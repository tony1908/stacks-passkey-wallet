// Main entry point (@toony1908/stacks-passkey-react-native).
// Batteries-included: re-exports the React provider/hooks, the RN UI
// components, and the consumer-facing core primitives.
//
// Read this before wiring up passkeys in your app: this package calls
// `crypto.getRandomValues(...)` (via @stacks/* and its own passkey.ts), which
// Hermes/React Native does not provide by default. Add, as the very first
// import in your app's entry point:
//
//   import 'react-native-get-random-values';
//
// See src/setup.ts for the full explanation of why this isn't done for you
// inside the library.

export const VERSION = '0.0.0';

export { StacksPasskeyProvider } from './StacksPasskeyProvider';
export type { StacksPasskeyProviderProps } from './StacksPasskeyProvider';

export { useStacksPasskeyWallet, useStxBalance, useStxTransactions } from './hooks';
export type { SendStxArgs, StacksPasskeyContextValue } from './context';

export { WalletButton } from './ui/WalletButton';
export type { WalletButtonProps } from './ui/WalletButton';
export { WalletDrawer } from './ui/WalletDrawer';
export type { WalletDrawerProps } from './ui/WalletDrawer';
export { defaultTheme, lightTheme, resolveTheme } from './ui/theme';
export type { StacksPasskeyTheme } from './ui/theme';

export {
  truncateAddress,
  explorerTxUrl,
  explorerAddressUrl,
  getAddressError,
  getAmountError,
  getMemoError,
  relativeTime,
  chunkAddress,
} from './ui/format';

// Non-UI primitives a consumer building a custom UI (instead of
// WalletButton/WalletDrawer) would need directly.
export { isPasskeySupported } from './passkey';
export { withWalletKey, deriveWalletAddresses } from './session';
export type { SendStxParams } from './stx';
export { sendStx, signStxTransfer } from './stx';
export { loadStoredWallet, saveStoredWallet, clearStoredWallet } from './storage';

// Re-exported from @toony1908/stacks-passkey-core so a consumer only ever
// needs to depend on this one package for the whole passkey-wallet surface.
export {
  resolveConfig,
  hiroHost,
  defaultExplorerTxUrl,
  defaultExplorerAddressUrl,
  PasskeyWalletError,
  isPasskeyWalletError,
  formatMicroStx,
  parseStxToMicroStx,
  isValidStacksAddress,
  assertValidRecipient,
  memoByteLength,
  base64UrlEncode,
  base64UrlDecode,
  STX_FEE_BUFFER_MICROSTX,
  getStxBalance,
  getStxTransactions,
} from '@toony1908/stacks-passkey-core';
export type {
  StacksNetwork,
  PasskeyWalletConfig,
  ResolvedConfig,
  ExplorerUrlBuilders,
  WalletErrorCode,
  DerivedWallet,
  WalletTx,
  StoredWallet,
  ColorScheme,
  ResolvedColorScheme,
} from '@toony1908/stacks-passkey-core';
