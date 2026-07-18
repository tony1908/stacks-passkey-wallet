// useStacksPasskeyWallet stays here (it binds this package's own
// StacksPasskeyContext — RN's context value also carries `isInitializing`,
// irrelevant to the data hooks below, which only need `address`/`config`).
// The balance/transaction polling logic itself is shared with
// @toony1908/stacks-passkey-react and lives in core's src/react.ts — this
// file only binds it to this package's context.

import { useContext } from 'react';
import { createWalletDataHooks } from '@toony1908/stacks-passkey-core/react';
import { StacksPasskeyContext, type StacksPasskeyContextValue } from './context';

export function useStacksPasskeyWallet(): StacksPasskeyContextValue {
  const ctx = useContext(StacksPasskeyContext);
  if (!ctx) {
    throw new Error('useStacksPasskeyWallet must be used within a StacksPasskeyProvider');
  }
  return ctx;
}

const dataHooks = createWalletDataHooks(useStacksPasskeyWallet);

export const useStxBalance = dataHooks.useStxBalance;
export const useStxTransactions = dataHooks.useStxTransactions;
