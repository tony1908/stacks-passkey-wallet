// Thin platform binding. The send/sign implementation (validation, fee
// ceiling, sign-inside/broadcast-outside `withWalletKey` split) is shared
// with @toony1908/stacks-passkey-react and lives in core's src/stx.ts — this
// file only supplies this package's `withWalletKey` (src/session.ts).

import { sendStx as coreSendStx, signStxTransfer as coreSignStxTransfer, type SendStxParams, type ResolvedConfig } from '@toony1908/stacks-passkey-core';
import { withWalletKey } from './session';

export type { SendStxParams };

/** Signs and broadcasts an STX transfer. See core's `sendStx` for the
 * sign-inside/broadcast-outside `withWalletKey` discipline this relies on. */
export async function sendStx(credentialId: string, cfg: ResolvedConfig, params: SendStxParams): Promise<string> {
  return coreSendStx(withWalletKey, credentialId, cfg, params);
}

/** Signs an STX transfer and returns the serialized hex. Never broadcasts. */
export async function signStxTransfer(
  credentialId: string,
  cfg: ResolvedConfig,
  params: SendStxParams,
): Promise<string> {
  return coreSignStxTransfer(withWalletKey, credentialId, cfg, params);
}
