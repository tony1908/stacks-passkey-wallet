import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveConfig } from './config';
import type { DerivedWallet } from './derivation';
import { sendStx, signStxTransfer, type WithWalletKey } from './stx';

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
 * `auth.spendingCondition.fee` (a bigint), since `buildSignedTransfer` reads
 * that field to enforce `cfg.maxFeeMicroStx`. Defaults well under
 * `resolveConfig`'s default `maxFeeMicroStx` (1_000_000n). */
function fakeSignedTx(fee = 180n) {
  return { serialize: () => '0xdeadbeef', auth: { spendingCondition: { fee } } };
}

/** Stub `withWalletKey` that just invokes `fn` with `FAKE_WALLET`, standing
 * in for a platform's real passkey-prompt + PRF-derived-key implementation. */
const stubWithWalletKey: WithWalletKey = async (_credentialId, _cfg, fn) => fn(FAKE_WALLET);

// vi.fn() can't preserve WithWalletKey's own generic <T>, so callers that
// need a spy (to assert "never called") cast back to WithWalletKey — the
// runtime behavior (delegating to stubWithWalletKey) is unaffected.
function spyWithWalletKey() {
  return vi.fn(stubWithWalletKey) as unknown as WithWalletKey & typeof stubWithWalletKey;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendStx / signStxTransfer validation (runs before any withWalletKey call)', () => {
  it('throws INVALID_ADDRESS for a bad recipient and never invokes withWalletKey', async () => {
    const spy = spyWithWalletKey();

    await expect(sendStx(spy, 'cred', CFG, { recipient: 'not-an-address', amount: 1n })).rejects.toMatchObject({
      code: 'INVALID_ADDRESS',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws INVALID_AMOUNT for a zero amount', async () => {
    const spy = spyWithWalletKey();

    await expect(sendStx(spy, 'cred', CFG, { recipient: RECIPIENT, amount: 0n })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws MEMO_TOO_LONG for an oversized memo', async () => {
    const spy = spyWithWalletKey();

    await expect(
      sendStx(spy, 'cred', CFG, { recipient: RECIPIENT, amount: 1n, memo: 'x'.repeat(35) }),
    ).rejects.toMatchObject({ code: 'MEMO_TOO_LONG' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('sendStx happy path', () => {
  it('broadcasts and returns the txid', async () => {
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx() as never);
    vi.mocked(broadcastTransaction).mockResolvedValue({ txid: '0xabc' } as never);

    const txid = await sendStx(stubWithWalletKey, 'cred', CFG, { recipient: RECIPIENT, amount: 100n });

    expect(txid).toBe('0xabc');
    expect(makeSTXTokenTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        senderKey: FAKE_WALLET.privateKey,
        recipient: RECIPIENT,
        amount: 100n,
        network: 'mainnet',
      }),
    );
    expect(broadcastTransaction).toHaveBeenCalledTimes(1);
  });

  it('trims memo and passes it through', async () => {
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx() as never);
    vi.mocked(broadcastTransaction).mockResolvedValue({ txid: '0xabc' } as never);

    await sendStx(stubWithWalletKey, 'cred', CFG, { recipient: RECIPIENT, amount: 100n, memo: '  hello  ' });

    expect(makeSTXTokenTransfer).toHaveBeenCalledWith(expect.objectContaining({ memo: 'hello' }));
  });

  it('throws BROADCAST_FAILED when the network rejects the tx', async () => {
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx() as never);
    vi.mocked(broadcastTransaction).mockResolvedValue({ reason: 'BadNonce' } as never);

    await expect(sendStx(stubWithWalletKey, 'cred', CFG, { recipient: RECIPIENT, amount: 100n })).rejects.toMatchObject({
      code: 'BROADCAST_FAILED',
    });
  });

  it('signs inside withWalletKey and broadcasts only after it has resolved, so the key never spans the broadcast round-trip', async () => {
    const order: string[] = [];
    const trackedWithWalletKey: WithWalletKey = async (_cid, _cfg, fn) => {
      const result = await fn(FAKE_WALLET);
      order.push('withWalletKey settled');
      return result;
    };
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx() as never);
    vi.mocked(broadcastTransaction).mockImplementation(async () => {
      order.push('broadcastTransaction called');
      return { txid: '0xabc' } as never;
    });

    await sendStx(trackedWithWalletKey, 'cred', CFG, { recipient: RECIPIENT, amount: 100n });

    expect(order).toEqual(['withWalletKey settled', 'broadcastTransaction called']);
  });
});

describe('fee ceiling (maxFeeMicroStx)', () => {
  it('sendStx throws FEE_TOO_HIGH and never broadcasts when the signed fee exceeds cfg.maxFeeMicroStx', async () => {
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx(CFG.maxFeeMicroStx + 1n) as never);

    await expect(sendStx(stubWithWalletKey, 'cred', CFG, { recipient: RECIPIENT, amount: 100n })).rejects.toMatchObject({
      code: 'FEE_TOO_HIGH',
    });
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });

  it('signStxTransfer also throws FEE_TOO_HIGH for an over-ceiling fee', async () => {
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx(CFG.maxFeeMicroStx + 1n) as never);

    await expect(
      signStxTransfer(stubWithWalletKey, 'cred', CFG, { recipient: RECIPIENT, amount: 100n }),
    ).rejects.toMatchObject({
      code: 'FEE_TOO_HIGH',
    });
  });

  it('allows a fee exactly at cfg.maxFeeMicroStx (ceiling is inclusive)', async () => {
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx(CFG.maxFeeMicroStx) as never);
    vi.mocked(broadcastTransaction).mockResolvedValue({ txid: '0xabc' } as never);

    await expect(sendStx(stubWithWalletKey, 'cred', CFG, { recipient: RECIPIENT, amount: 100n })).resolves.toBe(
      '0xabc',
    );
  });

  it('honors a custom (lower) config.maxFeeMicroStx', async () => {
    const strictCfg = resolveConfig({ appName: 'TestApp', network: 'mainnet', maxFeeMicroStx: 100n });
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx(101n) as never);

    await expect(
      sendStx(stubWithWalletKey, 'cred', strictCfg, { recipient: RECIPIENT, amount: 100n }),
    ).rejects.toMatchObject({
      code: 'FEE_TOO_HIGH',
    });
  });
});

describe('signStxTransfer', () => {
  it('returns the serialized hex without ever broadcasting', async () => {
    vi.mocked(makeSTXTokenTransfer).mockResolvedValue(fakeSignedTx() as never);

    const hex = await signStxTransfer(stubWithWalletKey, 'cred', CFG, { recipient: RECIPIENT, amount: 100n });

    expect(hex).toBe('0xdeadbeef');
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });

  it('validates before invoking withWalletKey', async () => {
    const spy = spyWithWalletKey();

    await expect(signStxTransfer(spy, 'cred', CFG, { recipient: RECIPIENT, amount: -1n })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
