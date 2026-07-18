import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Core is framework-agnostic and must run under Node: @stacks/wallet-sdk
    // pulls an old @noble/hashes whose `instanceof Uint8Array` check breaks
    // across jsdom's realm.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
