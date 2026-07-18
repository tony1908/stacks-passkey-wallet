// Ported verbatim from @toony1908/stacks-passkey-react's src/ui/format.ts —
// pure string/number helpers with no DOM/RN dependency, so nothing needed
// adapting. `describePasskeyError` below is an RN-only addition (WalletButton
// and WalletDrawer's recovery view both need the same cancel/PRF
// classification for their inline error text) — kept here rather than
// duplicated in both components.

import {
  isPasskeyWalletError,
  isValidStacksAddress,
  memoByteLength,
  parseStxToMicroStx,
  type StacksNetwork,
} from '@toony1908/stacks-passkey-core';

export function truncateAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Re-exported (not reimplemented) so the default explorer link logic has one
// source of truth in core.
export { defaultExplorerTxUrl as explorerTxUrl, defaultExplorerAddressUrl as explorerAddressUrl } from '@toony1908/stacks-passkey-core';

// Prefix rule mirrors core's validation.ts (kept local so the UI layer can
// surface a message before the recipient string is trimmed/submitted).
const NETWORK_PREFIXES: Record<StacksNetwork, string[]> = {
  mainnet: ['SP', 'SM'],
  testnet: ['ST', 'SN'],
};

/** Empty input is not an error — it just means the user hasn't typed
 * anything yet. */
export function getAddressError(address: string, network: StacksNetwork): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  if (!isValidStacksAddress(trimmed)) return 'Invalid Stacks address';
  const prefix = trimmed.slice(0, 2).toUpperCase();
  if (!NETWORK_PREFIXES[network].includes(prefix)) {
    return `Address is for the wrong network (expected ${network})`;
  }
  return null;
}

export function getAmountError(input: string, balanceMicroStx: bigint | undefined): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'Enter a valid amount';
  const [, frac = ''] = trimmed.split('.');
  if (frac.length > 6) return 'Maximum 6 decimal places';
  const micro = parseStxToMicroStx(trimmed);
  if (micro === null || micro <= 0n) return 'Amount must be greater than 0';
  if (balanceMicroStx !== undefined && micro > balanceMicroStx) return 'Amount exceeds balance';
  return null;
}

export function getMemoError(memo: string): string | null {
  if (memoByteLength(memo) > 34) return "Memo can't exceed 34 bytes";
  return null;
}

export interface PasskeyErrorDisplay {
  /** True when the error is just the user backing out of the OS biometric
   * prompt (PASSKEY_CANCELLED) — expected behavior, not a failure. Callers
   * should skip showing error text and skip `onError` for these. */
  quiet: boolean;
  /** Empty when `quiet` is true (nothing to show). */
  message: string;
}

/** Classifies an error thrown by a passkey operation (connect / reconnect /
 * reveal) for inline UI display, shared by WalletButton's connect/reconnect
 * and WalletDrawer's recovery-reveal so both surfaces treat "user cancelled"
 * and "this device can't do PRF" the same way instead of drifting apart. */
export function describePasskeyError(e: unknown, fallback: string): PasskeyErrorDisplay {
  if (isPasskeyWalletError(e)) {
    if (e.code === 'PASSKEY_CANCELLED') return { quiet: true, message: '' };
    if (e.code === 'PRF_UNSUPPORTED') {
      return {
        quiet: false,
        message: "This device doesn't support the passkey feature this wallet needs (PRF). Try a different device or update your OS.",
      };
    }
    return { quiet: false, message: e.message };
  }
  if (e instanceof Error) return { quiet: false, message: e.message };
  return { quiet: false, message: fallback };
}

/** Inserts a space every `size` characters — used to render the Receive
 * view's address in easier-to-eyeball chunks (like a card number). */
export function chunkAddress(address: string, size = 4): string {
  const chunks: string[] = [];
  for (let i = 0; i < address.length; i += size) chunks.push(address.slice(i, i + size));
  return chunks.join(' ');
}

export function relativeTime(unixSeconds?: number): string {
  if (unixSeconds === undefined) return '—';
  const diffSec = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Day bucket label for grouping the activity list: "Pending" (no block time
 * yet) / "Today" / "Yesterday" / "Jul 13". */
export function dateLabel(unixSeconds?: number): string {
  if (unixSeconds === undefined) return 'Pending';
  const d = new Date(unixSeconds * 1000);
  const now = new Date();
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
