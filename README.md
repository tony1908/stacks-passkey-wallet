# stacks-wallet-sdk

<!-- Live only once GitHub Pages is enabled for this repo (Settings → Pages → deploy from /docs on main). -->
📖 **[Documentation](https://tony1908.github.io/stacks-passkey-wallet/)** — full docs site: architecture, install, quickstart, configuration reference, security/threat model, API reference.

A monorepo for a **passkey-derived Stacks hot-wallet SDK**, for both **web** and **React Native**, sharing a single framework-agnostic core.

The headline feature: **the same passkey — synced across devices via iCloud Keychain or Google Password Manager — plus the same `prfSalt` derives the same Stacks wallet on web and on mobile.** WebAuthn's PRF extension (browser) and native passkey PRF (`react-native-passkeys` on iOS/Android) both produce the same 32 bytes of entropy for the same passkey + salt, and both platforms feed that entropy into the same `@toony1908/stacks-passkey-core` derivation logic. Connect on your phone, open the same app on the web, hit "Use an existing passkey," and you're looking at the same address — no seed phrase, no manual import.

No browser extension, no seed phrase to write down at setup: the wallet's key material is derived on demand from the user's platform passkey, used for one operation, and discarded.

## Packages

| Package | What it is | Install target |
| --- | --- | --- |
| [`@toony1908/stacks-passkey-core`](packages/core/README.md) | Framework-agnostic primitives: config, validation, BIP39/BIP44 derivation, Hiro balance/transaction fetching, errors, types. No React, no DOM, no WebAuthn. | Shared — usually pulled in transitively, not installed directly. |
| [`@toony1908/stacks-passkey-react`](packages/react/README.md) | Web SDK: WebAuthn-PRF passkeys + a React provider/hooks + a DOM `WalletButton`/`WalletDrawer` UI. | Web app. |
| [`@toony1908/stacks-passkey-react-native`](packages/react-native/README.md) | React Native SDK: native passkeys (via `react-native-passkeys`, PRF) + a React provider/hooks + an RN `WalletButton`/`WalletDrawer` UI. | React Native / Expo app (custom dev client or bare build). |

The React Native package's connect → send → reconnect flow has been **verified end-to-end on a real Android device, including a real mainnet STX send** — see [its README's Status section](packages/react-native/README.md#status).

## Which package do I install?

- **Building a web app?** → `pnpm add @toony1908/stacks-passkey-react`
- **Building a React Native / Expo app?** → `pnpm add @toony1908/stacks-passkey-react-native`

Either one pulls in `@toony1908/stacks-passkey-core` automatically — you never need to install core yourself unless you're integrating a third platform.

## Architecture

```
   Web app                          React Native app
     │  WebAuthn PRF                     │  native passkey PRF
     │  (navigator.credentials)          │  (react-native-passkeys)
     ▼                                   ▼
  @toony1908/stacks-passkey-react     @toony1908/stacks-passkey-react-native
     │                                   │
     └────────────┬──────────────────────┘
                   │  same 32 bytes of PRF entropy
                   ▼
       @toony1908/stacks-passkey-core
       walletFromEntropy → BIP39 mnemonic → BIP44 account → privateKey/address
                   │
                   ▼
              Hiro API (balance, tx history, broadcast)
```

The per-operation key model and entropy zeroization are identical on both platforms: a signing key is never cached in memory across operations. It's derived inside a single `withWalletKey(credentialId, config, fn)` call — triggering a fresh biometric/FaceID/Touch ID prompt — handed to `fn`, and the raw entropy is zeroed (`entropy.fill(0)`) in a `finally` block the instant `fn` returns or throws. Only public data (`{ credentialId, addresses }`) is ever persisted, in `localStorage` on web and `AsyncStorage` on React Native. See each package's Security section for the full threat model.

## Repo layout

```
packages/
  core/           @toony1908/stacks-passkey-core
  react/          @toony1908/stacks-passkey-react        (formerly @toony1908/stacks-passkey-wallet)
  react-native/   @toony1908/stacks-passkey-react-native
```

## Development

```sh
pnpm install

pnpm -r typecheck   # tsc --noEmit in every package
pnpm -r test        # vitest in every package
pnpm -r build       # tsup -> dist/ in every package
```

Or scope any of the above to one package with `pnpm --filter <package-name> <script>`.

## Docs

- [`packages/core/README.md`](packages/core/README.md) — core primitives.
- [`packages/react/README.md`](packages/react/README.md) — web SDK: install, quickstart, full configuration reference, security/threat model, API reference, theming.
- [`packages/react-native/README.md`](packages/react-native/README.md) — React Native SDK: install, native setup requirements, quickstart, configuration, security, API reference.

Licensed under MIT.
