// Ported from @toony1908/stacks-passkey-react's src/ui/WalletDrawer.tsx: same
// five views (home / send / receive / activity / recovery) and the same
// state machine, re-skinned on RN primitives — a bottom-sheet `Modal`
// instead of a fixed/portal-ed side drawer, `TextInput` instead of `<input>`,
// `Linking.openURL` instead of `<a target="_blank">`, and RN's (deprecated
// but still present) core `Clipboard` instead of `navigator.clipboard`.
//
// Security note (same as web, plus two RN-only ceilings): the only place a
// mnemonic ever touches this component's state is `mnemonicWords`, and only
// after an explicit Reveal tap in the `recovery` view. It's wiped on Hide, on
// Back, when the drawer closes, on unmount, 60s after reveal, and — RN-only —
// the instant the app leaves the foreground (see the AppState effect below;
// that one guards the OS app-switcher snapshot, not a foreground
// screenshot).

import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Clipboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useStacksPasskeyWallet, useStxBalance, useStxTransactions } from '../hooks';
import { formatMicroStx, isPasskeyWalletError, parseStxToMicroStx } from '@toony1908/stacks-passkey-core';
import { chunkAddress, dateLabel, describePasskeyError, getAddressError, getAmountError, getMemoError, truncateAddress } from './format';
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
import { resolveTheme, type StacksPasskeyTheme } from './theme';

export interface WalletDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (txid: string) => void;
  onError?: (e: unknown) => void;
  theme?: Partial<StacksPasskeyTheme>;
}

type DrawerView = 'home' | 'send' | 'receive' | 'activity' | 'recovery';
type Notice = { kind: 'success' | 'error'; message: string; txid?: string };

