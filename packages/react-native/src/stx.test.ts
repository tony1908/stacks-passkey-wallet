// stx.ts is now a thin binding of core's sendStx/signStxTransfer to this
// package's `withWalletKey` — the full validation/fee-ceiling/broadcast
// behavior suite moved to core/src/stx.test.ts. These tests only cover the
// wiring: that this package's `./session` withWalletKey is what actually
// gets invoked, plus one end-to-end sanity check (FEE_TOO_HIGH) that the
// binding surfaces core's errors correctly.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveConfig, type DerivedWallet } from '@toony1908/stacks-passkey-core';
import * as sessionModule from './session';
import { sendStx, signStxTransfer } from './stx';

// stx.ts -> session.ts -> passkey.ts, which imports the real
// react-native-passkeys native module — not loadable in plain Node/vitest,
// so it's stubbed the same way passkey.test.ts/session.test.ts do, even
// though `withWalletKey` itself is mocked below and never actually calls it.
vi.mock('react-native-passkeys', () => ({
  isSupported: vi.fn(() => true),
  create: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@stacks/transactions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stacks/transactions')>();
  return {
    ...actual,
    makeSTXTokenTransfer: vi.fn(),
    broadcastTransaction: vi.fn(),
  };
});

import { broadcastTransaction, makeSTXTokenTransfer } from '@stacks/transactions';

const CFG = resolveConfig({ appName: 'TestApp', network: 'mainnet' });
// Real mainnet address (reused from core's balance.test.ts / derivation.test.ts fixtures).
const RECIPIENT = 'SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS';
const FAKE_WALLET: DerivedWallet = {
  mnemonic: 'fake mnemonic',
  privateKey: 'fake-priv-key',
  address: 'SPFAKEADDR',
};

// Shared shape for a mocked `makeSTXTokenTransfer` result: only
// `auth.spendingCondition.fee` (read by the fee-ceiling check) and
// `serialize()` are exercised by stx.ts.
function fakeTx(fee: bigint) {
  return { auth: { spendingCondition: { fee } }, serialize: () => '0xdeadbeef' };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendStx / signStxTransfer wiring', () => {
  it('sendStx routes through this package\'s session.withWalletKey and broadcasts the result', async () => {
    const spy = vi
      .spyOn(sessionModule, 'withWalletKey')
      .mockImplementation(async (_cid, _cfg, fn) => fn(FAKE_WALLET));
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeTx(180n) as never);
    vi.mocked(broadcastTransaction).mockResolvedValue({ txid: '0xabc' } as never);

    const txid = await sendStx('cred', CFG, { recipient: RECIPIENT, amount: 100n });

    expect(spy).toHaveBeenCalledWith('cred', CFG, expect.any(Function));
    expect(txid).toBe('0xabc');
  });

  it('signStxTransfer routes through this package\'s session.withWalletKey and returns the serialized hex', async () => {
    const spy = vi
      .spyOn(sessionModule, 'withWalletKey')
      .mockImplementation(async (_cid, _cfg, fn) => fn(FAKE_WALLET));
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeTx(180n) as never);

    const hex = await signStxTransfer('cred', CFG, { recipient: RECIPIENT, amount: 100n });

    expect(spy).toHaveBeenCalledWith('cred', CFG, expect.any(Function));
    expect(hex).toBe('0xdeadbeef');
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });

  it('throws FEE_TOO_HIGH when the built tx fee exceeds cfg.maxFeeMicroStx, without broadcasting', async () => {
    // End-to-end sanity check: confirms the binding surfaces core's
    // validation/fee-ceiling errors, not just the happy path.
    vi.spyOn(sessionModule, 'withWalletKey').mockImplementation(async (_cid, _cfg, fn) => fn(FAKE_WALLET));
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeTx(CFG.maxFeeMicroStx + 1n) as never);

    await expect(sendStx('cred', CFG, { recipient: RECIPIENT, amount: 100n })).rejects.toMatchObject({
      code: 'FEE_TOO_HIGH',
    });
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });
});
