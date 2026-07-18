import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStacksPasskeyWallet, useStxBalance, useStxTransactions } from '../react';
import { resolveConfig, type WalletTx } from '@toony1908/stacks-passkey-core';
import { chunkAddress } from './format';
import { WalletDrawer } from './WalletDrawer';

vi.mock('../react', () => ({
  useStacksPasskeyWallet: vi.fn(),
  useStxBalance: vi.fn(),
  useStxTransactions: vi.fn(),
}));

// Real, checksummed addresses so the (un-mocked) core address validation
// accepts/rejects them correctly.
const TESTNET_ADDRESS = 'ST000000000000000000002AMW42H';
const MAINNET_ADDRESS = 'SP000000000000000000002Q6VF78';

const baseWallet = {
  isSupported: true,
  isConnected: true,
  isConnecting: false,
  address: 'ST2B5E06PAWAX0V6VQT93S4R1N411R3C3RQWF26F7',
  network: 'testnet' as const,
  setNetwork: vi.fn(),
  config: resolveConfig({ appName: 'test-app', network: 'testnet' }),
  resolvedColorScheme: 'dark' as const,
  connect: vi.fn(),
  reconnect: vi.fn(),
  disconnect: vi.fn(),
  sendStx: vi.fn(),
  signStxTransfer: vi.fn(),
  withWalletKey: vi.fn(),
  revealMnemonic: vi.fn(),
};

function mockBalance(balanceMicroStx: bigint | undefined, isLoading = false) {
  vi.mocked(useStxBalance).mockReturnValue({ balanceMicroStx, isLoading, refetch: vi.fn() });
}

function mockTransactions(transactions: WalletTx[] | undefined, isLoading = false) {
  vi.mocked(useStxTransactions).mockReturnValue({ transactions, isLoading, refetch: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useStacksPasskeyWallet).mockReturnValue(baseWallet);
  mockBalance(5_000_000n);
  mockTransactions([]);
});

