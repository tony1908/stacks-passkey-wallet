import { describe, it, expect } from 'vitest';
import { resolveConfig, hiroHost, defaultExplorerTxUrl, defaultExplorerAddressUrl } from './config';

describe('resolveConfig', () => {
  it('fills in defaults derived from appName and network', () => {
    const resolved = resolveConfig({ appName: 'MyApp', network: 'mainnet' });

    expect(resolved.appName).toBe('MyApp');
    expect(resolved.network).toBe('mainnet');
    expect(resolved.userName).toBe('MyApp');
    expect(resolved.userDisplayName).toBe('MyApp');
    expect(resolved.prfSalt).toBe('MyApp-stacks-passkey-v1');
    expect(resolved.storageKey).toBe('stacks-passkey-wallet:MyApp');
    expect(resolved.apiUrls).toEqual({});
    expect(resolved.explorer.txUrl).toBe(defaultExplorerTxUrl);
    expect(resolved.explorer.addressUrl).toBe(defaultExplorerAddressUrl);
    expect(resolved.accountIndex).toBe(0);
    expect(resolved.feeBufferMicroStx).toBe(3_000n);
    expect(resolved.maxFeeMicroStx).toBe(1_000_000n);
    expect(resolved.pollIntervalMs).toBe(30_000);
    expect(resolved.transactionLimit).toBe(20);
    expect(resolved.rpId).toBeUndefined();
    expect(resolved.webauthnTimeoutMs).toBeUndefined();
    expect(resolved.storage).toBeUndefined();
    expect(resolved.colorScheme).toBe('dark');
  });

  it('preserves every explicit override', () => {
    const customTxUrl = (network: string, txid: string) => `custom/${network}/${txid}`;
    const customAddressUrl = (network: string, address: string) => `custom-addr/${network}/${address}`;
    const storage = { get: () => null, set: () => {}, remove: () => {} };

    const resolved = resolveConfig({
      appName: 'MyApp',
      network: 'testnet',
      rpId: 'example.com',
      userName: 'user@example.com',
      userDisplayName: 'A User',
      prfSalt: 'custom-salt',
      webauthnTimeoutMs: 45_000,
      apiUrls: { testnet: 'https://custom.host' },
      explorer: { txUrl: customTxUrl, addressUrl: customAddressUrl },
      accountIndex: 2,
      feeBufferMicroStx: 5_000n,
      maxFeeMicroStx: 2_000_000n,
      pollIntervalMs: 15_000,
      transactionLimit: 50,
      storage,
      storageKey: 'custom-key',
      colorScheme: 'light',
    });

    expect(resolved.rpId).toBe('example.com');
    expect(resolved.userName).toBe('user@example.com');
    expect(resolved.userDisplayName).toBe('A User');
    expect(resolved.prfSalt).toBe('custom-salt');
    expect(resolved.webauthnTimeoutMs).toBe(45_000);
    expect(resolved.apiUrls).toEqual({ testnet: 'https://custom.host' });
    expect(resolved.explorer.txUrl).toBe(customTxUrl);
    expect(resolved.explorer.addressUrl).toBe(customAddressUrl);
    expect(resolved.accountIndex).toBe(2);
    expect(resolved.feeBufferMicroStx).toBe(5_000n);
    expect(resolved.maxFeeMicroStx).toBe(2_000_000n);
    expect(resolved.pollIntervalMs).toBe(15_000);
    expect(resolved.transactionLimit).toBe(50);
    expect(resolved.storage).toBe(storage);
    expect(resolved.storageKey).toBe('custom-key');
    expect(resolved.colorScheme).toBe('light');
  });
});

describe('hiroHost', () => {
  it('uses the mainnet default host when apiUrls is empty', () => {
    expect(hiroHost({ network: 'mainnet', apiUrls: {} })).toBe('https://api.hiro.so');
  });

  it('uses the testnet default host when apiUrls is empty', () => {
    expect(hiroHost({ network: 'testnet', apiUrls: {} })).toBe('https://api.testnet.hiro.so');
  });

  it('prefers an explicit apiUrls override for the active network', () => {
    expect(hiroHost({ network: 'mainnet', apiUrls: { mainnet: 'https://custom.host' } })).toBe(
      'https://custom.host',
    );
  });

  it('falls back to the default when apiUrls only has an entry for the OTHER network', () => {
    expect(hiroHost({ network: 'mainnet', apiUrls: { testnet: 'https://custom.testnet.host' } })).toBe(
      'https://api.hiro.so',
    );
  });
});
