import { describe, it, expect } from 'vitest';
import { base64UrlEncode, base64UrlDecode } from './encoding';

describe('base64Url encode/decode', () => {
  it('round-trips arbitrary bytes through a Uint8Array', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 127, 128]);
    const encoded = base64UrlEncode(bytes);
    const decoded = base64UrlDecode(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('round-trips an ArrayBuffer', () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const encoded = base64UrlEncode(bytes.buffer);
    const decoded = base64UrlDecode(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('produces URL-safe output with no +, /, or = padding', () => {
    // bytes chosen so the base64 alphabet would otherwise contain +, /, and =
    const bytes = new Uint8Array([251, 255, 191, 239, 63]);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('round-trips 32 bytes of high-entropy data', () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = (i * 37 + 11) % 256;
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
  });
});
