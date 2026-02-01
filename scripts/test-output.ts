import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { StateManager } from '../src/stateManager';
import { VaultState } from '../src/types';

// Load environment variables
dotenv.config();

/**
 * Test script to generate bot notification output and write to a file
 * instead of sending to Telegram. Useful for testing message formats.
 *
 * Usage:
 *   npx ts-node scripts/test-output.ts
 *
 * Output:
 *   Creates a file at test-output/notifications.txt with all message formats
 */

// Output directory and file
const OUTPUT_DIR = path.join(__dirname, '..', 'test-output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'notifications.txt');

// Helper functions (copied from TelegramNotifier)
function formatNumber(value: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0');
  return `${whole.toString()}.${fractionStr.slice(0, 6)}`;
}

function getTokenSymbol(vault: VaultState): string {
  return vault.depositTokenSymbol || vault.symbol || 'N/A';
}

// Message generators (matching TelegramNotifier format)
function generateNewVaultMessage(vault: VaultState, isFilled: boolean): string {
  const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
  const status = isFilled ? '🔴 FULLY FILLED' : '🟢 AVAILABLE';
  const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
  const tokenSymbol = getTokenSymbol(vault);

  return `
🚀 *New Vault Created!*

*Name:* ${vault.name}
*Symbol:* ${vault.symbol}
*🪙 Token:* ${tokenSymbol}
*Address:* \`${vault.address}\`
*Status:* ${status}

*Cap:* ${formatNumber(vault.totalSupplyCap)}
*Current Supply:* ${formatNumber(vault.lastKnownTotalSupply)}
*Maturity:* ${maturityDate}

[View on Arbiscan](${arbiscanUrl})
  `.trim();
}

function generateCapRaisedMessage(
  vault: VaultState,
  oldCap: bigint,
  newCap: bigint,
  currentSupply: bigint
): string {
  const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
  const isNowAvailable = currentSupply < newCap;
  const status = isNowAvailable ? '🟢 NOW AVAILABLE' : '🔴 STILL FULL';
  const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
  const tokenSymbol = getTokenSymbol(vault);

  return `
📈 *Vault Cap Raised!*

*Vault:* ${vault.name} (${vault.symbol})
*🪙 Token:* ${tokenSymbol}
*Address:* \`${vault.address}\`
*Status:* ${status}

*Old Cap:* ${formatNumber(oldCap)}
*New Cap:* ${formatNumber(newCap)}
*Current Supply:* ${formatNumber(currentSupply)}
*Maturity:* ${maturityDate}

*Available Space:* ${formatNumber(newCap - currentSupply)}

[View on Arbiscan](${arbiscanUrl})
  `.trim();
}

function generateVaultFilledMessage(vault: VaultState): string {
  const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
  const tokenSymbol = getTokenSymbol(vault);

  return `
🔴 *Vault Filled!*

*Vault:* ${vault.name} (${vault.symbol})
*🪙 Token:* ${tokenSymbol}
*Address:* \`${vault.address}\`

*Cap:* ${formatNumber(vault.totalSupplyCap)}
*Current Supply:* ${formatNumber(vault.lastKnownTotalSupply)}

[View on Arbiscan](${arbiscanUrl})
  `.trim();
}

function generateVaultAvailableMessage(vault: VaultState, currentSupply: bigint): string {
  const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
  const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleString();
  const available = vault.totalSupplyCap - currentSupply;
  const tokenSymbol = getTokenSymbol(vault);

  return `
🟢 *Vault Available Again!*

*Vault:* ${vault.name} (${vault.symbol})
*🪙 Token:* ${tokenSymbol}
*Address:* \`${vault.address}\`

*Cap:* ${formatNumber(vault.totalSupplyCap)}
*Current Supply:* ${formatNumber(currentSupply)}
*Available Space:* ${formatNumber(available)}
*Maturity:* ${maturityDate}

[View on Arbiscan](${arbiscanUrl})
  `.trim();
}

function generateLiveVaultsList(
  vaults: Array<VaultState & { utilization: number }>
): string {
  if (vaults.length === 0) {
    return '❌ No live vaults found.';
  }

  let message = `📊 *Live Vaults* (${vaults.length})\n\n`;

  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    const arbiscanUrl = `https://arbiscan.io/address/${vault.address}`;
    const maturityDate = new Date(Number(vault.maturity) * 1000).toLocaleDateString();
    const available = vault.totalSupplyCap - vault.lastKnownTotalSupply;
    const status = vault.utilization < 100 ? '🟢' : '🔴';

    // Remove "Boros AMM - " prefix from vault name
    const displayName = vault.name.replace(/^Boros AMM - /, '');
    const tokenSymbol = vault.depositTokenSymbol || 'N/A';

    message += `${i + 1}. ${status} *${displayName}*\n`;
    message += `   🪙 Token: ${tokenSymbol}\n`;
    message += `   📅 Expires: ${maturityDate}\n`;
    message += `   📊 Utilization: ${vault.utilization.toFixed(2)}%\n`;
    message += `   💵 Cap: ${formatNumber(vault.totalSupplyCap)}\n`;
    message += `   📈 Current: ${formatNumber(vault.lastKnownTotalSupply)}\n`;
    message += `   ✅ Available: ${formatNumber(available)}\n`;
    message += `   🔗 [View](${arbiscanUrl})\n\n`;
  }

  return message.trim();
}

