import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve the sibling workspace package straight from source, so tests
    // don't require `packages/core` to be built first (its published
    // `exports` map only points at `dist`).
    alias: {
      '@toony1908/stacks-passkey-core/react': path.resolve(__dirname, '../core/src/react.ts'),
      '@toony1908/stacks-passkey-core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    // No jsdom here: this package's tests only cover the non-UI logic
    // (passkey/session/storage/stx), which is plain Node-runnable with
    // react-native-passkeys/@react-native-async-storage/async-storage
    // mocked. The RN UI layer (WalletButton/WalletDrawer) has no test
    // environment set up — it's typechecked by `tsc` only (would need a
    // react-native Jest/vitest preset to render).
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
