import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import AMMFactoryABI from '../src/abis/IAMMFactory.json';

// Load environment variables
dotenv.config();

/**
 * Simple script to query events from a contract
 * 
 * Usage:
 *   npx ts-node scripts/query-events.ts
 */

async function main() {
  // Setup provider (connect to blockchain)
  const rpcUrl = process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  console.log('🔗 Connected to:', rpcUrl);
  
  // Get current block
  const currentBlock = await provider.getBlockNumber();
  console.log('📦 Current block:', currentBlock);
  
  // Contract address (AMM Factory in this example)
  const contractAddress = process.env.AMM_FACTORY_ADDRESS || '0x3205e972714B52512c837AE6f5FCFDeB07f0f23C';
  console.log('📄 Contract address:', contractAddress);
  
  // Check if this is a proxy and get the implementation address
  console.log('\n🔍 Checking if contract is a proxy...');
  try {
    // Standard proxy storage slot for implementation address
    // ERC1967: implementation slot = keccak256("eip1967.proxy.implementation") - 1
    const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    const implementationAddress = await provider.getStorage(contractAddress, implementationSlot);
    if (implementationAddress && implementationAddress !== ethers.ZeroHash) {
      const implAddr = '0x' + implementationAddress.slice(-40);
      console.log(`  ✅ Found implementation address: ${implAddr}`);
      console.log(`  Note: Events are emitted from proxy address, but ABI should match implementation`);
    }
  } catch (error) {
    console.log(`  Could not check proxy status: ${(error as Error).message}`);
  }
  
  // Use the actual ABI from the JSON file
  const abi = AMMFactoryABI;
  
  // Create contract instance
  const contract = new ethers.Contract(contractAddress, abi, provider);
  
  // Also try querying the raw log and see if we can decode it differently
  console.log('\n💡 Tip: If events still don\'t parse, the ABI might need to be updated.');
  console.log('   You can get the correct ABI from Arbiscan by:');
  console.log('   1. Go to https://arbiscan.io/address/' + contractAddress);
  console.log('   2. Click "Contract" tab');
  console.log('   3. If verified, download the ABI');
  console.log('   4. Or check the "Events" tab to see the actual event signatures');
  
  // Define block range (last 1000 blocks as example)
  const fromBlock = 413548049;
  const toBlock = 413548049;
  
  // First, let's check the transaction directly
  const txHash = '0x5a684325a96a11c7b47eb0239485d3c1d405edabca3898ecc040d504810334c5';
  console.log('\n🔍 Method 0: Inspect transaction directly');
  console.log('=' .repeat(50));
  console.log(`Transaction: ${txHash}`);
  
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      console.log('❌ Transaction receipt not found');
    } else {
      console.log(`✅ Transaction found in block ${receipt.blockNumber}`);
      console.log(`   Logs: ${receipt.logs.length}`);
      console.log(`   Contract: ${receipt.to}`);
      
      // Check if transaction is to our contract
      if (receipt.to?.toLowerCase() === contractAddress.toLowerCase()) {
        console.log('✅ Transaction is to AMM Factory contract');
      } else {
        console.log(`⚠️  Transaction is to different contract: ${receipt.to}`);
        console.log(`   Expected: ${contractAddress}`);
      }
      
      // Calculate expected event signature from the ABI
      // The correct way: use ethers.js Interface to get the event fragment and its signature
      const eventFragment = contract.interface.getEvent("AMMCreated");
      const expectedSigFromABI = eventFragment ? eventFragment.topicHash : null;
      
      // Try different signature formats
      // For events, the signature includes ALL parameters (indexed or not) in the signature hash
      // But indexed parameters go into topics[1+], non-indexed go into data
      const manualSig1 = ethers.id("AMMCreated(tuple,tuple)");
      const manualSig2 = ethers.id("AMMCreated((bytes16,string,string,address,address,uint32,uint64,uint256,bytes26,address),(uint256,uint256,uint256,uint256,int256,uint256,uint256))");
      const manualSig3 = ethers.id("AMMCreated(address,bool,tuple,tuple)");
      const manualSig4 = ethers.id("AMMCreated(address,bool,(bytes16,string,string,address,address,uint32,uint64,uint256,bytes26,address),(uint256,uint256,uint256,uint256,int256,uint256,uint256))");
      
      // User's suggestion: with parameter names
      const userSig = ethers.id("AMMCreated(address amm, bool isPositive, tuple createParams, tuple seedParams)");
      
      // The actual signature from the log
      const actualSig = receipt.logs[6].topics[0]; // Log 7 is index 6
      console.log(`\n🔍 Event Signature Analysis:`);
      console.log(`  Actual signature (from blockchain): ${actualSig}`);
      console.log(`  Expected from ABI (via Interface): ${expectedSigFromABI || 'null'}`);
      console.log(`  Manual calc (address,bool,tuple,tuple): ${manualSig1}`);
      console.log(`  Manual calc (address,bool,full tuple): ${manualSig2}`);
      console.log(`  User's suggestion (with param names): ${userSig}`);
      
      if (expectedSigFromABI) {
        if (actualSig === expectedSigFromABI) {
          console.log(`  ✅ ABI signature matches!`);
        } else {
          console.log(`  ❌ ABI signature doesn't match - ABI might be wrong`);
          console.log(`     The ABI says amm/isPositive are indexed, but the log has only 1 topic!`);
          console.log(`     This means they're actually NOT indexed in the deployed contract.`);
        }
      }
      
      // Check all manual calculations
      if (actualSig === manualSig1) {
        console.log(`  🎉 MATCH! Format: AMMCreated(address,bool,tuple,tuple)`);
      } else if (actualSig === manualSig2) {
        console.log(`  🎉 MATCH! Format: AMMCreated(address,bool,(full tuple),(full tuple))`);
      } else if (actualSig === userSig) {
        console.log(`  🎉 MATCH! User's suggestion works!`);
      } else {
        console.log(`  ❌ None of the calculated signatures match`);
        console.log(`  The actual signature is: ${actualSig}`);
        console.log(`  This suggests the tuple encoding might be different.`);
        console.log(`  You may need to check Arbiscan or the actual deployed contract ABI.`);
      }
      
      // Try to parse all logs
      console.log('\n📋 All logs in transaction:');
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        console.log(`\nLog ${i + 1}:`);
        console.log(`  Address: ${log.address}`);
        console.log(`  Topics: ${log.topics.length}`);
        if (log.topics.length > 0) {
          console.log(`  Topic[0]: ${log.topics[0]}`);
        }
        console.log(`  Data length: ${log.data.length} bytes`);
        
        // Check if this log is from AMM Factory
        const isFromFactory = log.address.toLowerCase() === contractAddress.toLowerCase();
        if (isFromFactory) {
          console.log(`  🎯 THIS IS FROM AMM FACTORY!`);
          if (log.topics.length > 0) {
            const actualSig = log.topics[0];
            console.log(`  Actual sig: ${actualSig}`);
            const eventFragment = contract.interface.getEvent("AMMCreated");
            if (eventFragment) {
              const expectedSig = eventFragment.topicHash;
              console.log(`  Expected sig (from ABI): ${expectedSig}`);
              if (actualSig === expectedSig) {
                console.log(`  ✅ Signature matches!`);
              } else {
                console.log(`  ⚠️  Signature doesn't match - ABI might be incorrect`);
              }
            }
          }
        }
        
        // Try multiple parsing methods
        let parsed: any = null;
        
        // Method 1: parseLog (standard method)
        try {
          parsed = contract.interface.parseLog(log);
          if (parsed) {
            console.log(`  ✅ Parsed with parseLog: ${parsed.name}`);
          }
        } catch (e1) {
          // Method 2: decodeEventLog (for events with no indexed params)
          try {
            parsed = contract.interface.decodeEventLog("AMMCreated", log.data, log.topics);
            if (parsed) {
              console.log(`  ✅ Parsed with decodeEventLog!`);
            }
          } catch (e2) {
            // Method 3: Try to get the event fragment and decode manually
            try {
              const eventFragment = contract.interface.getEvent("AMMCreated");
              if (eventFragment) {
                console.log(`  Event fragment found: ${eventFragment.name}`);
                console.log(`  Inputs:`, eventFragment.inputs.map((i: any) => `${i.name}:${i.type}${i.indexed ? '(indexed)' : ''}`));
                
                // Try decodeEventLog with the fragment
                parsed = contract.interface.decodeEventLog(eventFragment, log.data, log.topics);
                if (parsed) {
                  console.log(`  ✅ Parsed with event fragment!`);
                }
              }
            } catch (e3) {
              console.log(`  ❌ All parsing methods failed`);
              console.log(`     parseLog error: ${(e1 as Error).message}`);
              console.log(`     decodeEventLog error: ${(e2 as Error).message}`);
              console.log(`     fragment decode error: ${(e3 as Error).message}`);
              
              // The ABI might be wrong - let's try to manually extract the AMM address
              // For events with no indexed params, all data is in the data field
              // The first parameter (address amm) should be the first 32 bytes after the event signature
              if (isFromFactory && log.data.length >= 66) {
                console.log(`  🔧 Attempting manual extraction...`);
                // Event data structure for non-indexed events:
                // - topic[0] = event signature hash
                // - data = encoded parameters (ABI-encoded)
                // First parameter (address) is at offset 0, padded to 32 bytes
                // So: positions 2-66 (first 32 bytes after 0x) contain the address
                const ammAddress = '0x' + log.data.slice(26, 66); // Last 20 bytes of first 32-byte word = address
                console.log(`     ✅ Extracted AMM address: ${ammAddress}`);
                
                // Second parameter (bool isPositive) should be at offset 32 (positions 66-130)
                if (log.data.length >= 130) {
                  const isPositiveHex = log.data.slice(126, 130); // Last 4 chars of second 32-byte word
                  const isPositive = isPositiveHex !== '0000';
                  console.log(`     ✅ Extracted isPositive: ${isPositive}`);
                }
                
                console.log(`\n  💡 Summary:`);
                console.log(`     AMM Address: ${ammAddress}`);
                console.log(`     Transaction: ${log.transactionHash}`);
                console.log(`     Block: ${receipt.blockNumber}`);
                console.log(`\n  ⚠️  Note: The ABI doesn't match the actual event signature.`);
                console.log(`     The event signature is: ${log.topics[0]}`);
                console.log(`     But our ABI expects a different signature.`);
                console.log(`     You may need to update the ABI or use manual decoding.`);
              }
            }
          }
        }
        
        if (parsed) {
          if (parsed.name === 'AMMCreated' || parsed[0]) {
            console.log(`  🎉 SUCCESS! Found AMMCreated event!`);
            // Handle both parseLog format (parsed.args) and decodeEventLog format (parsed array)
            const args = parsed.args || parsed;
            console.log(`     AMM Address: ${args[0] || args.amm}`);
            console.log(`     Is Positive: ${args[1] || args.isPositive}`);
            if (args[2] || args.createParams) {
              console.log(`     CreateParams available`);
            }
          } else {
            console.log(`  Parsed result:`, parsed);
          }
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Error getting transaction:', error.message);
  }
  
  // Method 1: Query all events (no filter)
  console.log('\n📊 Method 1: Query all AMMCreated events');
  console.log('=' .repeat(50));
  console.log(`Scanning blocks ${fromBlock} to ${toBlock}...`);
  console.log(`Contract address: ${contractAddress}`);
  
  let events: ethers.Log[] = [];
  
  try {
    const startTime = Date.now();
    
    // Create filter for the event
    const filter = contract.filters.AMMCreated();
    console.log('Filter:', filter);
    
    // Also try querying all logs from the block
    console.log('\n🔍 Method 1b: Query all logs from block (raw)');
    const blockLogs = await provider.getLogs({
      address: contractAddress,
      fromBlock: fromBlock,
      toBlock: toBlock,
    });
    console.log(`Found ${blockLogs.length} raw logs from contract in block ${fromBlock}`);
    
    // Query events
    events = await contract.queryFilter(filter, fromBlock, toBlock);
    
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ Query completed in ${queryTime}ms`);
    console.log(`📋 Found ${events.length} events via queryFilter\n`);
    
    // Display events
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      if (event instanceof ethers.EventLog) {
        console.log(`Event ${i + 1}:`);
        console.log(`  Block: ${event.blockNumber}`);
        console.log(`  Transaction: ${event.transactionHash}`);
        console.log(`  AMM Address: ${event.args[0]}`);
        console.log(`  Is Positive: ${event.args[1]}`);
        console.log('');
      }
    }
    
    if (events.length === 0) {
      console.log('ℹ️  No events found in this block range.');
      console.log('   Try increasing the block range or checking a different time period.');
    }
    
  } catch (error: any) {
    console.error('❌ Error querying events:');
    console.error('  Message:', error.message);
    console.error('  Code:', error.code);
    console.error('  Reason:', error.reason);
  }
  
  // Method 2: Query with specific filter (e.g., only positive AMMs)
  console.log('\n📊 Method 2: Query filtered events (example: only positive AMMs)');
  console.log('=' .repeat(50));
  
  try {
    // Filter for only positive AMMs (isPositive = true)
    const positiveFilter = contract.filters.AMMCreated(null, true);
    const positiveEvents = await contract.queryFilter(positiveFilter, fromBlock, toBlock);
    
    console.log(`Found ${positiveEvents.length} positive AMM events`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
  
  // Method 3: Get events by transaction hash (if you have one)
  console.log('\n📊 Method 3: Get event from transaction');
  console.log('=' .repeat(50));
  
  // Example: Get receipt and parse events
  if (events.length > 0 && events[0] instanceof ethers.EventLog) {
    const txHash = events[0].transactionHash;
    console.log(`Getting receipt for transaction: ${txHash}`);
    
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (receipt) {
        console.log(`Transaction had ${receipt.logs.length} logs`);
        
        // Parse logs to find our event
        for (const log of receipt.logs) {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed) {
              console.log(`Found event: ${parsed.name}`);
              console.log(`  Args:`, parsed.args);
            }
          } catch {
            // Not our event, skip
          }
        }
      } else {
        console.log('Receipt not found (transaction may be pending)');
      }
    } catch (error: any) {
      console.error('Error getting receipt:', error.message);
    }
  } else {
    console.log('No events found to demonstrate Method 3');
  }
}

// Run the script
main()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

