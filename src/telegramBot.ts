import TelegramBot from 'node-telegram-bot-api';
import { CONFIG } from './config';
import { AvailableDepositInfo, Notifier, VaultState } from './types';

export class TelegramNotifier implements Notifier {
  private bot: TelegramBot;
  private commandHandlers: Map<string, (msg: TelegramBot.Message) => Promise<void>> = new Map();

  constructor() {
    if (!CONFIG.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }
    this.bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: true });
    this.setupCommandHandlers();
  }

  private setupCommandHandlers(): void {
    // Command handlers will be registered by VaultMonitor
  }

  registerCommand(command: string, handler: (msg: TelegramBot.Message) => Promise<void>): void {
    this.commandHandlers.set(command, handler);
  }

  getBot(): TelegramBot {
    return this.bot;
  }

  private formatNumber(value: bigint, decimals: number = 18): string {
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const fraction = value % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0');
    return `${whole.toString()}.${fractionStr.slice(0, 6)}`;
  }

  private formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private getTokenSymbol(vault: VaultState): string {
    // Try depositTokenSymbol first, then fallback to vault symbol, then N/A
    return vault.depositTokenSymbol || vault.symbol || 'N/A';
  }

  private formatDepositInfo(vault: VaultState, depositInfo?: AvailableDepositInfo): string {
    if (!depositInfo) {
      return '';
    }
    const tokenSymbol = this.getTokenSymbol(vault);
    return `
*--- Deposit Calculation ---*
*LP Price:* ${depositInfo.lpPrice.toFixed(6)}
*Available LP Capacity:* ${depositInfo.availableLpCapacity.toString()}
*💰 Available Deposit:* ${depositInfo.availableDeposit.toFixed(2)} ${tokenSymbol}
`;
  }

  async notifyNewVault(vault: VaultState, isFilled: boolean, depositInfo?: AvailableDepositInfo): Promise<void> {
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const status = isFilled ? '🔴 FULLY FILLED' : '🟢 AVAILABLE';
    const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
    const tokenSymbol = this.getTokenSymbol(vault);
    const depositInfoStr = this.formatDepositInfo(vault, depositInfo);

    const message = `
🚀 *New Vault Created!*

*Name:* ${vault.name}
*Symbol:* ${vault.symbol}
*🪙 Token:* ${tokenSymbol}
*Address:* \`${vault.address}\`
*Status:* ${status}

*Cap:* ${this.formatNumber(vault.totalSupplyCap)}
*Current Supply:* ${this.formatNumber(vault.lastKnownTotalSupply)}
*Maturity:* ${maturityDate}
${depositInfoStr}
[View on Arbiscan](${arbiscanUrl})
    `.trim();

    await this.sendMessage(message);
  }

  async notifyCapRaised(vault: VaultState, oldCap: bigint, newCap: bigint, currentSupply: bigint, depositInfo?: AvailableDepositInfo): Promise<void> {
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const isNowAvailable = currentSupply < newCap;
    const status = isNowAvailable ? '🟢 NOW AVAILABLE' : '🔴 STILL FULL';
    const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
    const tokenSymbol = this.getTokenSymbol(vault);
    const depositInfoStr = this.formatDepositInfo(vault, depositInfo);

    const message = `
📈 *Vault Cap Raised!*

*Vault:* ${vault.name} (${vault.symbol})
*🪙 Token:* ${tokenSymbol}
*Address:* \`${vault.address}\`
*Status:* ${status}

*Old Cap:* ${this.formatNumber(oldCap)}
*New Cap:* ${this.formatNumber(newCap)}
*Current Supply:* ${this.formatNumber(currentSupply)}
*Maturity:* ${maturityDate}

*Available Space:* ${this.formatNumber(newCap - currentSupply)}
${depositInfoStr}
[View on Arbiscan](${arbiscanUrl})
    `.trim();

    await this.sendMessage(message);
  }

  async notifyVaultFilled(vault: VaultState): Promise<void> {
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const tokenSymbol = this.getTokenSymbol(vault);
    
    const message = `
🔴 *Vault Filled!*

*Vault:* ${vault.name} (${vault.symbol})
*🪙 Token:* ${tokenSymbol}
*Address:* \`${vault.address}\`

*Cap:* ${this.formatNumber(vault.totalSupplyCap)}
*Current Supply:* ${this.formatNumber(vault.lastKnownTotalSupply)}

[View on Arbiscan](${arbiscanUrl})
    `.trim();

    await this.sendMessage(message);
  }

  async notifyVaultAvailable(vault: VaultState, currentSupply: bigint, depositInfo?: AvailableDepositInfo): Promise<void> {
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
    const available = vault.totalSupplyCap - currentSupply;
    const tokenSymbol = this.getTokenSymbol(vault);
    const depositInfoStr = this.formatDepositInfo(vault, depositInfo);

    const message = `
🟢 *Vault Available Again!*

*Vault:* ${vault.name} (${vault.symbol})
*🪙 Token:* ${tokenSymbol}
*Address:* \`${vault.address}\`

*Cap:* ${this.formatNumber(vault.totalSupplyCap)}
*Current Supply:* ${this.formatNumber(currentSupply)}
*Available Space:* ${this.formatNumber(available)}
*Maturity:* ${maturityDate}
${depositInfoStr}
[View on Arbiscan](${arbiscanUrl})
    `.trim();

    await this.sendMessage(message);
  }

  private async sendMessage(text: string): Promise<void> {
    try {
      await this.bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      });
    } catch (error) {
      console.error('Error sending Telegram message:', error);
    }
  }

  async sendTestMessage(): Promise<void> {
    await this.sendMessage('🤖 Vault Monitor Bot is running!');
  }
}

