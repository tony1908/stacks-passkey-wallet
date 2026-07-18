# @toony1908/stacks-passkey-react

> Part of the [`stacks-wallet-sdk`](../../README.md) monorepo — the web package. Building for React Native/Expo instead? See [`@toony1908/stacks-passkey-react-native`](../react-native/README.md).

A reusable React SDK that gives any app a **WebAuthn passkey (PRF)-derived Stacks hot wallet**: connect with FaceID/fingerprint, view balance and transaction history, send STX, sign transactions, and reveal the recovery phrase. No browser extension to install, no seed phrase to write down at setup — the wallet's key material is derived on demand from the user's platform passkey.

STX-only for now (no SIP-10 tokens, NFTs, or arbitrary contract calls out of the box — see [Extension points](#extension-points)).

## Install

```sh
pnpm add @toony1908/stacks-passkey-react
# or
npm install @toony1908/stacks-passkey-react
# or
yarn add @toony1908/stacks-passkey-react
```

The following peer dependencies must also be installed in the consuming app:

| Package | Version |
| --- | --- |
| `react` | `>=18` |
| `react-dom` | `>=18` |
| `@stacks/transactions` | `>=7` |
| `@stacks/wallet-sdk` | `>=7` |

`@toony1908/stacks-passkey-core` (the framework-agnostic primitives this package builds on) and its own `@scure/bip39` dependency are pulled in automatically — you don't need to install either yourself.

## Requirements

- A **secure context**: HTTPS in production, or `localhost` in development. Every passkey operation (`registerPasskey`, `withWalletKey`, and everything built on top of it) calls `assertSecureContext()` first and throws `INSECURE_CONTEXT` otherwise.
- A browser/authenticator that supports the **WebAuthn PRF extension** — recent Safari or Chrome with a platform passkey (Touch ID, Face ID, Windows Hello, iCloud Keychain, Android Credential Manager). PRF is not optional: it's how the wallet's signing key is derived. If the authenticator creates a passkey but doesn't return PRF results, `connect()` (via `registerPasskey`) throws `PRF_UNSUPPORTED`. If the browser doesn't support WebAuthn at all, `connect()`/`reconnect()` throw `PASSKEY_UNSUPPORTED` before ever touching `navigator.credentials`.

## Quickstart

Wrap your app in the provider and drop in `WalletButton` — it renders a connect button, and once connected, a pill button that opens the full wallet drawer (balance, send, receive, activity, recovery).

```tsx
import { StacksPasskeyProvider, WalletButton } from '@toony1908/stacks-passkey-react';

export function App() {
  return (
    <StacksPasskeyProvider appName="My App" network="testnet">
      <WalletButton />
    </StacksPasskeyProvider>
  );
}
```

`StacksPasskeyProviderProps` is `PasskeyWalletConfig & { children: ReactNode }` — see [Configuration](#configuration) for every field.

### Runtime testnet/mainnet switching

One passkey derives one private key, and that key has both a mainnet (`SP…`) and a testnet (`ST…`) address — same key, different network version byte. Both addresses are derived together at `connect()`/`reconnect()` time (a single passkey prompt) and stored together, so the active network can be flipped at runtime with **no new passkey prompt**:

```tsx
const { network, setNetwork, address } = useStacksPasskeyWallet();

<button onClick={() => setNetwork(network === 'testnet' ? 'mainnet' : 'testnet')}>
  Switch to {network === 'testnet' ? 'mainnet' : 'testnet'}
</button>
```

The `network` prop on `StacksPasskeyProvider` only sets the **initial** network; `setNetwork` changes it after that. `address`, `config.network`, and everything derived from them (`useStxBalance`, `useStxTransactions`, `sendStx`) update immediately to match. `WalletDrawer`'s home view ships a built-in Testnet/Mainnet toggle that calls this for you.

For a headless UI, use `useStacksPasskeyWallet()` and `useStxBalance()` directly:

```tsx
import { useStacksPasskeyWallet, useStxBalance } from '@toony1908/stacks-passkey-react';

function SendPanel() {
  const { isConnected, connect, address, sendStx } = useStacksPasskeyWallet();
  const { balanceMicroStx, isLoading } = useStxBalance();

  if (!isConnected) {
    return <button onClick={() => connect()}>Connect wallet</button>;
  }

  async function handleSend() {
    // amount is in microSTX (1 STX = 1_000_000n microSTX)
    const txid = await sendStx({ recipient: 'ST2JHG...', amount: 1_000_000n });
    console.log('broadcast:', txid);
  }

  return (
    <div>
      <p>{address}</p>
      <p>{isLoading ? 'Loading…' : `${balanceMicroStx} microSTX`}</p>
      <button onClick={handleSend}>Send 1 STX</button>
    </div>
  );
}
```

## Configuration

`PasskeyWalletConfig` (also the prop shape for `StacksPasskeyProvider`, and the argument to `resolveConfig` from the `/core` entry) is fully configurable — every field below is optional except `appName` and `network`. Defined in `src/core/config.ts`.

### Identity / WebAuthn

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `appName` | `string` | *(required)* | Shown in the WebAuthn `rp.name` prompt. Also seeds the default `userName`, `userDisplayName`, `prfSalt`, and `storageKey`. |
| `network` | `'mainnet' \| 'testnet'` | *(required)* | The **initial** active network. The provider tracks the active network as runtime state (`setNetwork`), so this only seeds it — see [Runtime testnet/mainnet switching](#runtime-testnetmainnet-switching). |
| `rpId` | `string` | *(unset — browser resolves to the current origin)* | WebAuthn relying-party id (`rp.id`). Leave unset unless you need passkeys to work across subdomains of a single registrable domain. |
| `userName` | `string` | `appName` | WebAuthn `user.name` — the account label shown in the OS passkey picker/UI. |
| `userDisplayName` | `string` | `appName` | WebAuthn `user.displayName` — the friendlier label some platforms show alongside `userName`. |
| `prfSalt` | `string` | `` `${appName}-stacks-passkey-v1` `` | PRF extension salt — the "password" that, together with the passkey, determines the derived wallet's entropy. **This is the wallet's identity.** Changing it after users have already connected derives a **different** wallet for them. Version it deliberately (e.g. bump the `v1` suffix only if you intend to migrate everyone to a new wallet). |
| `webauthnTimeoutMs` | `number` | *(unset — browser's own timeout)* | WebAuthn `publicKey.timeout` in milliseconds, applied to registration, PRF derivation, and reconnect assertions. |

> `residentKey: 'required'` and `userVerification: 'required'` are **not** in this table — they're fixed in the WebAuthn call options and not configurable. They're what make the wallet phishing- and passkey-loss resistant (a discoverable credential that always demands biometric/PIN verification), so they're secure defaults by design, not knobs.

> **The `appName`/`prfSalt` footgun.** `appName` isn't just a label — by default it seeds `prfSalt` (`` `${appName}-stacks-passkey-v1` ``), and `prfSalt` is what actually determines the derived wallet's key material. Rename `appName` later (a rebrand, a typo fix, anything) without pinning `prfSalt` explicitly, and every existing user derives a **different** wallet on their next connect — there's no migration path back. The same default salt is also the **only** isolation boundary between separate apps/builds that share a WebAuthn `rpId` (e.g. dev/staging/prod all pointed at one domain): if they all leave `prfSalt` unset, they compute the identical default and derive the identical wallet. Pin `prfSalt` explicitly (and differently per environment) the moment either of these is a possibility.

### Endpoints

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `apiUrls` | `Partial<Record<'mainnet' \| 'testnet', string>>` | `{}` — falls back to the public Hiro-hosted API per network (`https://api.hiro.so` / `https://api.testnet.hiro.so`) | Per-network API host override, e.g. to point at a self-hosted Stacks node. Any network left unset still falls back to the public default. |
| `explorer` | `{ txUrl?, addressUrl? }` | unset builders fall back to the built-in `explorer.stacks.co` links | Block-explorer link builder overrides used by the UI layer (activity rows, address link, post-send success notice). |

### Derivation

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `accountIndex` | `number` | `0` | Which BIP44 account (from the single passkey-derived wallet) to use. Change it to derive a different account from the same passkey without a second passkey. |

### Behavior

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `feeBufferMicroStx` | `bigint` | `3_000n` | UX safety margin subtracted from the balance when checking/pre-filling a "send max" amount, so a full-balance send doesn't fail at broadcast for lack of fee headroom. |
| `maxFeeMicroStx` | `bigint` | `1_000_000n` (1 STX) | Hard ceiling on the network fee `sendStx`/`signStxTransfer` will sign. If the API's estimated fee for the transfer exceeds this, the SDK throws a `FEE_TOO_HIGH` `PasskeyWalletError` instead of silently signing it (see [API reference](#api-reference)). Raise this if you expect legitimately high-fee sends (e.g. during fee-market congestion); it is **not** clamped down to this value, because a clamped fee could still broadcast successfully but too low to ever confirm, i.e. a stuck transaction. |
| `pollIntervalMs` | `number` | `30000` | Balance/transaction poll interval in milliseconds (used by `useStxBalance`/`useStxTransactions`). |
| `transactionLimit` | `number` | `20` | Default page size for `getStxTransactions`/`useStxTransactions` when no per-call `limit` is given. |

### Appearance

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `colorScheme` | `'dark' \| 'light' \| 'auto'` | `'dark'` | UI color scheme for the built-in components. `'auto'` follows the OS/browser setting (`prefers-color-scheme` on web, `useColorScheme()` on native). |

`colorScheme` only picks the *base* palette — `resolvedColorScheme` on the context tells you which one (`'light'`/`'dark'`) is actually in effect once `'auto'` is resolved. The `--spw-*` custom properties described in [Theming](#theming) still layer on top of whichever base is selected.

### Storage

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `storage` | `WalletStorage` (`{ get, set, remove }`) | `undefined` → an internal `localStorage`-backed store with an in-memory fallback | Storage backend for the persisted `{ credentialId, addresses }` pair. **`WalletStorage` is synchronous** (`get`/`set`/`remove` all return `void`/`string \| null`, no `Promise`) — swap in your own sync store (e.g. `sessionStorage`, or a synchronous encrypted store) by implementing the 3-method interface. An inherently async store (like React Native's `AsyncStorage`) can't implement this interface directly; use `@toony1908/stacks-passkey-react-native`, which has its own async `WalletStorage` shape for that platform. |
| `storageKey` | `string` | `` `stacks-passkey-wallet:${appName}` `` | Storage key for the persisted wallet. Only relevant if you run multiple wallet instances in one origin. |

### Fully configurable — examples

Custom API endpoints per network (e.g. a self-hosted Stacks node). **Define `apiUrls`/`explorer` objects at module scope (or `useMemo` them), never as an inline literal on the JSX prop.** `StacksPasskeyProvider` memoizes `config`, and an inline `{{ ... }}` literal gets a brand-new object identity every parent render. `apiUrls` is compared by content internally, so it alone won't restart polling — but `explorer` holds functions, which can't be compared that way, so an inline `explorer` literal *does* give `config` a new identity every render, which resets the `useStxBalance`/`useStxTransactions` polling effects before their interval ever fires. Hoisting both keeps the habit consistent and cheap either way:

```tsx
// Module scope: created once, stable for the app's lifetime.
const apiUrls = { mainnet: 'https://my-node.example.com', testnet: 'https://my-testnet-node.example.com' };

<StacksPasskeyProvider appName="My App" network="mainnet" apiUrls={apiUrls}>
  <WalletButton />
</StacksPasskeyProvider>
```

Custom explorer links (same reason — hoisted to module scope):

```tsx
const explorer = {
  txUrl: (network, txid) => `https://my-explorer.example.com/${network}/tx/${txid}`,
  addressUrl: (network, address) => `https://my-explorer.example.com/${network}/address/${address}`,
};

<StacksPasskeyProvider appName="My App" network="mainnet" explorer={explorer}>
  <WalletButton />
</StacksPasskeyProvider>
```

Custom storage backend — implement `WalletStorage` (here, `sessionStorage` instead of the `localStorage` default):

```tsx
import type { WalletStorage } from '@toony1908/stacks-passkey-react';

const sessionOnlyStorage: WalletStorage = {
  get: (key) => sessionStorage.getItem(key),
  set: (key, value) => sessionStorage.setItem(key, value),
  remove: (key) => sessionStorage.removeItem(key),
};

<StacksPasskeyProvider appName="My App" network="mainnet" storage={sessionOnlyStorage}>
  <WalletButton />
</StacksPasskeyProvider>
```

Behavior tuning — faster polling, a smaller activity page, and a larger fee safety margin:

```tsx
<StacksPasskeyProvider
  appName="My App"
  network="mainnet"
  pollIntervalMs={10_000}
  transactionLimit={10}
  feeBufferMicroStx={5_000n}
>
  <WalletButton />
</StacksPasskeyProvider>
```

Auto color scheme — follow the OS/browser setting instead of the dark default:

```tsx
<StacksPasskeyProvider appName="My App" network="mainnet" colorScheme="auto">
  <WalletButton />
</StacksPasskeyProvider>
```

A second account from the same passkey (e.g. a "savings" wallet alongside the default one):

```tsx
<StacksPasskeyProvider appName="My App" network="mainnet" accountIndex={1}>
  <WalletButton />
</StacksPasskeyProvider>
```

WebAuthn identity — custom passkey label, a fixed `rpId`, and a shorter prompt timeout:

```tsx
<StacksPasskeyProvider
  appName="My App"
  network="mainnet"
  userName="my-app-wallet"
  userDisplayName="My App Wallet"
  rpId="example.com"
  webauthnTimeoutMs={60_000}
>
  <WalletButton />
</StacksPasskeyProvider>
```

The same fields work with the framework-agnostic `/core` entry via `resolveConfig`:

```ts
import { resolveConfig } from '@toony1908/stacks-passkey-react/core';

const config = resolveConfig({
  appName: 'My App',
  network: 'mainnet',
  apiUrls: { mainnet: 'https://my-node.example.com' },
  pollIntervalMs: 10_000,
});
```

## Security & threat model

This SDK derives a **hot wallet** from a WebAuthn passkey. Read this section before shipping.

**Per-operation derivation, not a cached session.** The signing key is never generated once and held — it's derived fresh, used, and thrown away for every single operation, via `withWalletKey(credentialId, config, fn)` in `src/core/session.ts`:

```ts
export async function withWalletKey<T>(credentialId, cfg, fn): Promise<T> {
  assertSecureContext();
  const entropy = await derivePrfEntropy(credentialId, cfg); // triggers FaceID/fingerprint
  try {
    const wallet = await walletFromEntropy(entropy, cfg.network);
    return await fn(wallet); // key exists only inside this call
  } finally {
    entropy.fill(0); // zeroed even if fn throws
  }
}
```

- The private key/mnemonic is **never cached in memory across operations** — not in a module variable, not in React state, not in a ref, not in context. `StacksPasskeyContextValue` and the persisted `StoredWallet` hold only *public* data: a `credentialId` and both derived addresses, `{ credentialId, addresses: { mainnet, testnet } }` (in `localStorage` by default). Deriving both addresses together (`deriveWalletAddresses`) still goes through a single `withWalletKey` call — the key exists only for that one call, same as any other operation.
- Every send, sign, or reveal derives the key from scratch, which means **every one of those triggers a fresh user-verification prompt** (FaceID/fingerprint) and keeps the key's in-memory lifetime to a single `withWalletKey` call.
- The raw entropy `Uint8Array` is explicitly zeroed (`entropy.fill(0)`) in a `finally` block after every operation, so it doesn't linger on the heap waiting for GC.

**Honest JavaScript caveat.** The *entropy bytes* are zeroable — the derived **mnemonic and private-key strings are not**. JS strings are immutable, so once `walletFromEntropy` builds the mnemonic/private key, that string exists until garbage collected; there's no reliable way to scrub it from the heap in the interim. An XSS payload that executes *while an operation is in flight* (in the split second between prompt approval and `finally`) could theoretically still read that key. Per-operation derivation drastically shrinks this window (milliseconds per user action, instead of the app's entire session) — it does **not** eliminate it. **Treat this as a hot wallet: do not use it to hold large or long-term balances.**

**Phishing resistance.** WebAuthn binds the passkey to the relying-party ID (`rpId`, defaulting to your origin). A different domain — even a convincing phishing clone — cannot invoke your passkey or derive your wallet's key material.

**Recommendations for consumers embedding this SDK:**
- Serve your app over HTTPS in production (required anyway — see [Requirements](#requirements)).
- Ship a strict **Content-Security-Policy**. This SDK's own attack surface (XSS reading key material mid-operation) is exactly what a good CSP mitigates.
- **Pin your `@stacks/transactions` and `@stacks/wallet-sdk` peer dependency versions.** Duplicate copies of these packages in your dependency tree (e.g. two different majors pulled in transitively) can cause subtle serialization/signing bugs.
- Audit your full dependency tree periodically — any script running in your page can attempt to read data during a live operation.
- Remember the `prfSalt` note above: it **is** the wallet's identity. Change it and existing users silently get a different (empty) wallet on their next connect.

## API reference

### `@toony1908/stacks-passkey-react` (main entry)

| Export | Signature | Description |
| --- | --- | --- |
| `StacksPasskeyProvider` | `(props: PasskeyWalletConfig & { children: ReactNode }) => JSX.Element` | Context provider; wrap your app (or the subtree that needs wallet access) in it. |
| `useStacksPasskeyWallet` | `(): StacksPasskeyContextValue` | The main hook — `isSupported`, `isConnected`, `isConnecting`, `address?`, `network`, `setNetwork(network)`, `config`, `resolvedColorScheme`, `connect()`, `reconnect()`, `disconnect()`, `sendStx(args)`, `signStxTransfer(args)`, `withWalletKey(fn)`, `revealMnemonic()`. Throws if called outside a `StacksPasskeyProvider`. `setNetwork` flips the active network with no new passkey prompt — see [Runtime testnet/mainnet switching](#runtime-testnetmainnet-switching). `resolvedColorScheme` is `config.colorScheme` with `'auto'` resolved to the live `'light'`/`'dark'` OS reading. |
| `useStxBalance` | `(): { balanceMicroStx?: bigint; isLoading: boolean; error?: Error; refetch(): void }` | **Spendable** STX balance in microSTX (total minus any amount locked/stacked). Fetches on connect, polls every 30s, and on `refetch()`. |
| `useStxTransactions` | `(opts?: { limit?: number }): { transactions?: WalletTx[]; isLoading: boolean; error?: Error; refetch(): void }` | Merged pending (mempool) + confirmed transfers, pending first. Polls every 30s. |
| `WalletButton` | `(props: WalletButtonProps) => JSX.Element` | `{ className?, style?, label?, onError?(e) }`. Self-contained connect button; once connected it renders its own `WalletDrawer`. While disconnected, also renders a small "Use an existing passkey" link that calls `reconnect()` — for restoring a wallet after storage loss (cleared site data, private browsing) without creating a new passkey. |
| `WalletDrawer` | `(props: WalletDrawerProps) => JSX.Element \| null` | `{ open, onClose(), onSuccess?(txid), onError?(e) }`. The slide-over panel (home/send/receive/activity/recovery), portaled to `document.body`. Render this yourself instead of `WalletButton` if you need `onSuccess` or your own trigger UI. |
| `injectStyles` | `() => void` | Injects the SDK's `<style>` tag once per document. SSR-safe no-op without `document`, idempotent. `WalletButton`/`WalletDrawer` already call it on mount — only call it yourself to avoid a flash-of-unstyled-button before either mounts. |
| `PasskeyWalletError` | `class extends Error { code: WalletErrorCode }` | The SDK's error type. |
| `isPasskeyWalletError` | `(e: unknown) => e is PasskeyWalletError` | Type guard. |
| `formatMicroStx` | `(amount: bigint) => string` | `1_500_000n → "1.500000 STX"`. Also handles negatives: `-1_500_000n → "-1.500000 STX"`. |
| `parseStxToMicroStx` | `(input: string) => bigint \| null` | Inverse of the above; `null` on invalid input or more than 6 decimal places. |
| `truncateAddress`, `explorerTxUrl`, `explorerAddressUrl`, `getAddressError`, `getAmountError`, `getMemoError`, `relativeTime` | — | The formatting/validation helpers `WalletButton`/`WalletDrawer` use internally, exported for building your own custom wallet UI. See `src/ui/format.ts`. |
| `VERSION` | `string` | The SDK's version string. |

Types re-exported: `StacksPasskeyProviderProps`, `StacksPasskeyContextValue`, `SendStxArgs` (`{ recipient: string; amount: bigint; memo?: string }`), `WalletButtonProps`, `WalletDrawerProps`, `StacksNetwork`, `PasskeyWalletConfig`, `WalletTx`, `DerivedWallet`, `WalletErrorCode`, `WalletStorage`, `ColorScheme` (`'dark' | 'light' | 'auto'`), `ResolvedColorScheme` (`'dark' | 'light'`).

`WalletErrorCode` is one of: `PASSKEY_CANCELLED`, `PRF_UNSUPPORTED`, `PASSKEY_UNSUPPORTED`, `INSECURE_CONTEXT`, `INSUFFICIENT_BALANCE`, `INVALID_ADDRESS`, `INVALID_AMOUNT`, `MEMO_TOO_LONG`, `NO_WALLET`, `NETWORK_ERROR`, `BROADCAST_FAILED`, `FEE_TOO_HIGH` (the estimated fee exceeded `config.maxFeeMicroStx`; see [Configuration](#configuration)).

### `@toony1908/stacks-passkey-react/core` (framework-agnostic)

No React import in this entry point — safe to use from a script, a CLI, or a non-React framework.

| Export | Signature | Description |
| --- | --- | --- |
| `resolveConfig` | `(cfg: PasskeyWalletConfig) => ResolvedConfig` | Fills in the defaults documented in [Configuration](#configuration). |
| `hiroHost` | `(cfg) => string` | Resolves the effective Hiro API base URL. |
| `isPasskeySupported` | `() => boolean` | `'PublicKeyCredential' in window`. |
| `registerPasskey` | `(cfg: ResolvedConfig) => Promise<string>` | Creates a new passkey with the PRF extension requested; returns a base64url `credentialId`. Throws `PASSKEY_UNSUPPORTED` if the browser lacks WebAuthn support, or `PRF_UNSUPPORTED` if the authenticator doesn't return PRF results. |
| `reconnectWallet` | `(cfg: ResolvedConfig) => Promise<{ credentialId: string; addresses: { mainnet: string; testnet: string } }>` | Restores a wallet from an existing resident/discoverable passkey — for when local storage lost the `{ credentialId, addresses }` pair (cleared site data, private browsing) but the passkey itself still exists. Requests a WebAuthn assertion with no `allowCredentials`, so the platform surfaces the user's resident passkey directly; re-derives the same PRF salt as `registerPasskey` so the result is the identical wallet. Throws `PASSKEY_UNSUPPORTED`/`PRF_UNSUPPORTED`/`PASSKEY_CANCELLED` like the above. The entropy is used once to compute both addresses, then zeroized — never returned. |
| `withWalletKey` | `<T>(credentialId, cfg, fn: (wallet: DerivedWallet) => Promise<T>) => Promise<T>` | The per-operation signing primitive described in [Security](#security--threat-model). `DerivedWallet` is `{ mnemonic, privateKey, address }`. |
| `deriveWalletAddresses` | `(credentialId, cfg: ResolvedConfig) => Promise<{ mainnet: string; testnet: string }>` | One passkey prompt (via `withWalletKey`), both network addresses — `addressesFromPrivateKey` applied to the freshly-derived key. Used by `StacksPasskeyProvider.connect()` so `setNetwork` never needs a second prompt. |
| `addressesFromPrivateKey` | `(privateKey: string) => { mainnet: string; testnet: string }` | Pure helper: one Stacks private key has both a mainnet (`SP…`) and testnet (`ST…`) address (same key, different version byte). Thin wrapper over `@stacks/transactions`' `getAddressFromPrivateKey`. |
| `sendStx` | `(credentialId, cfg, params: SendStxParams) => Promise<string>` | Validates, derives the key, signs an STX transfer, broadcasts it, returns the txid. Signing happens inside the key's one-shot scope; broadcasting happens after, once the key is already gone. Throws `BROADCAST_FAILED` on broadcast rejection, or `FEE_TOO_HIGH` if the estimated fee exceeds `cfg.maxFeeMicroStx`. |
| `signStxTransfer` | `(credentialId, cfg, params: SendStxParams) => Promise<string>` | Same signing/validation (including the `FEE_TOO_HIGH` fee ceiling), but returns the serialized signed transaction hex and never broadcasts. |
| `getStxBalance` | `(address, cfg) => Promise<bigint>` | **Spendable** STX balance in microSTX from the Hiro API — the API's `balance` field is the total on-chain balance (it includes anything locked in stacking), so this returns `balance - locked`. A missing `locked` field is treated as 0 (back-compat), and the result is floored at 0. |
| `getStxTransactions` | `(address, cfg, opts?: { limit?: number }) => Promise<WalletTx[]>` | Pending mempool transfers followed by confirmed ones. |
| `isValidStacksAddress`, `assertValidRecipient`, `memoByteLength`, `assertValidMemo` | validators | `assertValidRecipient` also checks the address prefix matches the configured network (`SP`/`SM` for mainnet, `ST`/`SN` for testnet); `assertValidMemo` enforces the 34-byte on-chain memo limit. |
| `parseStxToMicroStx`, `formatMicroStx` | — | Same as the main entry. `formatMicroStx` handles negative amounts (`-1_500_000n → "-1.500000 STX"`). |
| `STX_FEE_BUFFER_MICROSTX` | `bigint` (`3_000n`) | Heuristic microSTX reserve subtracted when checking/pre-filling a "send max" amount, so a full-balance send doesn't fail at broadcast for lack of fee headroom. The node is the final arbiter of whether the actual fee is sufficient — this is only a UX safety margin. Used by `StacksPasskeyProvider`'s `sendStx` preflight and `WalletDrawer`'s Max button. |
| `defaultStorage`, `getStorage`, `loadStoredWallet`, `saveStoredWallet`, `clearStoredWallet` | storage helpers | Build your own persistence layer on top of `StoredWallet` (`{ credentialId, addresses: { mainnet, testnet } }`). `loadStoredWallet` returns `null` for anything that doesn't match this shape, including the pre-network-switching `{ credentialId, address }` shape — a `reconnect()` re-populates it. |
| `base64UrlEncode`, `base64UrlDecode` | `(bytes) => string` / `(value) => Uint8Array` | Credential-ID encoding helpers used internally. |
| `PasskeyWalletError`, `isPasskeyWalletError` | — | Same as the main entry. |

Types: `StacksNetwork`, `PasskeyWalletConfig`, `ResolvedConfig`, `WalletStorage`, `WalletErrorCode`, `DerivedWallet`, `WalletTx`, `SendStxParams`, `StoredWallet`.

Note: `derivePrfEntropy` (the function that actually talks to the authenticator and returns raw key entropy) is intentionally **not** exported from `/core` — only `withWalletKey` may call it, so raw key material can never leak outside a single operation's scope.

## Theming

`WalletButton` and `WalletDrawer` inject their own stylesheet on mount — there's no CSS file to import. The default look is a dark, Xverse-style theme (near-black surfaces, a white primary button, Stacks-orange accents). Override it by setting these custom properties (from `src/ui/styles.ts`) on `:root` or any ancestor of the components:

```css
:root {
  --spw-bg: #101010;            /* drawer / page background */
  --spw-surface: #1c1c1e;       /* cards, inputs, token rows */
  --spw-surface-2: #2a2a2d;     /* hover / nested surface */
  --spw-fg: #ffffff;            /* primary text */
  --spw-muted: #8e8e93;         /* secondary text */
  --spw-muted-2: #b4b4b9;
  --spw-border: rgba(255, 255, 255, 0.12);
  --spw-primary: #ffffff;       /* primary button background */
  --spw-primary-fg: #101010;    /* primary button text */
  --spw-accent: #fc6432;        /* Stacks orange: token icon, focus ring */
  --spw-accent-2: #ff8656;      /* lighter orange for the token-icon gradient */
  --spw-danger: #ff453a;
  --spw-success: #32d74b;
  --spw-radius-card: 20px;
  --spw-radius-input: 14px;
  --spw-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
}
```

A light palette is already built in — set `colorScheme: 'light'` (or `'auto'` to follow the OS/browser) instead of hand-rolling one. `WalletButton`/`WalletDrawer` set `data-spw-scheme` (from `resolvedColorScheme`) on their root element, which flips every `--spw-*` color token to the light values via a `[data-spw-scheme="light"]` override — no need to override `--spw-bg`/`--spw-surface`/etc. yourself just to get a light theme. Setting any of these custom properties yourself still works exactly as before and layers on top of whichever base (light or dark) `colorScheme` resolved to — e.g. to keep the light background but swap in your own accent color.

## Extension points

SIP-10 tokens, NFTs, arbitrary message signing, and contract calls aren't built in, but they're all reachable through `withWalletKey`, which hands your callback a one-shot `{ privateKey, address, mnemonic }`:

```tsx
import { useStacksPasskeyWallet } from '@toony1908/stacks-passkey-react';
import { makeContractCall, broadcastTransaction } from '@stacks/transactions';

function useCallMyContract() {
  const { withWalletKey, network } = useStacksPasskeyWallet();

  return () =>
    withWalletKey(async ({ privateKey }) => {
      const tx = await makeContractCall({
        contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        contractName: 'my-contract',
        functionName: 'do-thing',
        functionArgs: [],
        senderKey: privateKey,
        network,
      });
      const result = await broadcastTransaction({ transaction: tx, network });
      if ('reason' in result) throw new Error(`Broadcast failed: ${result.reason}`);
      return result.txid;
    });
}
```

The same `withWalletKey` is available from `useStacksPasskeyWallet()` (scoped to the connected wallet) or standalone from `@toony1908/stacks-passkey-react/core` (`withWalletKey(credentialId, config, fn)`) for non-React usage.

## Development

```sh
pnpm install
pnpm test        # vitest
pnpm build       # tsup -> dist/
pnpm typecheck   # tsc --noEmit
```

Licensed under [MIT](./LICENSE).
