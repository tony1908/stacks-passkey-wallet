// Framework-agnostic core entry point (@toony1908/stacks-passkey-react/core).
// Re-exports the whole pure @toony1908/stacks-passkey-core API, plus the
// web-only passkey/session/storage primitives that stay in this package
// (they use WebAuthn/localStorage, which have no meaning off the web).

export const VERSION = '0.2.0';

export type {
  StacksNetwork,
  PasskeyWalletConfig,
  ResolvedConfig,
  WalletStorage,
  ExplorerUrlBuilders,
  WalletErrorCode,
  DerivedWallet,
  WalletTx,
  StoredWallet,
  ColorScheme,
  ResolvedColorScheme,
} from '@toony1908/stacks-passkey-core';
export {
  resolveConfig,
  hiroHost,
  defaultExplorerTxUrl,
  defaultExplorerAddressUrl,
  PasskeyWalletError,
  isPasskeyWalletError,
  addressesFromPrivateKey,
  walletFromEntropy,
  base64UrlEncode,
  base64UrlDecode,
  isValidStacksAddress,
  assertValidRecipient,
  memoByteLength,
  assertValidMemo,
  parseStxToMicroStx,
  formatMicroStx,
  STX_FEE_BUFFER_MICROSTX,
  getStxBalance,
  getStxTransactions,
} from '@toony1908/stacks-passkey-core';

// Note: `derivePrfEntropy` is intentionally NOT re-exported here — it's
// internal plumbing for `withWalletKey` and must never be called directly,
// so raw key material can't leak outside a single operation's scope.
export { isPasskeySupported, registerPasskey, reconnectWallet } from './passkey';

export { withWalletKey, deriveWalletAddresses } from './session';

export type { SendStxParams } from './stx';
export { sendStx, signStxTransfer } from './stx';

export { defaultStorage, getStorage, loadStoredWallet, saveStoredWallet, clearStoredWallet } from './storage';
