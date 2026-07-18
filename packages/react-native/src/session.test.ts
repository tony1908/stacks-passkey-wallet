import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveConfig } from '@toony1908/stacks-passkey-core';

// session.ts only calls through to passkey.ts's `derivePrfEntropy` (spied on
// below), but importing passkey.ts still pulls in the real
// `react-native-passkeys` native module — which isn't linked/loadable in a
// plain Node/vitest process — so it's stubbed the same way passkey.test.ts
// does, even though these tests never call `create`/`get` directly.
vi.mock('react-native-passkeys', () => ({
  isSupported: vi.fn(() => true),
  create: vi.fn(),
  get: vi.fn(),
}));

const { deriveWalletAddresses, withWalletKey, registerWallet } = await import('./session');
const passkeyModule = await import('./passkey');

const CFG = resolveConfig({ appName: 'TestApp', network: 'mainnet' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withWalletKey', () => {
  it('zeroizes the entropy after fn resolves', async () => {
    const entropy = new Uint8Array(32).fill(7);
    vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(entropy);

    const address = await withWalletKey('cred-id', CFG, async (wallet) => wallet.address);

    expect(typeof address).toBe('string');
    expect(address.length).toBeGreaterThan(0);
    expect(entropy.every((b) => b === 0)).toBe(true);
  });

  it('zeroizes the entropy even when fn throws', async () => {
    const entropy = new Uint8Array(32).fill(9);
    vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(entropy);

    await expect(
      withWalletKey('cred-id', CFG, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(entropy.every((b) => b === 0)).toBe(true);
  });

  it('never caches the wallet: fn only sees the wallet for the duration of the call', async () => {
    const entropy = new Uint8Array(32).fill(3);
    vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(entropy);

    let capturedPrivateKey: string | undefined;
    await withWalletKey('cred-id', CFG, async (wallet) => {
      capturedPrivateKey = wallet.privateKey;
    });

    expect(capturedPrivateKey).toEqual(expect.any(String));
    expect(capturedPrivateKey!.length).toBeGreaterThan(0);
  });

  it('passes credentialId and cfg through to derivePrfEntropy', async () => {
    const entropy = new Uint8Array(32).fill(2);
    const spy = vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(entropy);

    await withWalletKey('my-cred-id', CFG, async (w) => w.address);

    expect(spy).toHaveBeenCalledWith('my-cred-id', CFG);
  });
});

describe('deriveWalletAddresses', () => {
  it('derives both the mainnet and testnet address from a single passkey prompt, then zeroizes the entropy', async () => {
    const entropy = new Uint8Array(32).fill(1);
    const spy = vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(entropy);

    const addresses = await deriveWalletAddresses('cred-id', CFG);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(addresses.mainnet).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
    expect(addresses.testnet).toBe('ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ');
    expect(entropy.every((b) => b === 0)).toBe(true);
  });
});

describe('registerWallet', () => {
  it('derives the wallet from create-time entropy (single ceremony), without falling back to derivePrfEntropy', async () => {
    const entropy = new Uint8Array(32).fill(1);
    vi.spyOn(passkeyModule, 'registerPasskey').mockResolvedValue({ credentialId: 'new-cred-id', entropy });
    const deriveSpy = vi.spyOn(passkeyModule, 'derivePrfEntropy');

    const result = await registerWallet(CFG);

    expect(result.credentialId).toBe('new-cred-id');
    expect(result.addresses.mainnet).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
    expect(result.addresses.testnet).toBe('ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ');
    expect(deriveSpy).not.toHaveBeenCalled();
    expect(entropy.every((b) => b === 0)).toBe(true);
  });

  it('falls back to derivePrfEntropy when registerPasskey returns entropy: null (platform did not evaluate PRF at create)', async () => {
    vi.spyOn(passkeyModule, 'registerPasskey').mockResolvedValue({ credentialId: 'new-cred-id', entropy: null });
    const fallbackEntropy = new Uint8Array(32).fill(1);
    const deriveSpy = vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(fallbackEntropy);

    const result = await registerWallet(CFG);

    expect(deriveSpy).toHaveBeenCalledWith('new-cred-id', CFG);
    expect(result.credentialId).toBe('new-cred-id');
    expect(result.addresses.mainnet).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
    expect(result.addresses.testnet).toBe('ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ');
    expect(fallbackEntropy.every((b) => b === 0)).toBe(true);
  });
});
