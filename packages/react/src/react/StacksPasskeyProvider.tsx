// The only place a `DerivedWallet` (private key/mnemonic) may momentarily
// exist is inside a core `withWalletKey` callback. This component's state
// holds nothing but the public `StoredWallet` ({ credentialId, addresses })
// — never a key, mnemonic, or entropy in state/ref/context/module scope.
//
// One passkey derives one private key, which has both a mainnet AND a
// testnet address (same key, different version byte). Both are derived once
// at connect/reconnect time and stored together, so switching the active
// network at runtime (`setNetwork`) is just picking a different stored
// address — no second passkey prompt.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  PasskeyWalletError,
  deriveWalletAddresses,
  getStxBalance,
  isPasskeySupported,
  loadStoredWallet,
  reconnectWallet as coreReconnectWallet,
  registerPasskey,
  resolveConfig,
  saveStoredWallet,
  clearStoredWallet,
  sendStx as coreSendStx,
  signStxTransfer as coreSignStxTransfer,
  withWalletKey as coreWithWalletKey,
  type DerivedWallet,
  type PasskeyWalletConfig,
  type ResolvedColorScheme,
  type StacksNetwork,
  type StoredWallet,
} from '../core';
import { StacksPasskeyContext, type SendStxArgs } from './context';

/** Live `(prefers-color-scheme: light)` reading. SSR-safe: defaults to
 * `'dark'` when there's no `window` (matching the config-level default). */
