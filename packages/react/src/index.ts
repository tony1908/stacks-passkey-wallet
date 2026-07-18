// Main entry point (@toony1908/stacks-passkey-wallet).
// Batteries-included: re-exports the React provider/hooks, the UI
// components, and the consumer-facing core primitives.

export { VERSION } from './core';

export { StacksPasskeyProvider } from './react';
export type { StacksPasskeyProviderProps } from './react';
export { useStacksPasskeyWallet, useStxBalance, useStxTransactions } from './react';
export type { SendStxArgs, StacksPasskeyContextValue } from './react';

export { WalletButton, WalletDrawer, injectStyles } from './ui';
export type { WalletButtonProps, WalletDrawerProps } from './ui';

export {
  truncateAddress,
  explorerTxUrl,
  explorerAddressUrl,
  getAddressError,
  getAmountError,
  getMemoError,
  relativeTime,
} from './ui';

export { PasskeyWalletError, isPasskeyWalletError, formatMicroStx, parseStxToMicroStx } from './core';
export type {
  StacksNetwork,
  PasskeyWalletConfig,
  WalletTx,
  DerivedWallet,
  WalletErrorCode,
  WalletStorage,
  ColorScheme,
  ResolvedColorScheme,
} from './core';

// Non-UI primitives for building a custom UI instead of WalletButton/
// WalletDrawer — previously reachable only via the `/core` subpath (still
// works). Re-exported here too so this package's root matches
// @toony1908/stacks-passkey-react-native's root, which exposes the same
// primitives directly.
export { isPasskeySupported, withWalletKey, deriveWalletAddresses, sendStx, signStxTransfer } from './core';
export type { SendStxParams } from './core';
export { loadStoredWallet, saveStoredWallet, clearStoredWallet } from './core';
