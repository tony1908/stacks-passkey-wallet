// THE SECURITY CORE of the SDK. The private key exists only for the duration
// of `fn`, inside this call frame — never in a module variable, a closure
// that outlives the call, or storage. The entropy is zeroized in `finally` so
// it's wiped even when `fn` throws.

import { addressesFromPrivateKey, walletFromEntropy, type DerivedWallet, type ResolvedConfig } from '@toony1908/stacks-passkey-core';
import { assertSecureContext, derivePrfEntropy } from './passkey';

export async function withWalletKey<T>(
  credentialId: string,
  cfg: ResolvedConfig,
  fn: (wallet: DerivedWallet) => Promise<T>,
): Promise<T> {
  assertSecureContext();
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
