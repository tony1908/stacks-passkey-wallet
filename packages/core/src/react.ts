// Optional React data hooks, kept OUT of the main entry (`./index.ts`) so
// core's package description ("No React") stays true for consumers who never
// import this subpath. Behind `./react`, this is the single source of truth
// that @toony1908/stacks-passkey-react and -react-native bind their own
// `useStacksPasskeyWallet()` context into via `createWalletDataHooks` — context
// creation itself stays platform-side (it needs the platform's Provider/DOM
// vs RN differences), only the balance/transaction polling logic is shared.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getStxBalance } from './balance';
import { getStxTransactions, type WalletTx } from './transactions';
import type { ResolvedConfig } from './config';

/** The slice of a platform's wallet context this module needs to poll
 * balance/transactions — just the resolved address (if connected) and
 * config, not the full provider surface (connect/disconnect/send/etc). */
export interface WalletHookContext {
  address?: string;
  config: ResolvedConfig;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

interface PolledResource<T> {
  data?: T;
  isLoading: boolean;
  error?: Error;
  refetch: () => void;
}

/** Fetches `fetcher()` whenever `address` (re)appears, on a `pollIntervalMs`
 * poll, and on demand via `refetch`. Drops any in-flight response that
 * resolves after the effect was cleaned up (address change / unmount) via a
 * plain `ignore` flag — the core fetch functions take no AbortSignal. */
function usePolledResource<T>(
  address: string | undefined,
  fetcher: () => Promise<T>,
  pollIntervalMs: number,
  extraDeps: readonly unknown[],
): PolledResource<T> {
  const [state, setState] = useState<{ data?: T; isLoading: boolean; error?: Error }>({
    isLoading: !!address,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const ignoreRef = useRef({ current: false });

  const load = useCallback(() => {
    const ignore = ignoreRef.current;
    setState((s) => ({ ...s, isLoading: true, error: undefined }));
    fetcherRef.current().then(
      (data) => {
        if (!ignore.current) setState({ data, isLoading: false });
      },
      (err: unknown) => {
        if (!ignore.current) setState((s) => ({ ...s, isLoading: false, error: toError(err) }));
      },
    );
  }, []);

  const refetch = useCallback(() => {
    if (address) load();
  }, [address, load]);

  useEffect(() => {
    if (!address) {
      setState({ isLoading: false });
      return;
    }
    ignoreRef.current = { current: false };
    load();
    const interval = setInterval(load, pollIntervalMs);
    return () => {
      ignoreRef.current.current = true;
      clearInterval(interval);
    };
    // extraDeps lets callers (e.g. useStxTransactions) refetch when their
    // fetch params change, without this hook needing to know their shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, load, pollIntervalMs, ...extraDeps]);

  return { ...state, refetch };
}

/** Binds the shared balance/transaction polling hooks to a platform's own
 * `useWalletContext` (each platform's `useStacksPasskeyWallet`), so the
 * polling logic — and its comments — live in exactly one place while each
 * platform keeps its own context/provider implementation. */
export function createWalletDataHooks(useWalletContext: () => WalletHookContext): {
  useStxBalance: () => {
    balanceMicroStx?: bigint;
    isLoading: boolean;
    error?: Error;
    refetch: () => void;
  };
  useStxTransactions: (opts?: { limit?: number }) => {
    transactions?: WalletTx[];
    isLoading: boolean;
    error?: Error;
    refetch: () => void;
  };
} {
  function useStxBalance(): {
    balanceMicroStx?: bigint;
    isLoading: boolean;
    error?: Error;
    refetch: () => void;
  } {
    const { address, config } = useWalletContext();
    const { data, isLoading, error, refetch } = usePolledResource<bigint>(
      address,
      () => getStxBalance(address as string, config),
      config.pollIntervalMs,
      [config],
    );
    return { balanceMicroStx: data, isLoading, error, refetch };
  }

  function useStxTransactions(opts?: { limit?: number }): {
    transactions?: WalletTx[];
    isLoading: boolean;
    error?: Error;
    refetch: () => void;
  } {
    const { address, config } = useWalletContext();
    const limit = opts?.limit;
    const { data, isLoading, error, refetch } = usePolledResource<WalletTx[]>(
      address,
      // No explicit limit: getStxTransactions falls back to
      // cfg.transactionLimit (from config), so a provider-level
      // transactionLimit is honored without this hook needing to resolve it.
      () => getStxTransactions(address as string, config, opts),
      config.pollIntervalMs,
      [config, limit],
    );
    return { transactions: data, isLoading, error, refetch };
  }

  return { useStxBalance, useStxTransactions };
}
