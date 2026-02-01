import * as fs from 'fs';
import * as path from 'path';
import { AvailableDepositInfo, Notifier, VaultState } from './types';

/**
 * File-based notifier that writes notifications to a local file
 * instead of sending to Telegram. Useful for local testing.
 */
export class FileNotifier implements Notifier {
  private outputFile: string;

  constructor(outputFile?: string) {
    this.outputFile = outputFile || path.join(process.cwd(), 'notifications.txt');

    // Ensure output directory exists
    const dir = path.dirname(this.outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`FileNotifier initialized. Output file: ${this.outputFile}`);
  }

  private formatNumber(value: bigint, decimals: number = 18): string {
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const fraction = value % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0');
    return `${whole.toString()}.${fractionStr.slice(0, 6)}`;
  }

  private getTokenSymbol(vault: VaultState): string {
    return vault.depositTokenSymbol || vault.symbol || 'N/A';
  }

  private formatDepositInfo(vault: VaultState, depositInfo?: AvailableDepositInfo): string {
    if (!depositInfo) {
      return '';
    }
    const tokenSymbol = this.getTokenSymbol(vault);
    return `
--- Deposit Calculation ---
LP Price: ${depositInfo.lpPrice.toFixed(6)}
Available LP Capacity: ${depositInfo.availableLpCapacity.toString()}
Available Deposit: ${depositInfo.availableDeposit.toFixed(2)} ${tokenSymbol}`;
  }

  private writeNotification(message: string): void {
    const timestamp = new Date().toISOString();
    const separator = '\n' + '='.repeat(60) + '\n';
    const entry = `${separator}[${timestamp}]\n${separator}${message}\n`;

    fs.appendFileSync(this.outputFile, entry);
    console.log(`Notification written to ${this.outputFile}`);
  }

  async notifyNewVault(vault: VaultState, isFilled: boolean, depositInfo?: AvailableDepositInfo): Promise<void> {
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const status = isFilled ? 'FULLY FILLED' : 'AVAILABLE';
    const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
    const tokenSymbol = this.getTokenSymbol(vault);
    const depositInfoStr = this.formatDepositInfo(vault, depositInfo);

    const message = `
NEW VAULT CREATED!

Name: ${vault.name}
Symbol: ${vault.symbol}
Token: ${tokenSymbol}
Address: ${vault.address}
Status: ${status}

Cap: ${this.formatNumber(vault.totalSupplyCap)}
Current Supply: ${this.formatNumber(vault.lastKnownTotalSupply)}
Maturity: ${maturityDate}
${depositInfoStr}
View on Arbiscan: ${arbiscanUrl}
    `.trim();

    this.writeNotification(message);
  }

  async notifyCapRaised(
    vault: VaultState,
    oldCap: bigint,
    newCap: bigint,
    currentSupply: bigint,
    depositInfo?: AvailableDepositInfo
  ): Promise<void> {
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const isNowAvailable = currentSupply < newCap;
    const status = isNowAvailable ? 'NOW AVAILABLE' : 'STILL FULL';
    const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
    const tokenSymbol = this.getTokenSymbol(vault);
    const depositInfoStr = this.formatDepositInfo(vault, depositInfo);

    const message = `
VAULT CAP RAISED!

Vault: ${vault.name} (${vault.symbol})
Token: ${tokenSymbol}
Address: ${vault.address}
Status: ${status}

Old Cap: ${this.formatNumber(oldCap)}
New Cap: ${this.formatNumber(newCap)}
Current Supply: ${this.formatNumber(currentSupply)}
Maturity: ${maturityDate}

Available Space: ${this.formatNumber(newCap - currentSupply)}
${depositInfoStr}
View on Arbiscan: ${arbiscanUrl}
    `.trim();

    this.writeNotification(message);
  }

  async notifyVaultFilled(vault: VaultState): Promise<void> {
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const tokenSymbol = this.getTokenSymbol(vault);

    const message = `
VAULT FILLED!

Vault: ${vault.name} (${vault.symbol})
Token: ${tokenSymbol}
Address: ${vault.address}

Cap: ${this.formatNumber(vault.totalSupplyCap)}
Current Supply: ${this.formatNumber(vault.lastKnownTotalSupply)}

View on Arbiscan: ${arbiscanUrl}
    `.trim();

    this.writeNotification(message);
  }

  async notifyVaultAvailable(vault: VaultState, currentSupply: bigint, depositInfo?: AvailableDepositInfo): Promise<void> {
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
    const available = vault.totalSupplyCap - currentSupply;
    const tokenSymbol = this.getTokenSymbol(vault);
    const depositInfoStr = this.formatDepositInfo(vault, depositInfo);

    const message = `
VAULT AVAILABLE AGAIN!

Vault: ${vault.name} (${vault.symbol})
Token: ${tokenSymbol}
Address: ${vault.address}

Cap: ${this.formatNumber(vault.totalSupplyCap)}
Current Supply: ${this.formatNumber(currentSupply)}
Available Space: ${this.formatNumber(available)}
Maturity: ${maturityDate}
${depositInfoStr}
View on Arbiscan: ${arbiscanUrl}
    `.trim();

    this.writeNotification(message);
  }

  async sendTestMessage(): Promise<void> {
    this.writeNotification('Vault Monitor Bot is running! (File output mode)');
  }
}
