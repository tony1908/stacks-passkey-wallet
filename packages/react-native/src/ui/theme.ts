// Design tokens for the RN UI, ported from @toony1908/stacks-passkey-react's
// src/ui/styles.ts `:root` custom properties — same values, just a plain JS
// object instead of CSS custom properties (RN has no CSS cascade to hook
// into). Visual language: dark, bold, near-black surfaces with a white
// primary CTA and a Stacks-orange accent reserved for small details (the
// token glyph, focus/active states).
//
// Pass a `theme` prop (a `Partial<StacksPasskeyTheme>`) to `WalletButton` /
// `WalletDrawer` to override any subset of these tokens.

import type { ResolvedColorScheme } from '@toony1908/stacks-passkey-core';

export interface StacksPasskeyTheme {
  bg: string;
  surface: string;
  surface2: string;
  fg: string;
  muted: string;
  muted2: string;
  border: string;
  primary: string;
  primaryFg: string;
  accent: string;
  accent2: string;
  danger: string;
  success: string;
  radiusCard: number;
  radiusInput: number;
  radiusPill: number;
  font?: string;
}

export const defaultTheme: StacksPasskeyTheme = {
  bg: '#101010',
  surface: '#1c1c1e',
  surface2: '#2a2a2d',
  fg: '#ffffff',
  muted: '#8e8e93',
  muted2: '#b4b4b9',
  border: 'rgba(255, 255, 255, 0.12)',
  primary: '#ffffff',
  primaryFg: '#101010',
  accent: '#fc6432',
  accent2: '#ff8656',
  danger: '#ff453a',
  success: '#32d74b',
  radiusCard: 20,
  radiusInput: 14,
  radiusPill: 999,
};

// Light counterpart to `defaultTheme`, matching @toony1908/stacks-passkey-react's
// light palette exactly for cross-platform consistency. Same radii/font as
// `defaultTheme` — only the colors flip.
export const lightTheme: StacksPasskeyTheme = {
  bg: '#ffffff',
  surface: '#f4f4f6',
  surface2: '#e9e9ee',
  fg: '#0a0a0a',
  muted: '#8a8a8e',
  muted2: '#565659',
  border: 'rgba(0,0,0,0.10)',
  primary: '#0a0a0a',
  primaryFg: '#ffffff',
  accent: '#fc6432',
  accent2: '#e5551f',
  danger: '#d70015',
  success: '#1a7f37',
  radiusCard: 20,
  radiusInput: 14,
  radiusPill: 999,
};

export function resolveTheme(
  scheme: ResolvedColorScheme,
  override?: Partial<StacksPasskeyTheme>,
): StacksPasskeyTheme {
  const base = scheme === 'light' ? lightTheme : defaultTheme;
  return override ? { ...base, ...override } : base;
}
