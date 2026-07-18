// Passkey-only wallet drawer: no extension multiplexing, plain CSS instead of
// Tailwind, inline success/error instead of toast notifications, plus an
// Activity (transactions) view.
//
// Security note: the only place a mnemonic ever touches this component's
// state is `mnemonicWords`, and only after an explicit Reveal click in the
// `recovery` view. It's wiped (never just left to rot in state) on Hide, on
// Back, when the drawer closes, and on unmount.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStacksPasskeyWallet, useStxBalance, useStxTransactions } from '../react';
import { formatMicroStx, isPasskeyWalletError, parseStxToMicroStx } from '@toony1908/stacks-passkey-core';
import { chunkAddress, getAddressError, getAmountError, getMemoError, relativeTime, truncateAddress } from './format';
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BackIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ExternalLinkIcon,
  KeyIcon,
  SpinnerIcon,
  StacksTokenIcon,
} from './icons';
import { injectStyles } from './styles';

export interface WalletDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (txid: string) => void;
  onError?: (e: unknown) => void;
}

type View = 'home' | 'send' | 'receive' | 'activity' | 'recovery';
type Notice = { kind: 'success' | 'error'; message: string; txid?: string };

function errorMessage(e: unknown, fallback: string): string {
  if (isPasskeyWalletError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

export function WalletDrawer({ open, onClose, onSuccess, onError }: WalletDrawerProps) {
  useEffect(() => {
    injectStyles();
  }, []);

  const { address, network, setNetwork, sendStx, disconnect, revealMnemonic, isConnected, config, resolvedColorScheme } =
    useStacksPasskeyWallet();
  const balance = useStxBalance();
  // No explicit limit: honors config.transactionLimit (default 20).
  const txs = useStxTransactions();

  const [view, setView] = useState<View>('home');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [mnemonicWords, setMnemonicWords] = useState<string[] | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [isSending, setIsSending] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // The element focused right before the drawer opened, so focus can be
  // restored to it on close instead of falling back to <body>.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Reset all transient view state whenever the drawer closes, and wipe the
  // mnemonic on unmount too (the cleanup function below fires both on
  // dependency change and on unmount).
  useEffect(() => {
    if (!open) {
      setView('home');
      setNotice(null);
      setMnemonicWords(null);
      setRecipient('');
      setAmount('');
      setMemo('');
      setConfirmingDisconnect(false);
    }
    return () => setMnemonicWords(null);
  }, [open]);

  // Auto-hide the revealed recovery phrase after 60s: it's shown on-screen
  // in plain text, so an unattended/forgotten open drawer (or someone
  // glancing over a shoulder) shouldn't get an indefinite window to read it.
  // The effect's cleanup (on Hide/Back/close/unmount, all of which null out
  // mnemonicWords) clears the pending timer so it never fires stale.
  useEffect(() => {
    if (!mnemonicWords) return;
    const timer = setTimeout(() => setMnemonicWords(null), 60_000);
    return () => clearTimeout(timer);
  }, [mnemonicWords]);

  // Also wipe the mnemonic (and bounce back to the home view) the instant
  // the wallet disconnects — e.g. Disconnect Wallet, or storage/session loss
  // — so a revealed phrase never lingers in state past the connection it
  // belongs to.
  useEffect(() => {
    if (!isConnected) {
      setMnemonicWords(null);
      setView('home');
    }
  }, [isConnected]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      // Trap Tab/Shift+Tab within the drawer while it's open, so focus never
      // escapes into the (aria-hidden, inert) page behind it.
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute('disabled'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !drawer.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Move focus into the drawer when it opens (the Close button is a safe,
  // always-present target), and restore it to whatever had focus beforehand
  // once it closes — standard dialog focus-management expectations.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  const goTo = useCallback((next: View) => {
    setNotice(null);
    setConfirmingDisconnect(false);
    setView(next);
  }, []);

  const handleCopyAddress = useCallback(() => {
    if (!address || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [address]);

  const handleBack = () => {
    setMnemonicWords(null);
    goTo('home');
  };

  const handleDisconnect = async () => {
    onClose();
    await disconnect();
  };

  const handleReveal = async () => {
    setIsRevealing(true);
    try {
      const mnemonic = await revealMnemonic();
      setMnemonicWords(mnemonic.split(' '));
    } catch (e) {
      onError?.(e);
    } finally {
      setIsRevealing(false);
    }
  };

  const handleHide = () => {
    setMnemonicWords(null);
    goTo('home');
  };

  const addressError = getAddressError(recipient, network);
  const amountError = getAmountError(amount, balance.balanceMicroStx, config.feeBufferMicroStx);
  const memoError = getMemoError(memo);
  const canSend =
    recipient.trim().length > 0 &&
    amount.trim().length > 0 &&
    balance.balanceMicroStx !== undefined &&
    !addressError &&
    !amountError &&
    !memoError &&
    !isSending;

  const handleMax = () => {
    if (balance.balanceMicroStx === undefined) return;
    const sendable =
      balance.balanceMicroStx > config.feeBufferMicroStx ? balance.balanceMicroStx - config.feeBufferMicroStx : 0n;
    setAmount(formatMicroStx(sendable).replace(' STX', ''));
  };

  const handleSend = async () => {
    const microStx = parseStxToMicroStx(amount);
    if (!canSend || microStx === null) return;
    setIsSending(true);
    try {
      const trimmedMemo = memo.trim();
      const txid = await sendStx({ recipient: recipient.trim(), amount: microStx, memo: trimmedMemo || undefined });
      setRecipient('');
      setAmount('');
      setMemo('');
      balance.refetch();
      txs.refetch();
      setNotice({ kind: 'success', message: 'Transaction submitted', txid });
      onSuccess?.(txid);
      setView('home'); // bypass goTo: keep the success notice visible on home
    } catch (e) {
      setNotice({ kind: 'error', message: errorMessage(e, 'Failed to send STX') });
      onError?.(e);
    } finally {
      setIsSending(false);
    }
  };

  const balanceDisplay =
    balance.isLoading || balance.balanceMicroStx === undefined ? '—' : formatMicroStx(balance.balanceMicroStx);

  const viewTitle =
    view === 'send'
      ? 'Send STX'
      : view === 'receive'
        ? 'Receive STX'
        : view === 'activity'
          ? 'Activity'
          : view === 'recovery'
            ? 'Recovery phrase'
            : 'Wallet';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div data-spw-scheme={resolvedColorScheme}>
      <div className={`spw-overlay ${open ? 'spw-overlay-open' : ''}`.trim()} onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Wallet"
        aria-hidden={!open}
        inert={!open}
        className={`spw-drawer ${open ? 'spw-drawer-open' : ''}`.trim()}
      >
        <div className="spw-drawer-header">
          <div className="spw-drawer-header-left">
            {view !== 'home' && (
              <button type="button" onClick={handleBack} aria-label="Back" className="spw-icon-btn">
                <BackIcon size={18} />
              </button>
            )}
            {view === 'home' ? (
              <>
                {/* Visually replaced by the network segment toggle below, but
                    a real heading stays in the a11y tree so the drawer
                    always has an identifiable title for screen readers /
                    tests. */}
                <h2 className="spw-sr-only">Wallet</h2>
                <div className="spw-segment" role="group" aria-label="Network">
                  <button
                    type="button"
                    onClick={() => setNetwork('testnet')}
                    className={`spw-segment-btn ${network === 'testnet' ? 'spw-segment-active' : ''}`.trim()}
                    aria-pressed={network === 'testnet'}
                  >
                    Testnet
                  </button>
                  <button
                    type="button"
                    onClick={() => setNetwork('mainnet')}
                    className={`spw-segment-btn ${network === 'mainnet' ? 'spw-segment-active' : ''}`.trim()}
                    aria-pressed={network === 'mainnet'}
                  >
                    Mainnet
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="spw-view-title">{viewTitle}</h2>
                {/* The home view's network toggle is gone from these views, so
                    without this the active network would be invisible right
                    where it matters most — e.g. about to Send. */}
                <span className="spw-network-chip">{network === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
              </>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="spw-icon-btn" ref={closeButtonRef}>
            <CloseIcon size={18} />
          </button>
        </div>

        {notice && (
          <div className={`spw-notice spw-notice-${notice.kind}`} role="status">
            <span>{notice.message}</span>
            {notice.kind === 'success' && notice.txid && (
              <a href={config.explorer.txUrl(network, notice.txid)} target="_blank" rel="noopener noreferrer">
                View on explorer
              </a>
            )}
          </div>
        )}

        <div className="spw-drawer-body">
          {view === 'home' && (
            <div className="spw-home">
              <div className="spw-home-hero">
                <span className="spw-eyebrow">Total balance</span>
                <div className="spw-balance-amount">{balanceDisplay}</div>
                <button type="button" onClick={handleCopyAddress} aria-label="Copy address" className="spw-address-chip">
                  <span>{truncateAddress(address ?? '')}</span>
                  {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                </button>
              </div>

              <div className="spw-actions-row">
                <button type="button" onClick={() => goTo('send')} className="spw-btn-primary">
                  Send
                </button>
                <button type="button" onClick={() => goTo('receive')} className="spw-btn-secondary">
                  Receive
                </button>
                <button type="button" onClick={() => goTo('activity')} className="spw-btn-secondary">
                  Activity
                </button>
              </div>

              <div className="spw-assets-section">
                <span className="spw-eyebrow">Assets</span>
                <div className="spw-token-row">
                  <div className="spw-token-row-left">
                    <StacksTokenIcon size={40} />
                    <div className="spw-token-info">
                      <div className="spw-token-name">Stacks</div>
                      <div className="spw-token-symbol">STX</div>
                    </div>
                  </div>
                  <div className="spw-token-balance">{balanceDisplay}</div>
                </div>
              </div>

              <div className="spw-drawer-footer">
                {confirmingDisconnect ? (
                  // Two-step confirm: a stray tap can't drop a connection the
                  // user has to re-derive from a passkey prompt to get back.
                  <div className="spw-disconnect-confirm">
                    <div className="spw-disconnect-confirm-title">Disconnect wallet?</div>
                    <span className="spw-disconnect-confirm-text">
                      You can reconnect anytime with your passkey.
                    </span>
                    <div className="spw-disconnect-confirm-actions">
                      <button
                        type="button"
                        onClick={() => setConfirmingDisconnect(false)}
                        className="spw-btn-secondary"
                      >
                        Cancel
                      </button>
                      <button type="button" onClick={handleDisconnect} className="spw-btn-danger">
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => goTo('recovery')} className="spw-btn-ghost">
                      <KeyIcon size={16} />
                      <span>Recovery phrase</span>
                    </button>
                    <a
                      href={config.explorer.addressUrl(network, address ?? '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Explorer"
                      className="spw-btn-ghost"
                    >
                      <ExternalLinkIcon size={18} />
                    </a>
                    <button
                      type="button"
                      onClick={() => setConfirmingDisconnect(true)}
                      className="spw-btn-ghost spw-btn-ghost-danger"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {view === 'send' && (
            <div className="spw-form">
              <div className="spw-send-amount-wrap">
                <label htmlFor="spw-send-amount" className="spw-sr-only">
                  Amount (STX)
                </label>
                <input
                  id="spw-send-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="spw-send-amount-input"
                />
                <span className="spw-send-amount-suffix">STX</span>
              </div>
              <button
                type="button"
                onClick={handleMax}
                disabled={balance.balanceMicroStx === undefined}
                className="spw-send-max-link"
              >
                Send max
              </button>
              {amountError && <p className="spw-error-text spw-error-text-center">{amountError}</p>}

              <div className="spw-asset-static-row">
                <StacksTokenIcon size={32} />
                <span className="spw-token-name">Stacks</span>
              </div>

              <div className="spw-field">
                <label htmlFor="spw-send-recipient" className="spw-eyebrow">
                  Recipient
                </label>
                <input
                  id="spw-send-recipient"
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="SP… / ST… address"
                  className="spw-input"
                />
                {addressError && <p className="spw-error-text">{addressError}</p>}
              </div>

              <div className="spw-field">
                <label htmlFor="spw-send-memo" className="spw-eyebrow">
                  Memo
                </label>
                <input
                  id="spw-send-memo"
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Memo (optional)"
                  className="spw-input"
                />
                {memoError && <p className="spw-error-text">{memoError}</p>}
              </div>

              <div className="spw-available-balance-row">
                <span className="spw-muted-label">Available balance</span>
                <span>{balanceDisplay}</span>
              </div>

              <button type="button" onClick={handleSend} disabled={!canSend} className="spw-btn-primary">
                {isSending && <SpinnerIcon size={16} />}
                <span>Send</span>
              </button>
            </div>
          )}

          {view === 'receive' && (
            <div className="spw-receive">
              <span className="spw-eyebrow spw-eyebrow-center">Your STX address</span>
              <div className="spw-receive-card">
                <div className="spw-receive-address">{chunkAddress(address ?? '')}</div>
              </div>
              <button type="button" onClick={handleCopyAddress} className="spw-btn-primary">
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                <span>{copied ? 'Copied' : 'Copy address'}</span>
              </button>
              <p className="spw-hint-text spw-hint-text-center">Send STX to this address to fund your wallet.</p>
            </div>
          )}

          {view === 'activity' && (
            <div className="spw-activity">
              {txs.isLoading && <p className="spw-loading-state">Loading…</p>}
              {!txs.isLoading && (!txs.transactions || txs.transactions.length === 0) && (
                <p className="spw-empty-state">No transactions yet</p>
              )}
              {!txs.isLoading && txs.transactions && txs.transactions.length > 0 && (
                <ul className="spw-tx-list">
                  {txs.transactions.map((tx) => (
                    <li key={tx.txid}>
                      <a
                        href={config.explorer.txUrl(network, tx.txid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="spw-tx-row"
                      >
                        <span className="spw-tx-badge">
                          {tx.kind === 'sent' ? <ArrowUpRightIcon size={16} /> : <ArrowDownLeftIcon size={16} />}
                        </span>
                        <div className="spw-tx-info">
                          <div className="spw-tx-direction">
                            {tx.kind === 'sent' ? 'Sent' : tx.kind === 'received' ? 'Received' : 'Transaction'}
                            {tx.counterparty && (
                              <span className="spw-tx-counterparty"> · {truncateAddress(tx.counterparty)}</span>
                            )}
                          </div>
                          <div className="spw-tx-time">{relativeTime(tx.timestamp)}</div>
                        </div>
                        <div className="spw-tx-right">
                          <div
                            className={`spw-tx-amount ${tx.kind === 'sent' ? 'spw-tx-amount-neg' : 'spw-tx-amount-pos'}`}
                          >
                            {tx.kind === 'sent' ? '- ' : '+ '}
                            {formatMicroStx(tx.amountMicroStx)}
                          </div>
                          {tx.status !== 'success' && (
                            <span className={`spw-status-pill spw-status-${tx.status}`}>{tx.status}</span>
                          )}
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {view === 'recovery' && (
            <div className="spw-recovery">
              {!mnemonicWords && (
                <div className="spw-recovery-warning">
                  <p>Anyone with this phrase can take your funds.</p>
                  <div className="spw-recovery-warning-actions">
                    <button type="button" onClick={handleBack} className="spw-btn-secondary">
                      Cancel
                    </button>
                    <button type="button" onClick={handleReveal} disabled={isRevealing} className="spw-btn-primary">
                      {isRevealing && <SpinnerIcon size={14} />}
                      <span>Reveal</span>
                    </button>
                  </div>
                </div>
              )}
              {mnemonicWords && (
                <div>
                  <div className="spw-mnemonic-grid">
                    {mnemonicWords.map((word, index) => (
                      <div key={index} className="spw-mnemonic-word">
                        <span className="spw-mnemonic-index">{index + 1}.</span> {word}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={handleHide} className="spw-btn-secondary">
                    Hide
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
