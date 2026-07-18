import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStacksPasskeyWallet } from '../react';
import { PasskeyWalletError, resolveConfig } from '@toony1908/stacks-passkey-core';
import { WalletButton } from './WalletButton';

// Mock the whole React layer — WalletButton (and the WalletDrawer it opens)
// must never touch real WebAuthn/network, only the context values we hand it.
vi.mock('../react', () => ({
  useStacksPasskeyWallet: vi.fn(),
  useStxBalance: vi.fn(() => ({ balanceMicroStx: undefined, isLoading: false, refetch: vi.fn() })),
  useStxTransactions: vi.fn(() => ({ transactions: undefined, isLoading: false, refetch: vi.fn() })),
}));

const baseWallet = {
  isSupported: true,
  isConnected: false,
  isConnecting: false,
  address: undefined as string | undefined,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalletButton — unsupported', () => {
  it('renders a disabled button with a hint', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, isSupported: false });
    render(<WalletButton />);

    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeDisabled();
    expect(screen.getByText(/passkeys not supported/i)).toBeInTheDocument();
  });

  it('sets data-spw-scheme from the resolved color scheme on the root wrapper', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({
      ...baseWallet,
      isSupported: false,
      resolvedColorScheme: 'light',
    });
    const { container } = render(<WalletButton />);

    expect(container.firstElementChild).toHaveAttribute('data-spw-scheme', 'light');
  });
});

describe('WalletButton — disconnected', () => {
  it('calls connect() when clicked', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, connect });
    const user = userEvent.setup();
    render(<WalletButton />);

    await user.click(screen.getByRole('button', { name: /connect wallet/i }));

    expect(connect).toHaveBeenCalled();
  });

  it('uses the label prop to override the button text', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue(baseWallet);
    render(<WalletButton label="Sign in" />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('applies the color prop as --spw-primary and auto-picks a readable --spw-primary-fg on the connect button', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue(baseWallet);
    render(<WalletButton color="#fc6432" />);

    const btn = screen.getByRole('button', { name: /connect wallet/i });
    expect(btn.style.getPropertyValue('--spw-primary')).toBe('#fc6432');
    // A mid/dark orange -> white text for contrast.
    expect(btn.style.getPropertyValue('--spw-primary-fg')).toBe('#ffffff');
  });

  it('lets textColor override the auto-picked foreground', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue(baseWallet);
    render(<WalletButton color="#ffffff" textColor="#123456" />);

    const btn = screen.getByRole('button', { name: /connect wallet/i });
    expect(btn.style.getPropertyValue('--spw-primary')).toBe('#ffffff');
    expect(btn.style.getPropertyValue('--spw-primary-fg')).toBe('#123456');
  });

  it('leaves the token untouched when no color prop is given', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue(baseWallet);
    render(<WalletButton />);

    const btn = screen.getByRole('button', { name: /connect wallet/i });
    expect(btn.style.getPropertyValue('--spw-primary')).toBe('');
  });

  it('disables the button and shows a spinner while connecting', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, isConnecting: true });
    render(<WalletButton />);

    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeDisabled();
  });

  it('surfaces a connect failure via onError, without throwing', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('cancelled'));
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, connect });
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<WalletButton onError={onError} />);

    await user.click(screen.getByRole('button', { name: /connect wallet/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
  });

  it('shows no inline error for a cancelled passkey prompt — a cancel is not a failure', async () => {
    const connect = vi.fn().mockRejectedValue(new PasskeyWalletError('PASSKEY_CANCELLED', 'Passkey prompt was cancelled'));
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, connect });
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<WalletButton onError={onError} />);

    await user.click(screen.getByRole('button', { name: /connect wallet/i }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('maps a PRF_UNSUPPORTED connect failure to human copy', async () => {
    const connect = vi.fn().mockRejectedValue(new PasskeyWalletError('PRF_UNSUPPORTED', 'raw core message'));
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, connect });
    const user = userEvent.setup();
    render(<WalletButton />);

    await user.click(screen.getByRole('button', { name: /connect wallet/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/passkeys don't support wallet derivation/i));
  });

  it('shows the underlying message as-is for an INSECURE_CONTEXT connect failure', async () => {
    const connect = vi
      .fn()
      .mockRejectedValue(new PasskeyWalletError('INSECURE_CONTEXT', 'Passkeys require a secure (HTTPS) context'));
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, connect });
    const user = userEvent.setup();
    render(<WalletButton />);

    await user.click(screen.getByRole('button', { name: /connect wallet/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/secure \(https\) context/i));
  });

  it('dismisses a previous connect error as soon as a retry succeeds', async () => {
    const connect = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, connect });
    const user = userEvent.setup();
    render(<WalletButton />);

    await user.click(screen.getByRole('button', { name: /connect wallet/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'));

    await user.click(screen.getByRole('button', { name: /connect wallet/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('calls reconnect() when "Use an existing passkey" is clicked', async () => {
    const reconnect = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, reconnect });
    const user = userEvent.setup();
    render(<WalletButton />);

    await user.click(screen.getByRole('button', { name: /use an existing passkey/i }));

    expect(reconnect).toHaveBeenCalled();
  });

  it('disables the "Use an existing passkey" button while connecting', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, isConnecting: true });
    render(<WalletButton />);

    expect(screen.getByRole('button', { name: /use an existing passkey/i })).toBeDisabled();
  });

  it('surfaces a reconnect failure via onError, without throwing', async () => {
    const reconnect = vi.fn().mockRejectedValue(new Error('no resident passkey'));
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, reconnect });
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<WalletButton onError={onError} />);

    await user.click(screen.getByRole('button', { name: /use an existing passkey/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
  });

  it('maps a PRF_UNSUPPORTED reconnect failure to human copy too', async () => {
    const reconnect = vi.fn().mockRejectedValue(new PasskeyWalletError('PRF_UNSUPPORTED', 'raw core message'));
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...baseWallet, reconnect });
    const user = userEvent.setup();
    render(<WalletButton />);

    await user.click(screen.getByRole('button', { name: /use an existing passkey/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/passkeys don't support wallet derivation/i));
  });
});

describe('WalletButton — connected', () => {
  const connectedWallet = {
    ...baseWallet,
    isConnected: true,
    address: 'STFAKEADDRESSFORTESTING1234',
  };

  it('shows the truncated address', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue(connectedWallet);
    render(<WalletButton />);

    // Scoped to the (accessible, i.e. non-hidden) pill button — the closed
    // WalletDrawer this renders also shows the address, but it's aria-hidden.
    expect(screen.getByRole('button', { name: /STFAKE\.\.\.1234/ })).toBeInTheDocument();
  });

  it('opens the wallet drawer when clicked', async () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue(connectedWallet);
    const user = userEvent.setup();
    render(<WalletButton />);

    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('dialog', { name: /wallet/i })).toBeInTheDocument();
  });

  it('sets data-spw-scheme on the account pill from the resolved color scheme', () => {
    vi.mocked(useStacksPasskeyWallet).mockReturnValue({ ...connectedWallet, resolvedColorScheme: 'light' });
    render(<WalletButton />);

    expect(screen.getByRole('button', { name: /STFAKE\.\.\.1234/ })).toHaveAttribute('data-spw-scheme', 'light');
  });
});
