import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  // Peer dependencies must never be bundled — the consumer provides them, and
  // bundling @stacks/* would risk duplicate copies (a real source of bugs).
  // @toony1908/stacks-passkey-core is a real sibling package (its own dist),
  // not source to inline, so it's externalized the same way.
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@stacks/transactions',
    '@stacks/wallet-sdk',
    '@toony1908/stacks-passkey-core',
    '@toony1908/stacks-passkey-core/react',
  ],
});
