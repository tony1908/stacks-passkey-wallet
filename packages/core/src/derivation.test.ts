import { describe, it, expect, vi } from 'vitest';
import { HDKey } from '@scure/bip32';
import { addressesFromPrivateKey, walletFromEntropy } from './derivation';

// Fixed 32-byte entropy vector (all 0x01) so derivation is deterministic
// across runs. Values below were computed once from this vector and are
// pinned as a regression snapshot.
const FIXED_ENTROPY = new Uint8Array(32).fill(1);

describe('walletFromEntropy', () => {
  it('derives a stable 24-word mnemonic and mainnet address from fixed entropy', async () => {
    const wallet = await walletFromEntropy(FIXED_ENTROPY, 'mainnet');
    expect(wallet.mnemonic.split(' ')).toHaveLength(24);
    expect(wallet.address).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
    expect(wallet.privateKey).toEqual(expect.any(String));
    expect(wallet.privateKey.length).toBeGreaterThan(0);
  });

  it('derives the corresponding stable testnet address from the same entropy', async () => {
    const wallet = await walletFromEntropy(FIXED_ENTROPY, 'testnet');
    expect(wallet.address).toBe('ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ');
  });

  it('is deterministic: same entropy + network always derives the same wallet', async () => {
    const a = await walletFromEntropy(FIXED_ENTROPY, 'mainnet');
    const b = await walletFromEntropy(FIXED_ENTROPY, 'mainnet');
    expect(a).toEqual(b);
  });

  it('derives a different address for different entropy', async () => {
    const other = new Uint8Array(32).fill(2);
    const wallet = await walletFromEntropy(other, 'mainnet');
    expect(wallet.address).not.toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
  });

  it('defaults accountIndex to 0, matching the pinned snapshot address', async () => {
    const explicit = await walletFromEntropy(FIXED_ENTROPY, 'mainnet', 0);
    expect(explicit.address).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
  });

  it('derives a different, but still valid, mainnet address for accountIndex 1', async () => {
    const account0 = await walletFromEntropy(FIXED_ENTROPY, 'mainnet', 0);
    const account1 = await walletFromEntropy(FIXED_ENTROPY, 'mainnet', 1);

    expect(account1.address).not.toBe(account0.address);
    expect(account1.address).toMatch(/^SP[0-9A-Z]+$/);
    expect(account1.privateKey).not.toBe(account0.privateKey);
  });

  it('wipes the HDKey nodes it derives, without changing the derived output (key-material hygiene)', async () => {
    const wipeSpy = vi.spyOn(HDKey.prototype, 'wipePrivateData');
    try {
      const wallet = await walletFromEntropy(FIXED_ENTROPY, 'mainnet');
      // Byte-identical to the pinned snapshot: hygiene must not alter output.
      expect(wallet.address).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
      // rootNode, the intermediate account node, and childKey all get wiped.
      expect(wipeSpy).toHaveBeenCalledTimes(3);
    } finally {
      wipeSpy.mockRestore();
    }
  });
});

describe('addressesFromPrivateKey', () => {
  it('derives both the mainnet and testnet address from a single private key, matching the walletFromEntropy snapshots', async () => {
    const wallet = await walletFromEntropy(FIXED_ENTROPY, 'mainnet');

    const addresses = addressesFromPrivateKey(wallet.privateKey);

    expect(addresses.mainnet.startsWith('SP')).toBe(true);
    expect(addresses.mainnet).toBe('SP1M4NHX3D458DH06R958BTF3EABKFG0XBFHHH8ZS');
    expect(addresses.testnet.startsWith('ST')).toBe(true);
    expect(addresses.testnet).toBe('ST1M4NHX3D458DH06R958BTF3EABKFG0XBFH7X7PQ');
  });
});
