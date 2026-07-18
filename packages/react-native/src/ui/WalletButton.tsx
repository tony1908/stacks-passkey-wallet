// Ported from @toony1908/stacks-passkey-react's src/ui/WalletButton.tsx: same
// three states (unsupported / disconnected / connected pill), re-skinned on
// RN primitives (View/Text/Pressable) with the self-injecting web stylesheet
// replaced by `theme.ts` tokens fed into `StyleSheet.create`.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useStacksPasskeyWallet } from '../hooks';
import { describePasskeyError, truncateAddress } from './format';
import { FingerprintIcon, SpinnerIcon } from './icons';
import { defaultTheme, resolveTheme, type StacksPasskeyTheme } from './theme';
import { WalletDrawer } from './WalletDrawer';

export interface WalletButtonProps {
  style?: StyleProp<ViewStyle>;
  label?: string;
  /** Background color of the Connect button. Overrides the theme's `primary`
   * for this button only (the drawer's own buttons are unaffected). */
  color?: string;
  /** Foreground (icon + label) color of the Connect button. Defaults to a
   * readable black/white picked from `color`, or the theme's `primaryFg`. */
  textColor?: string;
  theme?: Partial<StacksPasskeyTheme>;
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

export function WalletButton({ style, label, color, textColor, theme: themeOverride, onError }: WalletButtonProps) {
  const { isSupported, isConnected, isConnecting, address, connect, reconnect, resolvedColorScheme } =
    useStacksPasskeyWallet();
  const theme = resolveTheme(resolvedColorScheme, themeOverride);
  const primaryFg = textColor ?? (color ? readableTextColor(color) : null) ?? theme.primaryFg;
  const styles = createStyles(theme);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Same silent-failure gap the web WalletButton has: connect/reconnect
  // errors previously only reached the caller via onError, so a consumer
  // that didn't wire onError got a button that just quietly did nothing on
  // failure. `connectError` gives every consumer a visible fallback for
  // free; onError still also fires for anyone who wants to handle it too.
  // (Declared unconditionally, alongside drawerOpen — not inside the
  // `!isConnected` branch below — so the hook order never depends on
  // connection state.)
  const [connectError, setConnectError] = useState<string | null>(null);

  if (!isSupported) {
    return (
      <View style={style}>
        {/* Kept as "Connect wallet" (not "Passkeys not supported") so this
            disabled button's accessible label matches every other state —
            the reason is surfaced separately via the hint below. */}
        <View style={[styles.btnSecondary, styles.btnDisabled]}>
          <FingerprintIcon size={16} color={theme.fg} />
          <Text style={styles.btnSecondaryText}>{label ?? 'Connect wallet'}</Text>
        </View>
        <Text style={styles.hint}>Passkeys not supported</Text>
      </View>
    );
  }

  if (!isConnected) {
    const handleConnect = async () => {
      setConnectError(null);
      try {
        await connect();
      } catch (e) {
        const { quiet, message } = describePasskeyError(e, 'Failed to connect wallet');
        // A cancelled passkey prompt is the user backing out, not a failure
        // worth surfacing — skip both the inline text and onError for it.
        if (quiet) return;
        setConnectError(message);
        onError?.(e);
      }
    };

    const handleReconnect = async () => {
      setConnectError(null);
      try {
        await reconnect();
      } catch (e) {
        const { quiet, message } = describePasskeyError(e, 'Failed to reconnect wallet');
        if (quiet) return;
        setConnectError(message);
        onError?.(e);
      }
    };

    return (
      <View style={style}>
        <Pressable
          onPress={handleConnect}
          disabled={isConnecting}
          style={({ pressed }) => [
            styles.btnPrimary,
            color ? { backgroundColor: color } : null,
            isConnecting && styles.btnDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: isConnecting, busy: isConnecting }}
        >
          {isConnecting ? <SpinnerIcon size={16} color={primaryFg} /> : <FingerprintIcon size={16} color={primaryFg} />}
          <Text style={[styles.btnPrimaryText, { color: primaryFg }]}>{label ?? 'Connect wallet'}</Text>
        </Pressable>
        <Pressable
          onPress={handleReconnect}
          disabled={isConnecting}
          style={({ pressed }) => [styles.reconnectLink, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: isConnecting, busy: isConnecting }}
        >
          {isConnecting && <SpinnerIcon size={11} color={theme.muted2} />}
          <Text style={styles.reconnectLinkText}>Use an existing passkey</Text>
        </Pressable>
        {connectError && <Text style={styles.errorText}>{connectError}</Text>}
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setDrawerOpen(true)}
        style={({ pressed }) => [styles.accountPill, style, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <View style={styles.dot} />
        <Text style={styles.accountAddress}>{truncateAddress(address ?? '')}</Text>
      </Pressable>
      <WalletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onError={onError} theme={themeOverride} />
    </>
  );
}

function createStyles(theme: StacksPasskeyTheme) {
  return StyleSheet.create({
    btnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 15,
      paddingHorizontal: 24,
      backgroundColor: theme.primary,
      borderRadius: theme.radiusPill,
    },
    btnPrimaryText: { color: theme.primaryFg, fontSize: 15, fontWeight: '600' },
    btnSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radiusPill,
    },
    btnSecondaryText: { color: theme.fg, fontSize: 15, fontWeight: '600' },
    btnDisabled: { opacity: 0.4 },
    pressed: { opacity: 0.85 },
    hint: { marginTop: 8, fontSize: 12, color: theme.muted },
    errorText: { marginTop: 8, fontSize: 12, color: theme.danger },
    reconnectLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    reconnectLinkText: { fontSize: 13, color: theme.muted2, textDecorationLine: 'underline' },
    accountPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radiusPill,
      alignSelf: 'flex-start',
    },
    accountAddress: { fontFamily: 'monospace', fontSize: 13, color: theme.fg },
    dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: theme.success },
  });
}

export { defaultTheme };
