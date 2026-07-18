// React context for the passkey wallet (mirrors
// @toony1908/stacks-passkey-react's src/react/context.ts). Holds only public
// data (credential id, address) — never a private key/mnemonic/entropy.

import { createContext } from 'react';
import type { ColorScheme, DerivedWallet, ResolvedColorScheme, ResolvedConfig, StacksNetwork } from '@toony1908/stacks-passkey-core';

export interface SendStxArgs {
  recipient: string;
  amount: bigint;
  memo?: string;
}

/** Resolves `config.colorScheme` against a live `useColorScheme()` reading.
 * Pure (and free of any `react-native` import) so it's directly unit-testable
 * — `useColorScheme` is a hook and must be called from the provider, which
 * isn't rendered in this package's test suite (no RN Jest/vitest preset is
 * set up; see vitest.config.ts). `null`/`undefined` (RN's "unknown" reading)
 * falls back to `'dark'`, matching the config-level default. */
export function resolveColorScheme(
  configured: ColorScheme,
  systemScheme: 'light' | 'dark' | null | undefined,
): ResolvedColorScheme {
  if (configured !== 'auto') return configured;
  return systemScheme === 'light' ? 'light' : 'dark';
}

export interface StacksPasskeyContextValue {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  /** `true` from mount until the provider's initial AsyncStorage read of any
   * previously-connected wallet resolves (success or failure), then `false`
   * for the rest of the session. Distinguishes "still hydrating, don't know
   * yet" from a real "disconnected" — without it, a returning user with an
   * already-linked wallet reads as `isConnected: false` for one render while
   * the async load is in flight (AsyncStorage, unlike web's synchronous
   * `localStorage`, can't be read in a `useState` lazy initializer). Gate any
   * "connect" CTA on `!isInitializing`, not on `isConnected` alone, during
   * startup. */
  isInitializing: boolean;
  address?: string;
  network: StacksNetwork;
  /** Switches the active network. One passkey derives one private key with
   * both a mainnet and testnet address — both are stored at connect time, so
   * this just flips which stored address is active. No passkey prompt. */
  setNetwork(network: StacksNetwork): void;
  config: ResolvedConfig;
  /** `config.colorScheme` with `'auto'` resolved to the actual scheme in
   * effect (the live `useColorScheme()` reading). */
  resolvedColorScheme: ResolvedColorScheme;
  connect(): Promise<void>;
  /** Restores a wallet from an existing (resident/discoverable) passkey —
   * for when device storage lost the `{ credentialId, addresses }` pair
   * (app data cleared, new device) but the passkey itself still exists
   * (e.g. synced via iCloud Keychain / Google Password Manager). */
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  sendStx(args: SendStxArgs): Promise<string>;
  signStxTransfer(args: SendStxArgs): Promise<string>;
  withWalletKey<T>(fn: (wallet: DerivedWallet) => Promise<T>): Promise<T>;
  revealMnemonic(): Promise<string>;
}

export const StacksPasskeyContext = createContext<StacksPasskeyContextValue | undefined>(undefined);
