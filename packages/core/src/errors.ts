// Error type for the SDK. Never embed secrets (private keys, mnemonics,
// entropy) in a message here — only public info (addresses, codes).

export type WalletErrorCode =
  | 'PASSKEY_CANCELLED'
  | 'PRF_UNSUPPORTED'
  | 'PASSKEY_UNSUPPORTED'
  | 'INSECURE_CONTEXT'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'MEMO_TOO_LONG'
  | 'NO_WALLET'
  | 'NETWORK_ERROR'
  | 'BROADCAST_FAILED'
  | 'FEE_TOO_HIGH';

export class PasskeyWalletError extends Error {
  public readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = 'PasskeyWalletError';
    this.code = code;
  }
}

export function isPasskeyWalletError(e: unknown): e is PasskeyWalletError {
  return e instanceof PasskeyWalletError;
}
