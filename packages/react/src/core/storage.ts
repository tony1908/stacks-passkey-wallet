import type { ResolvedConfig, StoredWallet, WalletStorage } from '@toony1908/stacks-passkey-core';

// Shared in-memory fallback for when localStorage is unavailable or throws
// (private browsing, sandboxed iframes, non-browser hosts). Module-level so
// it behaves like a persistent per-process store, the same as localStorage
// itself would — otherwise save/load pairs across separate defaultStorage()
// calls would silently lose data.
const memoryFallback = new Map<string, string>();

function hasWorkingLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function defaultStorage(): WalletStorage {
  return {
    get(key) {
      if (hasWorkingLocalStorage()) {
        try {
          const fromLocalStorage = localStorage.getItem(key);
          if (fromLocalStorage !== null) return fromLocalStorage;
          // localStorage itself worked, but has no value for this key. That's
          // NOT necessarily authoritative: `set()` falls back to
          // `memoryFallback` whenever `localStorage.setItem` throws (quota
          // exceeded, write-blocked browser, etc.), so a wallet "saved"
          // earlier this session may only exist in memory. Trusting a
          // successful-but-empty read here would make it silently disappear.
          return memoryFallback.get(key) ?? null;
        } catch {
          // fall through to memory
        }
      }
      return memoryFallback.get(key) ?? null;
    },
    set(key, value) {
      if (hasWorkingLocalStorage()) {
        try {
          localStorage.setItem(key, value);
          return;
        } catch {
          // fall through to memory
        }
      }
      memoryFallback.set(key, value);
    },
    remove(key) {
      if (hasWorkingLocalStorage()) {
        try {
          localStorage.removeItem(key);
          return;
        } catch {
          // fall through to memory
        }
      }
      memoryFallback.delete(key);
    },
  };
}

export function getStorage(cfg: ResolvedConfig): WalletStorage {
  return cfg.storage ?? defaultStorage();
}

// Old localStorage entries (the pre-network-switching `{ credentialId,
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

export function loadStoredWallet(cfg: ResolvedConfig): StoredWallet | null {
  try {
    const raw = getStorage(cfg).get(cfg.storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredWallet(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoredWallet(cfg: ResolvedConfig, wallet: StoredWallet): void {
  getStorage(cfg).set(cfg.storageKey, JSON.stringify(wallet));
}

export function clearStoredWallet(cfg: ResolvedConfig): void {
  getStorage(cfg).remove(cfg.storageKey);
}
