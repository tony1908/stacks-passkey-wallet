// Shared test helper for src/react/**. Mocks the framework-agnostic core so
// no test ever touches real WebAuthn or the network — only side-effecting
// functions are faked; resolveConfig/PasskeyWalletError/etc stay real.
//
// `vi.mock` calls are hoisted to the top of *this* file (above its own
// imports, including the transitive `../core` import pulled in by
// `StacksPasskeyProvider`), so importing `Wrapper` from here is enough to
// guarantee the mock is registered before the provider (or any direct
// `../core` import in a test file) resolves it.
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { PasskeyWalletConfig } from '../core';
import { StacksPasskeyProvider } from './StacksPasskeyProvider';

vi.mock('../core', async () => {
  const actual = await vi.importActual<typeof import('../core')>('../core');
  return {
    ...actual,
    isPasskeySupported: vi.fn(() => true),
    registerPasskey: vi.fn(),
    reconnectWallet: vi.fn(),
    deriveWalletAddresses: vi.fn(),
    withWalletKey: vi.fn(),
    sendStx: vi.fn(),
    signStxTransfer: vi.fn(),
    getStxBalance: vi.fn(),
    getStxTransactions: vi.fn(),
    loadStoredWallet: vi.fn(() => null),
    saveStoredWallet: vi.fn(),
    clearStoredWallet: vi.fn(),
  };
});

export const testConfig: PasskeyWalletConfig = { appName: 'test-app', network: 'testnet' };

/** Builds a Wrapper with `testConfig` plus per-test overrides — lets a test
 * exercise a non-default config value (e.g. `feeBufferMicroStx`,
 * `pollIntervalMs`) without duplicating the whole fixture. */
export function makeWrapper(overrides: Partial<PasskeyWalletConfig> = {}) {
  return function ConfiguredWrapper({ children }: { children: ReactNode }) {
    return (
      <StacksPasskeyProvider {...testConfig} {...overrides}>
        {children}
      </StacksPasskeyProvider>
    );
  };
}

export function Wrapper({ children }: { children: ReactNode }) {
  return <StacksPasskeyProvider {...testConfig}>{children}</StacksPasskeyProvider>;
}
