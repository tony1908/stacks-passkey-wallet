import { hiroHost, type ResolvedConfig } from './config';
import { PasskeyWalletError } from './errors';

export interface WalletTx {
  txid: string;
  kind: 'sent' | 'received' | 'other';
  amountMicroStx: bigint;
  counterparty?: string;
  memo?: string;
  status: 'pending' | 'success' | 'failed';
  timestamp?: number;
  feeMicroStx: bigint;
  nonce: number;
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

// Memos are fully attacker-controlled on-chain data (anyone can send a
// transfer with any memo bytes) that this SDK decodes and hands straight to
// UI. C0/C1 control characters (0x00-0x1f, 0x7f-0x9f) can smuggle terminal
// escape sequences; the Unicode bidi-override/embedding characters
// (U+202A-U+202E, U+2066-U+2069) can visually reorder or spoof rendered text
// (e.g. RLO tricks). Stripped after decoding, before the memo ever reaches a
// caller.
// eslint-disable-next-line no-control-regex
const UNSAFE_MEMO_CHARS = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g;

/** Best-effort hex -> trimmed UTF-8 decode of a Hiro `token_transfer.memo` field.
 * On-chain memos are a fixed 34-byte buffer right-padded with `0x00`, so the
 * trailing NUL padding is stripped along with trailing spaces before
 * trimming (`\0` is not whitespace, so plain `.trim()` alone would leave it
 * in). Also strips control and bidi-override characters (see
 * `UNSAFE_MEMO_CHARS`) since the memo is fully attacker-controlled on-chain
 * data. Ignores failures (returns undefined) rather than throwing. */
function decodeMemoHex(hex: unknown): string | undefined {
  if (typeof hex !== 'string') return undefined;
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean) return undefined;
  try {
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    const text = new TextDecoder()
      .decode(bytes)
      .replace(/[\0 ]+$/, '')
      .trim()
      .replace(UNSAFE_MEMO_CHARS, '');
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function mapTx(raw: unknown, address: string, isPending: boolean): WalletTx {
  const r = (raw ?? {}) as Record<string, unknown>;
  const txid = typeof r.tx_id === 'string' ? r.tx_id : '';
  const tokenTransfer =
    r.tx_type === 'token_transfer' && r.token_transfer && typeof r.token_transfer === 'object'
      ? (r.token_transfer as Record<string, unknown>)
      : undefined;

  let kind: WalletTx['kind'] = 'other';
  let amountMicroStx = 0n;
  let counterparty: string | undefined;
  let memo: string | undefined;

  if (tokenTransfer) {
    const senderAddress = typeof r.sender_address === 'string' ? r.sender_address : undefined;
    const recipientAddress =
      typeof tokenTransfer.recipient_address === 'string' ? tokenTransfer.recipient_address : undefined;
    // Only classify sent/received when we actually know who the sender is —
    // a malformed/missing sender_address must not default to "received",
    // which would fabricate a plausible-looking incoming payment.
    if (senderAddress !== undefined) {
      kind = senderAddress === address ? 'sent' : 'received';
      counterparty = kind === 'sent' ? recipientAddress : senderAddress;
    }
    amountMicroStx = toBigInt(tokenTransfer.amount);
    memo = decodeMemoHex(tokenTransfer.memo);
  }

  const status: WalletTx['status'] = isPending ? 'pending' : r.tx_status === 'success' ? 'success' : 'failed';
  const timestamp = !isPending && typeof r.burn_block_time === 'number' ? r.burn_block_time : undefined;

  return {
    txid,
    kind,
    amountMicroStx,
    counterparty,
    memo,
    status,
    timestamp,
    feeMicroStx: toBigInt(r.fee_rate),
    nonce: typeof r.nonce === 'number' ? r.nonce : 0,
  };
}

function extractResults(body: unknown): unknown[] {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) {
    throw new PasskeyWalletError('NETWORK_ERROR', 'Malformed STX transactions response');
  }
  return results;
}

export async function getStxTransactions(
  address: string,
  cfg: Pick<ResolvedConfig, 'network' | 'apiUrls' | 'transactionLimit'>,
  opts?: { limit?: number },
): Promise<WalletTx[]> {
  const limit = opts?.limit ?? cfg.transactionLimit ?? 20;
  const host = hiroHost(cfg);
  const encodedAddress = encodeURIComponent(address);

  const [confirmedRes, mempoolRes] = await Promise.all([
    fetch(`${host}/extended/v1/address/${encodedAddress}/transactions?limit=${limit}`),
    fetch(`${host}/extended/v1/address/${encodedAddress}/mempool?limit=${limit}`),
  ]);

  if (!confirmedRes.ok || !mempoolRes.ok) {
    throw new PasskeyWalletError('NETWORK_ERROR', 'Failed to fetch STX transactions');
  }

  const [confirmedBody, mempoolBody] = await Promise.all([confirmedRes.json(), mempoolRes.json()]);
  const pending = extractResults(mempoolBody).map((tx) => mapTx(tx, address, true));
  const confirmed = extractResults(confirmedBody).map((tx) => mapTx(tx, address, false));

  return [...pending, ...confirmed];
}
