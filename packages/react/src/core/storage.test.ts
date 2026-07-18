import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveConfig, type WalletStorage } from '@toony1908/stacks-passkey-core';
import { clearStoredWallet, getStorage, loadStoredWallet, saveStoredWallet } from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

// Each test uses a distinct appName so its storageKey doesn't collide with
// another test sharing the in-memory fallback (a module-level singleton, same
// as real localStorage would be per-origin).

const ADDR1 = { mainnet: 'SPADDR1', testnet: 'STADDR1' };
const ADDR2 = { mainnet: 'SPADDR2', testnet: 'STADDR2' };
const ADDRX = { mainnet: 'SPADDRX', testnet: 'STADDRX' };
const ADDRY = { mainnet: 'SPADDRY', testnet: 'STADDRY' };
const ADDRZ = { mainnet: 'SPADDRZ', testnet: 'STADDRZ' };

describe('defaultStorage (in-memory fallback, no real localStorage in node env)', () => {
  it('round-trips save -> load', () => {
    const cfg = resolveConfig({ appName: 'StorageRoundTrip', network: 'mainnet' });
    saveStoredWallet(cfg, { credentialId: 'cred-1', addresses: ADDR1 });
    expect(loadStoredWallet(cfg)).toEqual({ credentialId: 'cred-1', addresses: ADDR1 });
  });

  it('returns null after clear', () => {
    const cfg = resolveConfig({ appName: 'StorageClear', network: 'mainnet' });
    saveStoredWallet(cfg, { credentialId: 'cred-2', addresses: ADDR2 });
    clearStoredWallet(cfg);
    expect(loadStoredWallet(cfg)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    const cfg = resolveConfig({ appName: 'StorageMalformed', network: 'mainnet' });
    getStorage(cfg).set(cfg.storageKey, 'not-json{');
    expect(loadStoredWallet(cfg)).toBeNull();
  });

  it('returns null when required fields are missing or wrong type', () => {
    const cfg = resolveConfig({ appName: 'StorageMissingFields', network: 'mainnet' });
    getStorage(cfg).set(cfg.storageKey, JSON.stringify({ credentialId: 'only-this' }));
    expect(loadStoredWallet(cfg)).toBeNull();
  });

  it('returns null for the old { credentialId, address } shape (pre-release: a reconnect re-populates it)', () => {
    const cfg = resolveConfig({ appName: 'StorageOldShape', network: 'mainnet' });
    getStorage(cfg).set(cfg.storageKey, JSON.stringify({ credentialId: 'cred-old', address: 'SPOLD' }));
    expect(loadStoredWallet(cfg)).toBeNull();
  });

  it('returns null when addresses.mainnet or addresses.testnet is missing/wrong type', () => {
    const cfg = resolveConfig({ appName: 'StorageBadAddresses', network: 'mainnet' });
    getStorage(cfg).set(
      cfg.storageKey,
      JSON.stringify({ credentialId: 'cred-1', addresses: { mainnet: 'SPADDR1' } }),
    );
    expect(loadStoredWallet(cfg)).toBeNull();
  });

  it('returns null when nothing was ever stored', () => {
    const cfg = resolveConfig({ appName: 'StorageNeverWritten', network: 'mainnet' });
    expect(loadStoredWallet(cfg)).toBeNull();
  });
});

describe('getStorage with an injected custom storage', () => {
  it('prefers cfg.storage over the default storage', () => {
    const backing = new Map<string, string>();
    const customStorage: WalletStorage = {
      get: (key) => backing.get(key) ?? null,
      set: (key, value) => {
        backing.set(key, value);
      },
      remove: (key) => {
        backing.delete(key);
      },
    };
    const cfg = resolveConfig({ appName: 'StorageCustom', network: 'mainnet', storage: customStorage });

    expect(getStorage(cfg)).toBe(customStorage);

    saveStoredWallet(cfg, { credentialId: 'cred-x', addresses: ADDRX });

    expect(backing.get(cfg.storageKey)).toBe(JSON.stringify({ credentialId: 'cred-x', addresses: ADDRX }));
    expect(loadStoredWallet(cfg)).toEqual({ credentialId: 'cred-x', addresses: ADDRX });
  });
});

describe('defaultStorage falling back from a real (or real-ish) localStorage', () => {
  it('uses window.localStorage when it is present and working', () => {
    const backing = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
    });
    const cfg = resolveConfig({ appName: 'StorageRealLS', network: 'mainnet' });

    saveStoredWallet(cfg, { credentialId: 'cred-y', addresses: ADDRY });

    expect(backing.get(cfg.storageKey)).toBe(JSON.stringify({ credentialId: 'cred-y', addresses: ADDRY }));
    expect(loadStoredWallet(cfg)).toEqual({ credentialId: 'cred-y', addresses: ADDRY });
  });

  it('falls back to the in-memory store when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    const cfg = resolveConfig({ appName: 'StorageThrowingLS', network: 'mainnet' });

    expect(() => saveStoredWallet(cfg, { credentialId: 'cred-z', addresses: ADDRZ })).not.toThrow();
    expect(loadStoredWallet(cfg)).toEqual({ credentialId: 'cred-z', addresses: ADDRZ });
  });

  // Regression test for the get()/set() fallback asymmetry: setItem() can
  // throw (write-blocked browser, quota exceeded) while getItem() keeps
  // working fine (just returning null, since nothing was ever actually
  // written there) — a WORKING localStorage.getItem() returning null is NOT
  // proof the key has no value; it may only exist in the memory fallback.
  it('get() checks the in-memory fallback when a working localStorage.getItem() returns null for a key set() wrote to memory', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null, // localStorage genuinely has nothing under any key
      setItem: () => {
        throw new Error('blocked'); // e.g. quota exceeded, write-blocked browser
      },
      removeItem: () => {},
    });
    const cfg = resolveConfig({ appName: 'StorageGetMemoryFallback', network: 'mainnet' });

    saveStoredWallet(cfg, { credentialId: 'cred-fallback', addresses: ADDRZ });

    // Before the fix: loadStoredWallet trusted getItem()'s successful `null`
    // and returned null here too — a "saved" wallet vanishing mid-session.
    expect(loadStoredWallet(cfg)).toEqual({ credentialId: 'cred-fallback', addresses: ADDRZ });
  });
});
