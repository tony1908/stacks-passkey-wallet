import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveConfig } from '@toony1908/stacks-passkey-core';

// In-memory fake backing the AsyncStorage mock — a real AsyncStorage would
// persist to native disk; the fake just needs get/set/remove semantics.
const backing = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => backing.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      backing.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      backing.delete(key);
    }),
  },
}));

const { loadStoredWallet, saveStoredWallet, clearStoredWallet } = await import('./storage');

const ADDR1 = { mainnet: 'SPADDR1', testnet: 'STADDR1' };

beforeEach(() => {
  backing.clear();
});

describe('storage (AsyncStorage-backed, async)', () => {
  it('round-trips save -> load', async () => {
    const cfg = resolveConfig({ appName: 'RNStorageRoundTrip', network: 'mainnet' });
    await saveStoredWallet(cfg, { credentialId: 'cred-1', addresses: ADDR1 });
    await expect(loadStoredWallet(cfg)).resolves.toEqual({ credentialId: 'cred-1', addresses: ADDR1 });
  });

  it('returns null after clear', async () => {
    const cfg = resolveConfig({ appName: 'RNStorageClear', network: 'mainnet' });
    await saveStoredWallet(cfg, { credentialId: 'cred-2', addresses: ADDR1 });
    await clearStoredWallet(cfg);
    await expect(loadStoredWallet(cfg)).resolves.toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    const cfg = resolveConfig({ appName: 'RNStorageMalformed', network: 'mainnet' });
    backing.set(cfg.storageKey, 'not-json{');
    await expect(loadStoredWallet(cfg)).resolves.toBeNull();
  });

  it('returns null when required fields are missing or wrong type', async () => {
    const cfg = resolveConfig({ appName: 'RNStorageMissingFields', network: 'mainnet' });
    backing.set(cfg.storageKey, JSON.stringify({ credentialId: 'only-this' }));
    await expect(loadStoredWallet(cfg)).resolves.toBeNull();
  });

  it('returns null when addresses.mainnet or addresses.testnet is missing/wrong type', async () => {
    const cfg = resolveConfig({ appName: 'RNStorageBadAddresses', network: 'mainnet' });
    backing.set(cfg.storageKey, JSON.stringify({ credentialId: 'cred-1', addresses: { mainnet: 'SPADDR1' } }));
    await expect(loadStoredWallet(cfg)).resolves.toBeNull();
  });

  it('returns null when nothing was ever stored', async () => {
    const cfg = resolveConfig({ appName: 'RNStorageNeverWritten', network: 'mainnet' });
    await expect(loadStoredWallet(cfg)).resolves.toBeNull();
  });

  it('keys entries by cfg.storageKey (distinct appNames do not collide)', async () => {
    const cfgA = resolveConfig({ appName: 'RNStorageAppA', network: 'mainnet' });
    const cfgB = resolveConfig({ appName: 'RNStorageAppB', network: 'mainnet' });
    await saveStoredWallet(cfgA, { credentialId: 'cred-a', addresses: ADDR1 });

    await expect(loadStoredWallet(cfgB)).resolves.toBeNull();
    await expect(loadStoredWallet(cfgA)).resolves.toEqual({ credentialId: 'cred-a', addresses: ADDR1 });
  });
});
