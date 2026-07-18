// Passkey-only wallet button, with no Leather/Xverse extension multiplexing,
// styled via a self-injecting stylesheet instead of Tailwind.

import { useEffect, useState, type CSSProperties } from 'react';
import { isPasskeyWalletError } from '@toony1908/stacks-passkey-core';
import { useStacksPasskeyWallet } from '../react';
import { truncateAddress } from './format';
import { FingerprintIcon, SpinnerIcon } from './icons';
import { injectStyles } from './styles';
import { WalletDrawer } from './WalletDrawer';

export interface WalletButtonProps {
  className?: string;
  style?: CSSProperties;
  label?: string;
  onError?: (e: unknown) => void;
}

/** Maps a connect/reconnect failure to human copy for the inline error under
 * the button. Returns null when nothing should be shown — a cancelled
 * passkey prompt is the user backing out on purpose, not a failure. */
function connectErrorMessage(e: unknown): string | null {
  if (isPasskeyWalletError(e)) {
    if (e.code === 'PASSKEY_CANCELLED') return null;
    if (e.code === 'PRF_UNSUPPORTED') return "This device's passkeys don't support wallet derivation";
    return e.message; // INSECURE_CONTEXT / PASSKEY_UNSUPPORTED etc. already read well as-is
  }
  if (e instanceof Error) return e.message;
  return 'Failed to connect';
}

export function WalletButton({ className, style, label, onError }: WalletButtonProps) {
  useEffect(() => {
    injectStyles();
  }, []);

  const { isSupported, isConnected, isConnecting, address, connect, reconnect, resolvedColorScheme } =
    useStacksPasskeyWallet();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSupported) {
    return (
      <div className={className} style={style} data-spw-scheme={resolvedColorScheme}>
        {/* Kept as "Connect wallet" (not "Passkeys not supported") so this
            disabled button's accessible name matches every other state —
            the reason is surfaced separately via the hint below. */}
        <button type="button" className="spw-btn-secondary" disabled>
          <FingerprintIcon size={16} />
          <span>{label ?? 'Connect wallet'}</span>
        </button>
        <span className="spw-hint">Passkeys not supported</span>
      </div>
    );
  }

  if (!isConnected) {
    const handleConnect = async () => {
      setError(null); // dismiss any previous error the moment the user retries
      try {
        await connect();
      } catch (e) {
        setError(connectErrorMessage(e));
        onError?.(e);
      }
    };

    const handleReconnect = async () => {
      setError(null);
      try {
        await reconnect();
      } catch (e) {
        setError(connectErrorMessage(e));
        onError?.(e);
      }
    };

    return (
      <div className={className} style={style} data-spw-scheme={resolvedColorScheme}>
        <button type="button" className="spw-btn-primary" onClick={handleConnect} disabled={isConnecting} aria-busy={isConnecting}>
          {isConnecting ? <SpinnerIcon size={16} /> : <FingerprintIcon size={16} />}
          <span>{label ?? 'Connect wallet'}</span>
        </button>
        <button
          type="button"
          className="spw-reconnect-link"
          onClick={handleReconnect}
          disabled={isConnecting}
          aria-busy={isConnecting}
        >
          {isConnecting && <SpinnerIcon size={11} />}
          <span>Use an existing passkey</span>
        </button>
        {error && (
          <p className="spw-error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`spw-account-pill ${className ?? ''}`.trim()}
        style={style}
        data-spw-scheme={resolvedColorScheme}
        onClick={() => setDrawerOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="spw-dot" />
        <span className="spw-account-address">{truncateAddress(address ?? '')}</span>
      </button>
      <WalletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onError={onError} />
    </>
  );
}
