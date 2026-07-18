import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPasskeySupported, assertSecureContext, registerPasskey, derivePrfEntropy, reconnectWallet } from './passkey';
import { resolveConfig, base64UrlDecode } from '@toony1908/stacks-passkey-core';

const CFG = resolveConfig({ appName: 'TestApp', network: 'mainnet' });

afterEach(() => {
  vi.unstubAllGlobals();
});

// A window that's both a secure context AND supports passkeys (has
// PublicKeyCredential) — the "everything's fine" baseline most tests below
// stub in before overriding navigator.credentials.
function stubSecureWindow() {
  vi.stubGlobal('window', { isSecureContext: true, PublicKeyCredential: class {} });
}

describe('isPasskeySupported', () => {
  it('is false when window is undefined', () => {
    expect(isPasskeySupported()).toBe(false);
  });

  it('is true when PublicKeyCredential exists on window', () => {
    vi.stubGlobal('window', { PublicKeyCredential: class {} });
    expect(isPasskeySupported()).toBe(true);
  });

  it('is false when window exists but lacks PublicKeyCredential', () => {
    vi.stubGlobal('window', {});
    expect(isPasskeySupported()).toBe(false);
  });
});

describe('assertSecureContext', () => {
  it('throws INSECURE_CONTEXT when window is undefined', () => {
    expect(() => assertSecureContext()).toThrow();
    try {
      assertSecureContext();
      expect.unreachable();
    } catch (e) {
      expect((e as { code?: string }).code).toBe('INSECURE_CONTEXT');
    }
  });

  it('throws INSECURE_CONTEXT when isSecureContext is false', () => {
    vi.stubGlobal('window', { isSecureContext: false });
    expect(() => assertSecureContext()).toThrow(expect.objectContaining({ code: 'INSECURE_CONTEXT' }));
  });

  it('does not throw when isSecureContext is true', () => {
    stubSecureWindow();
    expect(() => assertSecureContext()).not.toThrow();
  });
});

