export type StacksNetwork = 'mainnet' | 'testnet';

/** UI color scheme for the built-in components. `'auto'` follows the
 * OS/browser `prefers-color-scheme` setting. */
export type ColorScheme = 'dark' | 'light' | 'auto';
/** `ColorScheme` after resolving `'auto'` to the actual scheme in effect. */
export type ResolvedColorScheme = 'dark' | 'light';

export interface WalletStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Overrides for the block-explorer link builders used by the UI layer
 * (activity rows, the address/explorer link, the post-send success notice).
 * Any builder left unset falls back to the built-in `explorer.stacks.co`
 * default (`defaultExplorerTxUrl`/`defaultExplorerAddressUrl`). */
export interface ExplorerUrlBuilders {
  txUrl?: (network: StacksNetwork, txid: string) => string;
  addressUrl?: (network: StacksNetwork, address: string) => string;
}

export interface PasskeyWalletConfig {
  /** Shown in the WebAuthn `rp.name` prompt, and used as the default
   * `userName`/`userDisplayName` and the default `storageKey`/`prfSalt`.
   *
   * **This is not just branding.** `appName` seeds two derived defaults with
   * real consequences if it changes after launch:
   * - The default `prfSalt` is `${appName}-stacks-passkey-v1` — renaming
   *   `appName` (a rebrand, a typo fix, anything) re-derives a DIFFERENT
   *   wallet for every existing user unless `prfSalt` was pinned explicitly.
   *   There is no migration path back to the old wallet from this SDK.
   * - The default `storageKey` is `stacks-passkey-wallet:${appName}` —
   *   renaming orphans every already-persisted session (it'll look like a
   *   fresh install with no wallet, even though the underlying passkey and
   *   derivable wallet still exist).
   *
   * If you might ever rename your app, pin `prfSalt` and `storageKey`
   * explicitly now so `appName` is free to change later. */
  appName: string;
  /** INITIAL network. The React provider tracks the active network as
   * runtime state (`setNetwork`), so this only seeds it. */
  network: StacksNetwork;

  /** WebAuthn relying party id (`rp.id`). Defaults to the browser's own
   * resolution (current origin) when omitted. */
  rpId?: string;
  /** WebAuthn `user.name`. Defaults to `appName`. */
  userName?: string;
  /** WebAuthn `user.displayName`. Defaults to `appName`. */
  userDisplayName?: string;
  /** PRF extension salt, the "password" that (together with the passkey)
   * determines the derived wallet's entropy. Defaults to
   * `${appName}-stacks-passkey-v1`. Changing it after users have already
   * connected derives a DIFFERENT wallet for them.
   *
   * **The default salt is the ONLY isolation boundary between apps/builds
   * that share a `rpId`.** WebAuthn's PRF output already depends on the
   * passkey + salt, not on `appName` — so if your dev, staging, and prod
   * builds share the same `rpId` (e.g. all point at the same domain) and
   * all leave `prfSalt` at its `appName`-derived default, they derive the
   * IDENTICAL wallet, because they compute the identical default salt.
   * Set `prfSalt` explicitly and differently per environment (e.g.
   * `myapp-dev`, `myapp-staging`, `myapp-prod`) whenever environments can
   * share an `rpId`. */
  prfSalt?: string;
  /** WebAuthn `publicKey.timeout` (milliseconds), applied to registration,
   * PRF derivation, and reconnect assertions. Defaults to the browser's own
   * timeout when omitted. */
  webauthnTimeoutMs?: number;

  /** Per-network Hiro API host override. Any network left unset falls back
   * to the public Hiro-hosted default for that network. */
  apiUrls?: Partial<Record<StacksNetwork, string>>;
  /** Block-explorer link builder overrides; unset builders fall back to the
   * built-in `explorer.stacks.co` default. */
  explorer?: ExplorerUrlBuilders;

  /** Which BIP44 account (from the single passkey-derived wallet) to use.
   * Defaults to 0 (the first/only account most integrations need). */
  accountIndex?: number;

