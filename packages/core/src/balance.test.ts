import { describe, it, expect, vi, afterEach } from 'vitest';
import { getStxBalance } from './balance';
import { isPasskeyWalletError } from './errors';

const ADDRESS = 'SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS';
const CFG = { network: 'mainnet' as const, apiUrls: {} };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStxBalance', () => {
  it('fetches and parses the balance as a bigint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ balance: '1500000', locked: '0' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const balance = await getStxBalance(ADDRESS, CFG);

    expect(balance).toBe(1_500_000n);
    expect(fetchMock).toHaveBeenCalledWith(`https://api.hiro.so/extended/v1/address/${ADDRESS}/stx`);
  });

  it('returns the spendable balance (total minus locked/stacked)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ balance: '10000000', locked: '8000000' }),
      }),
    );

    const balance = await getStxBalance(ADDRESS, CFG);

    expect(balance).toBe(2_000_000n);
  });

  it('treats a missing locked field as 0 (back-compat)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ balance: '1500000' }),
      }),
    );

    const balance = await getStxBalance(ADDRESS, CFG);

    expect(balance).toBe(1_500_000n);
  });

  it('floors at 0 if locked somehow exceeds the total balance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ balance: '100', locked: '200' }),
      }),
    );

    const balance = await getStxBalance(ADDRESS, CFG);

    expect(balance).toBe(0n);
  });

  it('throws NETWORK_ERROR when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );

    try {
      await getStxBalance(ADDRESS, CFG);
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('NETWORK_ERROR');
    }
  });

  it('throws NETWORK_ERROR when the body is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ balance: 12345 }) }),
    );

    try {
      await getStxBalance(ADDRESS, CFG);
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('NETWORK_ERROR');
    }
  });

  it('throws NETWORK_ERROR (not a raw SyntaxError) when balance is a non-numeric string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ balance: 'not-a-number' }) }),
    );

    try {
      await getStxBalance(ADDRESS, CFG);
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('NETWORK_ERROR');
    }
  });

  it('throws NETWORK_ERROR when locked is a non-numeric string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ balance: '100', locked: 'nope' }) }),
    );

    try {
      await getStxBalance(ADDRESS, CFG);
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('NETWORK_ERROR');
    }
  });

  it('URL-encodes the address in the fetch URL', async () => {
    const weirdAddress = 'SP1M4/../evil?x=1';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ balance: '0' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getStxBalance(weirdAddress, CFG);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.hiro.so/extended/v1/address/${encodeURIComponent(weirdAddress)}/stx`,
    );
  });
});
