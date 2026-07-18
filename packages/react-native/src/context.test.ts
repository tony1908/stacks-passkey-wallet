import { describe, expect, it } from 'vitest';
import { resolveColorScheme } from './context';

// `resolveColorScheme` is the pure core of the provider's `resolvedColorScheme`
// field: `config.colorScheme` with `'auto'` resolved against the live
// `useColorScheme()` reading. Kept pure (and importable without pulling in
// `react-native`) so it's directly unit-testable — the provider itself isn't
// rendered in this package's test suite (no RN Jest/vitest preset is set up;
// see vitest.config.ts), so this is where the resolution logic gets covered.
describe('resolveColorScheme', () => {
  it("passes through 'dark' regardless of the system reading", () => {
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
    expect(resolveColorScheme('dark', null)).toBe('dark');
  });

  it("passes through 'light' regardless of the system reading", () => {
    expect(resolveColorScheme('light', 'dark')).toBe('light');
    expect(resolveColorScheme('light', null)).toBe('light');
  });

  it("resolves 'auto' to the system reading when it's 'light'", () => {
    expect(resolveColorScheme('auto', 'light')).toBe('light');
  });

  it("resolves 'auto' to the system reading when it's 'dark'", () => {
    expect(resolveColorScheme('auto', 'dark')).toBe('dark');
  });

  it("defaults 'auto' to 'dark' when useColorScheme() reads null (unknown)", () => {
    expect(resolveColorScheme('auto', null)).toBe('dark');
  });

  it("defaults 'auto' to 'dark' when useColorScheme() reads undefined", () => {
    expect(resolveColorScheme('auto', undefined)).toBe('dark');
  });
});
