import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import RouterABI from '../src/abis/IRouter.json';

// Load environment variables
dotenv.config();

/**
 * Script to query AddLiquidityDualToAmm and AddLiquiditySingleCashToAmm events for a user
 * 
 * Usage:
 *   npx ts-node scripts/query-liquidity-events.ts <userAddress> [fromBlock] [toBlock]
 * 
 * Examples:
 *   npx ts-node scripts/query-liquidity-events.ts 0xYourWalletAddressHere
 *   npx ts-node scripts/query-liquidity-events.ts 0xYourWalletAddressHere 400000000 416000000
 */

// Router contract address
const ROUTER_ADDRESS = '0x8080808080daB95eFED788a9214e400ba552DEf6';

// Helper function to create MarketAcc from address
// MarketAcc format: address(160 bits) | accountId(8 bits) | tokenId(16 bits) | marketId(24 bits)
// For main account with cross market: accountId=0, marketId=0xFFFFFF
function createMarketAccFromAddress(address: string, accountId: number = 0, tokenId: number = 0, marketId: number = 0xFFFFFF): string {
  // Convert address to bytes20 (160 bits)
  const addrBytes = ethers.getBytes(address);
  
  // Pack: address(160) | accountId(8) | tokenId(16) | marketId(24) = 208 bits = 26 bytes
  // For cross market queries, we typically use marketId = 0xFFFFFF
  // But we can also search for all markets by not filtering on marketId
  
  // Create packed bytes26
  const packed = new Uint8Array(26);
  
  // Address (20 bytes)
  packed.set(addrBytes, 0);
  
  // AccountId (1 byte) at position 20
  packed[20] = accountId;
  
  // TokenId (2 bytes) at positions 21-22
  packed[21] = (tokenId >> 8) & 0xFF;
  packed[22] = tokenId & 0xFF;
  
  // MarketId (3 bytes) at positions 23-25
  packed[23] = (marketId >> 16) & 0xFF;
  packed[24] = (marketId >> 8) & 0xFF;
  packed[25] = marketId & 0xFF;
  
  return ethers.hexlify(packed);
}

// Helper to extract address from MarketAcc
function extractAddressFromMarketAcc(marketAcc: string): string {
  // MarketAcc is 26 bytes, address is first 20 bytes
  const bytes = ethers.getBytes(marketAcc);
  return ethers.getAddress(ethers.hexlify(bytes.slice(0, 20)));
}

