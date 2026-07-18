import { afterEach, describe, expect, it } from 'vitest';
import { injectStyles } from './styles';

afterEach(() => {
  document.getElementById('spw-styles')?.remove();
});

describe('injectStyles', () => {
  it('injects exactly one style tag, even when called twice', () => {
    injectStyles();
    injectStyles();
    expect(document.querySelectorAll('#spw-styles').length).toBe(1);
  });

  it('appends the style tag to <head>', () => {
    injectStyles();
    const style = document.getElementById('spw-styles');
    expect(style?.parentElement).toBe(document.head);
  });

  it('defines the theme CSS custom properties', () => {
    injectStyles();
    const css = document.getElementById('spw-styles')?.textContent ?? '';
    expect(css).toContain('--spw-accent');
    expect(css).toContain('--spw-bg');
    expect(css).toContain('--spw-radius');
  });

  it('defines a light-scheme override scoped to [data-spw-scheme="light"]', () => {
    injectStyles();
    const css = document.getElementById('spw-styles')?.textContent ?? '';
    expect(css).toContain('[data-spw-scheme="light"]');
    expect(css).toContain('--spw-bg: #ffffff');
    expect(css).toContain('--spw-fg: #0a0a0a');
  });

  it('gives the light-scheme muted text at least WCAG AA contrast (4.5:1) against its backgrounds', () => {
    injectStyles();
    const css = document.getElementById('spw-styles')?.textContent ?? '';
    const muted = css.match(/\[data-spw-scheme="light"\][^}]*--spw-muted:\s*(#[0-9a-f]{6})/i)?.[1];
    if (!muted) throw new Error('could not find --spw-muted in the light-scheme CSS block');

    function relativeLuminance(hex: string): number {
      const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const r = channel(parseInt(hex.slice(1, 3), 16) / 255);
      const g = channel(parseInt(hex.slice(3, 5), 16) / 255);
      const b = channel(parseInt(hex.slice(5, 7), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function contrast(a: string, b: string): number {
      const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
      return (lighter + 0.05) / (darker + 0.05);
    }

    // The light theme's three surface tokens, from brightest to darkest.
    for (const bg of ['#ffffff', '#f4f4f6', '#e9e9ee']) {
      expect(contrast(muted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is a no-op when there is no document (SSR)', () => {
    const original = globalThis.document;
    // @ts-expect-error simulating an SSR environment with no DOM
    delete globalThis.document;
    try {
      expect(() => injectStyles()).not.toThrow();
    } finally {
      globalThis.document = original;
    }
  });
});
