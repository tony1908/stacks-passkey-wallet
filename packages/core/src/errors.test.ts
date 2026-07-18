import { describe, it, expect } from 'vitest';
import { PasskeyWalletError, isPasskeyWalletError } from './errors';

describe('PasskeyWalletError', () => {
  it('carries a code and sets name/message', () => {
    const err = new PasskeyWalletError('INVALID_ADDRESS', 'bad address');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PasskeyWalletError');
    expect(err.code).toBe('INVALID_ADDRESS');
    expect(err.message).toBe('bad address');
  });

  it('supports the FEE_TOO_HIGH code', () => {
    const err = new PasskeyWalletError('FEE_TOO_HIGH', 'fee exceeds the configured ceiling');
    expect(err.code).toBe('FEE_TOO_HIGH');
  });

  it('is identified by isPasskeyWalletError, rejecting plain errors', () => {
    const err = new PasskeyWalletError('NETWORK_ERROR', 'oops');
    expect(isPasskeyWalletError(err)).toBe(true);
    expect(isPasskeyWalletError(new Error('oops'))).toBe(false);
    expect(isPasskeyWalletError('oops')).toBe(false);
    expect(isPasskeyWalletError(null)).toBe(false);
  });
});
