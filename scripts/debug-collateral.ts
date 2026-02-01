import { ethers } from 'ethers';
import { config } from 'dotenv';

config();

const RPC_URL = process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc';
const MARKET_HUB_ADDRESS = '0x1080808080f145b14228443212e62447C112ADaD';

// Minimal ABIs
const AMMABI = [
  'function MARKET() external view returns (address)',
  'function name() external view returns (string)',
];

const MarketABI = [
  'function descriptor() external view returns (bool isIsolatedOnly, uint16 tokenId, uint24 marketId, uint32 maturity, uint8 tickStep, uint16 iTickThresh, uint32 latestFTime)',
  'function symbol() external view returns (string)',
];

const MarketHubABI = [
  'function tokenIdToAddress(uint16 tokenId) external view returns (address)',
  'function tokenData(uint16 tokenId) external view returns (address token, uint96 scalingFactor)',
];

const ERC20ABI = [
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function decimals() external view returns (uint8)',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const marketHub = new ethers.Contract(MARKET_HUB_ADDRESS, MarketHubABI, provider);

  // Test with a known vault address
  const testVaults = [
    '0x0d8C99Cc1473d71E608243C8cA7C2750bD47Bd2D', // Binance BTCUSDT
    '0xb22717c8C26dD9b038150f9Ba81844962C908Ef6', // Binance ETHUSDT
    '0x4E429788F15ceE9Bcf6ac19E99B2299c74Ac8Fe6', // Binance BTCUSDT Feb
  ];

  for (const vaultAddress of testVaults) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Vault: ${vaultAddress}`);
    console.log('='.repeat(60));

    try {
      const ammContract = new ethers.Contract(vaultAddress, AMMABI, provider);
      const name = await ammContract.name();
      const marketAddress = await ammContract.MARKET();

      console.log(`Name: ${name}`);
      console.log(`Market Address: ${marketAddress}`);

      const marketContract = new ethers.Contract(marketAddress, MarketABI, provider);

      // Get the descriptor
      const descriptor = await marketContract.descriptor();
      console.log('\nDescriptor raw:', descriptor);
      console.log(`  isIsolatedOnly: ${descriptor[0]}`);
      console.log(`  tokenId: ${descriptor[1]} (type: ${typeof descriptor[1]})`);
      console.log(`  marketId: ${descriptor[2]}`);
      console.log(`  maturity: ${descriptor[3]}`);

      // Try to get token address from marketHub
      const tokenId = descriptor[1];
      console.log(`\nUsing tokenId: ${tokenId}`);

      try {
        const tokenAddress = await marketHub.tokenIdToAddress(tokenId);
        console.log(`Token Address: ${tokenAddress}`);

        if (tokenAddress && tokenAddress !== ethers.ZeroAddress) {
          const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, provider);
          const symbol = await tokenContract.symbol();
          const tokenName = await tokenContract.name();
          const decimals = await tokenContract.decimals();
          console.log(`Token Symbol: ${symbol}`);
          console.log(`Token Name: ${tokenName}`);
          console.log(`Token Decimals: ${decimals}`);
        } else {
          console.log('Token address is zero!');
        }
      } catch (e: any) {
        console.log(`Error getting token from MarketHub: ${e.message}`);

        // Try tokenData instead
        try {
          console.log('\nTrying tokenData() instead...');
          const tokenData = await marketHub.tokenData(tokenId);
          console.log('Token Data:', tokenData);
        } catch (e2: any) {
          console.log(`tokenData also failed: ${e2.message}`);
        }
      }
    } catch (e: any) {
      console.error(`Error processing vault: ${e.message}`);
    }
  }
}

main().catch(console.error);
