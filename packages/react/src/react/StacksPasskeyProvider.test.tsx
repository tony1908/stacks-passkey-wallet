import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Import order matters: `./testUtils` registers the `../core` mock (hoisted
// within its own file); importing it first guarantees this file's own
// `../core` import below resolves to the same mocked module instance.
import { makeWrapper, testConfig, Wrapper } from './testUtils';
import {
  clearStoredWallet,
  deriveWalletAddresses,
  getStxBalance,
  loadStoredWallet,
  reconnectWallet,
  registerPasskey,
  saveStoredWallet,
  sendStx,
  STX_FEE_BUFFER_MICROSTX,
  withWalletKey,
} from '../core';
import { useStacksPasskeyWallet } from './hooks';
import { StacksPasskeyProvider } from './StacksPasskeyProvider';

const mockRegisterPasskey = vi.mocked(registerPasskey);
const mockReconnectWallet = vi.mocked(reconnectWallet);
const mockDeriveWalletAddresses = vi.mocked(deriveWalletAddresses);
const mockWithWalletKey = vi.mocked(withWalletKey);
const mockSendStx = vi.mocked(sendStx);
const mockGetStxBalance = vi.mocked(getStxBalance);
const mockLoadStoredWallet = vi.mocked(loadStoredWallet);
const mockSaveStoredWallet = vi.mocked(saveStoredWallet);
const mockClearStoredWallet = vi.mocked(clearStoredWallet);

const STORED_ADDRESSES = { mainnet: 'SP_STORED', testnet: 'ST_STORED' };

/** Stubs `window.matchMedia` for a `(prefers-color-scheme: light)`-only
 * query, returning `matches: lightPreferred`. No `change` subscription
 * plumbing — use an inline stub in tests that need to fire a change event. */
function mockMatchMedia(lightPreferred: boolean) {
  const fn = vi.fn(() => ({
    matches: lightPreferred,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('matchMedia', fn);
  return fn;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadStoredWallet.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StacksPasskeyProvider', () => {
  it('mounts disconnected when there is no stored wallet', () => {
    const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeUndefined();
    expect(result.current.isConnecting).toBe(false);
  });

  it('mounts connected when a wallet is already stored, using the initial network prop to pick the address', () => {
    mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });

    const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

    // testUtils.Wrapper configures network: 'testnet'.
    expect(result.current.isConnected).toBe(true);
    expect(result.current.network).toBe('testnet');
    expect(result.current.address).toBe('ST_STORED');
  });

  it('connect() registers a passkey, derives BOTH addresses from a single prompt, and persists them', async () => {
    mockRegisterPasskey.mockResolvedValue('cred1');
    mockDeriveWalletAddresses.mockResolvedValue({ mainnet: 'SP_NEW', testnet: 'ST_NEW' });

    const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

    let connectPromise!: Promise<void>;
    act(() => {
      connectPromise = result.current.connect();
    });
    expect(result.current.isConnecting).toBe(true);

    await act(async () => {
      await connectPromise;
    });

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.isConnected).toBe(true);
    // network prop defaults to 'testnet' in testUtils.
    expect(result.current.address).toBe('ST_NEW');
    expect(mockDeriveWalletAddresses).toHaveBeenCalledWith('cred1', expect.anything());
    expect(mockSaveStoredWallet).toHaveBeenCalledWith(expect.anything(), {
      credentialId: 'cred1',
      addresses: { mainnet: 'SP_NEW', testnet: 'ST_NEW' },
    });
  });

  it('reconnect() restores an existing passkey wallet with both addresses from a discoverable credential', async () => {
    mockReconnectWallet.mockResolvedValue({
      credentialId: 'c2',
      addresses: { mainnet: 'SP_RECONNECTED', testnet: 'ST_RECONNECTED' },
    });

    const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

    let reconnectPromise!: Promise<void>;
    act(() => {
      reconnectPromise = result.current.reconnect();
    });
    expect(result.current.isConnecting).toBe(true);

    await act(async () => {
      await reconnectPromise;
    });

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.address).toBe('ST_RECONNECTED');
    expect(mockSaveStoredWallet).toHaveBeenCalledWith(expect.anything(), {
      credentialId: 'c2',
      addresses: { mainnet: 'SP_RECONNECTED', testnet: 'ST_RECONNECTED' },
    });
  });

  it('disconnect() clears storage and flips to disconnected', async () => {
    mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
    const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockClearStoredWallet).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeUndefined();
  });

  describe('setNetwork', () => {
    it('flips the active address to the other stored network WITHOUT any passkey prompt or re-derivation', async () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      expect(result.current.network).toBe('testnet');
      expect(result.current.address).toBe('ST_STORED');

      act(() => {
        result.current.setNetwork('mainnet');
      });

      expect(result.current.network).toBe('mainnet');
      expect(result.current.address).toBe('SP_STORED');
      expect(mockRegisterPasskey).not.toHaveBeenCalled();
      expect(mockReconnectWallet).not.toHaveBeenCalled();
      expect(mockDeriveWalletAddresses).not.toHaveBeenCalled();
      expect(mockWithWalletKey).not.toHaveBeenCalled();
    });

    it('updates config.network so downstream reads (balance/tx/send) target the new network', () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      act(() => {
        result.current.setNetwork('mainnet');
      });

      expect(result.current.config.network).toBe('mainnet');
    });
  });

  describe('sendStx', () => {
    it('throws NO_WALLET when disconnected', async () => {
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      await expect(result.current.sendStx({ recipient: 'ST_R', amount: 1n })).rejects.toMatchObject({
        code: 'NO_WALLET',
      });
      expect(mockSendStx).not.toHaveBeenCalled();
    });

    it('rejects with INSUFFICIENT_BALANCE and skips core sendStx when balance is too low', async () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      mockGetStxBalance.mockResolvedValue(0n);
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      await expect(result.current.sendStx({ recipient: 'ST_R', amount: 100n })).rejects.toMatchObject({
        code: 'INSUFFICIENT_BALANCE',
      });
      expect(mockSendStx).not.toHaveBeenCalled();
    });

    it('rejects with INSUFFICIENT_BALANCE when balance exactly equals the amount (no room for the fee)', async () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      mockGetStxBalance.mockResolvedValue(100n);
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      await expect(result.current.sendStx({ recipient: 'ST_R', amount: 100n })).rejects.toMatchObject({
        code: 'INSUFFICIENT_BALANCE',
      });
      expect(mockSendStx).not.toHaveBeenCalled();
    });

    it('calls core sendStx and returns its txid when balance covers the amount plus the fee buffer', async () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      mockGetStxBalance.mockResolvedValue(100n + STX_FEE_BUFFER_MICROSTX);
      mockSendStx.mockResolvedValue('0xTXID');
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      const args = { recipient: 'ST_R', amount: 100n };
      const txid = await result.current.sendStx(args);

      expect(txid).toBe('0xTXID');
      expect(mockGetStxBalance).toHaveBeenCalledWith('ST_STORED', expect.objectContaining({ network: 'testnet' }));
      expect(mockSendStx).toHaveBeenCalledWith('cred1', expect.objectContaining({ network: 'testnet' }), args);
    });

    it('preflights against the CURRENT network address after switching networks', async () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      mockGetStxBalance.mockResolvedValue(100n + STX_FEE_BUFFER_MICROSTX);
      mockSendStx.mockResolvedValue('0xTXID');
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      act(() => {
        result.current.setNetwork('mainnet');
      });

      await result.current.sendStx({ recipient: 'SP_R', amount: 100n });

      expect(mockGetStxBalance).toHaveBeenCalledWith('SP_STORED', expect.objectContaining({ network: 'mainnet' }));
      expect(mockSendStx).toHaveBeenCalledWith(
        'cred1',
        expect.objectContaining({ network: 'mainnet' }),
        expect.anything(),
      );
    });

    it('honors a custom (lower) config.feeBufferMicroStx: a balance the DEFAULT buffer would reject now succeeds', async () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      // Balance exactly equals the amount — the default 3000n buffer test
      // above proves this is rejected at the default; a 0n buffer proves the
      // threshold moved because of the config override, not by coincidence.
      mockGetStxBalance.mockResolvedValue(100n);
      mockSendStx.mockResolvedValue('0xTXID');
      const { result } = renderHook(() => useStacksPasskeyWallet(), {
        wrapper: makeWrapper({ feeBufferMicroStx: 0n }),
      });

      const txid = await result.current.sendStx({ recipient: 'ST_R', amount: 100n });

      expect(txid).toBe('0xTXID');
    });

    it('honors a custom (higher) config.feeBufferMicroStx: a balance the DEFAULT buffer would accept now fails', async () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      // Balance covers amount + the default 3000n buffer, but not a 10_000n buffer.
      mockGetStxBalance.mockResolvedValue(100n + STX_FEE_BUFFER_MICROSTX);
      const { result } = renderHook(() => useStacksPasskeyWallet(), {
        wrapper: makeWrapper({ feeBufferMicroStx: 10_000n }),
      });

      await expect(result.current.sendStx({ recipient: 'ST_R', amount: 100n })).rejects.toMatchObject({
        code: 'INSUFFICIENT_BALANCE',
      });
      expect(mockSendStx).not.toHaveBeenCalled();
    });
  });

  describe('resolvedColorScheme', () => {
    it('defaults to dark when colorScheme is not configured', () => {
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      expect(result.current.resolvedColorScheme).toBe('dark');
    });

    it('resolves to light when colorScheme is explicitly "light"', () => {
      const { result } = renderHook(() => useStacksPasskeyWallet(), {
        wrapper: makeWrapper({ colorScheme: 'light' }),
      });

      expect(result.current.resolvedColorScheme).toBe('light');
    });

    it('resolves to dark when colorScheme is explicitly "dark"', () => {
      const { result } = renderHook(() => useStacksPasskeyWallet(), {
        wrapper: makeWrapper({ colorScheme: 'dark' }),
      });

      expect(result.current.resolvedColorScheme).toBe('dark');
    });

    it('follows matchMedia when colorScheme is "auto" (light preferred)', () => {
      const matchMedia = mockMatchMedia(true);
      const { result } = renderHook(() => useStacksPasskeyWallet(), {
        wrapper: makeWrapper({ colorScheme: 'auto' }),
      });

      expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: light)');
      expect(result.current.resolvedColorScheme).toBe('light');
    });

    it('follows matchMedia when colorScheme is "auto" (dark preferred)', () => {
      mockMatchMedia(false);
      const { result } = renderHook(() => useStacksPasskeyWallet(), {
        wrapper: makeWrapper({ colorScheme: 'auto' }),
      });

      expect(result.current.resolvedColorScheme).toBe('dark');
    });

    it('updates resolvedColorScheme when the OS-level preference changes, for "auto"', () => {
      let changeHandler: ((e: { matches: boolean }) => void) | undefined;
      const mql = {
        matches: false,
        addEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
          changeHandler = handler;
        }),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mql),
      );

      const { result } = renderHook(() => useStacksPasskeyWallet(), {
        wrapper: makeWrapper({ colorScheme: 'auto' }),
      });
      expect(result.current.resolvedColorScheme).toBe('dark');

      act(() => {
        changeHandler?.({ matches: true });
      });

      expect(result.current.resolvedColorScheme).toBe('light');
    });
  });

  // Regression tests for config identity stability: the polling effects in
  // useStxBalance/useStxTransactions depend on `[config]`, so a `config` that
  // changes identity every render (because a parent passes an inline object
  // literal) restarts polling every render instead of on its own interval.
  describe('config identity', () => {
    function Probe({ onConfig }: { onConfig: (config: unknown) => void }) {
      onConfig(useStacksPasskeyWallet().config);
      return null;
    }
    function DynamicWrapper({
      apiUrls,
      onConfig,
    }: {
      apiUrls?: Record<string, string>;
      onConfig: (config: unknown) => void;
    }) {
      return (
        <StacksPasskeyProvider {...testConfig} apiUrls={apiUrls}>
          <Probe onConfig={onConfig} />
        </StacksPasskeyProvider>
      );
    }

    it('keeps the same config object across renders when a new apiUrls object has identical content', () => {
      const configs: unknown[] = [];
      const onConfig = (config: unknown) => configs.push(config);

      const { rerender } = render(<DynamicWrapper apiUrls={{ mainnet: 'https://a.example.com' }} onConfig={onConfig} />);
      rerender(<DynamicWrapper apiUrls={{ mainnet: 'https://a.example.com' }} onConfig={onConfig} />);

      expect(configs).toHaveLength(2);
      expect(configs[1]).toBe(configs[0]);
    });

    it('gives config a new identity when apiUrls content actually changes', () => {
      const configs: unknown[] = [];
      const onConfig = (config: unknown) => configs.push(config);

      const { rerender } = render(<DynamicWrapper apiUrls={{ mainnet: 'https://a.example.com' }} onConfig={onConfig} />);
      rerender(<DynamicWrapper apiUrls={{ mainnet: 'https://b.example.com' }} onConfig={onConfig} />);

      expect(configs).toHaveLength(2);
      expect(configs[1]).not.toBe(configs[0]);
      expect(configs[1]).toMatchObject({ apiUrls: { mainnet: 'https://b.example.com' } });
    });
  });

  describe('revealMnemonic', () => {
    it('throws NO_WALLET when disconnected', async () => {
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      await expect(result.current.revealMnemonic()).rejects.toMatchObject({ code: 'NO_WALLET' });
    });

    it('delegates to withWalletKey and returns the mnemonic', async () => {
      mockLoadStoredWallet.mockReturnValue({ credentialId: 'cred1', addresses: STORED_ADDRESSES });
      mockWithWalletKey.mockImplementation(async (_credentialId, _cfg, fn) =>
        fn({ mnemonic: 'seed phrase words', privateKey: '0xprivate', address: 'ST_STORED' }),
      );
      const { result } = renderHook(() => useStacksPasskeyWallet(), { wrapper: Wrapper });

      await expect(result.current.revealMnemonic()).resolves.toBe('seed phrase words');
      expect(mockWithWalletKey).toHaveBeenCalledWith('cred1', expect.anything(), expect.any(Function));
    });
  });
});
