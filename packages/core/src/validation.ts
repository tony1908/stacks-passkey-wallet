import { validateStacksAddress } from '@stacks/transactions';
import type { StacksNetwork } from './config';
import { PasskeyWalletError } from './errors';

const MEMO_MAX_BYTES = 34;

/** Heuristic reserve subtracted when checking or pre-filling a "send max"
 * amount, so a full-balance send doesn't fail at broadcast for lack of fee
 * headroom. This is only a UX safety margin — the node is the final arbiter
 * of whether the actual network fee is sufficient. */
export const STX_FEE_BUFFER_MICROSTX = 3_000n;

export function isValidStacksAddress(addr: string): boolean {
  return validateStacksAddress(addr);
}

// Prefix rule for Stacks address validation.
const NETWORK_PREFIXES: Record<StacksNetwork, string[]> = {
  mainnet: ['SP', 'SM'],
  testnet: ['ST', 'SN'],
};

export function assertValidRecipient(addr: string, network: StacksNetwork): void {
  const trimmed = addr.trim();
  if (!isValidStacksAddress(trimmed)) {
    throw new PasskeyWalletError('INVALID_ADDRESS', 'Invalid Stacks address');
  }
  const prefix = trimmed.slice(0, 2).toUpperCase();
  if (!NETWORK_PREFIXES[network].includes(prefix)) {
    throw new PasskeyWalletError('INVALID_ADDRESS', `Address is for the wrong network (expected ${network})`);
  }
}

export function memoByteLength(memo: string): number {
  return new TextEncoder().encode(memo).length;
}

export function assertValidMemo(memo: string): void {
  if (memoByteLength(memo) > MEMO_MAX_BYTES) {
    throw new PasskeyWalletError('MEMO_TOO_LONG', `Memo can't exceed ${MEMO_MAX_BYTES} bytes`);
  }
}

// The max real STX amount (total supply, whole+6 decimals+separator) is
// ~17 characters; 32 is a generous upper bound. Rejecting oversized input
// before it reaches the regex/BigInt() avoids doing unbounded-length work
// (regex backtracking, BigInt parsing) on an attacker-supplied string.
const MAX_STX_INPUT_LENGTH = 32;

// String math only, no floats.
export function parseStxToMicroStx(input: string): bigint | null {
  const trimmed = input.trim();
  if (trimmed.length > MAX_STX_INPUT_LENGTH) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole = '0', frac = ''] = trimmed.split('.');
  if (frac.length > 6) return null;
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0'));
}

// Formats a microSTX bigint as a human-readable STX amount string.
export function formatMicroStx(amount: bigint): string {
  const sign = amount < 0n ? '-' : '';
  const abs = amount < 0n ? -amount : amount;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  return `${sign}${whole}.${frac.toString().padStart(6, '0')} STX`;
}