describe('WalletDrawer', () => {
  it('is not accessible via role when closed', () => {
    render(<WalletDrawer open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sets data-spw-scheme on the portal root from the resolved color scheme', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, resolvedColorScheme: 'light' });
    render(<WalletDrawer open onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('[data-spw-scheme]')).toHaveAttribute('data-spw-scheme', 'light');
  });

  it('shows the balance and truncated address on the home view', () => {
    render(<WalletDrawer open onClose={vi.fn()} />);

    // Rendered twice by design (hero balance + the STX asset row's balance),
    // so assert presence rather than a single-match getByText.
    expect(screen.getAllByText('5.000000 STX').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /copy address/i })).toBeInTheDocument();
  });

  it('shows a testnet/mainnet segmented toggle on the home view, and clicking Mainnet calls setNetwork', async () => {
    const setNetwork = vi.fn();
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, setNetwork });
    const user = userEvent.setup();
    render(<WalletDrawer open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^testnet$/i })).toBeInTheDocument();
    const mainnetSegment = screen.getByRole('button', { name: /^mainnet$/i });
    expect(mainnetSegment).toBeInTheDocument();

    await user.click(mainnetSegment);

    expect(setNetwork).toHaveBeenCalledWith('mainnet');
  });

  it('shows action cards, including Activity, on the home view', () => {
    render(<WalletDrawer open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^send$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^receive$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^activity$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recovery phrase/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /explorer/i })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<WalletDrawer open onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('back button returns to the home view', async () => {
    const user = userEvent.setup();
    render(<WalletDrawer open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /^send$/i }));
    expect(screen.getByRole('heading', { name: /send stx/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('heading', { name: /^wallet$/i })).toBeInTheDocument();
  });

  it('shows a network chip next to the view title on non-home views', async () => {
    const user = userEvent.setup();
    render(<WalletDrawer open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(screen.getByRole('heading', { name: /send stx/i }).parentElement).toHaveTextContent(/testnet/i);
  });

  it('shows a Mainnet network chip on non-home views when connected to mainnet', async () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, network: 'mainnet' });
    const user = userEvent.setup();
    render(<WalletDrawer open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /^receive$/i }));

    expect(screen.getByRole('heading', { name: /receive stx/i }).parentElement).toHaveTextContent(/mainnet/i);
  });

  describe('Focus management', () => {
    function Trigger() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open wallet
          </button>
          <WalletDrawer open={open} onClose={() => setOpen(false)} />
        </>
      );
    }

    it('moves focus to the Close button on open, and restores it to the trigger on close', async () => {
      const user = userEvent.setup();
      render(<Trigger />);
      const trigger = screen.getByRole('button', { name: /open wallet/i });

      await user.click(trigger);
      expect(screen.getByRole('button', { name: /^close$/i })).toHaveFocus();

      await user.keyboard('{Escape}');
      expect(trigger).toHaveFocus();
    });

    it('traps Tab within the drawer, wrapping from the last focusable element back to the first', async () => {
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);
      const dialog = screen.getByRole('dialog');
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) throw new Error('expected at least one focusable element in the dialog');

      last.focus();
      await user.tab();
      expect(first).toHaveFocus();

      first.focus();
      await user.tab({ shift: true });
      expect(last).toHaveFocus();
    });
  });

  it('requires a second Confirm click before disconnecting (two-step confirm)', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, disconnect });
    const user = userEvent.setup();
    render(<WalletDrawer open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /^disconnect$/i }));

    // First click only reveals the reassurance copy + Cancel/Disconnect — it
    // must not disconnect yet.
    expect(screen.getByText(/you can reconnect anytime with your passkey/i)).toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // In confirm state the footer is replaced, so the only Disconnect button
    // now is the confirm action.
    await user.click(screen.getByRole('button', { name: /^disconnect$/i }));

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(disconnect).toHaveBeenCalled());
  });

  it('backs out of the disconnect confirm on Cancel, without disconnecting', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WalletDrawer open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /^disconnect$/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('shows the full address and a funding hint on the Receive view', async () => {
    const user = userEvent.setup();
    render(<WalletDrawer open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /^receive$/i }));

    expect(screen.getByText(chunkAddress(baseWallet.address))).toBeInTheDocument();
    expect(screen.getByText(/send stx to this address to fund your wallet/i)).toBeInTheDocument();
  });

  describe('Send STX', () => {
    async function fillForm(recipient: string, amount: string, memo?: string) {
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /^send$/i }));
      if (recipient) await user.type(screen.getByLabelText(/recipient/i), recipient);
      if (amount) await user.type(screen.getByLabelText(/amount/i), amount);
      if (memo) await user.type(screen.getByLabelText(/memo/i), memo);
      return { user };
    }

    it('disables Send until recipient and amount are both filled', async () => {
      await fillForm('', '');
      expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
    });

    it('disables Send for a valid address on the wrong network', async () => {
      await fillForm(MAINNET_ADDRESS, '1');
      expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
      expect(screen.getByText(/wrong network/i)).toBeInTheDocument();
    });

    it('disables Send for a memo over 34 bytes', async () => {
      await fillForm(TESTNET_ADDRESS, '1', 'a'.repeat(35));
      expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
      expect(screen.getByText(/34 bytes/i)).toBeInTheDocument();
    });

    it('disables Send for an amount over the balance', async () => {
      await fillForm(TESTNET_ADDRESS, '10');
      expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
      expect(screen.getByText(/exceeds balance/i)).toBeInTheDocument();
    });

    it('fills the Send max amount minus the fee buffer when clicking Send max', async () => {
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await user.click(screen.getByRole('button', { name: /^send max$/i }));

      expect(screen.getByLabelText(/amount/i)).toHaveValue('4.997000');
    });

    it('honors a custom config.feeBufferMicroStx when computing Send max', async () => {
      const customConfig = resolveConfig({
        appName: 'test-app',
        network: 'testnet',
        feeBufferMicroStx: 100_000n,
      });
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, config: customConfig });
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await user.click(screen.getByRole('button', { name: /^send max$/i }));

      // 5_000_000n balance - 100_000n custom buffer (vs. the default 3_000n
      // buffer's 4.997000 above) proves the buffer is config-driven.
      expect(screen.getByLabelText(/amount/i)).toHaveValue('4.900000');
    });

    it('enables Send for valid input and submits the parsed microSTX amount + trimmed memo', async () => {
      const sendStx = vi.fn().mockResolvedValue('0xabc123');
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, sendStx });
      const { user } = await fillForm(TESTNET_ADDRESS, '0.5', '  hi  ');

      const sendButton = screen.getByRole('button', { name: /^send$/i });
      expect(sendButton).not.toBeDisabled();
      await user.click(sendButton);

      await waitFor(() =>
        expect(sendStx).toHaveBeenCalledWith({ recipient: TESTNET_ADDRESS, amount: 500_000n, memo: 'hi' }),
      );
    });

    it('shows an inline success message with an explorer link, refetches, and returns home', async () => {
      const sendStx = vi.fn().mockResolvedValue('0xabc123');
      const refetchBalance = vi.fn();
      const refetchTxs = vi.fn();
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, sendStx });
      vi.mocked(useStxBalance).mockReturnValue({ balanceMicroStx: 5_000_000n, isLoading: false, refetch: refetchBalance });
      vi.mocked(useStxTransactions).mockReturnValue({ transactions: [], isLoading: false, refetch: refetchTxs });
      const { user } = await fillForm(TESTNET_ADDRESS, '0.5');

      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => expect(screen.getByText(/transaction submitted/i)).toBeInTheDocument());
      expect(screen.getByRole('link', { name: /view on explorer/i })).toHaveAttribute(
        'href',
        'https://explorer.stacks.co/txid/0xabc123?chain=testnet',
      );
      expect(screen.getByRole('heading', { name: /^wallet$/i })).toBeInTheDocument();
      expect(refetchBalance).toHaveBeenCalled();
      expect(refetchTxs).toHaveBeenCalled();
    });

    it('calls onSuccess with the txid on a successful send', async () => {
      const sendStx = vi.fn().mockResolvedValue('0xabc123');
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, sendStx });
      const onSuccess = vi.fn();
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} onSuccess={onSuccess} />);
      await user.click(screen.getByRole('button', { name: /^send$/i }));
      await user.type(screen.getByLabelText(/recipient/i), TESTNET_ADDRESS);
      await user.type(screen.getByLabelText(/amount/i), '0.5');

      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('0xabc123'));
    });

    it('shows the send error inline and calls onError on failure', async () => {
      const sendStx = vi.fn().mockRejectedValue(new Error('cancelled'));
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, sendStx });
      const onError = vi.fn();
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} onError={onError} />);
      await user.click(screen.getByRole('button', { name: /^send$/i }));
      await user.type(screen.getByLabelText(/recipient/i), TESTNET_ADDRESS);
      await user.type(screen.getByLabelText(/amount/i), '0.5');

      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => expect(screen.getByText('cancelled')).toBeInTheDocument());
      expect(onError).toHaveBeenCalled();
    });

    it('resets the send form after closing and reopening the drawer', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<WalletDrawer open onClose={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /^send$/i }));
      await user.type(screen.getByLabelText(/recipient/i), TESTNET_ADDRESS);
      await user.type(screen.getByLabelText(/amount/i), '0.5');

      rerender(<WalletDrawer open={false} onClose={vi.fn()} />);
      rerender(<WalletDrawer open onClose={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      expect(screen.getByLabelText(/recipient/i)).toHaveValue('');
      expect(screen.getByLabelText(/amount/i)).toHaveValue('');
    });
  });

  describe('Activity', () => {
    it('renders a sent row and a received row, with a pending pill, linking to the explorer', async () => {
      const sentTx: WalletTx = {
        txid: '0xsent',
        kind: 'sent',
        amountMicroStx: 1_000_000n,
        counterparty: TESTNET_ADDRESS,
        status: 'success',
        timestamp: Math.floor(Date.now() / 1000) - 3600,
        feeMicroStx: 180n,
        nonce: 1,
      };
      const receivedTx: WalletTx = {
        txid: '0xrecv',
        kind: 'received',
        amountMicroStx: 2_000_000n,
        counterparty: MAINNET_ADDRESS,
        status: 'pending',
        timestamp: undefined,
        feeMicroStx: 180n,
        nonce: 2,
      };
      mockTransactions([sentTx, receivedTx]);
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /^activity$/i }));

      expect(screen.getByText(/sent/i)).toBeInTheDocument();
      expect(screen.getByText(/received/i)).toBeInTheDocument();
      expect(screen.getByText(/pending/i)).toBeInTheDocument();
      expect(screen.getByText(/\+ 2\.000000 STX/)).toBeInTheDocument();
      expect(screen.getByText(/- 1\.000000 STX/)).toBeInTheDocument();

      const links = screen.getAllByRole('link');
      const sentLink = links.find((l) => l.getAttribute('href')?.includes('0xsent'));
      expect(sentLink).toHaveAttribute('href', 'https://explorer.stacks.co/txid/0xsent?chain=testnet');
    });

    it('uses a custom config.explorer.txUrl for the activity-row link', async () => {
      const sentTx: WalletTx = {
        txid: '0xsent',
        kind: 'sent',
        amountMicroStx: 1_000_000n,
        counterparty: TESTNET_ADDRESS,
        status: 'success',
        timestamp: Math.floor(Date.now() / 1000) - 3600,
        feeMicroStx: 180n,
        nonce: 1,
      };
      mockTransactions([sentTx]);
      const customConfig = resolveConfig({
        appName: 'test-app',
        network: 'testnet',
        explorer: { txUrl: (network, txid) => `https://custom.explorer/${network}/${txid}` },
      });
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, config: customConfig });
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /^activity$/i }));

      const links = screen.getAllByRole('link');
      const sentLink = links.find((l) => l.getAttribute('href')?.includes('0xsent'));
      expect(sentLink).toHaveAttribute('href', 'https://custom.explorer/testnet/0xsent');
    });

    it('shows a loading state, then an empty state when there are no transactions', async () => {
      mockTransactions(undefined, true);
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /^activity$/i }));
      expect(screen.getByText(/loading/i)).toBeInTheDocument();

      mockTransactions([], false);
      const user2 = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);
      await user2.click(screen.getByRole('button', { name: /^activity$/i }));
      expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument();
    });
  });

  describe('Recovery phrase', () => {
    const MNEMONIC = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(' ');

    it('keeps words hidden until Reveal, then shows them once revealMnemonic resolves', async () => {
      const revealMnemonic = vi.fn().mockResolvedValue(MNEMONIC);
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, revealMnemonic });
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /recovery phrase/i }));
      expect(screen.queryByText('word1')).not.toBeInTheDocument();
      expect(revealMnemonic).not.toHaveBeenCalled();
      expect(screen.getByText(/anyone with this phrase can take your funds/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^reveal$/i }));

      await waitFor(() => expect(screen.getByText('word1')).toBeInTheDocument());
      expect(revealMnemonic).toHaveBeenCalledTimes(1);
      expect(screen.getByText('word24')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^hide$/i }));
      expect(screen.queryByText('word1')).not.toBeInTheDocument();
    });

    it('auto-hides the revealed mnemonic after 60 seconds', async () => {
      vi.useFakeTimers();
      try {
        const revealMnemonic = vi.fn().mockResolvedValue(MNEMONIC);
        vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, revealMnemonic });
        render(<WalletDrawer open onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /recovery phrase/i }));
        fireEvent.click(screen.getByRole('button', { name: /^reveal$/i }));
        await act(async () => {}); // flush the resolved revealMnemonic() promise

        expect(screen.getByText('word1')).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(60_000);
        });

        expect(screen.queryByText('word1')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('wipes the revealed words when navigating back from the recovery view', async () => {
      const revealMnemonic = vi.fn().mockResolvedValue(MNEMONIC);
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, revealMnemonic });
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /recovery phrase/i }));
      await user.click(screen.getByRole('button', { name: /^reveal$/i }));
      await waitFor(() => expect(screen.getByText('word1')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /^back$/i }));

      expect(screen.queryByText('word1')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /recovery phrase/i }));
      expect(screen.queryByText('word1')).not.toBeInTheDocument();
    });

    it('wipes the revealed words if the wallet becomes disconnected while the drawer stays open', async () => {
      const revealMnemonic = vi.fn().mockResolvedValue(MNEMONIC);
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, revealMnemonic });
      const user = userEvent.setup();
      const { rerender } = render(<WalletDrawer open onClose={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /recovery phrase/i }));
      await user.click(screen.getByRole('button', { name: /^reveal$/i }));
      await waitFor(() => expect(screen.getByText('word1')).toBeInTheDocument());

      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, revealMnemonic, isConnected: false });
      rerender(<WalletDrawer open onClose={vi.fn()} />);

      expect(screen.queryByText('word1')).not.toBeInTheDocument();
    });

    it('shows the failure inline and calls onError when revealing fails', async () => {
      const revealMnemonic = vi.fn().mockRejectedValue(new Error('Passkey prompt was cancelled'));
      vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, revealMnemonic });
      const onError = vi.fn();
      const user = userEvent.setup();
      render(<WalletDrawer open onClose={vi.fn()} onError={onError} />);

      await user.click(screen.getByRole('button', { name: /recovery phrase/i }));
      await user.click(screen.getByRole('button', { name: /^reveal$/i }));

      await waitFor(() => expect(onError).toHaveBeenCalled());
      expect(screen.getByText(/anyone with this phrase can take your funds/i)).toBeInTheDocument();
    });
  });
});
