import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
    // Core is framework-agnostic and must run under Node: @stacks/wallet-sdk
    // pulls an old @noble/hashes whose `instanceof Uint8Array` check breaks
    // across jsdom's realm. Only the React/UI layers need a DOM.
    environment: 'node',
    environmentMatchGlobs: [
      ['src/react/**', 'jsdom'],
      ['src/ui/**', 'jsdom'],
    ],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
