// Adapted to take a ResolvedConfig instead of hardcoded app name/salt.

import {
  PasskeyWalletError,
  addressesFromPrivateKey,
  base64UrlDecode,
  base64UrlEncode,
  walletFromEntropy,
  type ResolvedConfig,
} from '@toony1908/stacks-passkey-core';

export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

export function assertSecureContext(): void {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    throw new PasskeyWalletError('INSECURE_CONTEXT', 'Passkeys require a secure (HTTPS) context');
  }
}

/** Rethrows a user-dismissed WebAuthn prompt as a code downstream cancellation
 * checks match on. */
async function runWebAuthn<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'NotAllowedError') {
      throw new PasskeyWalletError('PASSKEY_CANCELLED', 'Passkey prompt was cancelled');
    }
    throw error;
  }
}

export async function registerPasskey(cfg: ResolvedConfig): Promise<string> {
  assertSecureContext();
  if (!isPasskeySupported()) {
    throw new PasskeyWalletError('PASSKEY_UNSUPPORTED', 'This browser does not support passkeys (WebAuthn)');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await runWebAuthn(() =>
    navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: cfg.appName, ...(cfg.rpId ? { id: cfg.rpId } : {}) },
        user: { id: userId, name: cfg.userName, displayName: cfg.userDisplayName },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        // residentKey/userVerification are fixed security defaults, not
        // configurable: a discoverable, user-verified credential is required
        // for reconnectWallet's resident-credential flow to work at all.
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        extensions: { prf: {} },
        ...(cfg.webauthnTimeoutMs !== undefined ? { timeout: cfg.webauthnTimeoutMs } : {}),
      } as PublicKeyCredentialCreationOptions,
    }),
  )) as PublicKeyCredential;

  const extensions = credential.getClientExtensionResults() as { prf?: { enabled?: boolean } };
  if (extensions.prf?.enabled !== true) {
    throw new PasskeyWalletError(
      'PRF_UNSUPPORTED',
      "This device's passkeys do not support wallet derivation (PRF)",
    );
  }

  return base64UrlEncode(credential.rawId);
}

/** Derives the 32 bytes of PRF entropy for an existing passkey. Internal —
 * not exported from the public barrel; only `withWalletKey` should call this,
 * so the resulting key material never escapes a single operation scope. */
export async function derivePrfEntropy(credentialId: string, cfg: ResolvedConfig): Promise<Uint8Array> {
  assertSecureContext();
  if (!isPasskeySupported()) {
    throw new PasskeyWalletError('PASSKEY_UNSUPPORTED', 'This browser does not support passkeys (WebAuthn)');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = (await runWebAuthn(() =>
    navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: base64UrlDecode(credentialId) }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: new TextEncoder().encode(cfg.prfSalt) } } },
        ...(cfg.webauthnTimeoutMs !== undefined ? { timeout: cfg.webauthnTimeoutMs } : {}),
      } as PublicKeyCredentialRequestOptions,
    }),
  )) as PublicKeyCredential;

  const extensions = assertion.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const entropy = extensions.prf?.results?.first;
  if (!entropy) {
    throw new PasskeyWalletError('PRF_UNSUPPORTED', 'Passkey did not return wallet material (PRF unsupported)');
  }

  return new Uint8Array(entropy);
}

/** Restores a wallet from an existing (resident/discoverable) passkey when
 * local storage has lost the `{ credentialId, addresses }` pair — e.g. site
 * data was cleared, or the user reconnects in a private window. Requests a
 * WebAuthn assertion with NO `allowCredentials`, which lets the platform
 * authenticator surface the user's resident passkey directly, and asks for
 * the same PRF salt as `registerPasskey`/`derivePrfEntropy` so the resulting
 * entropy re-derives the identical wallet. Returns only public data — the
 * entropy is used once to compute both the mainnet and testnet address, then
 * zeroized, mirroring `withWalletKey`'s discipline. */
export async function reconnectWallet(
  cfg: ResolvedConfig,
): Promise<{ credentialId: string; addresses: { mainnet: string; testnet: string } }> {
  assertSecureContext();
  if (!isPasskeySupported()) {
    throw new PasskeyWalletError('PASSKEY_UNSUPPORTED', 'This browser does not support passkeys (WebAuthn)');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = (await runWebAuthn(() =>
    navigator.credentials.get({
      publicKey: {
        challenge,
        userVerification: 'required',
        extensions: { prf: { eval: { first: new TextEncoder().encode(cfg.prfSalt) } } },
        ...(cfg.webauthnTimeoutMs !== undefined ? { timeout: cfg.webauthnTimeoutMs } : {}),
      } as PublicKeyCredentialRequestOptions,
    }),
  )) as PublicKeyCredential;

  const extensions = assertion.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const entropyBuffer = extensions.prf?.results?.first;
  if (!entropyBuffer) {
    throw new PasskeyWalletError('PRF_UNSUPPORTED', 'Passkey did not return wallet material (PRF unsupported)');
  }

  const entropy = new Uint8Array(entropyBuffer);
  try {
    const wallet = await walletFromEntropy(entropy, cfg.network, cfg.accountIndex);
    return { credentialId: base64UrlEncode(assertion.rawId), addresses: addressesFromPrivateKey(wallet.privateKey) };
  } finally {
    entropy.fill(0);
  }
}
