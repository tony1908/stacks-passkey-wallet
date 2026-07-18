// Ported from @toony1908/stacks-passkey-react's src/ui/icons.tsx: same paths,
// re-drawn on `react-native-svg` (`Svg`/`Path`/`Circle`) instead of raw
// `<svg>`, and the CSS `@keyframes` spinner replaced with RN's `Animated`
// API. Only the subset actually used by WalletButton/WalletDrawer is ported
// — this isn't a general-purpose icon set.

import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
}

function StrokeIcon({ size = 16, color = '#fff', children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function FingerprintIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="M12 3a5 5 0 0 1 5 5v2" />
      <Path d="M7 10V8a5 5 0 0 1 1.5-3.6" />
      <Path d="M4 15.5A9 9 0 0 1 3 11" />
      <Path d="M20.6 15A9 9 0 0 0 21 11" />
      <Path d="M9 20.6A9 9 0 0 1 6 18" />
      <Path d="M12 22a9 9 0 0 0 4.5-1.2" />
      <Path d="M12 10a2 2 0 0 1 2 2v3a4 4 0 0 1-1 2.6" />
      <Path d="M9 12v3a5 5 0 0 0 .8 2.7" />
    </StrokeIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </StrokeIcon>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="m12 19-7-7 7-7" />
      <Path d="M19 12H5" />
    </StrokeIcon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="M9 9h13v13H9z" />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </StrokeIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="M20 6 9 17l-5-5" />
    </StrokeIcon>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="m21 2-9.6 9.6" />
      <Path d="m15.5 7.5 3 3L22 7l-3-3" />
      <Circle cx="7.5" cy="15.5" r="5.5" />
    </StrokeIcon>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="M15 3h6v6" />
      <Path d="M10 14 21 3" />
      <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </StrokeIcon>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="M7 17 17 7" />
      <Path d="M7 7h10v10" />
    </StrokeIcon>
  );
}

export function ArrowDownLeftIcon(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <Path d="m17 7-10 10" />
      <Path d="M17 17H7V7" />
    </StrokeIcon>
  );
}

/** Continuously-rotating spinner — RN has no CSS `@keyframes`, so this uses
 * `Animated.loop` over a 0..1 value interpolated to a 0..360deg rotation. */
export function SpinnerIcon({ size = 16, color = '#fff' }: IconProps) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }),
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
        <Path d="M12 2a10 10 0 0 1 10 10" opacity={0.9} />
        <Circle cx="12" cy="12" r="10" opacity={0.25} />
      </Svg>
    </Animated.View>
  );
}

/** The Stacks token glyph: a circular orange-gradient badge with the white
 * Stacks "S" mark. `react-native-svg` needs its own `LinearGradient`/`Defs`
 * for a true gradient; a flat `accent` fill keeps this simple and still
 * reads correctly against the dark theme (the web version's gradient is a
 * subtle top-to-bottom shade of the same two accent tokens). */
export function StacksTokenIcon({ size = 40, accent = '#fc6432' }: { size?: number; accent?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 32 32" fill="#fff">
        <Path d="M24.5 16.978h-17v2.07h5.181L9.071 24.5h2.683l4.239-6.423 4.24 6.423h2.697l-3.611-5.467H24.5v-2.055zM11.71 7.5H9.014l3.568 5.395H7.5v2.084h17v-2.084h-5.081L22.987 7.5h-2.698l-4.296 6.509L11.71 7.5z" />
      </Svg>
    </View>
  );
}