describe('registerPasskey', () => {
  it('throws INSECURE_CONTEXT and never calls navigator.credentials.create', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    const create = vi.fn();
    vi.stubGlobal('navigator', { credentials: { create } });

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'INSECURE_CONTEXT' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns a base64url credential id when PRF is enabled', async () => {
    stubSecureWindow();
    const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
    const create = vi.fn().mockResolvedValue({
      rawId,
      getClientExtensionResults: () => ({ prf: { enabled: true } }),
    });
    vi.stubGlobal('navigator', { credentials: { create } });

    const credentialId = await registerPasskey(CFG);

    expect(typeof credentialId).toBe('string');
    expect(base64UrlDecode(credentialId)).toEqual(new Uint8Array(rawId));

    const options = create.mock.calls[0]![0].publicKey;
    expect(options.rp).toEqual({ name: CFG.appName });
    expect(options.user.name).toBe(CFG.userName);
    expect(options.user.displayName).toBe(CFG.userDisplayName);
    expect(options.authenticatorSelection).toEqual({ residentKey: 'required', userVerification: 'required' });
    expect(options.extensions).toEqual({ prf: {} });
    expect(options.pubKeyCredParams).toEqual([
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ]);
    expect(options.timeout).toBeUndefined();
  });

  it('uses cfg.userName/cfg.userDisplayName for user.name/displayName when configured', async () => {
    stubSecureWindow();
    const cfgWithIdentity = resolveConfig({
      appName: 'TestApp',
      network: 'mainnet',
      userName: 'alice@example.com',
      userDisplayName: 'Alice',
    });
    const create = vi.fn().mockResolvedValue({
      rawId: new Uint8Array(16).buffer,
      getClientExtensionResults: () => ({ prf: { enabled: true } }),
    });
    vi.stubGlobal('navigator', { credentials: { create } });

    await registerPasskey(cfgWithIdentity);

    const options = create.mock.calls[0]![0].publicKey;
    expect(options.user.name).toBe('alice@example.com');
    expect(options.user.displayName).toBe('Alice');
  });

  it('includes publicKey.timeout when cfg.webauthnTimeoutMs is set', async () => {
    stubSecureWindow();
    const cfgWithTimeout = resolveConfig({ appName: 'TestApp', network: 'mainnet', webauthnTimeoutMs: 60_000 });
    const create = vi.fn().mockResolvedValue({
      rawId: new Uint8Array(16).buffer,
      getClientExtensionResults: () => ({ prf: { enabled: true } }),
    });
    vi.stubGlobal('navigator', { credentials: { create } });

    await registerPasskey(cfgWithTimeout);

    expect(create.mock.calls[0]![0].publicKey.timeout).toBe(60_000);
  });

  it('includes rpId in rp when configured', async () => {
    stubSecureWindow();
    const cfgWithRpId = resolveConfig({ appName: 'TestApp', network: 'mainnet', rpId: 'example.com' });
    const create = vi.fn().mockResolvedValue({
      rawId: new Uint8Array(16).buffer,
      getClientExtensionResults: () => ({ prf: { enabled: true } }),
    });
    vi.stubGlobal('navigator', { credentials: { create } });

    await registerPasskey(cfgWithRpId);

    expect(create.mock.calls[0]![0].publicKey.rp).toEqual({ name: 'TestApp', id: 'example.com' });
  });

  it('throws PRF_UNSUPPORTED when prf.enabled is not true', async () => {
    stubSecureWindow();
    const create = vi.fn().mockResolvedValue({
      rawId: new Uint8Array(16).buffer,
      getClientExtensionResults: () => ({}),
    });
    vi.stubGlobal('navigator', { credentials: { create } });

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PRF_UNSUPPORTED' });
  });

  it('maps a NotAllowedError to PASSKEY_CANCELLED', async () => {
    stubSecureWindow();
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
    vi.stubGlobal('navigator', { credentials: { create } });

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('throws PASSKEY_UNSUPPORTED and never calls navigator.credentials.create when the browser lacks PublicKeyCredential', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    const create = vi.fn();
    vi.stubGlobal('navigator', { credentials: { create } });

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PASSKEY_UNSUPPORTED' });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('derivePrfEntropy', () => {
  it('throws INSECURE_CONTEXT and never calls navigator.credentials.get', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    const get = vi.fn();
    vi.stubGlobal('navigator', { credentials: { get } });

    await expect(derivePrfEntropy('cred-id', CFG)).rejects.toMatchObject({ code: 'INSECURE_CONTEXT' });
    expect(get).not.toHaveBeenCalled();
  });

  it('returns the PRF entropy bytes', async () => {
    stubSecureWindow();
    const entropyBuffer = new Uint8Array(32).fill(5).buffer;
    const get = vi.fn().mockResolvedValue({
      getClientExtensionResults: () => ({ prf: { results: { first: entropyBuffer } } }),
    });
    vi.stubGlobal('navigator', { credentials: { get } });

    const entropy = await derivePrfEntropy('cred-id', CFG);

    expect(entropy).toEqual(new Uint8Array(32).fill(5));

    const options = get.mock.calls[0]![0].publicKey;
    expect(options.userVerification).toBe('required');
    expect(options.allowCredentials).toEqual([{ type: 'public-key', id: base64UrlDecode('cred-id') }]);
    expect(options.extensions.prf.eval.first).toEqual(new TextEncoder().encode(CFG.prfSalt));
    expect(options.timeout).toBeUndefined();
  });

  it('includes publicKey.timeout on the assertion when cfg.webauthnTimeoutMs is set', async () => {
    stubSecureWindow();
    const cfgWithTimeout = resolveConfig({ appName: 'TestApp', network: 'mainnet', webauthnTimeoutMs: 15_000 });
    const entropyBuffer = new Uint8Array(32).fill(5).buffer;
    const get = vi.fn().mockResolvedValue({
      getClientExtensionResults: () => ({ prf: { results: { first: entropyBuffer } } }),
    });
    vi.stubGlobal('navigator', { credentials: { get } });

    await derivePrfEntropy('cred-id', cfgWithTimeout);

    expect(get.mock.calls[0]![0].publicKey.timeout).toBe(15_000);
  });

  it('throws PRF_UNSUPPORTED when no PRF result is returned', async () => {
    stubSecureWindow();
    const get = vi.fn().mockResolvedValue({ getClientExtensionResults: () => ({}) });
    vi.stubGlobal('navigator', { credentials: { get } });

    await expect(derivePrfEntropy('cred-id', CFG)).rejects.toMatchObject({ code: 'PRF_UNSUPPORTED' });
  });

  it('maps a NotAllowedError to PASSKEY_CANCELLED', async () => {
    stubSecureWindow();
    const get = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
    vi.stubGlobal('navigator', { credentials: { get } });

    await expect(derivePrfEntropy('cred-id', CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('throws PASSKEY_UNSUPPORTED and never calls navigator.credentials.get when the browser lacks PublicKeyCredential', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    const get = vi.fn();
    vi.stubGlobal('navigator', { credentials: { get } });

    await expect(derivePrfEntropy('cred-id', CFG)).rejects.toMatchObject({ code: 'PASSKEY_UNSUPPORTED' });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('reconnectWallet', () => {
  it('throws INSECURE_CONTEXT and never calls navigator.credentials.get', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    const get = vi.fn();
    vi.stubGlobal('navigator', { credentials: { get } });

    await expect(reconnectWallet(CFG)).rejects.toMatchObject({ code: 'INSECURE_CONTEXT' });
    expect(get).not.toHaveBeenCalled();
  });

  it('throws PASSKEY_UNSUPPORTED and never calls navigator.credentials.get when the browser lacks PublicKeyCredential', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    const get = vi.fn();
    vi.stubGlobal('navigator', { credentials: { get } });

    await expect(reconnectWallet(CFG)).rejects.toMatchObject({ code: 'PASSKEY_UNSUPPORTED' });
    expect(get).not.toHaveBeenCalled();
  });

  it('requests a discoverable-credential assertion (no allowCredentials) and returns the credential id + both derived addresses', async () => {
    stubSecureWindow();
    const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
    const entropyBuffer = new Uint8Array(32).fill(1).buffer;
    const get = vi.fn().mockResolvedValue({
      rawId,
      getClientExtensionResults: () => ({ prf: { results: { first: entropyBuffer } } }),
    });
    vi.stubGlobal('navigator', { credentials: { get } });

    const result = await reconnectWallet(CFG);

    expect(base64UrlDecode(result.credentialId)).toEqual(new Uint8Array(rawId));
    expect(result.addresses.mainnet).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
    expect(result.addresses.testnet).toBe('ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ');

    const options = get.mock.calls[0]![0].publicKey;
    expect(options.allowCredentials).toBeUndefined();
    expect(options.userVerification).toBe('required');
    expect(options.extensions.prf.eval.first).toEqual(new TextEncoder().encode(CFG.prfSalt));
  });

  it('throws PRF_UNSUPPORTED when no PRF result is returned', async () => {
    stubSecureWindow();
    const get = vi.fn().mockResolvedValue({
      rawId: new Uint8Array(16).buffer,
      getClientExtensionResults: () => ({}),
    });
    vi.stubGlobal('navigator', { credentials: { get } });

    await expect(reconnectWallet(CFG)).rejects.toMatchObject({ code: 'PRF_UNSUPPORTED' });
  });

  it('maps a NotAllowedError to PASSKEY_CANCELLED', async () => {
    stubSecureWindow();
    const get = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
    vi.stubGlobal('navigator', { credentials: { get } });

    await expect(reconnectWallet(CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('zeroizes the original ArrayBuffer backing the PRF result (proves it views, not copies, the memory)', async () => {
    stubSecureWindow();
    const entropyBuffer = new Uint8Array(32).fill(6).buffer;
    const get = vi.fn().mockResolvedValue({
      rawId: new Uint8Array(16).buffer,
      getClientExtensionResults: () => ({ prf: { results: { first: entropyBuffer } } }),
    });
    vi.stubGlobal('navigator', { credentials: { get } });

    await reconnectWallet(CFG);

    expect(new Uint8Array(entropyBuffer).every((b) => b === 0)).toBe(true);
  });
});
