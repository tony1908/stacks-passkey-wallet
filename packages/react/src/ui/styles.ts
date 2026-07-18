// Self-injecting stylesheet: consumers get a fully-styled WalletButton /
// WalletDrawer with zero build-step CSS imports. Every interactive component
// calls injectStyles() from a mount effect; the first call wins, later calls
// (from other components, or React strict-mode double-invoking effects) are
// no-ops. Theming is done entirely via the --spw-* custom properties below —
// override them on :root (or any ancestor) to re-skin the components.
//
// Visual language: dark, bold, near-black surfaces with a white primary CTA
// and a Stacks-orange accent reserved for small details (the token glyph,
// the focus ring). See README.md#theming for the token reference.

const STYLE_ID = 'spw-styles';

const CSS = `
:root {
  --spw-bg: #101010;
  --spw-surface: #1c1c1e;
  --spw-surface-2: #2a2a2d;
  --spw-fg: #ffffff;
  --spw-muted: #8e8e93;
  --spw-muted-2: #b4b4b9;
  --spw-border: rgba(255, 255, 255, 0.12);
  --spw-primary: #ffffff;
  --spw-primary-fg: #101010;
  --spw-accent: #fc6432;
  --spw-accent-2: #ff8656;
  --spw-danger: #ff453a;
  --spw-success: #32d74b;
  --spw-radius-card: 20px;
  --spw-radius-input: 14px;
  --spw-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
}

/* Light-scheme override: flips the color tokens for the subtree under any
   element carrying data-spw-scheme="light" (set by WalletButton/WalletDrawer
   based on config.colorScheme). Radii and font are scheme-independent, so
   only color tokens are redefined here. Dark (the :root block above) stays
   the default when the attribute is absent. */
[data-spw-scheme="light"] {
  --spw-bg: #ffffff;
  --spw-surface: #f4f4f6;
  --spw-surface-2: #e9e9ee;
  --spw-fg: #0a0a0a;
  /* Darkened from #8a8a8e (3.44:1 on --spw-bg — fails WCAG AA for the 11-14px
     text it's used at) to #606064, which clears 4.5:1 against every light
     surface token above (bg 6.26:1, surface 5.70:1, surface-2 5.17:1). */
  --spw-muted: #606064;
  --spw-muted-2: #565659;
  --spw-border: rgba(0, 0, 0, 0.10);
  --spw-primary: #0a0a0a;
  --spw-primary-fg: #ffffff;
  --spw-accent: #fc6432;
  --spw-accent-2: #e5551f;
  --spw-danger: #d70015;
  --spw-success: #1a7f37;
}

/* Visually hidden but still in the accessibility tree — e.g. the drawer's
   "Wallet" heading on the home view, which is replaced on-screen by the
   network chip but must stay announceable / queryable by role. */
.spw-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.spw-btn-primary, .spw-btn-secondary, .spw-btn-danger, .spw-btn-ghost, .spw-icon-btn, .spw-account-pill,
.spw-reconnect-link, .spw-send-max-link, .spw-address-chip, .spw-input, .spw-send-amount-input {
  font-family: var(--spw-font);
  cursor: pointer;
  box-sizing: border-box;
}

/* ---------------------------------------------------------------- Buttons */

.spw-btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 15px 24px;
  background: var(--spw-primary);
  color: var(--spw-primary-fg);
  border: none;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  transition: filter 0.15s ease;
}
.spw-btn-primary:hover:not(:disabled) { filter: brightness(0.94); }
.spw-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.spw-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px 18px;
  background: transparent;
  color: var(--spw-fg);
  border: 1px solid var(--spw-border);
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  transition: background-color 0.15s ease;
}
.spw-btn-secondary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.06); }
.spw-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

.spw-btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px 18px;
  background: var(--spw-danger);
  color: #ffffff;
  border: none;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  transition: filter 0.15s ease;
}
.spw-btn-danger:hover:not(:disabled) { filter: brightness(0.94); }
.spw-btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }

.spw-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--spw-muted);
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.spw-btn-ghost:hover:not(:disabled) { background: rgba(255, 255, 255, 0.06); color: var(--spw-fg); }
.spw-btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
.spw-btn-ghost-danger { color: var(--spw-danger); }
.spw-btn-ghost-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--spw-danger) 10%, transparent);
  color: var(--spw-danger);
}

/* Equal-width action pills on the home view (Send / Receive / Activity). */
.spw-actions-row { display: flex; gap: 10px; padding: 0 20px 20px; }
.spw-actions-row .spw-btn-primary,
.spw-actions-row .spw-btn-secondary { width: auto; flex: 1; padding: 13px 8px; font-size: 14px; }

/* Cancel / Reveal sit side by side on the recovery warning card. */
.spw-recovery-warning-actions { display: flex; gap: 10px; }
.spw-recovery-warning-actions .spw-btn-primary,
.spw-recovery-warning-actions .spw-btn-secondary { width: auto; flex: 1; }

.spw-hint {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--spw-muted);
}

.spw-reconnect-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 0;
  background: none;
  border: none;
  font-size: 13px;
  color: var(--spw-muted-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.spw-reconnect-link:hover:not(:disabled) { color: var(--spw-fg); }
.spw-reconnect-link:disabled { opacity: 0.5; cursor: not-allowed; }

/* Connected-state pill on the WalletButton. */
.spw-account-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--spw-surface);
  color: var(--spw-fg);
  border: 1px solid var(--spw-border);
  border-radius: 999px;
  font-size: 14px;
  transition: background-color 0.15s ease;
}
.spw-account-pill:hover { background: var(--spw-surface-2); }
.spw-account-address { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }

.spw-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--spw-success);
  flex-shrink: 0;
}

/* Focus ring, uniform across every interactive element in the component. */
.spw-btn-primary:focus-visible,
.spw-btn-secondary:focus-visible,
.spw-btn-danger:focus-visible,
.spw-btn-ghost:focus-visible,
.spw-icon-btn:focus-visible,
.spw-input:focus-visible,
.spw-send-amount-input:focus-visible,
.spw-send-max-link:focus-visible,
.spw-address-chip:focus-visible,
.spw-account-pill:focus-visible,
.spw-reconnect-link:focus-visible,
.spw-tx-row:focus-visible {
  outline: 2px solid var(--spw-accent);
  outline-offset: 2px;
}

/* ----------------------------------------------------------- Overlay/drawer */

.spw-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 2147483000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.spw-overlay-open { opacity: 1; pointer-events: auto; }

.spw-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 420px;
  background: var(--spw-bg);
  color: var(--spw-fg);
  font-family: var(--spw-font);
  font-size: 15px;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
  z-index: 2147483001;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.25s ease;
}
.spw-drawer-open { transform: translateX(0); }

@media (prefers-reduced-motion: reduce) {
  .spw-drawer, .spw-overlay { transition: none; }
}

.spw-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--spw-border);
  flex-shrink: 0;
}
.spw-drawer-header-left { display: flex; align-items: center; gap: 10px; }

.spw-view-title {
  margin: 0;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.05;
  font-size: 22px;
}

/* Network indicator shown next to the view title on every non-home view —
   the home view's segmented toggle is gone from these, so without this chip
   the active network (which the user is about to send/receive/act on) has
   no visible indicator at all. */
.spw-network-chip {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--spw-surface);
  color: var(--spw-muted-2);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Home-view network toggle: two pills, the active one filled. */
.spw-segment {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--spw-surface);
}
.spw-segment-btn {
  border: none;
  background: none;
  color: var(--spw-muted-2);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--spw-font);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.spw-segment-btn:hover:not(.spw-segment-active) { color: var(--spw-fg); }
.spw-segment-active {
  background: var(--spw-primary);
  color: var(--spw-primary-fg);
}
.spw-segment-btn:focus-visible {
  outline: 2px solid var(--spw-accent);
  outline-offset: 2px;
}

.spw-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--spw-muted);
  padding: 6px;
  border-radius: 8px;
  transition: color 0.15s ease;
}
.spw-icon-btn:hover { color: var(--spw-fg); }

.spw-drawer-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.spw-notice {
  margin: 16px 20px 0;
  padding: 12px 14px;
  border-radius: var(--spw-radius-input);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.spw-notice-success { background: color-mix(in srgb, var(--spw-success) 15%, transparent); color: var(--spw-success); }
.spw-notice-error { background: color-mix(in srgb, var(--spw-danger) 15%, transparent); color: var(--spw-danger); }
.spw-notice a { color: inherit; text-decoration: underline; }

/* Shared eyebrow label style: TOTAL BALANCE, ASSETS, RECIPIENT, MEMO... */
.spw-eyebrow {
  display: block;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--spw-muted);
  font-weight: 600;
}
.spw-eyebrow-center { text-align: center; }

/* --------------------------------------------------------------- Home view */

.spw-home { flex: 1; display: flex; flex-direction: column; }

.spw-home-hero {
  padding: 28px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.spw-balance-amount { font-weight: 800; font-size: 40px; letter-spacing: -0.02em; }

.spw-address-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--spw-muted);
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  border-radius: 999px;
  padding: 4px 8px;
  transition: color 0.15s ease;
}
.spw-address-chip:hover { color: var(--spw-fg); }

.spw-assets-section { padding: 4px 20px 20px; display: flex; flex-direction: column; gap: 10px; }

.spw-token-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  border-radius: var(--spw-radius-input);
  transition: background-color 0.15s ease;
}
.spw-token-row:hover { background: var(--spw-surface); }
.spw-token-row-left { display: flex; align-items: center; gap: 12px; }
.spw-token-info { display: flex; flex-direction: column; gap: 2px; }
.spw-token-name { font-size: 16px; font-weight: 600; }
.spw-token-symbol { font-size: 13px; font-weight: 500; color: var(--spw-muted); }
.spw-token-balance { font-size: 15px; font-weight: 600; }

.spw-drawer-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 16px 20px;
  border-top: 1px solid var(--spw-border);
}

/* Two-step Disconnect confirm: replaces the footer's normal contents in
   place (no new view) once the user taps Disconnect once. */
.spw-disconnect-confirm {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 100%;
  text-align: center;
}
.spw-disconnect-confirm-title { font-size: 15px; font-weight: 700; color: var(--spw-fg); }
.spw-disconnect-confirm-text { font-size: 13px; color: var(--spw-muted-2); margin-bottom: 12px; }
.spw-disconnect-confirm-actions { display: flex; gap: 10px; }
.spw-disconnect-confirm-actions .spw-btn-secondary,
.spw-disconnect-confirm-actions .spw-btn-danger { flex: 1; }

/* --------------------------------------------------------------- Send view */

.spw-form { padding: 0 20px 20px; display: flex; flex-direction: column; gap: 14px; }

.spw-send-amount-wrap {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  padding-top: 20px;
}
.spw-send-amount-input {
  background: none;
  border: none;
  color: var(--spw-fg);
  font-weight: 800;
  font-size: 48px;
  letter-spacing: -0.02em;
  width: 200px;
  max-width: 100%;
  text-align: center;
  padding: 0;
}
.spw-send-amount-input::placeholder { color: var(--spw-muted); opacity: 1; }
.spw-send-amount-input:focus { outline: none; }
.spw-send-amount-suffix { font-size: 20px; font-weight: 600; color: var(--spw-muted); }

.spw-send-max-link {
  align-self: center;
  margin-top: -6px;
  padding: 0;
  background: none;
  border: none;
  color: var(--spw-muted-2);
  font-size: 13px;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.spw-send-max-link:hover:not(:disabled) { color: var(--spw-fg); }
.spw-send-max-link:disabled { opacity: 0.4; cursor: not-allowed; }

.spw-asset-static-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--spw-border);
  border-radius: var(--spw-radius-input);
}

.spw-field { display: flex; flex-direction: column; gap: 6px; }

.spw-input {
  width: 100%;
  padding: 13px 14px;
  font-size: 15px;
  border: 1px solid var(--spw-border);
  border-radius: var(--spw-radius-input);
  background: var(--spw-surface);
  color: var(--spw-fg);
}
.spw-input::placeholder { color: var(--spw-muted); opacity: 1; }
.spw-input:focus { outline: none; border-color: var(--spw-accent); }

.spw-error-text { margin: 0; font-size: 12px; color: var(--spw-danger); }
.spw-error-text-center { text-align: center; }
.spw-hint-text { margin: 0; font-size: 12px; color: var(--spw-muted); }
.spw-hint-text-center { text-align: center; }

.spw-available-balance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid var(--spw-border);
  font-size: 13px;
}
.spw-muted-label { color: var(--spw-muted); }

/* ------------------------------------------------------------ Receive view */

.spw-receive { padding: 20px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
.spw-receive-card {
  width: 100%;
  background: var(--spw-surface);
  border: 1px solid var(--spw-border);
  border-radius: var(--spw-radius-card);
  padding: 24px 16px;
  display: flex;
  justify-content: center;
}
.spw-receive-address {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 17px;
  text-align: center;
  word-break: break-all;
  letter-spacing: 0.02em;
}

/* ----------------------------------------------------------- Recovery view */

.spw-recovery { padding: 20px; }
.spw-recovery-warning {
  border-radius: var(--spw-radius-card);
  padding: 18px;
  background: var(--spw-surface);
  border-left: 3px solid var(--spw-danger);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.spw-recovery-warning p { margin: 0; font-size: 14px; color: var(--spw-muted-2); }

.spw-mnemonic-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
.spw-mnemonic-word {
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--spw-surface);
  border-radius: var(--spw-radius-input);
  padding: 8px 10px;
}
.spw-mnemonic-index { color: var(--spw-muted); margin-right: 2px; }

/* ----------------------------------------------------------- Activity view */

.spw-activity { padding: 8px 0; }
.spw-empty-state, .spw-loading-state {
  padding: 48px 20px;
  text-align: center;
  color: var(--spw-muted);
  font-size: 14px;
}

.spw-tx-list { list-style: none; margin: 0; padding: 0; }
.spw-tx-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid var(--spw-border);
  transition: background-color 0.15s ease;
}
.spw-tx-row:hover { background: var(--spw-surface); }
.spw-tx-badge {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--spw-surface);
  color: var(--spw-muted-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.spw-tx-info { flex: 1; min-width: 0; }
.spw-tx-direction { font-size: 15px; font-weight: 600; }
.spw-tx-counterparty {
  color: var(--spw-muted);
  font-weight: 400;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.spw-tx-time { font-size: 12px; color: var(--spw-muted); margin-top: 2px; }
.spw-tx-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.spw-tx-amount { font-size: 14px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.spw-tx-amount-pos { color: var(--spw-success); }
.spw-tx-amount-neg { color: var(--spw-fg); }

.spw-status-pill {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 999px;
}
.spw-status-pending { background: color-mix(in srgb, #ff9f0a 15%, transparent); color: #ff9f0a; }
.spw-status-failed { background: color-mix(in srgb, var(--spw-danger) 15%, transparent); color: var(--spw-danger); }

.spw-spin { animation: spw-spin 0.8s linear infinite; }
@keyframes spw-spin { to { transform: rotate(360deg); } }
`;

/** Injects the SDK's stylesheet once per document. Safe to call from every
 * component's mount effect: SSR-safe (no-op without a `document`) and
 * idempotent (a second call is a no-op once the tag exists). */
export function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
