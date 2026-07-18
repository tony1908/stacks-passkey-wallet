# @toony1908/stacks-passkey-wallet — Implementation Plan

> **For Claude:** Execute this plan with **Sonnet 5 high-effort subagents**, one per task group, in dependency order. TDD throughout: write the failing test first, implement minimally, run tests, commit. Review each subagent's diff and run the gate (`pnpm typecheck && pnpm test && pnpm build`) before dispatching the next dependent group.

**Goal:** A reusable, security-conscious React SDK that gives any app a WebAuthn passkey (PRF)-derived Stacks hot wallet: connect with FaceID/fingerprint, view balance and transaction history, send STX, sign transactions, and reveal the recovery phrase — with the private key re-derived per operation and never cached.

**Architecture:** Three layers behind two package entry points. `./core` is framework-agnostic (WebAuthn PRF → BIP39/BIP44 key derivation, STX send/sign, balance + tx history fetch, validation, storage) with **no React**. `react/` is a provider + hooks. `ui/` is components-first (the primary `.` entry): a `<WalletButton>` and a `<WalletDrawer>` with self-injecting styles. The private key is derived inside a single `withWalletKey()` scope, used, and its entropy zeroed — never stored in state, a ref, storage, logs, or errors.

**Tech Stack:** TypeScript (strict), React ≥18, `@scure/bip39` (only runtime dep), `@stacks/transactions` + `@stacks/wallet-sdk` (peer deps), tsup (ESM + d.ts), vitest + Testing Library + jsdom. No Tailwind, no toast lib, no icon lib, no react-query — all removed to shrink the supply-chain surface.

---

## Security requirements (apply to EVERY task)

These are non-negotiable and must not be simplified away:

