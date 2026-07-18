// RN persistence for the `{ credentialId, addresses }` pair, backed by
// `@react-native-async-storage/async-storage`. Unlike the web package's
// storage.ts (synchronous `localStorage`, matching core's sync `WalletStorage`
// interface), AsyncStorage's API is async — so this module does NOT implement
// core's `WalletStorage` shape; it's its own small async equivalent.
//
// Only PUBLIC data ever passes through here (see core's `StoredWallet` doc
// comment) — a credential id and both derived addresses, never a key,
// mnemonic, or entropy — so plain (unencrypted) AsyncStorage is an acceptable
// default. A consumer who wants encryption-at-rest (e.g. because the device
// itself isn't trusted) can swap in `expo-secure-store` or
// `react-native-keychain` by re-implementing these three functions with the
// same signatures; nothing else in this package depends on AsyncStorage
// directly.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ResolvedConfig, StoredWallet } from '@toony1908/stacks-passkey-core';

// Old localStorage-era entries (a pre-network-switching `{ credentialId,
// address }` shape) simply fail this check and load as null — a reconnect
// re-populates them. Acceptable pre-release; no migration needed.
function isStoredWallet(value: unknown): value is StoredWallet {
  const v = value as Partial<StoredWallet> | null;
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.credentialId === 'string' &&
    !!v.addresses &&
    typeof v.addresses === 'object' &&
    typeof v.addresses.mainnet === 'string' &&
    typeof v.addresses.testnet === 'string'
  );
}

export async function loadStoredWallet(cfg: ResolvedConfig): Promise<StoredWallet | null> {
  try {
    const raw = await AsyncStorage.getItem(cfg.storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredWallet(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveStoredWallet(cfg: ResolvedConfig, wallet: StoredWallet): Promise<void> {
  await AsyncStorage.setItem(cfg.storageKey, JSON.stringify(wallet));
}

export async function clearStoredWallet(cfg: ResolvedConfig): Promise<void> {
  await AsyncStorage.removeItem(cfg.storageKey);
}
