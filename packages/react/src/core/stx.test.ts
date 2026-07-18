// Wiring-level only. The validation/fee-ceiling/sign-order behavior these
// wrappers delegate to now lives once in
// @toony1908/stacks-passkey-core's src/stx.ts, and is fully covered by
// packages/core/src/stx.test.ts — no need to re-run that whole matrix here.
// What's still this package's own responsibility (and worth covering here)
// is that `sendStx`/`signStxTransfer` route through THIS package's
// `./session` `withWalletKey` (WebAuthn PRF, not core's) and still produce a
// usable result, plus one end-to-end sanity check that the fee ceiling is
// actually wired through.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveConfig, type DerivedWallet } from '@toony1908/stacks-passkey-core';
import * as sessionModule from './session';
import { sendStx, signStxTransfer } from './stx';

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
// Real mainnet address (reused from balance.test.ts / derivation.test.ts fixtures).
const RECIPIENT = 'SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS';
const FAKE_WALLET: DerivedWallet = {
  mnemonic: 'fake mnemonic',
  privateKey: 'fake-priv-key',
  address: 'SPFAKEADDR',
};

/** A `makeSTXTokenTransfer` mock result carrying a real-shaped
 * `auth.spendingCondition.fee` (a bigint), since core's `buildSignedTransfer`
 * reads that field to enforce `cfg.maxFeeMicroStx`. Defaults well under
 * `resolveConfig`'s default `maxFeeMicroStx` (1_000_000n). */
function fakeSignedTx(fee = 180n) {
  return { serialize: () => '0xdeadbeef', auth: { spendingCondition: { fee } } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendStx', () => {
  it('signs via this package\'s session.withWalletKey and broadcasts the txid', async () => {
    const spy = vi
      .spyOn(sessionModule, 'withWalletKey')
      .mockImplementation(async (_cid, _cfg, fn) => fn(FAKE_WALLET));
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx() as never);
    vi.mocked(broadcastTransaction).mockResolvedValue({ txid: '0xabc' } as never);

    const txid = await sendStx('cred', CFG, { recipient: RECIPIENT, amount: 100n });

    expect(txid).toBe('0xabc');
    expect(spy).toHaveBeenCalledWith('cred', CFG, expect.any(Function));
    expect(makeSTXTokenTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ senderKey: FAKE_WALLET.privateKey, recipient: RECIPIENT, amount: 100n }),
    );
  });

  it('end-to-end sanity: throws FEE_TOO_HIGH and never broadcasts when the signed fee exceeds cfg.maxFeeMicroStx', async () => {
    vi.spyOn(sessionModule, 'withWalletKey').mockImplementation(async (_cid, _cfg, fn) => fn(FAKE_WALLET));
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx(CFG.maxFeeMicroStx + 1n) as never);

    await expect(sendStx('cred', CFG, { recipient: RECIPIENT, amount: 100n })).rejects.toMatchObject({
      code: 'FEE_TOO_HIGH',
    });
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });
});

describe('signStxTransfer', () => {
  it('signs via this package\'s session.withWalletKey and returns the serialized hex without broadcasting', async () => {
    const spy = vi
      .spyOn(sessionModule, 'withWalletKey')
      .mockImplementation(async (_cid, _cfg, fn) => fn(FAKE_WALLET));
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx() as never);

    const hex = await signStxTransfer('cred', CFG, { recipient: RECIPIENT, amount: 100n });

    expect(hex).toBe('0xdeadbeef');
    expect(spy).toHaveBeenCalledWith('cred', CFG, expect.any(Function));
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });
});
