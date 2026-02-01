import { ethers } from 'ethers';
import { CONFIG } from './config';
import { StateManager } from './stateManager';
import AMMABI from './abis/IAMM.json';
import MarketHubABI from './abis/IMarketHub.json';

async function testDepositCalculation() {
  const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
  const marketHub = new ethers.Contract(CONFIG.MARKET_HUB_ADDRESS, MarketHubABI, provider);
  const stateManager = new StateManager();

  // Get vaults to test
  const vaults = stateManager.getAllVaults();
  const testVaults = vaults.filter(v => v.selfAcc && v.depositTokenDecimals);

  // Test one vault per token type
  const testedTokens = new Set<string>();

  for (const testVault of testVaults) {
    if (testedTokens.has(testVault.depositTokenSymbol!)) continue;
    testedTokens.add(testVault.depositTokenSymbol!);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing vault: ${testVault.name}`);
    console.log(`Token: ${testVault.depositTokenSymbol} (${testVault.depositTokenDecimals} decimals)`);
    console.log(`selfAcc: ${testVault.selfAcc}`);

    const ammContract = new ethers.Contract(testVault.address, AMMABI, provider);

    try {
      const [totalSupply, totalSupplyCap, ammCash] = await Promise.all([
        ammContract.totalSupply(),
        ammContract.totalSupplyCap(),
        marketHub.accCash(testVault.selfAcc),
      ]);

      console.log('\nRaw values:');
      console.log(`  totalSupply: ${totalSupply.toString()}`);
      console.log(`  totalSupplyCap: ${totalSupplyCap.toString()}`);
      console.log(`  ammCash: ${ammCash.toString()}`);

      const DECIMALS_18 = 18;

      // Convert to human-readable
      const totalSupplyFloat = Number(totalSupply) / (10 ** DECIMALS_18);
      const totalSupplyCapFloat = Number(totalSupplyCap) / (10 ** DECIMALS_18);
      const ammCashFloat = Number(ammCash) / (10 ** DECIMALS_18);

      console.log('\nHuman-readable values:');
      console.log(`  totalSupply: ${totalSupplyFloat.toFixed(6)} LP`);
      console.log(`  totalSupplyCap: ${totalSupplyCapFloat.toFixed(6)} LP`);
      console.log(`  ammCash: ${ammCashFloat.toFixed(6)} ${testVault.depositTokenSymbol}`);

      // LP price = tokens per LP
      const lpPrice = ammCashFloat / totalSupplyFloat;
      console.log(`\nLP Price: ${lpPrice.toFixed(6)} ${testVault.depositTokenSymbol}/LP`);

      // Available LP capacity
      const availableLpCapacity = totalSupplyCapFloat - totalSupplyFloat;
      console.log(`Available LP Capacity: ${availableLpCapacity.toFixed(6)} LP`);

      // Available deposit = available LP * LP price
      const availableDeposit = availableLpCapacity * lpPrice;
      console.log(`Available Deposit: ${availableDeposit.toFixed(2)} ${testVault.depositTokenSymbol}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  }
}

testDepositCalculation().catch(console.error);