  /** UX safety margin subtracted from the balance when checking/pre-filling
   * a "send max" amount, so a full-balance send doesn't fail at broadcast
   * for lack of fee headroom. Defaults to 3000n microSTX. */
  feeBufferMicroStx?: bigint;
  /** Hard ceiling on the network fee the SDK will sign. A transfer whose
   * estimated fee exceeds this throws FEE_TOO_HIGH instead of silently
   * signing it. Defaults to 1_000_000n microSTX (1 STX). */
  maxFeeMicroStx?: bigint;
  /** Balance/transaction poll interval in milliseconds. Defaults to 30000. */
  pollIntervalMs?: number;
  /** Default page size for `getStxTransactions`/`useStxTransactions` when no
   * per-call `limit` is given. Defaults to 20. */
  transactionLimit?: number;

  /** Storage backend for the persisted `{ credentialId, addresses }` pair.
   * Defaults to `localStorage` (falling back to an in-memory store when
   * unavailable). */
  storage?: WalletStorage;
  /** Storage key for the persisted wallet. Defaults to
   * `stacks-passkey-wallet:${appName}`. */
  storageKey?: string;

  /** UI color scheme for the built-in components; `'auto'` follows the
   * OS/browser setting. Defaults to `'dark'`. */
  colorScheme?: ColorScheme;
}

export interface ResolvedConfig {
  appName: string;
  network: StacksNetwork;
  rpId?: string;
  userName: string;
  userDisplayName: string;
  prfSalt: string;
  webauthnTimeoutMs?: number;
  apiUrls: Partial<Record<StacksNetwork, string>>;
  explorer: {
    txUrl: (network: StacksNetwork, txid: string) => string;
    addressUrl: (network: StacksNetwork, address: string) => string;
  };
  accountIndex: number;
  feeBufferMicroStx: bigint;
  maxFeeMicroStx: bigint;
  pollIntervalMs: number;
  transactionLimit: number;
  storage?: WalletStorage;
  storageKey: string;
  colorScheme: ColorScheme;
}

function defaultHiroHost(network: StacksNetwork): string {
  return network === 'mainnet' ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so';
}

export function hiroHost(cfg: Pick<ResolvedConfig, 'network' | 'apiUrls'>): string {
  return cfg.apiUrls[cfg.network] ?? defaultHiroHost(cfg.network);
}

const EXPLORER_ORIGIN = 'https://explorer.stacks.co';

function explorerUrl(network: StacksNetwork, path: string): string {
  return network === 'mainnet' ? `${EXPLORER_ORIGIN}${path}` : `${EXPLORER_ORIGIN}${path}?chain=testnet`;
}

/** Built-in explorer.stacks.co tx link builder — the default for
 * `ResolvedConfig.explorer.txUrl` when no override is configured. */
export function defaultExplorerTxUrl(network: StacksNetwork, txid: string): string {
  return explorerUrl(network, `/txid/${txid}`);
}

/** Built-in explorer.stacks.co address link builder — the default for
 * `ResolvedConfig.explorer.addressUrl` when no override is configured. */
export function defaultExplorerAddressUrl(network: StacksNetwork, address: string): string {
  return explorerUrl(network, `/address/${address}`);
}

export function resolveConfig(cfg: PasskeyWalletConfig): ResolvedConfig {
  return {
    appName: cfg.appName,
    network: cfg.network,
    rpId: cfg.rpId,
    userName: cfg.userName ?? cfg.appName,
    userDisplayName: cfg.userDisplayName ?? cfg.appName,
    prfSalt: cfg.prfSalt ?? `${cfg.appName}-stacks-passkey-v1`,
    webauthnTimeoutMs: cfg.webauthnTimeoutMs,
    apiUrls: cfg.apiUrls ?? {},
    explorer: {
      txUrl: cfg.explorer?.txUrl ?? defaultExplorerTxUrl,
      addressUrl: cfg.explorer?.addressUrl ?? defaultExplorerAddressUrl,
    },
    accountIndex: cfg.accountIndex ?? 0,
    feeBufferMicroStx: cfg.feeBufferMicroStx ?? 3_000n,
    maxFeeMicroStx: cfg.maxFeeMicroStx ?? 1_000_000n,
    pollIntervalMs: cfg.pollIntervalMs ?? 30_000,
    transactionLimit: cfg.transactionLimit ?? 20,
    storage: cfg.storage,
    storageKey: cfg.storageKey ?? `stacks-passkey-wallet:${cfg.appName}`,
    colorScheme: cfg.colorScheme ?? 'dark',
  };
}
