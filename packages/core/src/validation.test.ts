import { describe, it, expect } from 'vitest';
import {
  isValidStacksAddress,
  assertValidRecipient,
  memoByteLength,
  assertValidMemo,
  parseStxToMicroStx,
  formatMicroStx,
} from './validation';
import { isPasskeyWalletError } from './errors';

const MAINNET_ADDR = 'SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS';
const TESTNET_ADDR = 'ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ';

describe('isValidStacksAddress', () => {
  it('accepts a well-formed mainnet address', () => {
    expect(isValidStacksAddress(MAINNET_ADDR)).toBe(true);
  });

  it('rejects garbage input', () => {
    expect(isValidStacksAddress('not-an-address')).toBe(false);
    expect(isValidStacksAddress('')).toBe(false);
  });
});

describe('assertValidRecipient', () => {
  it('passes for a valid testnet address on testnet', () => {
    expect(() => assertValidRecipient(TESTNET_ADDR, 'testnet')).not.toThrow();
  });

  it('passes for a valid mainnet address on mainnet', () => {
    expect(() => assertValidRecipient(MAINNET_ADDR, 'mainnet')).not.toThrow();
  });

  it('throws INVALID_ADDRESS for a testnet address used on mainnet', () => {
    try {
      assertValidRecipient(TESTNET_ADDR, 'mainnet');
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('INVALID_ADDRESS');
    }
  });

  it('throws INVALID_ADDRESS for garbage input', () => {
    try {
      assertValidRecipient('garbage', 'mainnet');
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('INVALID_ADDRESS');
    }
  });
});

describe('memo helpers', () => {
  it('counts UTF-8 byte length, not character length', () => {
    expect(memoByteLength('abcd')).toBe(4);
    expect(memoByteLength('👍')).toBe(4); // emoji is 4 bytes in UTF-8
  });

  it('allows exactly 34 bytes', () => {
    const memo = 'a'.repeat(34);
    expect(memoByteLength(memo)).toBe(34);
    expect(() => assertValidMemo(memo)).not.toThrow();
  });

  it('throws MEMO_TOO_LONG for 35 bytes', () => {
    const memo = 'a'.repeat(35);
    try {
      assertValidMemo(memo);
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('MEMO_TOO_LONG');
    }
  });

  it('throws MEMO_TOO_LONG for a multibyte memo over the limit', () => {
    // 9 emoji * 4 bytes = 36 bytes > 34
    const memo = '👍'.repeat(9);
    expect(() => assertValidMemo(memo)).toThrow();
  });
});

describe('parseStxToMicroStx', () => {
  it.each([
    ['0.5', 500_000n],
    ['1', 1_000_000n],
    ['0', 0n],
    ['123.000001', 123_000_001n],
  ])('parses %s -> %s', (input, expected) => {
    expect(parseStxToMicroStx(input)).toBe(expected);
  });

  it.each([['1.2345678'], ['abc'], ['-1'], ['']])('rejects %s', (input) => {
    expect(parseStxToMicroStx(input)).toBeNull();
  });

  it('rejects input longer than 32 characters before doing regex/BigInt work', () => {
    // Max real STX amount is ~17 chars; this is a well-formed decimal string,
    // just implausibly long, so only the length bound can be rejecting it.
    const tooLong = '1'.repeat(33);
    expect(parseStxToMicroStx(tooLong)).toBeNull();
  });

  it('accepts input at exactly the 32-character bound', () => {
    const atBound = '1'.repeat(32);
    expect(parseStxToMicroStx(atBound)).toBe(BigInt(atBound) * 1_000_000n);
  });
});

describe('formatMicroStx', () => {
  it('formats whole and fractional microSTX', () => {
    expect(formatMicroStx(1_500_000n)).toBe('1.500000 STX');
    expect(formatMicroStx(1_000_000n)).toBe('1.000000 STX');
    expect(formatMicroStx(0n)).toBe('0.000000 STX');
    expect(formatMicroStx(1n)).toBe('0.000001 STX');
  });

  it('round-trips with parseStxToMicroStx for whole STX amounts', () => {
    const micro = parseStxToMicroStx('42')!;
    expect(formatMicroStx(micro)).toBe('42.000000 STX');
  });

  it('formats negative amounts with a single leading minus sign', () => {
    expect(formatMicroStx(-1_500_000n)).toBe('-1.500000 STX');
    expect(formatMicroStx(-1n)).toBe('-0.000001 STX');
  });
});
