// UI entry point (@toony1908/stacks-passkey-wallet's components).

export { WalletButton } from './WalletButton';
export type { WalletButtonProps } from './WalletButton';

export { WalletDrawer } from './WalletDrawer';
export type { WalletDrawerProps } from './WalletDrawer';

export { injectStyles } from './styles';

// Formatting/validation helpers reused by WalletButton/WalletDrawer,
// exposed for consumers building their own custom wallet UI.
export {
  truncateAddress,
  explorerTxUrl,
  explorerAddressUrl,
  getAddressError,
  getAmountError,
  getMemoError,
  relativeTime,
} from './format';
