import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveConfig, base64UrlEncode, base64UrlDecode } from '@toony1908/stacks-passkey-core';

const CFG = resolveConfig({ appName: 'TestApp', network: 'mainnet' });

// react-native-passkeys is mocked at the top level (JSON/base64url-string
// API, confirmed against the installed 0.4.1 package's real
// build/index.d.ts): isSupported(): boolean, create(request) and get(request)
// resolve/reject with `AuthenticationResponseJSON`-shaped objects whose
// `rawId`/PRF results are base64url STRINGS, not ArrayBuffers.
// `vi.mock`'s factory is hoisted above these declarations, so the mock fns
// themselves must be created via `vi.hoisted` to be visible inside it.
const { isSupported, create, get } = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  create: vi.fn(),
  get: vi.fn(),
}));

vi.mock('react-native-passkeys', () => ({ isSupported, create, get }));

const { isPasskeySupported, registerPasskey, derivePrfEntropy, reconnectWallet } = await import('./passkey');

afterEach(() => {
  vi.clearAllMocks();
});

describe('isPasskeySupported', () => {
  it('reflects react-native-passkeys.isSupported()', () => {
    isSupported.mockReturnValue(true);
    expect(isPasskeySupported()).toBe(true);
    isSupported.mockReturnValue(false);
    expect(isPasskeySupported()).toBe(false);
  });

  it('is false if isSupported() throws (e.g. native module not linked)', () => {
    isSupported.mockImplementation(() => {
      throw new Error('native module not linked');
    });
    expect(isPasskeySupported()).toBe(false);
  });
});

