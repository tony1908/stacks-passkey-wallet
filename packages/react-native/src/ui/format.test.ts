import { describe, it, expect } from 'vitest';
import { PasskeyWalletError } from '@toony1908/stacks-passkey-core';
import { describePasskeyError } from './format';

describe('describePasskeyError', () => {
  it('flags PASSKEY_CANCELLED as quiet with no message', () => {
    const e = new PasskeyWalletError('PASSKEY_CANCELLED', 'Passkey prompt was cancelled');
    expect(describePasskeyError(e, 'fallback')).toEqual({ quiet: true, message: '' });
  });

  it('gives PRF_UNSUPPORTED a clear device-support message', () => {
    const e = new PasskeyWalletError('PRF_UNSUPPORTED', 'Passkey did not return wallet material (PRF unsupported)');
    const result = describePasskeyError(e, 'fallback');
    expect(result.quiet).toBe(false);
    expect(result.message).toMatch(/doesn't support/i);
  });

  it("surfaces other PasskeyWalletError codes' own message", () => {
    const e = new PasskeyWalletError('NETWORK_ERROR', 'Could not reach the network');
    expect(describePasskeyError(e, 'fallback')).toEqual({ quiet: false, message: 'Could not reach the network' });
  });

  it('falls back to a plain Error message', () => {
    expect(describePasskeyError(new Error('boom'), 'fallback')).toEqual({ quiet: false, message: 'boom' });
  });

  it('uses the fallback for a non-Error throw', () => {
    expect(describePasskeyError('not an error', 'fallback')).toEqual({ quiet: false, message: 'fallback' });
  });
});
