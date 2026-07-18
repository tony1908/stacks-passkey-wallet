// Mirrors @toony1908/stacks-passkey-react's StacksPasskeyProvider.tsx. The only
// place a `DerivedWallet` (private key/mnemonic) may momentarily exist is
// inside a `withWalletKey` callback. This component's state holds nothing but
// the public `StoredWallet` ({ credentialId, addresses }) — never a key,
// mnemonic, or entropy in state/ref/context/module scope.
//
// One passkey derives one private key, which has both a mainnet AND a
// testnet address (same key, different version byte). Both are derived once
// at connect/reconnect time and stored together, so switching the active
// network at runtime (`setNetwork`) is just picking a different stored
// address — no second passkey prompt.
//
// Adapted from web: device storage (AsyncStorage) is async, unlike
// localStorage, so the initial load happens in a mount effect instead of a
// synchronous `useState` lazy initializer — there's necessarily a brief
// render before it resolves where `stored` is still `null` (mirroring
// `isConnected: false`), which web's provider doesn't have. That render is
// exposed as `isInitializing: true` on the context value (cleared once the
// load settles, success or failure) specifically so a returning user with an
// already-linked wallet doesn't read as "disconnected" for that one frame —
// an integrator should gate any "connect" CTA on `!isInitializing` rather
// than trusting `isConnected` alone during startup.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  PasskeyWalletError,
  getStxBalance,
  resolveConfig,
  type DerivedWallet,
  type PasskeyWalletConfig,
  type StacksNetwork,
  type StoredWallet,
} from '@toony1908/stacks-passkey-core';
import { isPasskeySupported, reconnectWallet as coreReconnectWallet } from './passkey';
import { registerWallet, withWalletKey as coreWithWalletKey } from './session';
import { sendStx as coreSendStx, signStxTransfer as coreSignStxTransfer } from './stx';
import { loadStoredWallet, saveStoredWallet, clearStoredWallet } from './storage';
import { resolveColorScheme, StacksPasskeyContext, type SendStxArgs } from './context';

export interface StacksPasskeyProviderProps extends Omit<PasskeyWalletConfig, 'storage'> {
  // `storage` is intentionally excluded from the props (core's
  // `PasskeyWalletConfig.storage`, a synchronous `WalletStorage`) — RN
  // persistence (storage.ts) is its own async module backed by
  // `@react-native-async-storage/async-storage` and never reads
  // `config.storage` at all, so accepting it here would be a silent no-op
  // (looks configured, does nothing). Omitting it makes passing it a compile
  // error instead. See storage.ts's module doc comment for how to actually
  // swap the storage backend (re-implement its three exported functions).
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
    storageKey,
    colorScheme,
  } = props;

  // `network` prop is only the INITIAL network; the active network is state
  // the user can flip at runtime via `setNetwork`, with no new passkey
  // prompt (see module doc comment above).
  const [network, setNetwork] = useState<StacksNetwork>(initialNetwork);

  // `apiUrls` is a plain `Partial<Record<StacksNetwork, string>>` — safe to
  // compare by content, so an inline `apiUrls={{ mainnet: '...' }}` literal
  // (a fresh object reference every render) doesn't recompute `config` below
  // on every render, which would otherwise reset `useStxBalance`'s /
  // `useStxTransactions`'s poll interval each time. `explorer`, by contrast,
  // holds FUNCTIONS (`txUrl`/`addressUrl`) — those can't be compared by
  // JSON.stringify, so `explorer` is NOT stabilized this way. A caller
  // passing an inline `explorer={{ txUrl: (n, id) => ... }}` object literal
  // still resets `config` (and polling) every render; pass a module-level
  // constant instead if that matters.
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
        storageKey,
        colorScheme,
      }),
    // apiUrls itself is intentionally omitted: apiUrlsKey (its content hash,
    // computed above) is the dependency that actually gates recomputation —
    // see the comment above apiUrlsKey.
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
      storageKey,
      colorScheme,
    ],
  );

  const [stored, setStored] = useState<StoredWallet | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  // True from mount until the AsyncStorage load below resolves (success OR
  // failure) — lets an integrator distinguish "still hydrating, don't know
  // yet" from a real "disconnected" (isConnected: false, isInitializing:
  // false), instead of every returning user seeing a false disconnected
  // flash while storage.ts's async read is in flight.
  const [isInitializing, setIsInitializing] = useState(true);

  // Loads any previously-connected wallet from AsyncStorage once on mount.
  // Intentionally NOT re-run when `config` changes (e.g. `setNetwork`
  // flipping the active network recomputes `config`'s identity) — the
  // storage key doesn't depend on network, and re-reading storage on every
  // network toggle could clobber optimistic state from an in-flight
  // connect()/reconnect() with a stale read.
  useEffect(() => {
    let cancelled = false;
    loadStoredWallet(config).then(
      (wallet) => {
        if (!cancelled) {
          setStored(wallet);
          setIsInitializing(false);
        }
      },
      () => {
        // loadStoredWallet already catches internally and resolves `null`
        // rather than rejecting, but isInitializing must still clear on any
        // outcome — this handler is a defensive backstop, not the expected path.
        if (!cancelled) setIsInitializing(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSupported = isPasskeySupported();
  const isConnected = stored !== null;
  const address = stored?.addresses[network];

  // `useColorScheme` is a hook (must live here, not in a helper) and already
  // re-renders this component on OS-level theme changes — no extra
  // effect/state needed the way web's matchMedia listener requires.
  const systemScheme = useColorScheme();
  const resolvedColorScheme = resolveColorScheme(config.colorScheme, systemScheme);

  const connect = useCallback(async () => {
    if (stored) return;
    setIsConnecting(true);
    try {
      // Single ceremony: PRF is evaluated during create() (Android), so we
      // don't run a follow-up get() against the just-made credential.
      const wallet: StoredWallet = await registerWallet(config);
      await saveStoredWallet(config, wallet);
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
      await saveStoredWallet(config, wallet);
      setStored(wallet);
    } finally {
      setIsConnecting(false);
    }
  }, [config, stored]);

  const disconnect = useCallback(async () => {
    await clearStoredWallet(config);
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
      isInitializing,
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
      isInitializing,
      address,
      network,
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