// Write output to file
function writeOutput(content: string): void {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Append to file with timestamp
  const timestamp = new Date().toISOString();
  const separator = '\n' + '='.repeat(60) + '\n';
  const entry = `${separator}[${timestamp}]\n${separator}${content}\n`;

  fs.appendFileSync(OUTPUT_FILE, entry);
}

// Create sample vault for testing
function createSampleVault(overrides: Partial<VaultState> = {}): VaultState {
  return {
    address: '0x1234567890123456789012345678901234567890',
    name: 'Boros AMM - BTC Vault',
    symbol: 'bAMM-BTC',
    totalSupplyCap: BigInt('1000000000000000000000'), // 1000 tokens
    lastKnownTotalSupply: BigInt('500000000000000000000'), // 500 tokens
    isFilled: false,
    maturity: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30), // 30 days from now
    marketAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
    lastCheckedBlock: 12345678,
    createdAt: Date.now(),
    depositTokenSymbol: 'BTC',
    ...overrides,
  };
}

async function main() {
  console.log('🧪 Bot Output Test Script');
  console.log('========================\n');

  // Clear previous output
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }

  const stateManager = new StateManager();
  const realVaults = stateManager.getAllVaults();

  console.log(`📦 Found ${realVaults.length} vaults in state\n`);

  // Header
  writeOutput('BOT OUTPUT TEST - Generated Notifications\n');

  // Test 1: New Vault (Available)
  console.log('1. Generating: New Vault (Available)');
  const availableVault = createSampleVault();
  writeOutput('--- NEW VAULT (AVAILABLE) ---\n\n' + generateNewVaultMessage(availableVault, false));

  // Test 2: New Vault (Filled)
  console.log('2. Generating: New Vault (Filled)');
  const filledVault = createSampleVault({
    lastKnownTotalSupply: BigInt('980000000000000000000'), // 98% filled
    isFilled: true,
  });
  writeOutput('--- NEW VAULT (FILLED) ---\n\n' + generateNewVaultMessage(filledVault, true));

  // Test 3: Cap Raised (Now Available)
  console.log('3. Generating: Cap Raised (Now Available)');
  const capRaisedVault = createSampleVault();
  const oldCap = BigInt('500000000000000000000');
  const newCap = BigInt('1000000000000000000000');
  const currentSupply = BigInt('450000000000000000000');
  writeOutput(
    '--- CAP RAISED (NOW AVAILABLE) ---\n\n' +
      generateCapRaisedMessage(capRaisedVault, oldCap, newCap, currentSupply)
  );

  // Test 4: Cap Raised (Still Full)
  console.log('4. Generating: Cap Raised (Still Full)');
  const stillFullSupply = BigInt('980000000000000000000');
  writeOutput(
    '--- CAP RAISED (STILL FULL) ---\n\n' +
      generateCapRaisedMessage(capRaisedVault, oldCap, newCap, stillFullSupply)
  );

  // Test 5: Vault Filled
  console.log('5. Generating: Vault Filled');
  writeOutput('--- VAULT FILLED ---\n\n' + generateVaultFilledMessage(filledVault));

  // Test 6: Vault Available Again
  console.log('6. Generating: Vault Available Again');
  const availableAgainSupply = BigInt('700000000000000000000');
  writeOutput(
    '--- VAULT AVAILABLE AGAIN ---\n\n' +
      generateVaultAvailableMessage(availableVault, availableAgainSupply)
  );

  // Test 7: Live Vaults List (with sample data)
  console.log('7. Generating: Live Vaults List (sample)');
  const sampleVaults: Array<VaultState & { utilization: number }> = [
    { ...createSampleVault({ name: 'Boros AMM - BTC Vault' }), utilization: 45.5 },
    {
      ...createSampleVault({
        name: 'Boros AMM - ETH Vault',
        depositTokenSymbol: 'ETH',
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
      }),
      utilization: 72.3,
    },
    {
      ...createSampleVault({
        name: 'Boros AMM - USDT Vault',
        depositTokenSymbol: 'USDT',
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
      }),
      utilization: 15.8,
    },
  ];
  writeOutput('--- LIVE VAULTS LIST (SAMPLE) ---\n\n' + generateLiveVaultsList(sampleVaults));

  // Test 8: Live Vaults from actual state (if available)
  if (realVaults.length > 0) {
    console.log('8. Generating: Live Vaults List (from state)');
    const realVaultsWithUtilization = realVaults.slice(0, 5).map((v) => {
      const utilization =
        v.totalSupplyCap > 0n
          ? Number((v.lastKnownTotalSupply * 10000n) / v.totalSupplyCap) / 100
          : 0;
      return { ...v, utilization };
    });
    writeOutput(
      '--- LIVE VAULTS LIST (FROM STATE) ---\n\n' + generateLiveVaultsList(realVaultsWithUtilization)
    );

    // Test 9: Real vault notifications
    console.log('9. Generating: Real vault notification examples');
    const realVault = realVaults[0];
    writeOutput('--- REAL VAULT: NEW VAULT ---\n\n' + generateNewVaultMessage(realVault, realVault.isFilled));
  }

  // Test 10: Empty Live Vaults
  console.log('10. Generating: Empty Live Vaults');
  writeOutput('--- EMPTY LIVE VAULTS ---\n\n' + generateLiveVaultsList([]));

  console.log('\n✅ All notifications written to:');
  console.log(`   ${OUTPUT_FILE}\n`);

  // Print summary
  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`📊 Output file size: ${(stats.size / 1024).toFixed(2)} KB`);
}

main()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