describe('registerPasskey', () => {
  it('throws PASSKEY_UNSUPPORTED and never calls create() when unsupported', async () => {
    isSupported.mockReturnValue(false);

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PASSKEY_UNSUPPORTED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns { credentialId, entropy: null } when PRF is enabled but not evaluated at create', async () => {
    isSupported.mockReturnValue(true);
    create.mockResolvedValue({
      rawId: 'cred-raw-id-b64url',
      clientExtensionResults: { prf: { enabled: true } },
    });

    const result = await registerPasskey(CFG);

    expect(result).toEqual({ credentialId: 'cred-raw-id-b64url', entropy: null });

    const request = create.mock.calls[0]![0];
    expect(request.rp).toEqual({ name: CFG.appName });
    expect(request.user.name).toBe(CFG.userName);
    expect(request.user.displayName).toBe(CFG.userDisplayName);
    expect(request.authenticatorSelection).toEqual({ residentKey: 'required', userVerification: 'required' });
    // PRF is evaluated DURING create() (the Android pattern) with the same
    // salt bytes as the web package, base64url-encoded for this library.
    expect(request.extensions.prf.eval.first).toBe(base64UrlEncode(new TextEncoder().encode(CFG.prfSalt)));
    expect(request.pubKeyCredParams).toEqual([
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ]);
    expect(request.timeout).toBeUndefined();
    // challenge/user.id must be base64url strings (the JSON-friendly API),
    // not raw bytes.
    expect(typeof request.challenge).toBe('string');
    expect(typeof request.user.id).toBe('string');
  });

  it('returns the decoded entropy when the platform evaluates PRF at creation (Android)', async () => {
    isSupported.mockReturnValue(true);
    const entropyBytes = new Uint8Array(32).fill(4);
    create.mockResolvedValue({
      rawId: 'cred-raw-id-b64url',
      clientExtensionResults: { prf: { enabled: true, results: { first: base64UrlEncode(entropyBytes) } } },
    });

    const result = await registerPasskey(CFG);

    expect(result.credentialId).toBe('cred-raw-id-b64url');
    expect(result.entropy).toEqual(entropyBytes);
  });

  it('includes rpId in rp when configured', async () => {
    isSupported.mockReturnValue(true);
    const cfgWithRpId = resolveConfig({ appName: 'TestApp', network: 'mainnet', rpId: 'example.com' });
    create.mockResolvedValue({ rawId: 'id', clientExtensionResults: { prf: { enabled: true } } });

    await registerPasskey(cfgWithRpId);

    expect(create.mock.calls[0]![0].rp).toEqual({ name: 'TestApp', id: 'example.com' });
  });

  it('includes timeout when cfg.webauthnTimeoutMs is set', async () => {
    isSupported.mockReturnValue(true);
    const cfgWithTimeout = resolveConfig({ appName: 'TestApp', network: 'mainnet', webauthnTimeoutMs: 60_000 });
    create.mockResolvedValue({ rawId: 'id', clientExtensionResults: { prf: { enabled: true } } });

    await registerPasskey(cfgWithTimeout);

    expect(create.mock.calls[0]![0].timeout).toBe(60_000);
  });

  it('throws PRF_UNSUPPORTED when prf.enabled is not true', async () => {
    isSupported.mockReturnValue(true);
    create.mockResolvedValue({ rawId: 'id', clientExtensionResults: {} });

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PRF_UNSUPPORTED' });
  });

  it('throws PASSKEY_CANCELLED when create() resolves null (user dismissed the sheet)', async () => {
    isSupported.mockReturnValue(true);
    create.mockResolvedValue(null);

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('maps an iOS-style ERR_USER_CANCELLED error to PASSKEY_CANCELLED', async () => {
    isSupported.mockReturnValue(true);
    create.mockRejectedValue(Object.assign(new Error('User cancelled the passkey interaction'), { code: 'ERR_USER_CANCELLED' }));

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('maps an Android-style "UserCancelled" message to PASSKEY_CANCELLED', async () => {
    isSupported.mockReturnValue(true);
    create.mockRejectedValue(Object.assign(new Error('UserCancelled'), { code: 'Passkey Create' }));

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('maps a web-style NotAllowedError to PASSKEY_CANCELLED', async () => {
    isSupported.mockReturnValue(true);
    create.mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));

    await expect(registerPasskey(CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('rethrows an unrelated error unchanged', async () => {
    isSupported.mockReturnValue(true);
    create.mockRejectedValue(new Error('boom'));

    await expect(registerPasskey(CFG)).rejects.toThrow('boom');
  });
});

describe('derivePrfEntropy', () => {
  it('throws PASSKEY_UNSUPPORTED and never calls get() when unsupported', async () => {
    isSupported.mockReturnValue(false);

    await expect(derivePrfEntropy('cred-id', CFG)).rejects.toMatchObject({ code: 'PASSKEY_UNSUPPORTED' });
    expect(get).not.toHaveBeenCalled();
  });

  it('returns the decoded PRF entropy bytes', async () => {
    isSupported.mockReturnValue(true);
    const entropyBytes = new Uint8Array(32).fill(5);
    get.mockResolvedValue({
      clientExtensionResults: { prf: { results: { first: base64UrlEncode(entropyBytes) } } },
    });

    const entropy = await derivePrfEntropy('cred-id', CFG);

    expect(entropy).toEqual(entropyBytes);

    const request = get.mock.calls[0]![0];
    expect(request.userVerification).toBe('required');
    expect(request.allowCredentials).toEqual([{ type: 'public-key', id: 'cred-id' }]);
    // The PRF salt must be the exact same bytes as the web package derives
    // from `TextEncoder().encode(cfg.prfSalt)` — just base64url-encoded,
    // since that's the form react-native-passkeys' JSON API wants.
    expect(request.extensions.prf.eval.first).toBe(base64UrlEncode(new TextEncoder().encode(CFG.prfSalt)));
    // CFG has no rpId configured, so none should be sent.
    expect(request.rpId).toBeUndefined();
  });

  it('includes rpId in the get() request when cfg.rpId is set (required on native)', async () => {
    isSupported.mockReturnValue(true);
    const cfgWithRpId = resolveConfig({ appName: 'TestApp', network: 'mainnet', rpId: 'example.com' });
    get.mockResolvedValue({
      clientExtensionResults: { prf: { results: { first: base64UrlEncode(new Uint8Array(32)) } } },
    });

    await derivePrfEntropy('cred-id', cfgWithRpId);

    expect(get.mock.calls[0]![0].rpId).toBe(cfgWithRpId.rpId);
  });

  it('includes timeout when cfg.webauthnTimeoutMs is set', async () => {
    isSupported.mockReturnValue(true);
    const cfgWithTimeout = resolveConfig({ appName: 'TestApp', network: 'mainnet', webauthnTimeoutMs: 15_000 });
    get.mockResolvedValue({
      clientExtensionResults: { prf: { results: { first: base64UrlEncode(new Uint8Array(32)) } } },
    });

    await derivePrfEntropy('cred-id', cfgWithTimeout);

    expect(get.mock.calls[0]![0].timeout).toBe(15_000);
  });

  it('throws PRF_UNSUPPORTED when no PRF result is returned', async () => {
    isSupported.mockReturnValue(true);
    get.mockResolvedValue({ clientExtensionResults: {} });

    await expect(derivePrfEntropy('cred-id', CFG)).rejects.toMatchObject({ code: 'PRF_UNSUPPORTED' });
  });

  it('throws PASSKEY_CANCELLED when get() resolves null', async () => {
    isSupported.mockReturnValue(true);
    get.mockResolvedValue(null);

    await expect(derivePrfEntropy('cred-id', CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('maps a cancellation error to PASSKEY_CANCELLED', async () => {
    isSupported.mockReturnValue(true);
    get.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'ERR_USER_CANCELLED' }));

    await expect(derivePrfEntropy('cred-id', CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });
});

describe('reconnectWallet', () => {
  it('throws PASSKEY_UNSUPPORTED and never calls get() when unsupported', async () => {
    isSupported.mockReturnValue(false);

    await expect(reconnectWallet(CFG)).rejects.toMatchObject({ code: 'PASSKEY_UNSUPPORTED' });
    expect(get).not.toHaveBeenCalled();
  });

  it('requests a discoverable-credential assertion (no allowCredentials) and returns the credential id + both derived addresses', async () => {
    isSupported.mockReturnValue(true);
    const entropyBytes = new Uint8Array(32).fill(1);
    get.mockResolvedValue({
      rawId: 'discovered-cred-id',
      clientExtensionResults: { prf: { results: { first: base64UrlEncode(entropyBytes) } } },
    });

    const result = await reconnectWallet(CFG);

    expect(result.credentialId).toBe('discovered-cred-id');
    expect(result.addresses.mainnet).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
    expect(result.addresses.testnet).toBe('ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ');

    const request = get.mock.calls[0]![0];
    expect(request.allowCredentials).toBeUndefined();
    expect(request.userVerification).toBe('required');
    expect(request.extensions.prf.eval.first).toBe(base64UrlEncode(new TextEncoder().encode(CFG.prfSalt)));
    // CFG has no rpId configured, so none should be sent.
    expect(request.rpId).toBeUndefined();
  });

  it('includes rpId in the get() request when cfg.rpId is set (required on native)', async () => {
    isSupported.mockReturnValue(true);
    const cfgWithRpId = resolveConfig({ appName: 'TestApp', network: 'mainnet', rpId: 'example.com' });
    const entropyBytes = new Uint8Array(32).fill(1);
    get.mockResolvedValue({
      rawId: 'discovered-cred-id',
      clientExtensionResults: { prf: { results: { first: base64UrlEncode(entropyBytes) } } },
    });

    await reconnectWallet(cfgWithRpId);

    expect(get.mock.calls[0]![0].rpId).toBe(cfgWithRpId.rpId);
  });

  it('throws PRF_UNSUPPORTED when no PRF result is returned', async () => {
    isSupported.mockReturnValue(true);
    get.mockResolvedValue({ rawId: 'id', clientExtensionResults: {} });

    await expect(reconnectWallet(CFG)).rejects.toMatchObject({ code: 'PRF_UNSUPPORTED' });
  });

  it('maps a cancellation error to PASSKEY_CANCELLED', async () => {
    isSupported.mockReturnValue(true);
    get.mockRejectedValue(Object.assign(new Error('UserCancelled'), { code: 'Passkey Get' }));

    await expect(reconnectWallet(CFG)).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('decodes the base64url PRF result into the same bytes (round-trips with base64UrlDecode)', async () => {
    isSupported.mockReturnValue(true);
    const raw = base64UrlEncode(new Uint8Array(32).fill(9));
    get.mockResolvedValue({ rawId: 'id', clientExtensionResults: { prf: { results: { first: raw } } } });

    await reconnectWallet(CFG);

    expect(base64UrlDecode(raw)).toEqual(new Uint8Array(32).fill(9));
  });
});