// Helper to format bigint values (handles negative values for int256)
function formatBigInt(value: bigint, decimals: number = 18): string {
  const isNegative = value < 0n;
  const absValue = value < 0n ? -value : value;
  const divisor = BigInt(10 ** decimals);
  const whole = absValue / divisor;
  const fraction = absValue % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0');
  const sign = isNegative ? '-' : '';
  return `${sign}${whole.toString()}.${fractionStr.slice(0, 6)}`;
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Error: User address is required');
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/query-liquidity-events.ts <userAddress> [fromBlock] [toBlock]');
    console.log('\nExamples:');
    console.log('  npx ts-node scripts/query-liquidity-events.ts 0xYourWalletAddressHere');
    console.log('  npx ts-node scripts/query-liquidity-events.ts 0xYourWalletAddressHere 400000000 416000000');
    process.exit(1);
  }
  
  const userAddress = args[0];
  if (!ethers.isAddress(userAddress)) {
    console.error(`❌ Error: Invalid address: ${userAddress}`);
    process.exit(1);
  }
  
  // Setup provider
  const rpcUrl = process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  console.log('🔗 Connected to:', rpcUrl);
  
  // Get current block if toBlock not specified
  const currentBlock = await provider.getBlockNumber();
  console.log('📦 Current block:', currentBlock);
  
  // Parse block range
  const fromBlock = args[1] ? parseInt(args[1]) : Math.max(0, currentBlock - 100000); // Default: last 100k blocks
  const toBlock = args[2] ? parseInt(args[2]) : currentBlock;
  
  console.log(`📊 Scanning blocks ${fromBlock} to ${toBlock} (${(toBlock - fromBlock).toLocaleString()} blocks)`);
  console.log(`👤 User address: ${userAddress}`);
  console.log(`📄 Router contract: ${ROUTER_ADDRESS}\n`);
  
  // Create contract instance
  const router = new ethers.Contract(ROUTER_ADDRESS, RouterABI, provider);
  
  // Query all events (we'll filter by user address in code since MarketAcc includes tokenId/marketId)
  // Note: We query without user filter first, then filter results by extracting address from MarketAcc
  console.log('🔍 Querying all AddLiquidityDualToAmm events...');
  const allDualEvents = await router.queryFilter(router.filters.AddLiquidityDualToAmm(), fromBlock, toBlock);
  
  console.log('🔍 Querying all AddLiquiditySingleCashToAmm events...');
  const allSingleEvents = await router.queryFilter(router.filters.AddLiquiditySingleCashToAmm(), fromBlock, toBlock);
  
  // Filter events by user address
  const dualEvents = allDualEvents.filter((event) => {
    if (event instanceof ethers.EventLog) {
      const eventUser = extractAddressFromMarketAcc(event.args.user);
      return eventUser.toLowerCase() === userAddress.toLowerCase();
    }
    return false;
  });
  
  const singleEvents = allSingleEvents.filter((event) => {
    if (event instanceof ethers.EventLog) {
      const eventUser = extractAddressFromMarketAcc(event.args.user);
      return eventUser.toLowerCase() === userAddress.toLowerCase();
    }
    return false;
  });
  
  console.log(`   Found ${allDualEvents.length} total dual events, ${dualEvents.length} for user`);
  console.log(`   Found ${allSingleEvents.length} total single events, ${singleEvents.length} for user\n`);
  
  console.log(`\n✅ Found ${dualEvents.length} AddLiquidityDualToAmm events`);
  console.log(`✅ Found ${singleEvents.length} AddLiquiditySingleCashToAmm events\n`);
  
  // Display results
  if (dualEvents.length > 0) {
    console.log('='.repeat(80));
    console.log('📊 AddLiquidityDualToAmm Events');
    console.log('='.repeat(80));
    
    for (let i = 0; i < dualEvents.length; i++) {
      const event = dualEvents[i];
      if (event instanceof ethers.EventLog) {
        const args = event.args;
        const eventUser = extractAddressFromMarketAcc(args.user);
        
        console.log(`\nEvent ${i + 1}:`);
        console.log(`  Block: ${event.blockNumber}`);
        console.log(`  Transaction: https://arbiscan.io/tx/${event.transactionHash}`);
        console.log(`  User: ${eventUser}`);
        console.log(`  AMM ID: ${args.ammId}`);
        console.log(`  Exact Size In: ${formatBigInt(BigInt(args.exactSizeIn.toString()))}`);
        console.log(`  Net LP Out: ${formatBigInt(BigInt(args.netLpOut.toString()))}`);
        console.log(`  Net Cash In: ${formatBigInt(BigInt(args.netCashIn.toString()))}`);
        console.log(`  Net OTC Fee: ${formatBigInt(BigInt(args.netOtcFee.toString()))}`);
      }
    }
  }
  
  if (singleEvents.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 AddLiquiditySingleCashToAmm Events');
    console.log('='.repeat(80));
    
    for (let i = 0; i < singleEvents.length; i++) {
      const event = singleEvents[i];
      if (event instanceof ethers.EventLog) {
        const args = event.args;
        const eventUser = extractAddressFromMarketAcc(args.user);
        
        console.log(`\nEvent ${i + 1}:`);
        console.log(`  Block: ${event.blockNumber}`);
        console.log(`  Transaction: https://arbiscan.io/tx/${event.transactionHash}`);
        console.log(`  User: ${eventUser}`);
        console.log(`  AMM ID: ${args.ammId}`);
        console.log(`  Net LP Out: ${formatBigInt(BigInt(args.netLpOut.toString()))}`);
        console.log(`  Net Cash In: ${formatBigInt(BigInt(args.netCashIn.toString()))}`);
        console.log(`  Total Taker OTC Fee: ${formatBigInt(BigInt(args.totalTakerOtcFee.toString()))}`);
        console.log(`  Swap Size Intermediate: ${formatBigInt(BigInt(args.swapSizeInterm.toString()))}`);
      }
    }
  }
  
  if (dualEvents.length === 0 && singleEvents.length === 0) {
    console.log('ℹ️  No liquidity events found for this user in the specified block range.');
    console.log('   Try:');
    console.log('   - Expanding the block range');
    console.log('   - Checking if the address is correct');
    console.log('   - Verifying the user has added liquidity to AMMs');
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📈 Summary');
  console.log('='.repeat(80));
  console.log(`Total Dual Liquidity Events: ${dualEvents.length}`);
  console.log(`Total Single Cash Liquidity Events: ${singleEvents.length}`);
  console.log(`Total Events: ${dualEvents.length + singleEvents.length}`);
}

// Run the script
main()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

