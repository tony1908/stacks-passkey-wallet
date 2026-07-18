// Thin binding over the shared implementation in
// @toony1908/stacks-passkey-core's src/stx.ts (validation, fee-ceiling
// enforcement, sign-inside/broadcast-outside `withWalletKey` ordering — see
// that file for the "why"). This module only supplies this package's own
// `withWalletKey` (WebAuthn PRF-derived key, see ./session), so the two
// platform packages don't duplicate the transfer logic.

import {
  sendStx as coreSendStx,
  signStxTransfer as coreSignStxTransfer,
  type ResolvedConfig,
  type SendStxParams,
} from '@toony1908/stacks-passkey-core';
import { withWalletKey } from './session';

export type { SendStxParams };

/** Signs and broadcasts an STX transfer using this package's WebAuthn
 * `withWalletKey`. See core's `sendStx` for the signing/broadcast ordering
 * guarantee. */
export function sendStx(credentialId: string, cfg: ResolvedConfig, params: SendStxParams): Promise<string> {
  return coreSendStx(withWalletKey, credentialId, cfg, params);
}

/** Signs an STX transfer and returns the serialized hex. Never broadcasts. */
export function signStxTransfer(credentialId: string, cfg: ResolvedConfig, params: SendStxParams): Promise<string> {
  return coreSignStxTransfer(withWalletKey, credentialId, cfg, params);
}
