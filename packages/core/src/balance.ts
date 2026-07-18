import { hiroHost, type ResolvedConfig } from './config';
import { PasskeyWalletError } from './errors';

/** Fetches the **spendable** STX balance (total minus locked/stacked), in
 * microSTX, from the Hiro API. The `/stx` endpoint's `balance` field is the
 * total on-chain balance, which includes any amount locked in stacking —
 * spendable is `balance - locked`. A missing `locked` field is treated as 0
 * (back-compat with API responses/mocks that predate stacking support), and
 * the result is floored at 0 as a defensive guard (locked should never
 * exceed the total balance). */
export async function getStxBalance(
  address: string,
  cfg: Pick<ResolvedConfig, 'network' | 'apiUrls'>,
): Promise<bigint> {
  const response = await fetch(`${hiroHost(cfg)}/extended/v1/address/${encodeURIComponent(address)}/stx`);
  if (!response.ok) {
    throw new PasskeyWalletError('NETWORK_ERROR', 'Failed to fetch STX balance');
  }
  const data: unknown = await response.json();
  const record = data as { balance?: unknown; locked?: unknown } | null;
  const balance = record?.balance;
  if (typeof balance !== 'string') {
    throw new PasskeyWalletError('NETWORK_ERROR', 'Malformed STX balance response');
  }
  // `BigInt(...)` throws a raw SyntaxError on a non-numeric string. The Hiro
  // API is a trusted host, but a bad proxy/CDN/mock in front of it could
  // still hand back a mangled numeric field — surface that as the SDK's own
  // NETWORK_ERROR instead of leaking an unhandled SyntaxError to callers.
  let balanceBigInt: bigint;
  let locked: bigint;
  try {
    balanceBigInt = BigInt(balance);
    locked = typeof record?.locked === 'string' ? BigInt(record.locked) : 0n;
  } catch {
    throw new PasskeyWalletError('NETWORK_ERROR', 'Malformed STX balance response');
  }
  const spendable = balanceBigInt - locked;
  return spendable > 0n ? spendable : 0n;
}
