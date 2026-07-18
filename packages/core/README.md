# @toony1908/stacks-passkey-core

> Part of the [`stacks-wallet-sdk`](../../README.md) monorepo. This package is normally not installed directly — see [`@toony1908/stacks-passkey-react`](../react/README.md) (web) or [`@toony1908/stacks-passkey-react-native`](../react-native/README.md) (React Native), which depend on it and re-export everything you need.

Framework-agnostic primitives for a passkey-derived Stacks hot wallet: config resolution, input validation, BIP39/BIP44 key derivation from raw entropy, and Hiro API balance/transaction fetching.

**No React. No DOM. No WebAuthn.** This package doesn't talk to `navigator.credentials` or any native passkey API at all — it only turns 32 bytes of entropy (however the platform layer obtained them) into a wallet, and talks to the Hiro API over `fetch`. That's what makes it safe to share between a web app (WebAuthn PRF) and a React Native app (native passkey PRF via `react-native-passkeys`): both platforms do their own passkey/PRF dance, then hand the resulting entropy to this same code.

## Install

You normally get this transitively:

```sh
pnpm add @toony1908/stacks-passkey-react           # web
pnpm add @toony1908/stacks-passkey-react-native     # React Native
```

Install it directly only if you're building a third platform integration (e.g. a CLI, a server-side tool, or a non-React framework) on top of the same core.

Peer dependencies: `@stacks/transactions >=7`, `@stacks/wallet-sdk >=7`. `@scure/bip39` is a regular (bundled) dependency.

## What it exports

From `src/index.ts`:

- **Config** — `resolveConfig`, `hiroHost`, `defaultExplorerTxUrl`, `defaultExplorerAddressUrl`, and the `PasskeyWalletConfig` / `ResolvedConfig` / `StacksNetwork` / `WalletStorage` / `ExplorerUrlBuilders` / `ColorScheme` / `ResolvedColorScheme` types. See the [web package's Configuration section](../react/README.md#configuration) for the full field-by-field reference — the same config shape is used on every platform. `colorScheme?: ColorScheme` (`'dark' | 'light' | 'auto'`, default `'dark'`) picks the UI color scheme for the platform packages' built-in components; `ResolvedColorScheme` (`'dark' | 'light'`) is what `'auto'` resolves to at runtime.
- **Errors** — `PasskeyWalletError`, `isPasskeyWalletError`, and the `WalletErrorCode` union.
- **Derivation** — `addressesFromPrivateKey`, `walletFromEntropy` (32 bytes of entropy → BIP39 mnemonic → BIP44 account → `DerivedWallet` `{ mnemonic, privateKey, address }`), and the `DerivedWallet` type. `walletFromEntropy` isn't part of the original single-package surface but is exported here because the web and React Native packages' passkey/session modules need it, and cross-package consumption can only go through this barrel.
- **Encoding** — `base64UrlEncode`, `base64UrlDecode` (credential-id / PRF-salt encoding helpers).
- **Validation** — `isValidStacksAddress`, `assertValidRecipient`, `memoByteLength`, `assertValidMemo`, `parseStxToMicroStx`, `formatMicroStx`, `STX_FEE_BUFFER_MICROSTX`.
- **Balance & transactions** — `getStxBalance` (spendable balance, i.e. total minus locked/stacked), `getStxTransactions`, and the `WalletTx` type — both against the Hiro API.
- **Types** — `StoredWallet` (`{ credentialId, addresses: { mainnet, testnet } }`, the only shape ever persisted — public data, never a key or mnemonic).

Deliberately **not** exported here: anything that touches WebAuthn or a native passkey API (`registerPasskey`, `derivePrfEntropy`, `withWalletKey`, `sendStx`/`signStxTransfer`, storage adapters). Those live in the platform packages because "derive PRF entropy from a passkey" is inherently platform-specific; everything downstream of having that entropy is not, and lives here.

## Development

```sh
pnpm install
pnpm --filter @toony1908/stacks-passkey-core test        # vitest
pnpm --filter @toony1908/stacks-passkey-core build        # tsup -> dist/
pnpm --filter @toony1908/stacks-passkey-core typecheck     # tsc --noEmit
```

Licensed under MIT.
