// Framework-agnostic core entry point (@toony1908/stacks-passkey-core).
// No React, no DOM, no WebAuthn — safe to run in Node, workers, or any
// other JS host.

export type {
  StacksNetwork,
  PasskeyWalletConfig,
  ResolvedConfig,
  WalletStorage,
  ExplorerUrlBuilders,
  ColorScheme,
  ResolvedColorScheme,
} from './config';
export { resolveConfig, hiroHost, defaultExplorerTxUrl, defaultExplorerAddressUrl } from './config';

export type { WalletErrorCode } from './errors';
export { PasskeyWalletError, isPasskeyWalletError } from './errors';

export type { DerivedWallet } from './derivation';
// `walletFromEntropy` isn't part of the original public surface (it wasn't
// re-exported from the old single-package `core` barrel either), but the
// web-only `passkey.ts`/`session.ts` modules that stay in
// @toony1908/stacks-passkey-react need it, and cross-package consumption can
// only go through this barrel — so it's exported here for internal use.
export { addressesFromPrivateKey, walletFromEntropy } from './derivation';

export { base64UrlEncode, base64UrlDecode } from './encoding';

export {
  isValidStacksAddress,
  assertValidRecipient,
  memoByteLength,
  assertValidMemo,
  parseStxToMicroStx,
  formatMicroStx,
  STX_FEE_BUFFER_MICROSTX,
} from './validation';

export { getStxBalance } from './balance';

export type { WalletTx } from './transactions';
export { getStxTransactions } from './transactions';

export type { StoredWallet } from './types';

export type { SendStxParams, WithWalletKey } from './stx';
export { sendStx, signStxTransfer } from './stx';
