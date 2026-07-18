// useStxBalance/useStxTransactions now delegate their polling/refetch/
// stale-response-drop/network-switch behavior to
// `createWalletDataHooks(useStacksPasskeyWallet)` in
// @toony1908/stacks-passkey-core's src/react.ts — that behavior suite lives
// (or should live) there now, not here. What's left to verify at this
// package's level is wiring only: does this package's context (address,
// config) reach core's fetch calls correctly. Mocking moves from the old
// per-function `getStxBalance`/`getStxTransactions` mocks (which no longer
// sit on the call path — core calls its own internal ./balance and
// ./transactions modules directly) to a `fetch` stub, since that's the
// actual boundary those core modules cross.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wrapper, makeWrapper } from './testUtils';
import { loadStoredWallet } from '../core';
import { useStacksPasskeyWallet, useStxBalance, useStxTransactions } from './hooks';

const mockLoadStoredWallet = vi.mocked(loadStoredWallet);

const STORED_ADDRESSES = { mainnet: 'SP_ADDR', testnet: 'ST_ADDR' };

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useStacksPasskeyWallet', () => {
  it('throws a clear error when used outside StacksPasskeyProvider', () => {
    expect(() => renderHook(() => useStacksPasskeyWallet())).toThrow(/StacksPasskeyProvider/);
  });
});

describe('useStxBalance', () => {
  it('fetches the balance on mount for the context address and exposes it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ balance: '500', locked: '0' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStxBalance(), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.balanceMicroStx).toBe(500n);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/address/ST_ADDR/stx'));
  });

  it('does not fetch and reports not loading when there is no address', () => {
    mockLoadStoredWallet.mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStxBalance(), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.balanceMicroStx).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useStxTransactions', () => {
  it('fetches transactions on mount for the context address using the provided opts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStxTransactions({ limit: 5 }), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.transactions).toEqual([]);
    // Confirmed + mempool, both scoped to the context's address and the
    // caller-supplied limit.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/address/ST_ADDR/transactions?limit=5'));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/address/ST_ADDR/mempool?limit=5'));
  });

  it('does not fetch when there is no address', () => {
    mockLoadStoredWallet.mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStxTransactions(), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Behavior coverage for core's `usePolledResource` (core/src/react.ts),
// exercised through this package's binding because core's own vitest runs in
// a Node environment with no React renderer. If core's polling loop breaks,
// these fail. (A post-unmount stale-response test is deliberately absent:
// React 18+ makes a late setState after unmount a silent no-op, so the
// `ignore` flag's effect there has no external observable to assert on.)
describe('polling behavior (core usePolledResource via this binding)', () => {
  it('re-fetches on the configured pollIntervalMs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ balance: '500', locked: '0' }));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useStxBalance(), { wrapper: makeWrapper({ pollIntervalMs: 25 }) });

    // Initial load plus at least one interval tick.
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('refetch() triggers an immediate re-fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ balance: '500', locked: '0' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStxBalance(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsBefore = fetchMock.mock.calls.length;
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(callsBefore + 1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.balanceMicroStx).toBe(500n);
  });

  it('surfaces a failed fetch as `error` and clears it on a successful refetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue(jsonResponse({ balance: '7', locked: '0' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useStxBalance(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.balanceMicroStx).toBeUndefined();

    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.balanceMicroStx).toBe(7n));
    expect(result.current.error).toBeUndefined();
  });
});
