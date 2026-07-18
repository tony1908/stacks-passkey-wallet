// Only public data ever lives here — a credential id and both of its
// derived Stacks addresses (one key, one mainnet + one testnet address).
// Never store a key, mnemonic, or entropy through this type.
export interface StoredWallet {
  credentialId: string;
  addresses: { mainnet: string; testnet: string };
}
