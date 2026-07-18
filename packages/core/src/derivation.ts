import { entropyToMnemonic, mnemonicToSeed } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { compressPrivateKey, getAddressFromPrivateKey } from '@stacks/transactions';
import type { StacksNetwork } from './config';

export interface DerivedWallet {
  mnemonic: string;
  privateKey: string;
  address: string;
}

// The Stacks BIP44 account path used by @stacks/wallet-sdk (its
// STX_DERIVATION_PATH). We inline the derivation here rather than call
// `generateWallet` because `generateWallet` also runs `encryptMnemonic`,
// which needs Web Crypto's `crypto.subtle` — absent in React Native's Hermes
// engine (it throws "undefined is not a function"). We never use the
// encrypted secret key, so we derive the account key directly. This produces
// the byte-for-byte SAME key/address as `generateWallet` (verified against
// the pinned snapshots in derivation.test.ts).
const STX_DERIVATION_PATH = "m/44'/5757'/0'/0";

/** Pure BIP39/BIP32 derivation from 32 bytes of entropy. No `crypto.subtle`,
 * so it works in browsers AND React Native. `accountIndex` picks the BIP44
 * account (negative/non-integer values clamp to 0).
 *
 * Key-material hygiene: the BIP39 seed and every HDKey node derived from it
 * hold raw key bytes in `Uint8Array`s we control, so once the (string)
 * `privateKey`/`address` results are computed, we zero those buffers in a
 * `finally` (`seed.fill(0)`, `HDKey#wipePrivateData()`) rather than leaving
 * them for the GC to collect on its own schedule. This is best-effort, not a
 * guarantee: the returned `mnemonic`/`privateKey` are JS strings, and strings
 * are immutable — they can't be zeroized in place, so their bytes stay
 * resident in memory (heap/snapshots/swap) until the engine's GC happens to
 * reclaim them. That residual exposure is a JS-string limitation, not
 * something fixable at this layer; treat any process that has held a
 * derived wallet as having had transient access to the mnemonic/key. */
export async function walletFromEntropy(
  entropy: Uint8Array,
  network: StacksNetwork,
  accountIndex = 0,
): Promise<DerivedWallet> {
  const mnemonic = entropyToMnemonic(entropy, wordlist);
  const index = Math.max(0, Math.trunc(accountIndex));
  const seed = await mnemonicToSeed(mnemonic);
  let rootNode: HDKey | undefined;
  let accountNode: HDKey | undefined;
  let childKey: HDKey | undefined;
  try {
    rootNode = HDKey.fromMasterSeed(seed);
    accountNode = rootNode.derive(STX_DERIVATION_PATH);
    childKey = accountNode.deriveChild(index);
    if (!childKey.privateKey) {
      throw new Error('Failed to derive STX private key from entropy');
    }
    const privateKey = compressPrivateKey(childKey.privateKey);
    const address = getAddressFromPrivateKey(privateKey, network);
    return { mnemonic, privateKey, address };
  } finally {
    seed.fill(0);
    rootNode?.wipePrivateData();
    accountNode?.wipePrivateData();
    childKey?.wipePrivateData();
  }
}

/** One private key has both a mainnet (`SP…`) and testnet (`ST…`) address —
 * same key, different network version byte. Lets a single passkey-derived
 * key back both addresses without a second derivation/prompt. Verified
 * against `walletFromEntropy`/`getStxAddress` (see derivation.test.ts). */
export function addressesFromPrivateKey(privateKey: string): { mainnet: string; testnet: string } {
  return {
    mainnet: getAddressFromPrivateKey(privateKey, 'mainnet'),
    testnet: getAddressFromPrivateKey(privateKey, 'testnet'),
  };
}
