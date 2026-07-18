import { describe, it, expect } from 'vitest';
import {
  truncateAddress,
  chunkAddress,
  explorerTxUrl,
  explorerAddressUrl,
  getAddressError,
  getAmountError,
  getMemoError,
  relativeTime,
} from './format';

// Real, checksummed addresses so isValidStacksAddress (real
// @stacks/transactions, not mocked) accepts them.
const TESTNET_ADDRESS = 'ST000000000000000000002AMW42H';
const MAINNET_ADDRESS = 'SP000000000000000000002Q6VF78';

describe('truncateAddress', () => {
  it('truncates to first 6 + last 4 chars', () => {
    expect(truncateAddress('STFAKEADDRESSFORTESTING1234')).toBe('STFAKE...1234');
  });

  it('returns an empty string for falsy input', () => {
    expect(truncateAddress('')).toBe('');
  });
});

describe('chunkAddress', () => {
  it('inserts a space every 4 characters', () => {
    expect(chunkAddress('ST000000000000000000002AMW42H')).toBe('ST00 0000 0000 0000 0000 002A MW42 H');
  });

  it('returns an empty string for empty input', () => {
    expect(chunkAddress('')).toBe('');
  });
});

describe('explorer URLs', () => {
  it('builds mainnet URLs with no query string', () => {
    expect(explorerTxUrl('mainnet', '0xabc')).toBe('https://explorer.stacks.co/txid/0xabc');
    expect(explorerAddressUrl('mainnet', 'SPADDR')).toBe('https://explorer.stacks.co/address/SPADDR');
  });

  it('builds testnet URLs with the chain query string after the path (not before it)', () => {
    expect(explorerTxUrl('testnet', '0xabc')).toBe('https://explorer.stacks.co/txid/0xabc?chain=testnet');
    expect(explorerAddressUrl('testnet', 'STADDR')).toBe('https://explorer.stacks.co/address/STADDR?chain=testnet');
  });
});

describe('getAddressError', () => {
  it('allows an empty field (no error before typing)', () => {
    expect(getAddressError('', 'testnet')).toBeNull();
  });

  it('flags an invalid address', () => {
    expect(getAddressError('not-a-real-address', 'testnet')).toMatch(/invalid stacks address/i);
  });

  it('flags a valid address on the wrong network', () => {
    expect(getAddressError(MAINNET_ADDRESS, 'testnet')).toMatch(/wrong network/i);
  });

  it('accepts a valid same-network address', () => {
    expect(getAddressError(TESTNET_ADDRESS, 'testnet')).toBeNull();
    expect(getAddressError(MAINNET_ADDRESS, 'mainnet')).toBeNull();
  });
});

describe('getAmountError', () => {
  it('allows an empty field', () => {
    expect(getAmountError('', 5_000_000n)).toBeNull();
  });

  it('rejects a non-numeric amount', () => {
    expect(getAmountError('abc', 5_000_000n)).toMatch(/valid amount/i);
  });

  it('rejects more than 6 decimal places', () => {
    expect(getAmountError('0.1234567', 5_000_000n)).toMatch(/6 decimal/i);
  });

  it('rejects zero', () => {
    expect(getAmountError('0', 5_000_000n)).toMatch(/greater than 0/i);
  });

  it('rejects an amount over the balance', () => {
    expect(getAmountError('10', 5_000_000n)).toMatch(/exceeds balance/i);
  });

  it('accepts a valid amount within balance', () => {
    expect(getAmountError('1', 5_000_000n)).toBeNull();
  });

  it('accepts a valid amount when the balance is unknown', () => {
    expect(getAmountError('1', undefined)).toBeNull();
  });

  it('accepts an amount that leaves the fee buffer intact', () => {
    expect(getAmountError('4.997', 5_000_000n, 3_000n)).toBeNull();
  });

  it('flags an amount within the fee buffer of the balance instead of letting it through', () => {
    // 4.9985 STX leaves only 1_500 microSTX of the 3_000 buffer — Send would
    // pass validation here without the buffer check, then fail at broadcast.
    expect(getAmountError('4.9985', 5_000_000n, 3_000n)).toMatch(/leave at least 0\.003000 stx/i);
  });

  it('still reports "exceeds balance" (not the buffer message) when over the full balance', () => {
    expect(getAmountError('10', 5_000_000n, 3_000n)).toMatch(/exceeds balance/i);
  });

  it('ignores the fee buffer entirely when it is not passed', () => {
    expect(getAmountError('4.9985', 5_000_000n)).toBeNull();
  });
});

describe('getMemoError', () => {
  it('accepts a short memo', () => {
    expect(getMemoError('hi')).toBeNull();
  });

  it('rejects a memo over 34 bytes', () => {
    expect(getMemoError('a'.repeat(35))).toMatch(/34 bytes/i);
  });

  it('counts bytes, not characters, for multi-byte content', () => {
    // 12 emoji at 4 bytes each = 48 bytes, over the limit, even though the
    // JS string .length for these is only 24 (surrogate pairs).
    expect(getMemoError('😀'.repeat(12))).toMatch(/34 bytes/i);
  });
});

describe('relativeTime', () => {
  it('returns an em dash for undefined', () => {
    expect(relativeTime(undefined)).toBe('—');
  });

  it('returns "just now" for a timestamp seconds ago', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(relativeTime(now)).toBe('just now');
  });

  it('formats minutes ago', () => {
    const tenMinAgo = Math.floor(Date.now() / 1000) - 10 * 60;
    expect(relativeTime(tenMinAgo)).toBe('10m ago');
  });

  it('formats hours ago', () => {
    const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600;
    expect(relativeTime(twoHoursAgo)).toBe('2h ago');
  });

  it('formats days ago', () => {
    const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 86400;
    expect(relativeTime(threeDaysAgo)).toBe('3d ago');
  });
});
