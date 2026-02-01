import { ethers } from 'ethers';
import { config } from 'dotenv';

config();

const RPC_URL = process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc';
const MARKET_HUB_ADDRESS = '0x1080808080f145b14228443212e62447C112ADaD';

// Extended ABIs
const AMMABI = [
  'function MARKET() external view returns (address)',
  'function SELF_ACC() external view returns (bytes26)',
  'function name() external view returns (string)',
  'function totalSupply() external view returns (uint256)',
  'function totalSupplyCap() external view returns (uint256)',
  'function readState() external view returns (tuple(uint256 totalFloatAmount, uint256 normFixedAmount, uint256 totalLp, uint256 latestFTime, uint256 maturity, uint256 seedTime, uint256 minAbsRate, uint256 maxAbsRate, uint256 cutOffTimestamp))',
];

const MarketABI = [
  'function descriptor() external view returns (bool isIsolatedOnly, uint16 tokenId, uint24 marketId, uint32 maturity, uint8 tickStep, uint16 iTickThresh, uint32 latestFTime)',
  'function getLatestFTime() external view returns (uint32)',
];

const MarketHubABI = [
  'function tokenIdToAddress(uint16 tokenId) external view returns (address)',
  'function accCash(bytes26 user) external view returns (int256)',
];

const ERC20ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const marketHub = new ethers.Contract(MARKET_HUB_ADDRESS, MarketHubABI, provider);

  // Test with USDT vaults (USD₮0)
  const testVaults = [
    '0x44941440238423E15329CB2f2d90272421083E5e', // Hyperliquid ETH - USDT - Oct 2025 (expired)
    '0xBc659E10630FB1a09F89cA08c4662164fE7f3938', // OKX HYPEUSDT 27 Feb 2026 (live, available)
    '0xD32D8570a182b2f554af7766395bA8362113b53D', // Hyperliquid HYPE 27 Feb 2026 (live, available)
  ];

  for (const vaultAddress of testVaults) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Vault: ${vaultAddress}`);
    console.log('='.repeat(70));

    try {
      const ammContract = new ethers.Contract(vaultAddress, AMMABI, provider);

      const [name, totalSupply, totalSupplyCap, selfAcc, marketAddress] = await Promise.all([
        ammContract.name(),
        ammContract.totalSupply(),
        ammContract.totalSupplyCap(),
        ammContract.SELF_ACC(),
        ammContract.MARKET(),
      ]);

      console.log(`Name: ${name}`);
      console.log(`Total Supply: ${totalSupply}`);
      console.log(`Total Supply Cap: ${totalSupplyCap}`);
      console.log(`Available LP capacity: ${totalSupplyCap - totalSupply}`);
      console.log(`Self Account: ${selfAcc}`);
      console.log(`Market Address: ${marketAddress}`);

      // Get AMM state
      const state = await ammContract.readState();
      console.log('\nAMM State:');
      console.log(`  totalFloatAmount: ${state.totalFloatAmount}`);
      console.log(`  normFixedAmount: ${state.normFixedAmount}`);
      console.log(`  totalLp: ${state.totalLp}`);
      console.log(`  latestFTime: ${state.latestFTime}`);
      console.log(`  maturity: ${state.maturity}`);

      // Check if expired
      const isExpired = state.latestFTime >= state.maturity;
      console.log(`  isExpired: ${isExpired}`);

      // Get AMM's cash from MarketHub
      const ammCash = await marketHub.accCash(selfAcc);
      console.log(`\nAMM Cash (from MarketHub): ${ammCash}`);

      // Get token info
      const marketContract = new ethers.Contract(marketAddress, MarketABI, provider);
      const descriptor = await marketContract.descriptor();
      const tokenId = descriptor[1];
      const tokenAddress = await marketHub.tokenIdToAddress(tokenId);
      const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, provider);
      const [symbol, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
      ]);

      console.log(`\nCollateral Token: ${symbol} (${decimals} decimals)`);
      console.log(`Token Address: ${tokenAddress}`);

      // Calculate LP Price
      // LP Price = ammCash / totalLp (when totalLp > 0)
      const totalSupplyBN = BigInt(totalSupply.toString());
      const totalSupplyCapBN = BigInt(totalSupplyCap.toString());
      const ammCashBN = BigInt(ammCash.toString());

      if (totalSupplyBN > 0n && ammCashBN > 0n) {
        // LP price in raw units (scaled by 1e18)
        const lpPriceRaw = (ammCashBN * BigInt(1e18)) / totalSupplyBN;

        // Format for display
        const lpPriceFormatted = Number(lpPriceRaw) / 1e18;
        console.log(`\nLP Price (raw): ${lpPriceRaw}`);
        console.log(`LP Price (formatted): ${lpPriceFormatted}`);

        // Calculate available deposit amount
        const availableLpCapacity = totalSupplyCapBN - totalSupplyBN;
        if (availableLpCapacity > 0n) {
          // Available deposit = availableLpCapacity * lpPrice
          const availableDepositRaw = (availableLpCapacity * lpPriceRaw) / BigInt(1e18);

          // Format based on token decimals
          const divisor = 10 ** Number(decimals);
          const availableDepositFormatted = Number(availableDepositRaw) / divisor;

          console.log(`\n📊 DEPOSIT CALCULATION:`);
          console.log(`  Available LP capacity: ${availableLpCapacity}`);
          console.log(`  LP Price: ${lpPriceFormatted}`);
          console.log(`  Available deposit (raw): ${availableDepositRaw}`);
          console.log(`  Available deposit (${symbol}): ${availableDepositFormatted.toFixed(2)}`);
        } else {
          console.log(`\n⚠️ Vault is FULL - no deposit capacity available`);
        }
      } else {
        console.log(`\n⚠️ Cannot calculate LP price (totalSupply: ${totalSupply}, ammCash: ${ammCash})`);
      }
    } catch (e: any) {
      console.error(`Error processing vault: ${e.message}`);
    }
  }
}

main().catch(console.error);
