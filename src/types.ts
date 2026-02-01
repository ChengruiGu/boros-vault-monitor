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
  depositTokenSymbol?: string; // Human-readable token symbol (e.g., "WBTC", "WETH", "USD₮0")
  depositTokenDecimals?: number; // Token decimals (e.g., 6 for USDT, 18 for ETH, 8 for BTC)
  selfAcc?: string; // AMM's MarketAcc (bytes26) for querying cash from MarketHub
}

export interface MonitorState {
  lastProcessedBlock: number;
  vaults: Record<string, VaultState>;
}

/**
 * Available deposit calculation result
 */
export interface AvailableDepositInfo {
  lpPrice: number;
  availableDeposit: number;
  availableLpCapacity: bigint;
}

/**
 * Interface for notification outputs (Telegram, file, etc.)
 */
export interface Notifier {
  notifyNewVault(vault: VaultState, isFilled: boolean, depositInfo?: AvailableDepositInfo): Promise<void>;
  notifyCapRaised(vault: VaultState, oldCap: bigint, newCap: bigint, currentSupply: bigint, depositInfo?: AvailableDepositInfo): Promise<void>;
  notifyVaultFilled(vault: VaultState): Promise<void>;
  notifyVaultAvailable(vault: VaultState, currentSupply: bigint, depositInfo?: AvailableDepositInfo): Promise<void>;
  sendTestMessage(): Promise<void>;
}

