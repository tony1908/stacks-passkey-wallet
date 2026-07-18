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
  /** Background color of the Connect button. Overrides the `--spw-primary`
   * token for this button only (the drawer's own buttons are unaffected). */
  color?: string;
  /** Foreground (icon + label) color of the Connect button. Defaults to a
   * readable black/white picked from `color`, or the `--spw-primary-fg` token. */
  textColor?: string;
  onError?: (e: unknown) => void;
}

/** Picks a readable black/white foreground for a solid hex background, so a
 * single `color` prop "just works" without the caller also setting textColor.
 * Returns null for anything that isn't a 3/6-digit hex (caller falls back). */
function readableTextColor(bg: string): string | null {
  const hex = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(bg.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const n = parseInt(full, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0a0a0a' : '#ffffff';
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

export function WalletButton({ className, style, label, color, textColor, onError }: WalletButtonProps) {
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

    const connectFg = textColor ?? (color ? readableTextColor(color) : null);
    // Scoped to this button via inline custom properties, so it overrides the
    // token only here (the drawer and any other spw-btn-primary keep theirs).
    const connectBtnStyle = color
      ? ({ '--spw-primary': color, ...(connectFg ? { '--spw-primary-fg': connectFg } : {}) } as CSSProperties)
      : undefined;

    return (
      <div className={className} style={style} data-spw-scheme={resolvedColorScheme}>
        <button
          type="button"
          className="spw-btn-primary"
          style={connectBtnStyle}
          onClick={handleConnect}
          disabled={isConnecting}
          aria-busy={isConnecting}
        >
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
