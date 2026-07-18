// React context for the passkey wallet. Holds only public data
// (credential id, address) — never a private key/mnemonic/entropy.

import { createContext } from 'react';
import type { DerivedWallet, ResolvedColorScheme, ResolvedConfig, StacksNetwork } from '@toony1908/stacks-passkey-core';

export interface SendStxArgs {
  recipient: string;
  amount: bigint;
  memo?: string;
}

export interface StacksPasskeyContextValue {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  address?: string;
  network: StacksNetwork;
  /** Switches the active network. One passkey derives one private key with
   * both a mainnet and testnet address — both are stored at connect time, so
   * this just flips which stored address is active. No passkey prompt. */
  setNetwork(network: StacksNetwork): void;
  config: ResolvedConfig;
  /** `config.colorScheme` with `'auto'` resolved to the actual scheme in
   * effect (the live `prefers-color-scheme` reading). */
  resolvedColorScheme: ResolvedColorScheme;
  connect(): Promise<void>;
  /** Restores a wallet from an existing (resident/discoverable) passkey —
   * for when local storage lost the `{ credentialId, address }` pair (site
   * data cleared, private browsing) but the passkey itself still exists. */
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  sendStx(args: SendStxArgs): Promise<string>;
  signStxTransfer(args: SendStxArgs): Promise<string>;
  withWalletKey<T>(fn: (wallet: DerivedWallet) => Promise<T>): Promise<T>;
  revealMnemonic(): Promise<string>;
}

export const StacksPasskeyContext = createContext<StacksPasskeyContextValue | undefined>(undefined);
