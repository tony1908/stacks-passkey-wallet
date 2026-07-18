import { describe, it, expect } from 'vitest';
import { VERSION } from './index';

describe('scaffold', () => {
  it('builds and exposes a version string', () => {
    expect(typeof VERSION).toBe('string');
  });
});