function errorMessage(e: unknown, fallback: string): string {
  if (isPasskeyWalletError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

/** Compact amount for the activity list: "0.001000 STX" -> "0.001". Drops the
 * unit and trailing zeros (the token is identified by the row's icon/name). */
function compactStx(microStx: bigint): string {
  const s = formatMicroStx(microStx).replace(' STX', '');
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

export function WalletDrawer({ open, onClose, onSuccess, onError, theme: themeOverride }: WalletDrawerProps) {
  const { address, network, setNetwork, sendStx, disconnect, revealMnemonic, isConnected, config, resolvedColorScheme } =
    useStacksPasskeyWallet();
  const theme = resolveTheme(resolvedColorScheme, themeOverride);
  const styles = createStyles(theme);
  const balance = useStxBalance();
  // No explicit limit: honors config.transactionLimit (default 20).
  const txs = useStxTransactions();

  const [view, setView] = useState<DrawerView>('home');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [mnemonicWords, setMnemonicWords] = useState<string[] | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Reset all transient view state whenever the drawer closes, and wipe the
  // mnemonic on unmount too (the cleanup function below fires both on
  // dependency change and on unmount).
  useEffect(() => {
    if (!open) {
      setView('home');
      setNotice(null);
      setMnemonicWords(null);
      setRevealError(null);
      setConfirmingDisconnect(false);
      setRecipient('');
      setAmount('');
      setMemo('');
    }
    return () => setMnemonicWords(null);
  }, [open]);

  // Also wipe the mnemonic (and bounce back to the home view) the instant
  // the wallet disconnects, so a revealed phrase never lingers in state past
  // the connection it belongs to.
  useEffect(() => {
    if (!isConnected) {
      setMnemonicWords(null);
      setView('home');
    }
  }, [isConnected]);

  // Auto-hide the revealed phrase after 60s of inactivity so it doesn't just
  // sit on screen indefinitely if the user walks away. Resets (via the
  // `mnemonicWords` dependency) on every reveal, and the cleanup fires on
  // hide/back/close/unmount alike since all of those set mnemonicWords to
  // null or unmount the component.
  useEffect(() => {
    if (!mnemonicWords) return;
    const timer = setTimeout(() => setMnemonicWords(null), 60_000);
    return () => clearTimeout(timer);
  }, [mnemonicWords]);

  // Wipe the mnemonic the instant the app leaves the foreground, so the OS
  // app-switcher snapshot (taken when backgrounding) never contains the
  // phrase.
  // ponytail: this only guards the app-switcher snapshot, not a screenshot
  // taken while still in the foreground — blocking that needs FLAG_SECURE
  // (Android) / a screen-capture guard (iOS has no direct equivalent), which
  // means a native module this package deliberately doesn't depend on. A
  // consumer that needs that ceiling raised should add
  // `expo-screen-capture` (or an equivalent) at the app level.
  useEffect(() => {
    if (!mnemonicWords) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') setMnemonicWords(null);
    });
    return () => subscription.remove();
  }, [mnemonicWords]);

  const goTo = useCallback((next: DrawerView) => {
    setNotice(null);
    setView(next);
  }, []);

  const handleCopyAddress = useCallback(() => {
    if (!address) return;
    Clipboard.setString(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  const handleBack = () => {
    setMnemonicWords(null);
    setRevealError(null);
    goTo('home');
  };

  const handleDisconnect = async () => {
    setConfirmingDisconnect(false);
    onClose();
    await disconnect();
  };

  const handleReveal = async () => {
    setIsRevealing(true);
    setRevealError(null);
    try {
      const mnemonic = await revealMnemonic();
      setMnemonicWords(mnemonic.split(' '));
    } catch (e) {
      const { quiet, message } = describePasskeyError(e, 'Failed to reveal recovery phrase');
      // A cancelled passkey prompt is the user backing out, not a failure —
      // leave the warning view as-is instead of showing an error.
      if (!quiet) {
        setRevealError(message);
        onError?.(e);
      }
    } finally {
      setIsRevealing(false);
    }
  };

  const handleHide = () => {
    setMnemonicWords(null);
    setRevealError(null);
    goTo('home');
  };

  const addressError = getAddressError(recipient, network);
  const amountError = getAmountError(amount, balance.balanceMicroStx);
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

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {view !== 'home' && (
              <Pressable onPress={handleBack} accessibilityLabel="Back" accessibilityRole="button" style={styles.iconBtn}>
                <BackIcon size={18} color={theme.muted} />
              </Pressable>
            )}
            {view === 'home' ? (
              <View style={styles.segment}>
                <Pressable
                  onPress={() => setNetwork('testnet')}
                  style={[styles.segmentBtn, network === 'testnet' && styles.segmentActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: network === 'testnet' }}
                >
                  <Text style={[styles.segmentText, network === 'testnet' && styles.segmentTextActive]}>Testnet</Text>
                </Pressable>
                <Pressable
                  onPress={() => setNetwork('mainnet')}
                  style={[styles.segmentBtn, network === 'mainnet' && styles.segmentActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: network === 'mainnet' }}
                >
                  <Text style={[styles.segmentText, network === 'mainnet' && styles.segmentTextActive]}>Mainnet</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.viewTitle}>{viewTitle}</Text>
            )}
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" style={styles.iconBtn}>
            <CloseIcon size={18} color={theme.muted} />
          </Pressable>
        </View>

        {notice && (
          <View style={[styles.notice, notice.kind === 'success' ? styles.noticeSuccess : styles.noticeError]}>
            <View style={[styles.noticeIcon, notice.kind === 'success' ? styles.noticeIconSuccess : styles.noticeIconError]}>
              {notice.kind === 'success' ? (
                <CheckIcon size={14} color={theme.success} />
              ) : (
                <CloseIcon size={14} color={theme.danger} />
              )}
            </View>
            <View style={styles.noticeBody}>
              <Text style={styles.noticeTitle}>{notice.message}</Text>
              {notice.kind === 'success' && notice.txid && (
                <Pressable onPress={() => Linking.openURL(config.explorer.txUrl(network, notice.txid as string))}>
                  <Text style={styles.noticeLink}>View on explorer ↗</Text>
                </Pressable>
              )}
            </View>
            <Pressable onPress={() => setNotice(null)} style={styles.iconBtn} accessibilityLabel="Dismiss">
              <CloseIcon size={14} color={theme.muted} />
            </Pressable>
          </View>
        )}

        {/* iOS pushes the view up by the keyboard's height ('padding'); on
            Android the OS already resizes the window (adjustResize, RN's
            default), so no behavior is needed there and passing one would
            double-compensate. */}
        <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {view === 'home' && (
            <View style={styles.homeContent}>
              <View style={styles.homeHero}>
                <Text style={styles.eyebrow}>Total balance</Text>
                <Text style={styles.balanceAmount}>{balanceDisplay}</Text>
                <Pressable onPress={handleCopyAddress} style={styles.addressChip} accessibilityLabel="Copy address">
                  <Text style={styles.addressChipText}>{truncateAddress(address ?? '')}</Text>
                  {copied ? <CheckIcon size={12} color={theme.muted} /> : <CopyIcon size={12} color={theme.muted} />}
                </Pressable>
              </View>

              <View style={styles.actionsRow}>
                <Pressable onPress={() => goTo('send')} style={[styles.btnPrimary, styles.actionBtn]}>
                  <Text style={styles.btnPrimaryText}>Send</Text>
                </Pressable>
                <Pressable onPress={() => goTo('receive')} style={[styles.btnSecondary, styles.actionBtn]}>
                  <Text style={styles.btnSecondaryText}>Receive</Text>
                </Pressable>
                <Pressable onPress={() => goTo('activity')} style={[styles.btnSecondary, styles.actionBtn]}>
                  <Text style={styles.btnSecondaryText}>Activity</Text>
                </Pressable>
              </View>

              <View style={styles.assetsSection}>
                <Text style={styles.eyebrow}>Assets</Text>
                <View style={styles.tokenRow}>
                  <View style={styles.tokenRowLeft}>
                    <StacksTokenIcon size={40} accent={theme.accent} />
                    <View>
                      <Text style={styles.tokenName}>Stacks</Text>
                      <Text style={styles.tokenSymbol}>STX</Text>
                    </View>
                  </View>
                  <Text style={styles.tokenBalance}>{balanceDisplay}</Text>
                </View>
              </View>

              <View style={styles.flexSpacer} />

              {confirmingDisconnect ? (
                <View style={styles.disconnectConfirm}>
                  <Text style={styles.disconnectConfirmTitle}>Disconnect wallet?</Text>
                  <Text style={styles.disconnectConfirmSub}>You can reconnect anytime with your passkey.</Text>
                  <View style={styles.disconnectConfirmRow}>
                    <Pressable
                      onPress={() => setConfirmingDisconnect(false)}
                      style={[styles.btnSecondary, styles.confirmBtn]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnSecondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleDisconnect}
                      style={[styles.btnDanger, styles.confirmBtn]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnDangerText}>Disconnect</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.footer}>
                  <Pressable onPress={() => goTo('recovery')} style={styles.ghostBtn}>
                    <KeyIcon size={16} color={theme.muted} />
                    <Text style={styles.ghostBtnText}>Recovery phrase</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => Linking.openURL(config.explorer.addressUrl(network, address ?? ''))}
                    accessibilityLabel="Explorer"
                    style={styles.ghostBtn}
                  >
                    <ExternalLinkIcon size={18} color={theme.muted} />
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmingDisconnect(true)}
                    style={styles.ghostBtn}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ghostBtnText, styles.dangerText]}>Disconnect</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {view === 'send' && (
            <View style={styles.form}>
              <View style={styles.sendAmountWrap}>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={theme.muted}
                  keyboardType="decimal-pad"
                  style={styles.sendAmountInput}
                  accessibilityLabel="Amount (STX)"
                />
                <Text style={styles.sendAmountSuffix}>STX</Text>
              </View>
              <Pressable onPress={handleMax} disabled={balance.balanceMicroStx === undefined} style={styles.sendMaxLink}>
                <Text style={styles.sendMaxLinkText}>Send max</Text>
              </Pressable>
              {amountError && <Text style={[styles.errorText, styles.center]}>{amountError}</Text>}

              <View style={styles.assetStaticRow}>
                <StacksTokenIcon size={32} accent={theme.accent} />
                <Text style={styles.tokenName}>Stacks</Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.eyebrow}>Recipient</Text>
                <TextInput
                  value={recipient}
                  onChangeText={setRecipient}
                  placeholder="SP… / ST… address"
                  placeholderTextColor={theme.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                {addressError && <Text style={styles.errorText}>{addressError}</Text>}
              </View>

              <View style={styles.field}>
                <Text style={styles.eyebrow}>Memo</Text>
                <TextInput
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="Memo (optional)"
                  placeholderTextColor={theme.muted}
                  style={styles.input}
                />
                {memoError && <Text style={styles.errorText}>{memoError}</Text>}
              </View>

              <View style={styles.availableBalanceRow}>
                <Text style={styles.mutedLabel}>Available balance</Text>
                <Text style={{ color: theme.fg }}>{balanceDisplay}</Text>
              </View>

              <Pressable onPress={handleSend} disabled={!canSend} style={[styles.btnPrimary, !canSend && { opacity: 0.4 }]}>
                {isSending && <SpinnerIcon size={16} color={theme.primaryFg} />}
                <Text style={styles.btnPrimaryText}>Send</Text>
              </Pressable>
            </View>
          )}

          {view === 'receive' && (
            <View style={styles.receive}>
              <View style={styles.receiveCard}>
                <StacksTokenIcon size={44} accent={theme.accent} />
                <Text style={[styles.eyebrow, styles.center]}>Your STX address</Text>
                <Text style={styles.receiveAddress}>{chunkAddress(address ?? '')}</Text>
              </View>
              <Pressable onPress={handleCopyAddress} style={[styles.btnPrimary, styles.receiveBtn]}>
                {copied ? <CheckIcon size={16} color={theme.primaryFg} /> : <CopyIcon size={16} color={theme.primaryFg} />}
                <Text style={styles.btnPrimaryText}>{copied ? 'Copied' : 'Copy address'}</Text>
              </Pressable>
              <Text style={[styles.hintText, styles.center]}>Send STX to this address to fund your wallet.</Text>
            </View>
          )}

          {view === 'activity' && (
            <View style={styles.activityList}>
              {txs.isLoading && <Text style={styles.emptyState}>Loading…</Text>}
              {!txs.isLoading && (!txs.transactions || txs.transactions.length === 0) && (
                <Text style={styles.emptyState}>No transactions yet</Text>
              )}
              {!txs.isLoading &&
                txs.transactions &&
                txs.transactions.map((tx, i) => {
                  const isSent = tx.kind === 'sent';
                  const label = dateLabel(tx.timestamp);
                  const prev = i > 0 ? txs.transactions![i - 1] : undefined;
                  const showHeader = !prev || label !== dateLabel(prev.timestamp);
                  const failed = tx.status === 'failed';
                  return (
                    <View key={tx.txid}>
                      {showHeader && <Text style={styles.txDateHeader}>{label}</Text>}
                      <Pressable
                        onPress={() => Linking.openURL(config.explorer.txUrl(network, tx.txid))}
                        style={({ pressed }) => [styles.txRow, pressed && styles.txRowPressed]}
                      >
                        <View style={styles.txIcon}>
                          <StacksTokenIcon size={40} accent={theme.accent} />
                          <View style={[styles.txDirBadge, { borderColor: theme.bg }]}>
                            {isSent ? (
                              <ArrowUpRightIcon size={9} color="#ffffff" />
                            ) : (
                              <ArrowDownLeftIcon size={9} color="#ffffff" />
                            )}
                          </View>
                        </View>
                        <View style={styles.txInfo}>
                          <Text style={styles.txTokenName}>Stacks</Text>
                          <Text style={styles.txSub} numberOfLines={1}>
                            {failed ? 'Failed · ' : ''}
                            {truncateAddress(tx.txid)}
                          </Text>
                        </View>
                        {tx.amountMicroStx > 0n && (
                          <Text style={[styles.txAmount, failed && styles.txAmountFailed]}>
                            {isSent ? '-' : ''}
                            {compactStx(tx.amountMicroStx)}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
            </View>
          )}

          {view === 'recovery' && (
            <View>
              {!mnemonicWords && (
                <View style={styles.recoveryWarning}>
                  <Text style={styles.recoveryWarningText}>Anyone with this phrase can take your funds.</Text>
                  <View style={styles.recoveryWarningActions}>
                    <Pressable onPress={handleBack} style={[styles.btnSecondary, styles.actionBtn]}>
                      <Text style={styles.btnSecondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={handleReveal} disabled={isRevealing} style={[styles.btnPrimary, styles.actionBtn]}>
                      {isRevealing && <SpinnerIcon size={14} color={theme.primaryFg} />}
                      <Text style={styles.btnPrimaryText}>Reveal</Text>
                    </Pressable>
                  </View>
                  {revealError && <Text style={[styles.errorText, styles.center]}>{revealError}</Text>}
                </View>
              )}
              {mnemonicWords && (
                <View>
                  <View style={styles.mnemonicGrid}>
                    {mnemonicWords.map((word, index) => (
                      <View key={index} style={styles.mnemonicWord}>
                        <Text style={styles.mnemonicWordText}>
                          <Text style={styles.mnemonicIndex}>{index + 1}. </Text>
                          {word}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Pressable onPress={handleHide} style={styles.btnSecondary}>
                    <Text style={styles.btnSecondaryText}>Hide</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ponytail: a flat platform-conditional inset instead of a real safe-area
// query — react-native-safe-area-context isn't a dependency of this package,
// so there's no `useSafeAreaInsets()` to ask for the device's actual
// home-indicator height. This just clears the common case (notched
// iPhones); a host app that needs the exact per-device inset should add
// react-native-safe-area-context and wrap this in a SafeAreaProvider /
// pass the real bottom inset down as a theme/style override.
const BOTTOM_INSET_PADDING = Platform.OS === 'ios' ? 20 : 0;

function createStyles(theme: StacksPasskeyTheme) {
  return StyleSheet.create({
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      // Fixed height so the sheet doesn't jump between views (home / send /
      // receive / activity / recovery all render at the same height).
      height: '68%',
      backgroundColor: theme.bg,
      borderTopLeftRadius: theme.radiusCard,
      borderTopRightRadius: theme.radiusCard,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    viewTitle: { color: theme.fg, fontWeight: '800', fontSize: 20, textTransform: 'uppercase', letterSpacing: -0.2 },
    iconBtn: { padding: 6, borderRadius: 8 },
    segment: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: theme.radiusPill, backgroundColor: theme.surface },
    segmentBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radiusPill },
    segmentActive: { backgroundColor: theme.primary },
    segmentText: { color: theme.muted2, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    segmentTextActive: { color: theme.primaryFg },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      margin: 20,
      marginBottom: 4,
      padding: 12,
      borderRadius: theme.radiusInput,
      borderWidth: 1,
    },
    noticeSuccess: { backgroundColor: 'rgba(50, 215, 75, 0.08)', borderColor: 'rgba(50, 215, 75, 0.30)' },
    noticeError: { backgroundColor: 'rgba(255, 69, 58, 0.08)', borderColor: 'rgba(255, 69, 58, 0.30)' },
    noticeIcon: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    noticeIconSuccess: { backgroundColor: 'rgba(50, 215, 75, 0.18)' },
    noticeIconError: { backgroundColor: 'rgba(255, 69, 58, 0.18)' },
    noticeBody: { flex: 1, gap: 1 },
    noticeTitle: { color: theme.fg, fontSize: 14, fontWeight: '600' },
    noticeLink: { color: theme.success, fontSize: 13, fontWeight: '500' },
    underline: { textDecorationLine: 'underline' },
    body: { flex: 1 },
    bodyContent: { flexGrow: 1, paddingBottom: 24 + BOTTOM_INSET_PADDING },
    eyebrow: { textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, color: theme.muted, fontWeight: '600' },
    center: { textAlign: 'center' },
    homeContent: { flex: 1 },
    flexSpacer: { flexGrow: 1, minHeight: 16 },
    homeHero: { padding: 20, paddingTop: 28, alignItems: 'center', gap: 10 },
    balanceAmount: { color: theme.fg, fontWeight: '800', fontSize: 36, letterSpacing: -0.5 },
    addressChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8 },
    addressChipText: { color: theme.muted, fontFamily: 'monospace', fontSize: 13 },
    actionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 20 },
    actionBtn: { flex: 1 },
    assetsSection: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
    tokenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: theme.radiusInput },
    tokenRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tokenName: { color: theme.fg, fontSize: 16, fontWeight: '600' },
    tokenSymbol: { color: theme.muted, fontSize: 13, fontWeight: '500' },
    tokenBalance: { color: theme.fg, fontSize: 15, fontWeight: '600' },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: theme.border },
    ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: theme.radiusPill },
    ghostBtnText: { color: theme.muted, fontSize: 14, fontWeight: '500' },
    dangerText: { color: theme.danger },
    disconnectConfirm: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, borderTopWidth: 1, borderTopColor: theme.border },
    disconnectConfirmTitle: { color: theme.fg, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    disconnectConfirmSub: { color: theme.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 4, marginBottom: 16 },
    disconnectConfirmRow: { flexDirection: 'row', gap: 10 },
    confirmBtn: { flex: 1 },
    btnDanger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: theme.radiusPill, backgroundColor: theme.danger },
    btnDangerText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
    btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: theme.radiusPill, backgroundColor: theme.primary },
    btnPrimaryText: { color: theme.primaryFg, fontSize: 15, fontWeight: '600' },
    btnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: theme.radiusPill, borderWidth: 1, borderColor: theme.border },
    btnSecondaryText: { color: theme.fg, fontSize: 15, fontWeight: '600' },
    form: { paddingHorizontal: 20, paddingBottom: 20, gap: 14 },
    sendAmountWrap: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingTop: 20 },
    sendAmountInput: { color: theme.fg, fontWeight: '800', fontSize: 44, minWidth: 120, textAlign: 'center', padding: 0 },
    sendAmountSuffix: { fontSize: 18, fontWeight: '600', color: theme.muted },
    sendMaxLink: { alignSelf: 'center', marginTop: -4 },
    sendMaxLinkText: { color: theme.muted2, fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },
    errorText: { color: theme.danger, fontSize: 12 },
    hintText: { color: theme.muted, fontSize: 12 },
    assetStaticRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radiusInput },
    field: { gap: 6 },
    input: { padding: 13, fontSize: 15, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radiusInput, backgroundColor: theme.surface, color: theme.fg },
    availableBalanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border },
    mutedLabel: { color: theme.muted, fontSize: 13 },
    receive: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 20, gap: 16, alignItems: 'center' },
    receiveCard: { width: '100%', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radiusCard, padding: 24, alignItems: 'center', gap: 14 },
    receiveAddress: { color: theme.fg, fontFamily: 'monospace', fontSize: 15, textAlign: 'center', letterSpacing: 1, lineHeight: 24 },
    receiveBtn: { alignSelf: 'stretch' },
    emptyState: { padding: 48, textAlign: 'center', color: theme.muted, fontSize: 14 },
    activityList: { paddingBottom: 8 },
    txDateHeader: { color: theme.muted, fontSize: 13, fontWeight: '500', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
    txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 20 },
    txRowPressed: { backgroundColor: theme.surface },
    txIcon: { width: 40, height: 40 },
    txDirBadge: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 999, backgroundColor: '#5546ff', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    txInfo: { flex: 1, gap: 2 },
    txTokenName: { color: theme.fg, fontSize: 15, fontWeight: '600' },
    txSub: { color: theme.muted, fontSize: 13, fontFamily: 'monospace' },
    txAmount: { color: theme.fg, fontSize: 15, fontWeight: '600' },
    txAmountFailed: { color: theme.muted, textDecorationLine: 'line-through' },
    recoveryWarning: { margin: 20, marginTop: 0, padding: 18, borderRadius: theme.radiusCard, backgroundColor: theme.surface, borderLeftWidth: 3, borderLeftColor: theme.danger, gap: 14 },
    recoveryWarningText: { color: theme.muted2, fontSize: 14 },
    recoveryWarningActions: { flexDirection: 'row', gap: 10 },
    mnemonicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 20, paddingBottom: 0 },
    mnemonicWord: { width: '31%', backgroundColor: theme.surface, borderRadius: theme.radiusInput, padding: 10 },
    mnemonicWordText: { color: theme.fg, fontFamily: 'monospace', fontSize: 13 },
    mnemonicIndex: { color: theme.muted },
  });
}
