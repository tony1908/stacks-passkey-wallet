// Shared STX send/sign logic — the single source of truth that both
// @toony1908/stacks-passkey-react (src/core/stx.ts) and
// @toony1908/stacks-passkey-web/react-native (src/stx.ts) bind their platform
// `withWalletKey` into via `sendStx`/`signStxTransfer` below. Everything here
// is framework-agnostic (no WebAuthn/DOM/RN), which is why it lives in core
// instead of being duplicated per platform.

import { broadcastTransaction, makeSTXTokenTransfer } from '@stacks/transactions';
import { PasskeyWalletError } from './errors';
import { assertValidMemo, assertValidRecipient } from './validation';
import type { DerivedWallet } from './derivation';
import type { ResolvedConfig } from './config';

export interface SendStxParams {
  recipient: string;
  amount: bigint;
  memo?: string;
}

/** A platform's `withWalletKey` (passkey prompt + PRF-derived key + entropy
 * zeroization) shape, injected so this module never has to know how a given
 * platform obtains the wallet. */
export type WithWalletKey = <T>(
  credentialId: string,
  cfg: ResolvedConfig,
  fn: (wallet: DerivedWallet) => Promise<T>,
) => Promise<T>;

/** Validates params BEFORE any passkey prompt / key derivation happens.
 * Returns the trimmed memo (or undefined) — memo is never truncated
 * silently, only trimmed and length-checked. */
function validateSendParams(cfg: Pick<ResolvedConfig, 'network'>, params: SendStxParams): string | undefined {
  assertValidRecipient(params.recipient, cfg.network);
  if (params.amount <= 0n) {
    throw new PasskeyWalletError('INVALID_AMOUNT', 'Amount must be greater than zero');
  }
  const trimmedMemo = params.memo?.trim();
  if (trimmedMemo !== undefined) {
    assertValidMemo(trimmedMemo);
  }
  return trimmedMemo;
}

/** Builds and signs the transfer, then enforces the fee ceiling — shared by
 * `sendStx` and `signStxTransfer` so the check can't be bypassed by one of
 * them.
 *
 * `makeSTXTokenTransfer` with no explicit `fee` accepts whatever fee the API
 * host estimates, unbounded. A misbehaving or compromised API host (or just
 * fee-market chaos) could otherwise get this SDK to sign away an
 * extortionate fee without the caller ever seeing the number first. Throwing
 * here (instead of clamping the fee down to the ceiling) is deliberate: a
 * clamped fee still signs and can still be broadcast, just underpriced — it
 * would confirm never while permanently consuming that nonce, i.e. a stuck
 * transaction. Refusing to sign at all is safer than shipping one that can
 * never land. */
async function buildSignedTransfer(
  wallet: DerivedWallet,
  cfg: ResolvedConfig,
  params: SendStxParams,
  trimmedMemo: string | undefined,
) {
  const tx = await makeSTXTokenTransfer({
    senderKey: wallet.privateKey,
    recipient: params.recipient,
    amount: params.amount,
    network: cfg.network,
    ...(trimmedMemo ? { memo: trimmedMemo } : {}),
  });

  const fee = tx.auth.spendingCondition.fee;
  if (fee > cfg.maxFeeMicroStx) {
    throw new PasskeyWalletError(
      'FEE_TOO_HIGH',
      `Estimated fee ${fee} microSTX exceeds the configured maxFeeMicroStx (${cfg.maxFeeMicroStx} microSTX). ` +
        'Raise config.maxFeeMicroStx if this fee is expected, or try again once network fees settle.',
    );
  }

  return tx;
}

/** Signs and broadcasts an STX transfer. Signing happens inside
 * `withWalletKey`'s callback (the private key only exists there, and its
 * entropy is zeroized before that call returns); the broadcast happens
 * OUTSIDE it, after that callback has already resolved — so the key's
 * in-memory lifetime covers signing only, not the `broadcastTransaction`
 * network round-trip. The signed `tx` that crosses that boundary carries a
 * signature, not the key itself, so nothing sensitive leaks by returning
 * it. */
export async function sendStx(
  withWalletKey: WithWalletKey,
  credentialId: string,
  cfg: ResolvedConfig,
  params: SendStxParams,
): Promise<string> {
  const trimmedMemo = validateSendParams(cfg, params);

  const tx = await withWalletKey(credentialId, cfg, (wallet) => buildSignedTransfer(wallet, cfg, params, trimmedMemo));

  const result = await broadcastTransaction({ transaction: tx, network: cfg.network });
  if ('reason' in result) {
    throw new PasskeyWalletError('BROADCAST_FAILED', `Failed to send STX: ${result.reason}`);
  }
  return result.txid;
}

/** Signs an STX transfer and returns the serialized hex. Never broadcasts. */
export async function signStxTransfer(
  withWalletKey: WithWalletKey,
  credentialId: string,
  cfg: ResolvedConfig,
  params: SendStxParams,
): Promise<string> {
  const trimmedMemo = validateSendParams(cfg, params);

  return withWalletKey(credentialId, cfg, async (wallet) => {
    const tx = await buildSignedTransfer(wallet, cfg, params, trimmedMemo);
    return tx.serialize();
  });
}
