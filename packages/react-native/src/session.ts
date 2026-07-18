// THE SECURITY CORE of the SDK (same discipline as
// @toony1908/stacks-passkey-react's src/core/session.ts). The private key
// exists only for the duration of `fn`, inside this call frame — never in a
// module variable, a closure that outlives the call, or storage. The entropy
// is zeroized in `finally` so it's wiped even when `fn` throws.
//
// Unlike web's session.ts, there's no `assertSecureContext()` call here — RN
// has no browser secure-context concept, so that guard is simply dropped
// (see passkey.ts's module doc comment).

import { addressesFromPrivateKey, walletFromEntropy, type DerivedWallet, type ResolvedConfig } from '@toony1908/stacks-passkey-core';
import { derivePrfEntropy, registerPasskey } from './passkey';

export async function withWalletKey<T>(
  credentialId: string,
  cfg: ResolvedConfig,
  fn: (wallet: DerivedWallet) => Promise<T>,
): Promise<T> {
  const entropy = await derivePrfEntropy(credentialId, cfg);
  try {
    const wallet = await walletFromEntropy(entropy, cfg.network, cfg.accountIndex);
    return await fn(wallet);
  } finally {
    entropy.fill(0);
  }
}

/** One passkey prompt, both network addresses: derives the wallet's private
 * key once and computes its mainnet AND testnet address from it, so runtime
 * network switching never needs a second PRF prompt. The key still only
 * lives inside this call (via `withWalletKey`), and the entropy is zeroized
 * the same way. */
export async function deriveWalletAddresses(
  credentialId: string,
  cfg: ResolvedConfig,
): Promise<{ mainnet: string; testnet: string }> {
  return withWalletKey(credentialId, cfg, async (w) => addressesFromPrivateKey(w.privateKey));
}

/** Registers a new passkey AND derives its wallet in a SINGLE ceremony when
 * the platform evaluates PRF at creation (Android). Falls back to one extra
 * `get()` only on platforms that don't (some iOS versions). This is what
 * `connect()` uses instead of `registerPasskey` + `deriveWalletAddresses`, so
 * a fresh connect never runs a follow-up assertion against a just-created
 * credential (which providers like Samsung Pass won't resurface). Same
 * per-operation key discipline: the entropy is used once, then zeroized. */
export async function registerWallet(
  cfg: ResolvedConfig,
): Promise<{ credentialId: string; addresses: { mainnet: string; testnet: string } }> {
  const { credentialId, entropy: createEntropy } = await registerPasskey(cfg);
  const entropy = createEntropy ?? (await derivePrfEntropy(credentialId, cfg));
  try {
    const wallet = await walletFromEntropy(entropy, cfg.network, cfg.accountIndex);
    return { credentialId, addresses: addressesFromPrivateKey(wallet.privateKey) };
  } finally {
    entropy.fill(0);
  }
}
