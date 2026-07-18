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

// Balance/transaction polling logic (usePolledResource and friends) lives
// once in core's src/react.ts and is bound here to this package's own
// `useStacksPasskeyWallet` context — see that file for the polling/refetch
// behavior this delegates to.
const dataHooks = createWalletDataHooks(useStacksPasskeyWallet);
export const useStxBalance = dataHooks.useStxBalance;
export const useStxTransactions = dataHooks.useStxTransactions;
