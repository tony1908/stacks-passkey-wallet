# @toony1908/stacks-passkey-react-native

> Part of the [`stacks-wallet-sdk`](../../README.md) monorepo. Building for the web instead? See [`@toony1908/stacks-passkey-react`](../react/README.md), which shares the same [`@toony1908/stacks-passkey-core`](../core/README.md) and config shape as this package.

A React Native SDK that gives any Expo/RN app a **native-passkey (PRF)-derived Stacks hot wallet**: connect with FaceID/Touch ID/biometrics, view balance and transaction history, send STX, sign transactions, and reveal the recovery phrase. Built on [`react-native-passkeys`](https://github.com/f-24/react-native-passkeys) for the native passkey/PRF flow, and the same `@toony1908/stacks-passkey-core` derivation logic the web package uses.

STX-only for now (no SIP-10 tokens, NFTs, or arbitrary contract calls out of the box) — everything is reachable through `withWalletKey`, the same escape hatch the web package documents under [Extension points](../react/README.md#extension-points).

## Status

The native passkey/biometric flow, storage, signing, and UI are all **typechecked and unit-tested** (`react-native-passkeys` and `@react-native-async-storage/async-storage` are mocked in tests — see `src/*.test.ts`), and the full connect → send → reconnect flow has been **verified end-to-end on a real Android device**, including a real mainnet STX send. That verification pass is also what fixed native `get()` to pass an explicit `rpId`, evaluate PRF at create-time, and derive keys via `@scure/bip39`/`@scure/bip32` directly instead of `@stacks/wallet-sdk`'s `crypto.subtle`-dependent path (unavailable in Hermes) — see the `fix(react-native): device-validated passkey wallet` commit. iOS has not yet been verified on a physical device or simulator; treat the iOS path as implementation-complete but pre-validation until it has been.

## Install

```sh
pnpm add @toony1908/stacks-passkey-react-native
# or
npm install @toony1908/stacks-passkey-react-native
# or
yarn add @toony1908/stacks-passkey-react-native
```

The following peer dependencies must also be installed in the consuming app:

| Package | Version |
| --- | --- |
| `react` | `>=18` |
| `react-native` | `>=0.71` |
| `react-native-passkeys` | `>=0.3` |
| `@react-native-async-storage/async-storage` | `>=1` |
| `react-native-svg` | `>=13` |
| `@stacks/transactions` | `>=7` |
| `@stacks/wallet-sdk` | `>=7` |

Plus one more that isn't a listed peer dependency but is required for `@stacks/*` to work at all on Hermes/React Native:

```sh
pnpm add react-native-get-random-values
```

`@toony1908/stacks-passkey-core` and its own `@scure/bip39` dependency are pulled in automatically — you don't need to install either yourself.

## Setup requirements (read before wiring up passkeys)

1. **Install the `crypto.getRandomValues` polyfill as the very first import in your app's entry point** (`index.js`/`App.tsx`), above every other import:

   ```ts
   import 'react-native-get-random-values';
   ```

   `@stacks/transactions`/`@stacks/wallet-sdk` (and this package's own `passkey.ts`) call `crypto.getRandomValues(...)`, which Hermes/React Native does not provide by default. This isn't done for you inside the library — see `src/setup.ts` for why: importing a polyfill from inside a library would silently shadow whatever the app itself sets up, and would double-run setup code in apps that already import it. Installing the polyfill is the app's job.

2. **You need a custom dev client or a bare build — this does not work in Expo Go.** `react-native-passkeys` is a native module (it links native iOS/Android passkey APIs). Use an EAS Build custom dev client, or a bare workflow with `pod install` (iOS) / a Gradle sync (Android).

3. **iOS 15+ / Android API 28+, with associated domains / `assetlinks.json` configured for your passkey relying-party.** Native passkeys require your app to prove domain ownership (Apple's associated domains, Android's Digital Asset Links) — this is native-project configuration, not something this SDK can do for you. Follow [`react-native-passkeys`'s native setup docs](https://github.com/f-24/react-native-passkeys) for the exact entitlements/manifest changes.

## Quickstart

Wrap your app in the provider and drop in `WalletButton` — it renders a connect button, and once connected, a pill button that opens the full wallet drawer (balance, send, receive, activity, recovery).

```tsx
import { StacksPasskeyProvider, WalletButton } from '@toony1908/stacks-passkey-react-native';

export default function App() {
  return (
    <StacksPasskeyProvider appName="My App" network="testnet">
      <WalletButton />
    </StacksPasskeyProvider>
  );
}
```

`StacksPasskeyProviderProps` is `PasskeyWalletConfig & { children: ReactNode }` — same shape as web, see [Configuration](#configuration) below.

For a headless UI, use `useStacksPasskeyWallet()` and `useStxBalance()` directly:

```tsx
import { useStacksPasskeyWallet, useStxBalance } from '@toony1908/stacks-passkey-react-native';
import { Text, Button } from 'react-native';

function SendPanel() {
  const { isConnected, connect, address, sendStx } = useStacksPasskeyWallet();
  const { balanceMicroStx, isLoading } = useStxBalance();

  if (!isConnected) {
    return <Button title="Connect wallet" onPress={() => connect()} />;
  }

  async function handleSend() {
    // amount is in microSTX (1 STX = 1_000_000n microSTX)
    const txid = await sendStx({ recipient: 'ST2JHG...', amount: 1_000_000n });
    console.log('broadcast:', txid);
  }

  return (
    <>
      <Text>{address}</Text>
      <Text>{isLoading ? 'Loading…' : `${balanceMicroStx} microSTX`}</Text>
      <Button title="Send 1 STX" onPress={handleSend} />
    </>
  );
}
```

`WalletButton` and `WalletDrawer` also both accept a `theme?: Partial<StacksPasskeyTheme>` prop (see `src/ui/theme.ts`) to override the default dark, near-black RN styling — there's no stylesheet to import, styles are built with `StyleSheet.create`. The base (before any `theme` override) is picked by `config.colorScheme`: `defaultTheme` (dark) or the shipped `lightTheme` — see [Configuration](#configuration) below.

## Configuration

`PasskeyWalletConfig` is the exact same shape used by `@toony1908/stacks-passkey-core` and the web package — see the web package's **[Configuration](../react/README.md#configuration)** section for the full field-by-field reference (`appName`, `network`, `rpId`, `userName`/`userDisplayName`, `prfSalt`, `webauthnTimeoutMs`, `apiUrls`, `explorer`, `accountIndex`, `feeBufferMicroStx`, `maxFeeMicroStx`, `pollIntervalMs`, `transactionLimit`, `colorScheme`, `storageKey`) — **with one exception**: `StacksPasskeyProviderProps` here is `Omit<PasskeyWalletConfig, 'storage'>`, not the full config (see the `storage` bullet below for why). Every other field is passed the same way, as props on `StacksPasskeyProvider` or as an argument to `resolveConfig`.

> **The `appName`/`prfSalt` footgun.** `appName` isn't just a label — by default it seeds `prfSalt` (`` `${appName}-stacks-passkey-v1` ``), and `prfSalt` is what actually determines the derived wallet's key material (together with the passkey itself). Rename `appName` later (a rebrand, a typo fix, anything) without pinning `prfSalt` explicitly, and every existing user derives a **different** wallet on their next connect/reconnect — there's no migration path back. The same default salt is also the **only** isolation boundary between separate apps/builds that share a WebAuthn `rpId` (e.g. dev/staging/prod builds all associated with the same domain): if they all leave `prfSalt` unset, they compute the identical default and derive the identical wallet. Pin `prfSalt` explicitly (and differently per environment) the moment either of these is a possibility.

Object-valued config fields (`apiUrls`, `explorer`) should be defined as module-level constants, not inline object/function literals in JSX — an inline literal is a fresh reference every render, and `StacksPasskeyProvider` recomputes `config` (and, downstream, resets `useStxBalance`/`useStxTransactions` polling) whenever `explorer` changes identity:

```tsx
// Module scope — created once, stable identity across every render.
const API_URLS = { mainnet: 'https://my-proxy.example.com' };
const EXPLORER = { txUrl: (network: string, txid: string) => `https://my-explorer.example.com/${network}/tx/${txid}` };

function App() {
  return (
    <StacksPasskeyProvider appName="My App" network="mainnet" apiUrls={API_URLS} explorer={EXPLORER}>
      <WalletButton />
    </StacksPasskeyProvider>
  );
}
```

`apiUrls` (a plain string record) is additionally stabilized by content internally — an inline `apiUrls={{ mainnet: '...' }}` literal won't reset polling on its own — but `explorer`'s builders are functions, which can't be compared that way, so it still needs a stable reference from the caller. Hoisting both is the simplest rule that's always safe.

RN-specific notes:

- **`storage` default is AsyncStorage, not `localStorage` — and it's not a configurable prop here.** Unlike the web package (which implements the synchronous `WalletStorage` interface from core), this package's `storage.ts` is its own small async module backed by `@react-native-async-storage/async-storage` — it does not read `config.storage` at all. Because passing it would silently no-op, `StacksPasskeyProviderProps` omits `storage` from `PasskeyWalletConfig` entirely, so passing it is a **compile error** rather than a bug you discover at runtime. To swap in encrypted storage (e.g. `expo-secure-store` or `react-native-keychain`), re-implement the three functions in `src/storage.ts` (`loadStoredWallet`, `saveStoredWallet`, `clearStoredWallet`) with the same signatures; nothing else in this package depends on AsyncStorage directly.
- **Loading stored wallet state is asynchronous — use `isInitializing`, not just `isConnected`, during startup.** Because AsyncStorage is async (unlike web's synchronous `localStorage`), there's necessarily one brief render where `stored` (and therefore `isConnected`) is `false` before the mount effect resolves — this doesn't happen on web. `useStacksPasskeyWallet()` exposes this as `isInitializing: boolean`, `true` from mount until that initial load settles (success or failure), then `false` for the rest of the session. Gate a "connect" call-to-action on `!isInitializing` (e.g. render nothing, or a loading state, while `isInitializing` is `true`) so a returning user with an already-linked wallet doesn't flash a "disconnected" button for one frame.
- **`maxFeeMicroStx` guards `sendStx`/`signStxTransfer` the same way as web.** If the network fee `@stacks/transactions` estimates for a transfer exceeds `config.maxFeeMicroStx` (default `1_000_000n`, i.e. 1 STX), both throw a `FEE_TOO_HIGH` `PasskeyWalletError` instead of signing it. The fee is never clamped down to the ceiling — a clamped fee would sign a cheaper, different transaction than the one actually estimated, risking a stuck tx that broadcasts but never confirms at that price.
- **`colorScheme: 'auto'` reads the live `useColorScheme()` value**, not just the value at mount — the provider calls the RN hook itself, so `resolvedColorScheme` (on `useStacksPasskeyWallet()`) and the rendered theme update if the user flips their OS appearance setting while the app is open. `lightTheme` and `defaultTheme` (both `StacksPasskeyTheme`) are exported directly if you want to reuse the tokens outside `WalletButton`/`WalletDrawer`, e.g. to theme your own surrounding screen to match.

## Cross-device wallet note

The same passkey — synced across devices via iCloud Keychain or Google Password Manager — plus the same `appName` (and therefore the same default `prfSalt`, or an explicit matching one) derives the **exact same Stacks address** on this package as on the web package. Both platforms request the same PRF salt bytes (`TextEncoder().encode(cfg.prfSalt)`) from the authenticator and feed the resulting entropy into the identical `walletFromEntropy` in `@toony1908/stacks-passkey-core` — so a user who set up their wallet in your web app can open your mobile app, hit "Use an existing passkey," and land on the same address, with no migration step.

## Security

Same threat model and per-operation discipline as the web package — see its **[Security & threat model](../react/README.md#security--threat-model)** section for the full write-up (hot wallet, XSS caveat, phishing resistance, recommendations). The specifics as implemented here:

- **Per-operation derivation, not a cached session.** `withWalletKey(credentialId, config, fn)` in `src/session.ts` derives the entropy, hands it to `fn` once, and zeroes it (`entropy.fill(0)`) in a `finally` block — even if `fn` throws. The private key/mnemonic never exists outside that single call frame: not in provider state, not in a ref, not in context, not in storage.
- **Only public data persisted.** `AsyncStorage` holds exactly `{ credentialId, addresses: { mainnet, testnet } }` — never a key, mnemonic, or entropy. Swap in an encrypted store (see [Configuration](#configuration) above) if your threat model calls for encryption-at-rest on the device itself.
- **Every send, sign, or reveal re-derives the key from a fresh biometric prompt.** There is no in-memory session to steal after the fact.
- **This is a hot wallet.** Do not use it to hold large or long-term balances — see the web package's security section for the full honest caveat about JS string immutability and the narrow XSS/native-bridge window during a live operation.

## API reference

The public surface mirrors the web package's `/core` entry (see the web README's [API reference](../react/README.md#api-reference) for the shared pieces), plus the React layer and RN-specific UI:

| Export | Description |
| --- | --- |
| `StacksPasskeyProvider`, `useStacksPasskeyWallet`, `useStxBalance`, `useStxTransactions` | Same shape and behavior as web's, **plus** `useStacksPasskeyWallet()`'s `isInitializing: boolean` — RN-only, since the AsyncStorage-backed load it tracks is async (web's `localStorage` read is synchronous, so web has no equivalent hydration flash to expose). See the notes under [Configuration](#configuration). |
| `WalletButton`, `WalletDrawer` | RN equivalents built on `View`/`Pressable`/`Modal`/`TextInput` instead of DOM elements; accept an optional `theme` prop instead of CSS custom properties. |
| `defaultTheme`, `lightTheme`, `resolveTheme` | The dark/light theme token sets (`StacksPasskeyTheme`) and the function `WalletButton`/`WalletDrawer` use to pick a base (from `resolvedColorScheme`) and merge a partial `theme` override on top. |
| `isPasskeySupported`, `withWalletKey`, `deriveWalletAddresses`, `sendStx`, `signStxTransfer`, `loadStoredWallet`, `saveStoredWallet`, `clearStoredWallet` | Non-UI primitives for building a custom UI, exported from `passkey.ts`/`session.ts`/`stx.ts`/`storage.ts`. |
| `truncateAddress`, `explorerTxUrl`, `explorerAddressUrl`, `getAddressError`, `getAmountError`, `getMemoError`, `relativeTime`, `chunkAddress` | Formatting/validation helpers from `src/ui/format.ts`. |
| Everything from `@toony1908/stacks-passkey-core` (`resolveConfig`, `PasskeyWalletError`, `formatMicroStx`, `getStxBalance`, etc.) | Re-exported so a consumer only ever needs to depend on this one package. |

## Development

```sh
pnpm install
pnpm --filter @toony1908/stacks-passkey-react-native test        # vitest, natives mocked
pnpm --filter @toony1908/stacks-passkey-react-native build        # tsup -> dist/
pnpm --filter @toony1908/stacks-passkey-react-native typecheck     # tsc --noEmit
```

Licensed under MIT.