function systemColorScheme(): ResolvedColorScheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** `explorer` and `storage` (if you pass them) must be REFERENTIALLY STABLE
 * across renders — hoist them to a module-level constant, or memoize them
 * yourself. `apiUrls` is stabilized automatically below (it's a plain
 * string record, so it's cheap to compare by content), but `explorer` and
 * `storage` hold functions, which can't be compared that way. An inline
 * object/function literal on either prop gets a new identity every render,
 * which changes `config`'s identity every render, which resets the
 * `useEffect` polling in `useStxBalance`/`useStxTransactions` (both depend
 * on `[config, ...]`) before it ever gets a chance to fire on its interval. */
export interface StacksPasskeyProviderProps extends PasskeyWalletConfig {
  children: ReactNode;
}

export function StacksPasskeyProvider(props: StacksPasskeyProviderProps) {
  const {
    children,
    appName,
    network: initialNetwork,
    rpId,
    userName,
    userDisplayName,
    prfSalt,
    webauthnTimeoutMs,
    apiUrls,
    explorer,
    accountIndex,
    feeBufferMicroStx,
    pollIntervalMs,
    transactionLimit,
    storage,
    storageKey,
    colorScheme,
  } = props;

  // `network` prop is only the INITIAL network; the active network is state
  // the user can flip at runtime via `setNetwork`, with no new passkey
  // prompt (see module doc comment above).
  const [network, setNetwork] = useState<StacksNetwork>(initialNetwork);

  // `apiUrls` is a plain `{ mainnet?, testnet? }` string record, so its
  // CONTENT (not its reference) is what actually determines `config` — keying
  // the memo below on this JSON string instead of the `apiUrls` object itself
  // means an inline `apiUrls={{ ... }}` literal on every parent render no
  // longer forces `config` to change identity every render (see the prop doc
  // comment above for why that matters). `explorer`/`storage` hold functions
  // and can't be serialized the same way — those still require the caller to
  // pass a referentially stable value.
  const apiUrlsKey = JSON.stringify(apiUrls ?? {});

  const config = useMemo(
    () =>
      resolveConfig({
        appName,
        network,
        rpId,
        userName,
        userDisplayName,
        prfSalt,
        webauthnTimeoutMs,
        apiUrls,
        explorer,
        accountIndex,
        feeBufferMicroStx,
        pollIntervalMs,
        transactionLimit,
        storage,
        storageKey,
        colorScheme,
      }),
    // apiUrlsKey stands in for apiUrls itself — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      appName,
      network,
      rpId,
      userName,
      userDisplayName,
      prfSalt,
      webauthnTimeoutMs,
      apiUrlsKey,
      explorer,
      accountIndex,
      feeBufferMicroStx,
      pollIntervalMs,
      transactionLimit,
      storage,
      storageKey,
      colorScheme,
    ],
  );

  // Lazy initializer: storage reads are synchronous, so this avoids a
  // disconnected -> connected flash on mount for an already-linked wallet.
  const [stored, setStored] = useState<StoredWallet | null>(() => loadStoredWallet(config));
  const [isConnecting, setIsConnecting] = useState(false);

  const isSupported = isPasskeySupported();
  const isConnected = stored !== null;
  const address = stored?.addresses[network];

  // Only relevant for `config.colorScheme === 'auto'`; tracks the live OS
  // preference so an 'auto' consumer repaints if the user flips their
  // system theme without reloading the page. Reads `matchMedia` lazily
  // (only when 'auto' is actually requested) so non-'auto' configs never
  // touch it — matters for hosts (older jsdom, some SSR shims) that don't
  // implement `matchMedia` at all.
  const [autoScheme, setAutoScheme] = useState<ResolvedColorScheme>(() =>
    config.colorScheme === 'auto' ? systemColorScheme() : 'dark',
  );
  useEffect(() => {
    if (config.colorScheme !== 'auto' || typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e: MediaQueryListEvent) => setAutoScheme(e.matches ? 'light' : 'dark');
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [config.colorScheme]);
  const resolvedColorScheme: ResolvedColorScheme = config.colorScheme === 'auto' ? autoScheme : config.colorScheme;

  const connect = useCallback(async () => {
    if (stored) return;
    setIsConnecting(true);
    try {
      const credentialId = await registerPasskey(config);
      const addresses = await deriveWalletAddresses(credentialId, config);
      const wallet: StoredWallet = { credentialId, addresses };
      saveStoredWallet(config, wallet);
      setStored(wallet);
    } finally {
      setIsConnecting(false);
    }
  }, [config, stored]);

  const reconnect = useCallback(async () => {
    if (stored) return;
    setIsConnecting(true);
    try {
      const { credentialId, addresses } = await coreReconnectWallet(config);
      const wallet: StoredWallet = { credentialId, addresses };
      saveStoredWallet(config, wallet);
      setStored(wallet);
    } finally {
      setIsConnecting(false);
    }
  }, [config, stored]);

  const disconnect = useCallback(async () => {
    clearStoredWallet(config);
    setStored(null);
  }, [config]);

  const sendStx = useCallback(
    async (args: SendStxArgs): Promise<string> => {
      if (!stored) {
        throw new PasskeyWalletError('NO_WALLET', 'Connect a wallet before sending STX');
      }
      const currentAddress = stored.addresses[network];
      const balance = await getStxBalance(currentAddress, config);
      if (balance < args.amount + config.feeBufferMicroStx) {
        throw new PasskeyWalletError(
          'INSUFFICIENT_BALANCE',
          'Insufficient STX balance. Send STX to your wallet address, then try again.',
        );
      }
      return coreSendStx(stored.credentialId, config, args);
    },
    [stored, network, config],
  );

  const signStxTransfer = useCallback(
    async (args: SendStxArgs): Promise<string> => {
      if (!stored) {
        throw new PasskeyWalletError('NO_WALLET', 'Connect a wallet before signing a transaction');
      }
      return coreSignStxTransfer(stored.credentialId, config, args);
    },
    [stored, config],
  );

  const withWalletKey = useCallback(
    async <TResult,>(fn: (wallet: DerivedWallet) => Promise<TResult>): Promise<TResult> => {
      if (!stored) {
        throw new PasskeyWalletError('NO_WALLET', 'Connect a wallet first');
      }
      return coreWithWalletKey(stored.credentialId, config, fn);
    },
    [stored, config],
  );

  const revealMnemonic = useCallback(async (): Promise<string> => {
    if (!stored) {
      throw new PasskeyWalletError('NO_WALLET', 'Connect a wallet first');
    }
    return coreWithWalletKey(stored.credentialId, config, async (w) => w.mnemonic);
  }, [stored, config]);

  const value = useMemo(
    () => ({
      isSupported,
      isConnected,
      isConnecting,
      address,
      network,
      setNetwork,
      config,
      resolvedColorScheme,
      connect,
      reconnect,
      disconnect,
      sendStx,
      signStxTransfer,
      withWalletKey,
      revealMnemonic,
    }),
    [
      isSupported,
      isConnected,
      isConnecting,
      address,
      network,
      setNetwork,
      config,
      resolvedColorScheme,
      connect,
      reconnect,
      disconnect,
      sendStx,
      signStxTransfer,
      withWalletKey,
      revealMnemonic,
    ],
  );

  return <StacksPasskeyContext.Provider value={value}>{children}</StacksPasskeyContext.Provider>;
}
