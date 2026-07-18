// UI-facing formatting/validation helpers. Thin wrappers around the core
// address/amount/memo validators and STX amount formatting.

import {
  formatMicroStx,
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
// source of truth in core — the UI layer's `config.explorer` also falls back
// to these same two functions (see config.ts's `resolveConfig`).
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

/** Validates a Send-amount input string: numeric format, a max of 6 decimal
 * places, and (when known) that it doesn't exceed the available balance.
 *
 * `feeBufferMicroStx`, when passed, flags amounts that fit under the balance
 * but eat into the network-fee headroom (balance - feeBuffer, balance] —
 * without this, the Send button would enable for those amounts and the
 * transaction would then fail at broadcast for lack of fee room. */
export function getAmountError(
  input: string,
  balanceMicroStx: bigint | undefined,
  feeBufferMicroStx?: bigint,
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'Enter a valid amount';
  const [, frac = ''] = trimmed.split('.');
  if (frac.length > 6) return 'Maximum 6 decimal places';
  const micro = parseStxToMicroStx(trimmed);
  if (micro === null || micro <= 0n) return 'Amount must be greater than 0';
  if (balanceMicroStx !== undefined) {
    if (micro > balanceMicroStx) return 'Amount exceeds balance';
    if (feeBufferMicroStx !== undefined && micro > balanceMicroStx - feeBufferMicroStx) {
      return `Leave at least ${formatMicroStx(feeBufferMicroStx)} for the network fee`;
    }
  }
  return null;
}

/** Validates a memo string against the 34-byte on-chain memo limit. */
export function getMemoError(memo: string): string | null {
  if (memoByteLength(memo) > 34) return "Memo can't exceed 34 bytes";
  return null;
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
