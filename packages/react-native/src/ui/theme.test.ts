import { describe, expect, it } from 'vitest';
import { defaultTheme, lightTheme, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it("returns the dark defaultTheme base for scheme 'dark'", () => {
    expect(resolveTheme('dark')).toEqual(defaultTheme);
  });

  it("returns the lightTheme base for scheme 'light'", () => {
    expect(resolveTheme('light')).toEqual(lightTheme);
  });

  it('an override wins over the dark base', () => {
    expect(resolveTheme('dark', { bg: '#123456' })).toEqual({ ...defaultTheme, bg: '#123456' });
  });

  it('an override wins over the light base', () => {
    expect(resolveTheme('light', { bg: '#654321' })).toEqual({ ...lightTheme, bg: '#654321' });
  });
});

describe('lightTheme', () => {
  it('keeps the same radii and font as defaultTheme', () => {
    expect(lightTheme.radiusCard).toBe(defaultTheme.radiusCard);
    expect(lightTheme.radiusInput).toBe(defaultTheme.radiusInput);
    expect(lightTheme.radiusPill).toBe(defaultTheme.radiusPill);
    expect(lightTheme.font).toBe(defaultTheme.font);
  });

  it('matches the web light palette exactly', () => {
    expect(lightTheme).toEqual({
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
    });
  });
});
