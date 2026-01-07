export interface VaultState {
  address: string;
  name: string;
  symbol: string;
  totalSupplyCap: bigint;
  lastKnownTotalSupply: bigint;
  isFilled: boolean;
  maturity: bigint; // Unix timestamp when vault expires
  marketAddress: string; // Market contract address
  lastCheckedBlock: number;
  createdAt: number;
  depositTokenSymbol?: string; // Human-readable token symbol (e.g., "BTC", "USDT", "ETH")
}

export interface MonitorState {
  lastProcessedBlock: number;
  vaults: Record<string, VaultState>;
}

