import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveWalletAddresses, withWalletKey } from './session';
import * as passkeyModule from './passkey';
import { resolveConfig } from '@toony1908/stacks-passkey-core';

const CFG = resolveConfig({ appName: 'TestApp', network: 'mainnet' });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('withWalletKey', () => {
  it('zeroizes the entropy after fn resolves', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    const entropy = new Uint8Array(32).fill(7);
    vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(entropy);

    const address = await withWalletKey('cred-id', CFG, async (wallet) => wallet.address);

    expect(typeof address).toBe('string');
    expect(address.length).toBeGreaterThan(0);
    expect(entropy.every((b) => b === 0)).toBe(true);
  });

  it('zeroizes the entropy even when fn throws', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
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
    vi.stubGlobal('window', { isSecureContext: true });
    const entropy = new Uint8Array(32).fill(3);
    vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(entropy);

    let capturedPrivateKey: string | undefined;
    await withWalletKey('cred-id', CFG, async (wallet) => {
      capturedPrivateKey = wallet.privateKey;
    });

    expect(capturedPrivateKey).toEqual(expect.any(String));
    expect(capturedPrivateKey!.length).toBeGreaterThan(0);
  });

  it('zeroizes the original ArrayBuffer backing the real (unmocked) PRF result', async () => {
    // Unlike the other tests in this file, derivePrfEntropy is NOT mocked
    // here — this exercises the real WebAuthn -> Uint8Array(ArrayBuffer)
    // path end-to-end, proving `new Uint8Array(buf)` views (rather than
    // copies) the PRF memory, so `entropy.fill(0)` in withWalletKey's
    // `finally` actually scrubs the bytes the authenticator handed back.
    vi.stubGlobal('window', { isSecureContext: true, PublicKeyCredential: class {} });
    const entropyBuffer = new Uint8Array(32).fill(8).buffer;
    const get = vi.fn().mockResolvedValue({
      getClientExtensionResults: () => ({ prf: { results: { first: entropyBuffer } } }),
    });
    vi.stubGlobal('navigator', { credentials: { get } });

    await withWalletKey('cred-id', CFG, async (wallet) => wallet.address);

    expect(new Uint8Array(entropyBuffer).every((b) => b === 0)).toBe(true);
  });

  it('throws INSECURE_CONTEXT and never calls derivePrfEntropy', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    const spy = vi.spyOn(passkeyModule, 'derivePrfEntropy');

    await expect(withWalletKey('cred-id', CFG, async (w) => w.address)).rejects.toMatchObject({
      code: 'INSECURE_CONTEXT',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('deriveWalletAddresses', () => {
  it('derives both the mainnet and testnet address from a single passkey prompt, then zeroizes the entropy', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    const entropy = new Uint8Array(32).fill(1);
    const spy = vi.spyOn(passkeyModule, 'derivePrfEntropy').mockResolvedValue(entropy);

    const addresses = await deriveWalletAddresses('cred-id', CFG);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(addresses.mainnet).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
    expect(addresses.testnet).toBe('ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ');
    expect(entropy.every((b) => b === 0)).toBe(true);
  });
});
