import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  // Peer dependencies must never be bundled — the consumer provides them, and
  // bundling @stacks/* (or react, for the optional ./react subpath) would
  // risk duplicate copies (a real source of bugs).
  external: ['@stacks/transactions', '@stacks/wallet-sdk', 'react'],
});
