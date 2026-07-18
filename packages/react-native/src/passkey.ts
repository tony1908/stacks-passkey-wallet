// Native-passkey adapter, mirroring @toony1908/stacks-passkey-react's
// src/core/passkey.ts but built on `react-native-passkeys` instead of the
// browser's `navigator.credentials`.
//
// Verified against the installed react-native-passkeys@0.4.1: unlike the
// browser WebAuthn API (which deals in ArrayBuffers), its `create`/`get`
// take and return a JSON-friendly shape (base64url STRINGS for
// challenge/user.id/credential ids/PRF salt+results), the same shape on iOS,
// Android, and its own web fallback. There's no `window.isSecureContext`
// concept on native, so (unlike web's passkey.ts) there's no secure-context
// guard here.

import { create, get, isSupported } from 'react-native-passkeys';
import {
  PasskeyWalletError,
  addressesFromPrivateKey,
  base64UrlDecode,
  base64UrlEncode,
  walletFromEntropy,
  type ResolvedConfig,
} from '@toony1908/stacks-passkey-core';

export function isPasskeySupported(): boolean {
  try {
    return isSupported();
  } catch {
    // Defensive: the native module may not be linked/available at all in
    // some hosts (e.g. Expo Go without a custom dev client for older SDKs).
    return false;
  }
}

function randomBase64Url(byteLength: number): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Cross-platform user-cancellation detection. react-native-passkeys
 * surfaces a cancelled passkey sheet differently per platform:
 *  - iOS: the native `UserCancelledException` (PasskeyExceptions.swift)
 *    becomes a JS error whose `code` is Expo's class-name-derived
 *    `ERR_USER_CANCELLED` (expo-modules-core's `errorCodeFromString`).
 *  - Android: `ReactNativePasskeysModule.kt` rejects with
 *    `promise.reject("Passkey Create" | "Passkey Get", "UserCancelled", e)`
 *    — so `code` is the literal operation name, and `message` is exactly
 *    "UserCancelled".
 *  - Web (react-native-passkeys' own `.web.ts` fallback calls the real
 *    `navigator.credentials.create/get`): a dismissed prompt rejects with a
 *    `DOMException` named `NotAllowedError`, same as the browser package. */
function isUserCancelled(error: unknown): boolean {
  const err = error as { name?: string; code?: string; message?: string } | null;
  if (!err) return false;
  if (err.name === 'NotAllowedError') return true;
  if (err.code === 'ERR_USER_CANCELLED') return true;
  return typeof err.message === 'string' && /cancel/i.test(err.message);
}

async function runPasskeyOp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isUserCancelled(error)) {
      throw new PasskeyWalletError('PASSKEY_CANCELLED', 'Passkey prompt was cancelled');
    }
    throw error;
  }
}

export async function registerPasskey(
  cfg: ResolvedConfig,
): Promise<{ credentialId: string; entropy: Uint8Array | null }> {
  if (!isPasskeySupported()) {
    throw new PasskeyWalletError('PASSKEY_UNSUPPORTED', 'This device does not support passkeys');
  }

  const credential = await runPasskeyOp(() =>
    create({
      challenge: randomBase64Url(32),
      rp: { name: cfg.appName, ...(cfg.rpId ? { id: cfg.rpId } : {}) },
      user: { id: randomBase64Url(16), name: cfg.userName, displayName: cfg.userDisplayName },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      // residentKey/userVerification are fixed security defaults, not
      // configurable: a discoverable, user-verified credential is required
      // for reconnectWallet's resident-credential flow to work at all.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      // Evaluate PRF DURING creation (the Android Credential Manager pattern):
      // authenticators that support it return the entropy in this same
      // ceremony, so connect() needs a single prompt and never has to run a
      // follow-up get() (which some providers, e.g. Samsung Pass, won't
      // resurface a just-created credential for). Same salt BYTES as the web
      // package, base64url-encoded for this library's JSON eval input.
      extensions: { prf: { eval: { first: base64UrlEncode(new TextEncoder().encode(cfg.prfSalt)) } } },
      ...(cfg.webauthnTimeoutMs !== undefined ? { timeout: cfg.webauthnTimeoutMs } : {}),
    }),
  );

  // The library types `create`'s return as nullable; a dismissed sheet
  // resolves null on some platforms instead of rejecting.
  if (!credential) {
    throw new PasskeyWalletError('PASSKEY_CANCELLED', 'Passkey prompt was cancelled');
  }

  if (credential.clientExtensionResults.prf?.enabled !== true) {
    throw new PasskeyWalletError(
      'PRF_UNSUPPORTED',
      "This device's passkeys do not support wallet derivation (PRF)",
    );
  }

  // `rawId` is already a base64url string in this library's JSON API (unlike
  // the browser's ArrayBuffer), so there's nothing to encode here. `entropy`
  // is non-null when the platform evaluated PRF at creation (Android); it's
  // null on platforms that only return PRF results from a later get() (some
  // iOS versions), in which case the caller falls back to derivePrfEntropy.
  const resultB64 = credential.clientExtensionResults.prf?.results?.first;
  return { credentialId: credential.rawId, entropy: resultB64 ? base64UrlDecode(resultB64) : null };
}

