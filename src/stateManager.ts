import * as fs from 'fs';
import * as path from 'path';
import { MonitorState, VaultState } from './types';
import { CONFIG } from './config';

export class StateManager {
  private stateFile: string;

  constructor() {
    this.stateFile = path.resolve(CONFIG.STATE_FILE);
  }

  loadState(): MonitorState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf-8');
        const parsed = JSON.parse(data);
        // Convert bigint strings back to bigint
        const state: MonitorState = {
          lastProcessedBlock: parsed.lastProcessedBlock || 0,
          vaults: {},
        };

        for (const [address, vault] of Object.entries(parsed.vaults || {})) {
          const v = vault as any;
          state.vaults[address] = {
            address: v.address,
            name: v.name,
            symbol: v.symbol,
            totalSupplyCap: BigInt(v.totalSupplyCap),
            lastKnownTotalSupply: BigInt(v.lastKnownTotalSupply || '0'),
            isFilled: v.isFilled || false,
            maturity: BigInt(v.maturity || '0'),
            marketAddress: v.marketAddress || '',
            lastCheckedBlock: v.lastCheckedBlock || 0,
            createdAt: v.createdAt || Date.now(),
            depositTokenSymbol: v.depositTokenSymbol || undefined,
          };
        }

        return state;
      }
    } catch (error) {
      console.error('Error loading state:', error);
    }

    return {
      lastProcessedBlock: CONFIG.START_BLOCK || 0,
      vaults: {},
    };
  }

  saveState(state: MonitorState): void {
    try {
      // Convert bigint to string for JSON serialization
      const serializable: any = {
        lastProcessedBlock: state.lastProcessedBlock,
        vaults: {},
      };

      for (const [address, vault] of Object.entries(state.vaults)) {
        serializable.vaults[address] = {
          address: vault.address,
          name: vault.name,
          symbol: vault.symbol,
          totalSupplyCap: vault.totalSupplyCap.toString(),
          lastKnownTotalSupply: vault.lastKnownTotalSupply.toString(),
          isFilled: vault.isFilled,
          maturity: vault.maturity.toString(),
          marketAddress: vault.marketAddress,
          lastCheckedBlock: vault.lastCheckedBlock,
          createdAt: vault.createdAt,
          depositTokenSymbol: vault.depositTokenSymbol,
        };
      }

      fs.writeFileSync(this.stateFile, JSON.stringify(serializable, null, 2));
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }

  addVault(vault: VaultState): void {
    const state = this.loadState();
    state.vaults[vault.address.toLowerCase()] = vault;
    this.saveState(state);
  }

  updateVault(address: string, updates: Partial<VaultState>): void {
    const state = this.loadState();
    const addr = address.toLowerCase();
    if (state.vaults[addr]) {
      state.vaults[addr] = { ...state.vaults[addr], ...updates };
      this.saveState(state);
    }
  }

  getVault(address: string): VaultState | undefined {
    const state = this.loadState();
    return state.vaults[address.toLowerCase()];
  }

  getAllVaults(): VaultState[] {
    const state = this.loadState();
    return Object.values(state.vaults);
  }
}

