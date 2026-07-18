import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  // Peer dependencies must never be bundled — the consumer's app provides
  // them (native modules can't be duplicated across copies anyway).
  external: [
    'react',
    'react-native',
    'react-native-passkeys',
    '@react-native-async-storage/async-storage',
    'react-native-svg',
    '@stacks/transactions',
    '@stacks/wallet-sdk',
    '@toony1908/stacks-passkey-core',
  ],
});
