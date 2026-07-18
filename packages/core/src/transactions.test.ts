import { describe, it, expect, vi, afterEach } from 'vitest';
import { getStxTransactions } from './transactions';
import { isPasskeyWalletError } from './errors';

const ADDRESS = 'SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS';
const OTHER = 'SP2QKZ4FKHAH1NQKYKYAYZPY440FEPK7GZ1R5HBP2';
const CFG = { network: 'mainnet' as const, apiUrls: {}, transactionLimit: 20 };

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStxTransactions', () => {
  it('fetches confirmed + mempool in parallel and merges pending first', async () => {
    const confirmed = {
      results: [
        {
          tx_id: '0xsent1',
          tx_status: 'success',
          tx_type: 'token_transfer',
          sender_address: ADDRESS,
          fee_rate: '1000',
          nonce: 5,
          burn_block_time: 1700000000,
          token_transfer: { recipient_address: OTHER, amount: '2000000', memo: '0x48656c6c6f' },
        },
        {
          tx_id: '0xrecv1',
          tx_status: 'success',
          tx_type: 'token_transfer',
          sender_address: OTHER,
          fee_rate: '1200',
          nonce: 9,
          burn_block_time: 1700000100,
          token_transfer: { recipient_address: ADDRESS, amount: '3000000', memo: '0x' },
        },
        {
          tx_id: '0xother1',
          tx_status: 'success',
          tx_type: 'contract_call',
          sender_address: ADDRESS,
          fee_rate: '800',
          nonce: 10,
          burn_block_time: 1700000200,
        },
        {
          tx_id: '0xfailed1',
          tx_status: 'abort_by_response',
          tx_type: 'token_transfer',
          sender_address: ADDRESS,
          fee_rate: '900',
          nonce: 11,
          burn_block_time: 1700000300,
          token_transfer: { recipient_address: OTHER, amount: '500000' },
        },
      ],
    };
    const mempool = {
      results: [
        {
          tx_id: '0xpending1',
          tx_type: 'token_transfer',
          sender_address: ADDRESS,
          fee_rate: '1000',
          nonce: 12,
          token_transfer: { recipient_address: OTHER, amount: '100000' },
        },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/mempool')) return Promise.resolve(jsonResponse(mempool));
      return Promise.resolve(jsonResponse(confirmed));
    });
    vi.stubGlobal('fetch', fetchMock);

    const txs = await getStxTransactions(ADDRESS, CFG);

    expect(txs).toHaveLength(5);
    // pending first
    expect(txs[0]!.txid).toBe('0xpending1');
    expect(txs[0]!.status).toBe('pending');
    expect(txs[0]!.timestamp).toBeUndefined();
    expect(txs[0]!.kind).toBe('sent');

    const sent = txs.find((t) => t.txid === '0xsent1')!;
    expect(sent.kind).toBe('sent');
    expect(sent.counterparty).toBe(OTHER);
    expect(sent.amountMicroStx).toBe(2_000_000n);
    expect(sent.memo).toBe('Hello');
    expect(sent.feeMicroStx).toBe(1000n);
    expect(sent.nonce).toBe(5);
    expect(sent.status).toBe('success');
    expect(sent.timestamp).toBe(1700000000);

    const received = txs.find((t) => t.txid === '0xrecv1')!;
    expect(received.kind).toBe('received');
    expect(received.counterparty).toBe(OTHER);
    expect(received.amountMicroStx).toBe(3_000_000n);
    expect(received.memo).toBeUndefined();
  });

  it('decodes a memo padded to the full 34 bytes with trailing NUL bytes, stripping the padding', async () => {
    const confirmed = {
      results: [
        {
          tx_id: '0xpadded1',
          tx_status: 'success',
          tx_type: 'token_transfer',
          sender_address: ADDRESS,
          fee_rate: '1000',
          nonce: 5,
          burn_block_time: 1700000000,
          token_transfer: {
            recipient_address: OTHER,
            amount: '2000000',
            // "Hello" (5 bytes) right-padded with 0x00 to the full 34-byte memo field.
            memo: '0x' + '48656c6c6f' + '00'.repeat(29),
          },
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/mempool')) return Promise.resolve(jsonResponse({ results: [] }));
        return Promise.resolve(jsonResponse(confirmed));
      }),
    );

    const txs = await getStxTransactions(ADDRESS, CFG);

    expect(txs).toHaveLength(1);
    expect(txs[0]!.memo).toBe('Hello');
  });

  it('passes a custom limit through to both endpoints', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ results: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await getStxTransactions(ADDRESS, CFG, { limit: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.hiro.so/extended/v1/address/${ADDRESS}/transactions?limit=5`,
    );
    expect(fetchMock).toHaveBeenCalledWith(`https://api.hiro.so/extended/v1/address/${ADDRESS}/mempool?limit=5`);
  });

  it('falls back to cfg.transactionLimit when no opts.limit is given', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ results: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await getStxTransactions(ADDRESS, { network: 'mainnet', apiUrls: {}, transactionLimit: 7 });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.hiro.so/extended/v1/address/${ADDRESS}/transactions?limit=7`,
    );
    expect(fetchMock).toHaveBeenCalledWith(`https://api.hiro.so/extended/v1/address/${ADDRESS}/mempool?limit=7`);
  });

  it('lets opts.limit override cfg.transactionLimit', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ results: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await getStxTransactions(ADDRESS, { network: 'mainnet', apiUrls: {}, transactionLimit: 7 }, { limit: 3 });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.hiro.so/extended/v1/address/${ADDRESS}/transactions?limit=3`,
    );
    expect(fetchMock).toHaveBeenCalledWith(`https://api.hiro.so/extended/v1/address/${ADDRESS}/mempool?limit=3`);
  });

  it('throws NETWORK_ERROR when either endpoint responds not-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/mempool')) return Promise.resolve(jsonResponse({}, false));
        return Promise.resolve(jsonResponse({ results: [] }));
      }),
    );

    try {
      await getStxTransactions(ADDRESS, CFG);
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('NETWORK_ERROR');
    }
  });

  it('throws NETWORK_ERROR when a body is malformed (results not an array)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ results: 'nope' }))));

    try {
      await getStxTransactions(ADDRESS, CFG);
      expect.unreachable();
    } catch (e) {
      expect(isPasskeyWalletError(e)).toBe(true);
      expect(isPasskeyWalletError(e) && e.code).toBe('NETWORK_ERROR');
    }
  });

  it('URL-encodes the address in both the transactions and mempool fetch URLs', async () => {
    const weirdAddress = 'SP1M4/../evil?x=1';
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ results: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await getStxTransactions(weirdAddress, CFG);

    const encoded = encodeURIComponent(weirdAddress);
    expect(fetchMock).toHaveBeenCalledWith(`https://api.hiro.so/extended/v1/address/${encoded}/transactions?limit=20`);
    expect(fetchMock).toHaveBeenCalledWith(`https://api.hiro.so/extended/v1/address/${encoded}/mempool?limit=20`);
  });

  it("falls back to kind 'other' (not 'received') when sender_address is missing/non-string on a token_transfer row", async () => {
    const confirmed = {
      results: [
        {
          tx_id: '0xmalformed1',
          tx_status: 'success',
          tx_type: 'token_transfer',
          // sender_address deliberately omitted
          fee_rate: '1000',
          nonce: 1,
          burn_block_time: 1700000000,
          token_transfer: { recipient_address: ADDRESS, amount: '2000000' },
        },
        {
          tx_id: '0xmalformed2',
          tx_status: 'success',
          tx_type: 'token_transfer',
          sender_address: 12345, // non-string
          fee_rate: '1000',
          nonce: 2,
          burn_block_time: 1700000000,
          token_transfer: { recipient_address: ADDRESS, amount: '2000000' },
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/mempool')) return Promise.resolve(jsonResponse({ results: [] }));
        return Promise.resolve(jsonResponse(confirmed));
      }),
    );

    const txs = await getStxTransactions(ADDRESS, CFG);

    expect(txs.find((t) => t.txid === '0xmalformed1')!.kind).toBe('other');
    expect(txs.find((t) => t.txid === '0xmalformed1')!.counterparty).toBeUndefined();
    expect(txs.find((t) => t.txid === '0xmalformed2')!.kind).toBe('other');
    expect(txs.find((t) => t.txid === '0xmalformed2')!.counterparty).toBeUndefined();
  });

  it('strips control and bidi-override characters from a decoded memo', async () => {
    // "Hello" + ESC (0x1b, a C0 control) + RLO (U+202E) + "World"
    const raw = `Hello\x1bWorld\u202e`;
    const hex = Array.from(new TextEncoder().encode(raw))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const confirmed = {
      results: [
        {
          tx_id: '0xhostilememo',
          tx_status: 'success',
          tx_type: 'token_transfer',
          sender_address: ADDRESS,
          fee_rate: '1000',
          nonce: 1,
          burn_block_time: 1700000000,
          token_transfer: { recipient_address: OTHER, amount: '2000000', memo: `0x${hex}` },
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/mempool')) return Promise.resolve(jsonResponse({ results: [] }));
        return Promise.resolve(jsonResponse(confirmed));
      }),
    );

    const txs = await getStxTransactions(ADDRESS, CFG);

    expect(txs[0]!.memo).toBe('HelloWorld');
  });
});