1. **Per-operation key lifecycle.** The derived private key exists only inside a `withWalletKey(credentialId, cfg, fn)` call: derive → run `fn` → in `finally`, `entropy.fill(0)` and drop references. **No module-level, provider-level, or ref-level key cache.** Every sign/send/reveal triggers a fresh PRF + user-verification prompt.
2. **PRF required.** `registerPasskey` must throw `PRF_UNSUPPORTED` if `getClientExtensionResults().prf?.enabled` is not true. No wallet without PRF.
3. **User verification required** (`userVerification: 'required'`) and **resident key required** on both create and get.
4. **Secure-context guard.** Throw `INSECURE_CONTEXT` if `!window.isSecureContext` before any WebAuthn call.
5. **Only public data persisted.** Storage holds `{ credentialId, address }` and nothing else, ever. Never persist mnemonic/private key/entropy.
6. **`prfSalt` is the wallet identity.** Configurable, defaults to `` `${appName}-stacks-passkey-v1` ``. Document that changing it derives a different wallet.
7. **`rpId` defaults to origin** (the browser's secure default) — set only if the consumer passes it.
8. **Validation in core, not just UI:** recipient address validity + network-prefix match, memo ≤ 34 bytes, amount > 0. External API responses (Hiro) validated with minimal runtime guards.
9. **No secrets in logs or error messages.** Errors reference only public info (addresses, codes).
10. **No "copy secret" affordances.** Address copy is fine (public). Mnemonic is displayed word-grid only, never written to the clipboard.
11. **`signStxTransfer` never broadcasts.** It returns signed hex so consumers can't accidentally double-broadcast; only `sendStx` broadcasts.

---

## Conventions

- **Relative imports only** (no path aliases) — robust for a published lib.
- Each module has a colocated `*.test.ts`/`*.test.tsx`.
- Commit after each green module: `feat(core): ...`, `feat(react): ...`, `feat(ui): ...`, `docs: ...`, `test: ...`.
- WebAuthn/`crypto`/`navigator.credentials`/`fetch` are mocked in tests (jsdom has no `navigator.credentials`). `crypto.getRandomValues` is available via Node.
- The gate after every group: `pnpm typecheck && pnpm test && pnpm build`.

---

## Shared type contracts (implement exactly)

```ts
// core/config.ts
export type StacksNetwork = 'mainnet' | 'testnet';

export interface WalletStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface PasskeyWalletConfig {
  appName: string;                 // WebAuthn rp.name; seeds default prfSalt + storageKey
  network: StacksNetwork;
  prfSalt?: string;                // default `${appName}-stacks-passkey-v1`
  rpId?: string;                   // default: undefined (browser uses current origin)
  hiroApiUrl?: string;             // default: Hiro mainnet/testnet host
  storage?: WalletStorage;         // default: localStorage adapter (memory fallback if unavailable)
  storageKey?: string;             // default `stacks-passkey-wallet:${appName}`
}

export interface ResolvedConfig extends Required<Omit<PasskeyWalletConfig, 'rpId'>> {
  rpId?: string;
}
export function resolveConfig(cfg: PasskeyWalletConfig): ResolvedConfig;

// core/derivation.ts
export interface DerivedWallet { mnemonic: string; privateKey: string; address: string; }

// core/storage.ts
export interface StoredWallet { credentialId: string; address: string; }

// core/transactions.ts
export interface WalletTx {
  txid: string;
  kind: 'sent' | 'received' | 'other';
  amountMicroStx: bigint;
  counterparty?: string;
  memo?: string;
  status: 'pending' | 'success' | 'failed';
  timestamp?: number;              // unix seconds; undefined while pending
  feeMicroStx: bigint;
  nonce: number;
}
```

---

## Group A1 — Pure core (no browser, no WebAuthn). Subagent 1.

**Files (create + colocated tests):**
- `src/core/errors.ts` — `class PasskeyWalletError extends Error { code: WalletErrorCode }` and `type WalletErrorCode = 'PASSKEY_CANCELLED' | 'PRF_UNSUPPORTED' | 'PASSKEY_UNSUPPORTED' | 'INSECURE_CONTEXT' | 'INSUFFICIENT_BALANCE' | 'INVALID_ADDRESS' | 'INVALID_AMOUNT' | 'MEMO_TOO_LONG' | 'NO_WALLET' | 'NETWORK_ERROR' | 'BROADCAST_FAILED'`. Never embed secrets. Add `isPasskeyWalletError(e): e is PasskeyWalletError`.
- `src/core/config.ts` — `resolveConfig` (defaults per contract above) + Hiro host helper `hiroHost(cfg)`.
- `src/core/encoding.ts` — `base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string`, `base64UrlDecode(v: string): Uint8Array`. Port from the reference `passkeyWallet.ts:37-53`.
- `src/core/validation.ts` — `isValidStacksAddress`, `assertValidRecipient(addr, network)` (uses `validateStacksAddress` from `@stacks/transactions` + prefix check: mainnet `SP`/`SM`, testnet `ST`/`SN`, else `INVALID_ADDRESS`), `memoByteLength`, `assertValidMemo` (>34 bytes → `MEMO_TOO_LONG`), `parseStxToMicroStx(input): bigint | null` (port the reference `WalletDrawer.tsx:46-52`), `formatMicroStx(micro: bigint): string`.
- `src/core/derivation.ts` — `walletFromEntropy(entropy, network)` (port the reference `passkeyWallet.ts:22-31`, entropy 32 bytes → mnemonic → `generateWallet` → account[0] → address).
- `src/core/balance.ts` — `getStxBalance(address, cfg): Promise<bigint>` via `fetch(`${hiroHost}/extended/v1/address/${addr}/stx`)`, minimal guard on `{ balance: string }`, `NETWORK_ERROR` on failure.
- `src/core/transactions.ts` — `getStxTransactions(address, cfg, opts?): Promise<WalletTx[]>`. Fetch confirmed `/extended/v1/address/${addr}/transactions?limit=${limit ?? 20}` and mempool `/extended/v1/address/${addr}/mempool?limit=...` in parallel; merge with pending first; map `token_transfer` txs to `sent`/`received` relative to `address` (else `kind:'other'`); parse amounts/fees to `bigint`; decode memo if present; `status` from `tx_status` (`pending` for mempool, `success` for `success`, else `failed`). Minimal hand-written guards on the fields used — no zod.

**TDD focus:** `parseStxToMicroStx` edge cases (">6 decimals → null", "0.5 → 500000", integers, rejects letters/negatives); `formatMicroStx` round-trips; `assertValidRecipient` wrong-network prefix throws; `assertValidMemo` at 34 vs 35 bytes (multibyte); `walletFromEntropy` with a **fixed known 32-byte entropy vector** produces a stable address (snapshot the derived address so regressions are caught); `getStxBalance`/`getStxTransactions` with a mocked `fetch` (happy path + malformed body + non-ok → `NETWORK_ERROR`), and sent/received classification.

Commit: `feat(core): pure primitives — errors, config, encoding, validation, derivation, balance, transactions`.

---

## Group A2 — Browser core: WebAuthn + per-op signing. Subagent 2 (after A1).

**Files:**
- `src/core/passkey.ts` — `isPasskeySupported()`, `assertSecureContext()`, `registerPasskey(cfg): Promise<string>` (returns base64url credentialId; rp.name=`appName`, rp.id=`rpId` if set, `residentKey:'required'`, `userVerification:'required'`, `pubKeyCredParams` -7 & -257, `extensions:{prf:{}}`, throw `PRF_UNSUPPORTED` unless `prf.enabled`), and internal `derivePrfEntropy(credentialId, cfg): Promise<Uint8Array>` (get() with `allowCredentials`, `userVerification:'required'`, `extensions:{prf:{eval:{first: TextEncoder(prfSalt)}}}`; read `prf.results.first`; throw `PRF_UNSUPPORTED` if absent). Wrap create/get so a `NotAllowedError` becomes `PASSKEY_CANCELLED` (port the reference `runWebAuthn`).
- `src/core/session.ts` — **the security core.** `withWalletKey<T>(credentialId, cfg, fn: (w: DerivedWallet) => Promise<T>): Promise<T>`: `assertSecureContext()` → `entropy = await derivePrfEntropy(...)` → `wallet = await walletFromEntropy(entropy, network)` → `try { return await fn(wallet) } finally { entropy.fill(0) }`. No caching. This is the ONLY path that materializes a key.
- `src/core/stx.ts` — `sendStx(credentialId, cfg, { recipient, amount, memo? }): Promise<string /*txid*/>` (validate recipient+memo+amount; `withWalletKey` → `makeSTXTokenTransfer` → `broadcastTransaction`; throw `BROADCAST_FAILED` on `reason`; return `txid`). `signStxTransfer(credentialId, cfg, { recipient, amount, memo? }): Promise<string /*serialized hex, NOT broadcast*/>`. A pre-send balance check is optional in core (the react layer does the friendly check); do not silently truncate memos.
- `src/core/storage.ts` — `defaultStorage(): WalletStorage` (localStorage adapter with a try/catch in-memory fallback), `loadStoredWallet(cfg): StoredWallet | null`, `saveStoredWallet(cfg, w)`, `clearStoredWallet(cfg)`.
- Update `src/core/index.ts` — barrel export the full public core API (types + functions).

**TDD focus:** mock `navigator.credentials.create/get` and `window.isSecureContext`. Verify: `registerPasskey` throws `PRF_UNSUPPORTED` when `prf.enabled` falsy; `PASSKEY_CANCELLED` on `NotAllowedError`; `INSECURE_CONTEXT` when insecure. **`withWalletKey` zeroes the entropy** — assert the injected entropy `Uint8Array` is all-zero after the call resolves AND after `fn` throws (spy on a captured reference). `sendStx` validates before prompting (invalid address throws without calling `credentials.get`). `signStxTransfer` returns hex and never calls `broadcastTransaction`.

Commit: `feat(core): passkey WebAuthn + per-operation withWalletKey signing + storage`.

Gate, then dispatch B and C1 (C1 has no dependency on B).

---

## Group B — React layer. Subagent 3 (after A).

**Files:**
- `src/react/context.ts` — the context + `StacksPasskeyContextValue` type (see design; exposes `isSupported, isConnected, isConnecting, address?, network, connect, disconnect, sendStx, signStxTransfer, withWalletKey, revealMnemonic, config`).
- `src/react/StacksPasskeyProvider.tsx` — props = `PasskeyWalletConfig & { children }`. `resolveConfig` once (memoized). On mount, `loadStoredWallet` → set `{credentialId, address}` state (no key). `connect()`: `registerPasskey` then `withWalletKey(cid, cfg, w => w.address)` to obtain + persist the address (two one-time prompts). `disconnect()`: `clearStoredWallet` + reset state. `sendStx`/`signStxTransfer`/`withWalletKey`/`revealMnemonic` delegate to core with the stored credentialId (each = fresh prompt). `revealMnemonic` = `withWalletKey(cid, cfg, w => w.mnemonic)`. `sendStx` does the friendly pre-flight balance check (`getStxBalance` < amount → `INSUFFICIENT_BALANCE`). **No private key in state or refs.**
- `src/react/hooks.ts` — `useStacksPasskeyWallet()` (throws if outside provider); `useStxBalance(): { balanceMicroStx?, isLoading, error, refetch }` (fetch on address change, poll 30s via `setInterval`, `AbortController`, cleanup on unmount); `useStxTransactions(opts?): { transactions?, isLoading, error, refetch }` (same pattern). No react-query.
- `src/react/index.ts` — barrel.

**TDD focus:** render provider with mocked core (`vi.mock('../core')`); assert `connect` persists and flips `isConnected`; `disconnect` clears; `sendStx` throws `INSUFFICIENT_BALANCE` when balance low (and does not broadcast); hooks poll + `refetch` refetches + abort on unmount; `useStacksPasskeyWallet` throws outside provider.

Commit: `feat(react): provider, wallet context, balance + transactions hooks`.

---

## Group C1 — UI primitives: styles + icons. Subagent 4 (parallel with B, after A).

**Files:**
- `src/ui/styles.ts` — `injectStyles()`: on first call (guard by `document.getElementById('spw-styles')`), append a `<style id="spw-styles">` with all `.spw-*` rules and theme variables on `:root`/`.spw-root` (`--spw-accent`, `--spw-accent-fg`, `--spw-bg`, `--spw-fg`, `--spw-muted`, `--spw-border`, `--spw-danger`, `--spw-radius`). SSR-safe (`typeof document === 'undefined'` early return). Port the reference Tailwind look (violet accent, rounded, drawer slide) to plain CSS.
- `src/ui/icons.tsx` — inline stroke-SVG components (no lucide): `WalletIcon, FingerprintIcon, ChevronDownIcon, CloseIcon, BackIcon, CopyIcon, CheckIcon, SendIcon, DownloadIcon, KeyIcon, ExternalLinkIcon, SpinnerIcon, ActivityIcon, ArrowUpRightIcon, ArrowDownLeftIcon`. Each takes `size?`/`className?`.

**TDD focus:** `injectStyles` is idempotent (calling twice yields one `#spw-styles`); each icon renders an `<svg>`.

Commit: `feat(ui): self-injecting stylesheet + inline icon set`.

---

## Group C2 — UI components. Subagent 5 (after B + C1).

**Files:**
- `src/ui/format.ts` — `truncateAddress`, explorer URL builders (mainnet vs testnet incl. `?chain=testnet`), re-use `formatMicroStx` from core.
- `src/ui/WalletButton.tsx` — props `{ className?, style?, label?, onError? }`. Disconnected: "Connect wallet" button → `connect()` (passkey-only; show only if `isSupported`, else a disabled hint). Connected: address pill (green dot + truncated address) → opens `<WalletDrawer>`. Calls `injectStyles()` on mount.
- `src/ui/WalletDrawer.tsx` — props `{ open, onClose, onError?, onSuccess? }`. Portaled to `document.body`. Views: **home** (network badge, balance via `useStxBalance`, copyable address, action grid Send/Receive/Activity/Recovery/Explorer, Disconnect); **send** (recipient/amount/memo with the core validators, Max with fee buffer `3000n`, submit → `sendStx`, inline success/error + `onSuccess`/`onError`, invalidate balance + txs via `refetch`); **receive** (address + copy); **activity** (`useStxTransactions` → list rows: direction icon, ± amount, counterparty, status pill pending/success/failed, relative time, link to explorer); **recovery** (warning → `revealMnemonic()` → word grid → Hide; wipe on close/unmount). Esc closes; focus-safe. No sonner — inline feedback + callbacks.
- `src/ui/index.ts` — barrel.
- Update `src/index.ts` — main entry re-exports `react/*` + `ui/*` + selected `core` types.

**TDD focus (Testing Library, mock the provider/hooks):** dropdown connect calls `connect`; send form disables until valid, blocks wrong-network address + oversized memo + amount>balance, calls `sendStx` with parsed microSTX + trimmed memo, shows success and refetches; activity view renders sent vs received rows and a pending pill; recovery requires the warning confirm before words show and wipes on close. Port/adapt the reference `WalletDrawer.test.tsx` assertions.

Commit: `feat(ui): WalletButton + WalletDrawer (home/send/receive/activity/recovery)`.

---

## Group D — Docs, license, final gate. Subagent 6 (after all).

**Files:**
- `README.md` — install; quickstart (`<StacksPasskeyProvider appName network>` + `<WalletButton/>`); config table; **Security & threat model** section (hot wallet; per-op derivation shrinks the key's in-memory window to a single operation; XSS during a live op can still read the key; `prfSalt` versioning; rpId/origin binding via WebAuthn resists phishing; only public data persisted; recommend CSP + pinned `@stacks/*` peer versions; not for large/long-term balances — treat as a hot wallet); API reference (core + react + ui); **extension points** (SIP-10 tokens, NFTs, message signing, contract calls all buildable on `withWalletKey`); browser/PRF support notes; theming via `--spw-*` variables.
- `LICENSE` — MIT.
- Verify: `pnpm typecheck && pnpm test && pnpm build` all green; `dist/` has `index.js`, `core/index.js`, and `.d.ts` for both; confirm `@stacks/*` + react are **not** bundled (external).

Commit: `docs: README with security threat model + LICENSE`.

---

## Out of scope for v1 (documented as extension points, not built)

SIP-10 fungible tokens, NFTs, contract-call helpers, message signing UI, QR codes for receive, hardware/extension-wallet multiplexing, react-query integration. All reachable via `withWalletKey` or added later without breaking the API.