/** Derives the 32 bytes of PRF entropy for an existing passkey. Internal —
 * not exported from the public barrel; only `withWalletKey` should call this,
 * so the resulting key material never escapes a single operation scope. */
export async function derivePrfEntropy(credentialId: string, cfg: ResolvedConfig): Promise<Uint8Array> {
  if (!isPasskeySupported()) {
    throw new PasskeyWalletError('PASSKEY_UNSUPPORTED', 'This device does not support passkeys');
  }

  const assertion = await runPasskeyOp(() =>
    get({
      challenge: randomBase64Url(32),
      // rpId is REQUIRED on native: unlike the browser (where it defaults to
      // the page origin), Android/iOS Credential Manager has no origin, so
      // without it the platform queries the wrong domain and reports "no
      // available sign-in" for a credential that was created under cfg.rpId.
      ...(cfg.rpId ? { rpId: cfg.rpId } : {}),
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      // Same salt BYTES as the web package (`TextEncoder().encode(cfg.prfSalt)`),
      // just base64url-encoded for this library's JSON eval input — so a
      // passkey synced via iCloud Keychain / Google Password Manager derives
      // the identical wallet on web and mobile.
      extensions: { prf: { eval: { first: base64UrlEncode(new TextEncoder().encode(cfg.prfSalt)) } } },
      ...(cfg.webauthnTimeoutMs !== undefined ? { timeout: cfg.webauthnTimeoutMs } : {}),
    }),
  );

  if (!assertion) {
    throw new PasskeyWalletError('PASSKEY_CANCELLED', 'Passkey prompt was cancelled');
  }

  const entropyB64 = assertion.clientExtensionResults.prf?.results?.first;
  if (!entropyB64) {
    throw new PasskeyWalletError('PRF_UNSUPPORTED', 'Passkey did not return wallet material (PRF unsupported)');
  }

  return base64UrlDecode(entropyB64);
}

/** Restores a wallet from an existing (resident/discoverable) passkey when
 * local storage has lost the `{ credentialId, addresses }` pair. Requests an
 * assertion with NO `allowCredentials`, letting the platform authenticator
 * surface the user's resident passkey directly, and asks for the same PRF
 * salt as `registerPasskey`/`derivePrfEntropy` so the resulting entropy
 * re-derives the identical wallet. Returns only public data — the entropy is
 * used once to compute both the mainnet and testnet address, then zeroized,
 * mirroring `withWalletKey`'s discipline. */
export async function reconnectWallet(
  cfg: ResolvedConfig,
): Promise<{ credentialId: string; addresses: { mainnet: string; testnet: string } }> {
  if (!isPasskeySupported()) {
    throw new PasskeyWalletError('PASSKEY_UNSUPPORTED', 'This device does not support passkeys');
  }

  const assertion = await runPasskeyOp(() =>
    get({
      challenge: randomBase64Url(32),
      // Required on native (see derivePrfEntropy) — even the discoverable
      // reconnect flow must scope to the RP domain the passkey lives under.
      ...(cfg.rpId ? { rpId: cfg.rpId } : {}),
      userVerification: 'required',
      extensions: { prf: { eval: { first: base64UrlEncode(new TextEncoder().encode(cfg.prfSalt)) } } },
      ...(cfg.webauthnTimeoutMs !== undefined ? { timeout: cfg.webauthnTimeoutMs } : {}),
    }),
  );

  if (!assertion) {
    throw new PasskeyWalletError('PASSKEY_CANCELLED', 'Passkey prompt was cancelled');
  }

  const entropyB64 = assertion.clientExtensionResults.prf?.results?.first;
  if (!entropyB64) {
    throw new PasskeyWalletError('PRF_UNSUPPORTED', 'Passkey did not return wallet material (PRF unsupported)');
  }

  const entropy = base64UrlDecode(entropyB64);
  try {
    const wallet = await walletFromEntropy(entropy, cfg.network, cfg.accountIndex);
    return { credentialId: assertion.rawId, addresses: addressesFromPrivateKey(wallet.privateKey) };
  } finally {
    entropy.fill(0);
  }
}
