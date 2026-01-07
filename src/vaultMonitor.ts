import { ethers } from 'ethers';
import { CONFIG } from './config';
import { StateManager } from './stateManager';
import { TelegramNotifier } from './telegramBot';
import { VaultState } from './types';
import AMMFactoryABI from './abis/IAMMFactory.json';
import AMMABI from './abis/IAMM.json';
import MarketABI from './abis/IMarket.json';
import MarketHubABI from './abis/IMarketHub.json';
import ERC20ABI from './abis/IERC20.json';
import TelegramBot from 'node-telegram-bot-api';

export class VaultMonitor {
  private provider: ethers.JsonRpcProvider;
  private ammFactory: ethers.Contract;
  private marketHub: ethers.Contract;
  private stateManager: StateManager;
  private notifier: TelegramNotifier;
  private isRunning: boolean = false;
  
  // Cache for live vaults message
  private cachedLiveVaultsMessage: string | null = null;
  private cachedLiveVaultsTimestamp: number = 0;
  private readonly LIVE_VAULTS_CACHE_TTL_MS = 30000; // 30 seconds
  
  // Periodic status check tracking
  private lastStatusCheckBlock: number = 0;
  private readonly STATUS_CHECK_INTERVAL_BLOCKS = 120; 

  constructor() {
    this.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    this.ammFactory = new ethers.Contract(
      CONFIG.AMM_FACTORY_ADDRESS,
      AMMFactoryABI,
      this.provider
    );
    this.marketHub = new ethers.Contract(
      CONFIG.MARKET_HUB_ADDRESS,
      MarketHubABI,
      this.provider
    );
    this.stateManager = new StateManager();
    this.notifier = new TelegramNotifier();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.notifier.registerCommand('liveVaults', async (msg) => {
      await this.handleLiveVaultsCommand(msg);
    });
  }

  /**
   * Determines if a vault is considered filled based on utilization threshold
   * @param currentSupply Current total supply of LP tokens
   * @param totalSupplyCap Maximum allowed total supply (cap)
   * @returns true if utilization >= threshold (default 98%)
   */
  private isVaultFilled(currentSupply: bigint, totalSupplyCap: bigint): boolean {
    if (totalSupplyCap === 0n) {
      return false; // Can't be filled if cap is zero
    }
    
    // Calculate utilization: (currentSupply / totalSupplyCap) * 100
    // Use basis points (10000 = 100%) for precision
    const utilizationBasisPoints = (currentSupply * 10000n) / totalSupplyCap;
    const thresholdBasisPoints = BigInt(Math.floor(CONFIG.FILLED_THRESHOLD_PERCENT * 100));
    
    return utilizationBasisPoints >= thresholdBasisPoints;
  }

  async start(): Promise<void> {
    console.log('Starting Vault Monitor...');
    console.log(`AMM Factory: ${CONFIG.AMM_FACTORY_ADDRESS}`);
    console.log(`RPC URL: ${CONFIG.RPC_URL}`);

    // Setup Telegram command listeners
    const bot = this.notifier.getBot();
    bot.onText(/\/liveVaults/, async (msg) => {
      await this.handleLiveVaultsCommand(msg);
    });

    // Send test message
    await this.notifier.sendTestMessage();

    // Load existing vaults and start monitoring
    await this.loadExistingVaults();
    
    this.isRunning = true;
    await this.monitor();
  }

  private async handleLiveVaultsCommand(msg: TelegramBot.Message): Promise<void> {
    try {
      const chatId = msg.chat.id;
      
      // Check if we have a valid cached message
      const now = Date.now();
      const cacheAge = now - this.cachedLiveVaultsTimestamp;
      
      if (this.cachedLiveVaultsMessage && cacheAge < this.LIVE_VAULTS_CACHE_TTL_MS) {
        // Use cached message
        await this.notifier.getBot().sendMessage(chatId, this.cachedLiveVaultsMessage, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });
        return;
      }

      // Cache expired or doesn't exist, fetch fresh data
      await this.notifier.getBot().sendMessage(chatId, '📊 Fetching live vaults...', {
        parse_mode: 'Markdown',
      });

      const liveVaults = await this.getLiveVaults();
      
      if (liveVaults.length === 0) {
        const emptyMessage = '❌ No live vaults found.';
        this.cachedLiveVaultsMessage = emptyMessage;
        this.cachedLiveVaultsTimestamp = now;
        await this.notifier.getBot().sendMessage(chatId, emptyMessage, {
          parse_mode: 'Markdown',
        });
        return;
      }

      const message = this.formatLiveVaultsList(liveVaults);
      
      // Update cache
      this.cachedLiveVaultsMessage = message;
      this.cachedLiveVaultsTimestamp = now;
      
      await this.notifier.getBot().sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error('Error handling liveVaults command:', error);
      await this.notifier.getBot().sendMessage(msg.chat.id, '❌ Error fetching vaults. Please try again later.', {
        parse_mode: 'Markdown',
      });
    }
  }
  
  private invalidateLiveVaultsCache(): void {
    this.cachedLiveVaultsMessage = null;
    this.cachedLiveVaultsTimestamp = 0;
  }

  /**
   * Fetches the deposit token symbol for a vault by querying the market contract
   * @param marketAddress The address of the market contract
   * @returns The token symbol (e.g., "BTC", "USDT", "ETH") or null if unavailable
   */
  private async fetchDepositTokenSymbol(marketAddress: string): Promise<string | null> {
    try {
      const marketContract = new ethers.Contract(marketAddress, MarketABI, this.provider);
      const descriptorResult = await marketContract.descriptor();
      const tokenId = descriptorResult[1]; // tokenId is at index 1, returned as bytes16
      
      // Check if tokenId is valid (not zero)
      // bytes16 zero is 0x00000000000000000000000000000000
      const tokenIdHex = typeof tokenId === 'string' ? tokenId : ethers.hexlify(tokenId);
      if (!tokenIdHex || tokenIdHex === '0x00000000000000000000000000000000' || tokenIdHex === '0x') {
        console.warn(`TokenId is zero for market ${marketAddress}`);
        return null;
      }

      // tokenIdToAddress expects bytes16, which tokenId already is
      const tokenAddress = await this.marketHub.tokenIdToAddress(tokenId);
      if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
        console.warn(`Token address is zero for tokenId ${tokenIdHex} in market ${marketAddress}`);
        return null;
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.provider);
      const symbol = await tokenContract.symbol();
      console.log(`Successfully fetched token symbol: ${symbol} for market ${marketAddress}`);
      return symbol;
    } catch (error: any) {
      console.warn(`Could not fetch token symbol for market ${marketAddress}:`, error?.message || error);
      return null;
    }
  }

  private async getLiveVaults(): Promise<Array<VaultState & { depositCurrency: string; utilization: number }>> {
    const allVaults = this.stateManager.getAllVaults();
    const liveVaults: Array<VaultState & { depositCurrency: string; utilization: number }> = [];
    const currentTime = Math.floor(Date.now() / 1000);

    for (const vault of allVaults) {
      try {
        // Check if vault is expired
        const marketContract = new ethers.Contract(vault.marketAddress, MarketABI, this.provider);
        const latestFTime = await marketContract.getLatestFTime();
        const isExpired = latestFTime >= vault.maturity;

        if (isExpired) {
          continue; // Skip expired vaults
        }

        // Get current supply and cap
        const ammContract = new ethers.Contract(vault.address, AMMABI, this.provider);
        const [currentSupply, totalSupplyCap] = await Promise.all([
          ammContract.totalSupply(),
          ammContract.totalSupplyCap(),
        ]);

        // Check if filled (using utilization threshold)
        if (this.isVaultFilled(currentSupply, totalSupplyCap)) {
          continue; // Skip filled vaults
        }

        // Get deposit currency (token symbol)
        // Use cached token symbol if available, otherwise fetch it
        let depositCurrency = vault.depositTokenSymbol || vault.symbol; // Fallback to vault symbol
        if (!vault.depositTokenSymbol) {
          const tokenSymbol = await this.fetchDepositTokenSymbol(vault.marketAddress);
          if (tokenSymbol) {
            depositCurrency = tokenSymbol;
          }
        } else {
          depositCurrency = vault.depositTokenSymbol;
        }

        const utilization = totalSupplyCap > 0n 
          ? Number((currentSupply * 10000n) / totalSupplyCap) / 100 
          : 0;

        liveVaults.push({
          ...vault,
          depositCurrency,
          utilization,
          lastKnownTotalSupply: currentSupply,
          totalSupplyCap: totalSupplyCap,
          depositTokenSymbol: depositCurrency, // Ensure it's set
        });
      } catch (error) {
        console.error(`Error processing vault ${vault.address}:`, error);
      }
    }

    // Sort by utilization (lowest first - most available)
    liveVaults.sort((a, b) => a.utilization - b.utilization);

    return liveVaults;
  }

  private formatLiveVaultsList(vaults: Array<VaultState & { depositCurrency: string; utilization: number }>): string {
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
      const tokenSymbol = vault.depositTokenSymbol || vault.depositCurrency || 'N/A';

      message += `${i + 1}. ${status} *${displayName}*\n`;
      message += `   🪙 Token: ${tokenSymbol}\n`;
      message += `   📅 Expires: ${maturityDate}\n`;
      message += `   📊 Utilization: ${vault.utilization.toFixed(2)}%\n`;
      message += `   💵 Cap: ${this.notifier['formatNumber'](vault.totalSupplyCap)}\n`;
      message += `   📈 Current: ${this.notifier['formatNumber'](vault.lastKnownTotalSupply)}\n`;
      message += `   ✅ Available: ${this.notifier['formatNumber'](available)}\n`;
      message += `   🔗 [View](${arbiscanUrl})\n\n`;
    }

    return message.trim();
  }

  private formatNumber(value: bigint, decimals: number = 18): string {
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const fraction = value % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0');
    return `${whole.toString()}.${fractionStr.slice(0, 6)}`;
  }

  private async loadExistingVaults(): Promise<void> {
    const state = this.stateManager.loadState();
    const vaults = this.stateManager.getAllVaults();
    
    console.log(`Loaded ${vaults.length} existing vaults from state`);
    
    // If no vaults in state, try to backfill from historical events
    if (vaults.length === 0) {
      console.log('No vaults in state, attempting to backfill from historical events...');
      await this.backfillVaults();
    }
    
    // Check all existing vaults for cap updates
    const updatedVaults = this.stateManager.getAllVaults();
    for (const vault of updatedVaults) {
      await this.checkVaultStatus(vault);
    }
  }

  private async backfillVaults(): Promise<void> {
    try {
      console.log('Starting vault backfill...');
      
      // Get current block with detailed logging
      console.log('Fetching current block number...');
      const startTime = Date.now();
      let currentBlock: number;
      try {
        currentBlock = await this.provider.getBlockNumber();
        const blockFetchTime = Date.now() - startTime;
        console.log(`✓ Current block: ${currentBlock} (fetched in ${blockFetchTime}ms)`);
      } catch (error: any) {
        console.error('✗ Error fetching current block:', error);
        console.error('  Error message:', error?.message);
        console.error('  Error code:', error?.code);
        console.error('  Error data:', error?.data);
        throw error;
      }
      
      // Look back a reasonable number of blocks (e.g., 1 week = ~50,400 blocks at 12s/block)
      // Or use START_BLOCK if configured, otherwise look back 1 week
      const lookbackBlocks = 100800; // ~2 weeks
      const fromBlock = CONFIG.START_BLOCK 
        ? CONFIG.START_BLOCK 
        : Math.max(0, currentBlock - lookbackBlocks);
      
      const blockRange = currentBlock - fromBlock;
      
      console.log(`\n📊 Backfill Parameters:`);
      console.log(`   From Block: ${fromBlock}`);
      console.log(`   To Block: ${currentBlock}`);
      console.log(`   Block Range: ${blockRange.toLocaleString()} blocks`);
      console.log(`   AMM Factory: ${CONFIG.AMM_FACTORY_ADDRESS}`);
      
      // Query all AMMCreated events with detailed logging
      console.log(`\n🔍 Querying AMMCreated events...`);
      const queryStartTime = Date.now();
      
      let events: ethers.Log[];
      try {
        const filter = this.ammFactory.filters.AMMCreated();
        console.log(`   Filter created:`, filter);
        console.log(`   Executing queryFilter...`);
        
        events = await this.ammFactory.queryFilter(filter, fromBlock, currentBlock);
        
        const queryTime = Date.now() - queryStartTime;
        console.log(`✓ Query completed in ${queryTime}ms`);
        console.log(`   Events returned: ${events.length}`);
        
        if (queryTime < 100) {
          console.warn(`⚠️  WARNING: Query completed very quickly (${queryTime}ms). This might indicate:`);
          console.warn(`   - RPC rate limiting or filtering results`);
          console.warn(`   - Network issues`);
          console.warn(`   - Invalid block range`);
        }
        
        // Log first few events for debugging
        if (events.length > 0) {
          console.log(`\n📋 Sample events (first 3):`);
          for (let i = 0; i < Math.min(3, events.length); i++) {
            const event = events[i];
            if (event instanceof ethers.EventLog) {
              console.log(`   Event ${i + 1}: Block ${event.blockNumber}, Tx ${event.transactionHash}`);
              if (event.args && event.args.length > 0) {
                console.log(`     AMM Address: ${event.args[0]}`);
              }
            }
          }
        }
      } catch (error: any) {
        const queryTime = Date.now() - queryStartTime;
        console.error(`✗ Query failed after ${queryTime}ms`);
        console.error('  Error type:', error?.constructor?.name);
        console.error('  Error message:', error?.message);
        console.error('  Error code:', error?.code);
        console.error('  Error reason:', error?.reason);
        console.error('  Error data:', error?.data);
        
        // Check for common RPC errors
        if (error?.code === 'RATE_LIMIT' || error?.message?.includes('rate limit')) {
          console.error('\n⚠️  RATE LIMIT DETECTED!');
          console.error('   Consider:');
          console.error('   - Using a private RPC (Infura/Alchemy)');
          console.error('   - Adding delays between queries');
          console.error('   - Reducing block range');
        }
        
        if (error?.code === 'TIMEOUT' || error?.message?.includes('timeout')) {
          console.error('\n⚠️  TIMEOUT DETECTED!');
          console.error('   The RPC may be slow or unresponsive.');
        }
        
        if (error?.code === 'NETWORK_ERROR' || error?.message?.includes('network')) {
          console.error('\n⚠️  NETWORK ERROR!');
          console.error('   Check your RPC endpoint connection.');
        }
        
        throw error;
      }
      
      console.log(`\n📦 Found ${events.length} vault creation events`);
      
      let addedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      if (events.length === 0) {
        console.log('\n⚠️  No events found. Possible reasons:');
        console.log('   1. No vaults have been created in this block range');
        console.log('   2. RPC is filtering/limiting results');
        console.log('   3. AMM Factory address might be incorrect');
        console.log('   4. Block range might be too narrow');
        console.log(`\n💡 Suggestions:`);
        console.log(`   - Verify AMM Factory address: ${CONFIG.AMM_FACTORY_ADDRESS}`);
        console.log(`   - Check Arbiscan for AMMCreated events: https://arbiscan.io/address/${CONFIG.AMM_FACTORY_ADDRESS}#events`);
        console.log(`   - Try setting START_BLOCK to an earlier block in .env`);
        console.log(`   - Consider using a private RPC endpoint`);
        return;
      }
      
      console.log(`\n🔄 Processing ${events.length} events...`);
      const processStartTime = Date.now();
      
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        if (event instanceof ethers.EventLog && event.args) {
          const ammAddress = event.args[0] as string;
          
          // Check if we already have this vault
          const existing = this.stateManager.getVault(ammAddress);
          if (existing) {
            skippedCount++;
            console.log(`[${i + 1}/${events.length}] ⏭️  Skipped (already in state): ${ammAddress}`);
            continue;
          }

          try {
            console.log(`[${i + 1}/${events.length}] 🔄 Backfilling vault: ${ammAddress}`);
            
            // Get vault details
            const ammContract = new ethers.Contract(ammAddress, AMMABI, this.provider);
            const [name, symbol, totalSupplyCap, totalSupply, maturity, marketAddress] = await Promise.all([
              ammContract.name(),
              ammContract.symbol(),
              ammContract.totalSupplyCap(),
              ammContract.totalSupply(),
              ammContract.MATURITY(),
              ammContract.MARKET(),
            ]);

            // Check if vault is expired
            const marketContract = new ethers.Contract(marketAddress, MarketABI, this.provider);
            const latestFTime = await marketContract.getLatestFTime();
            const isExpired = latestFTime >= maturity;

            // Fetch deposit token symbol
            const depositTokenSymbol = await this.fetchDepositTokenSymbol(marketAddress);

            const vault: VaultState = {
              address: ammAddress,
              name: name,
              symbol: symbol,
              totalSupplyCap: totalSupplyCap,
              lastKnownTotalSupply: totalSupply,
              isFilled: this.isVaultFilled(totalSupply, totalSupplyCap),
              maturity: maturity,
              marketAddress: marketAddress,
              lastCheckedBlock: event.blockNumber,
              createdAt: event.blockNumber, // Use block number as proxy for creation time
              depositTokenSymbol: depositTokenSymbol || undefined,
            };

            this.stateManager.addVault(vault);
            addedCount++;
            
            console.log(`  ✓ Added: ${name} (${symbol}) - ${isExpired ? 'EXPIRED' : 'LIVE'} - Block ${event.blockNumber}`);
          } catch (error: any) {
            errorCount++;
            console.error(`  ✗ Error backfilling vault ${ammAddress}:`);
            console.error(`     Error: ${error?.message || error}`);
            console.error(`     Code: ${error?.code || 'N/A'}`);
          }
        } else {
          console.warn(`[${i + 1}/${events.length}] ⚠️  Event is not an EventLog or missing args`);
        }
      }
      
      const processTime = Date.now() - processStartTime;
      console.log(`\n✅ Backfill complete:`);
      console.log(`   Added: ${addedCount} vault(s)`);
      console.log(`   Skipped: ${skippedCount} vault(s)`);
      console.log(`   Errors: ${errorCount} vault(s)`);
      console.log(`   Processing time: ${processTime}ms`);
    } catch (error) {
      console.error('Error during vault backfill:', error);
    }
  }

  private async monitor(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        const state = this.stateManager.loadState();
        const fromBlock = state.lastProcessedBlock + 1;
        
        if (fromBlock <= currentBlock) {
          console.log(`Processing blocks ${fromBlock} to ${currentBlock}`);
          
          // Monitor new vault creation
          await this.monitorNewVaults(fromBlock, currentBlock);
          
          // Monitor cap updates for existing vaults
          await this.monitorCapUpdates(fromBlock, currentBlock);
          
          // Periodically check all vault statuses to detect withdrawals
          // This allows us to detect when filled vaults become available again
          if (currentBlock - this.lastStatusCheckBlock >= this.STATUS_CHECK_INTERVAL_BLOCKS) {
            console.log(`Performing periodic status check for all vaults at block ${currentBlock}`);
            await this.checkAllVaultStatuses();
            this.lastStatusCheckBlock = currentBlock;
          }
          
          // Update last processed block
          const newState = this.stateManager.loadState();
          newState.lastProcessedBlock = currentBlock;
          this.stateManager.saveState(newState);
        }
      } catch (error) {
        console.error('Error in monitor loop:', error);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL_MS));
    }
  }

  private async monitorNewVaults(fromBlock: number, toBlock: number): Promise<void> {
    try {
      const filter = this.ammFactory.filters.AMMCreated();
      const events = await this.ammFactory.queryFilter(filter, fromBlock, toBlock);

      for (const event of events) {
        if (event instanceof ethers.EventLog && event.args) {
          // Event args structure: [amm, isPositive, createParams, seedParams]
          const ammAddress = event.args[0] as string;
          const isPositive = event.args[1] as boolean;
          const createParams = event.args[2] as any;
          
          // Check if we already know about this vault
          const existing = this.stateManager.getVault(ammAddress);
          if (existing) {
            continue;
          }

          console.log(`New vault detected: ${ammAddress}`);

          // Get vault details
          const ammContract = new ethers.Contract(ammAddress, AMMABI, this.provider);
          const [name, symbol, totalSupplyCap, totalSupply, maturity, marketAddress] = await Promise.all([
            ammContract.name(),
            ammContract.symbol(),
            ammContract.totalSupplyCap(),
            ammContract.totalSupply(),
            ammContract.MATURITY(),
            ammContract.MARKET(),
          ]);

          // Check if vault is expired
          const marketContract = new ethers.Contract(marketAddress, MarketABI, this.provider);
          const latestFTime = await marketContract.getLatestFTime();
          const isExpired = latestFTime >= maturity;

          // Fetch deposit token symbol
          const depositTokenSymbol = await this.fetchDepositTokenSymbol(marketAddress);

          const vault: VaultState = {
            address: ammAddress,
            name: name,
            symbol: symbol,
            totalSupplyCap: totalSupplyCap,
            lastKnownTotalSupply: totalSupply,
            isFilled: this.isVaultFilled(totalSupply, totalSupplyCap),
            maturity: maturity,
            marketAddress: marketAddress,
            lastCheckedBlock: event.blockNumber,
            createdAt: Date.now(),
            depositTokenSymbol: depositTokenSymbol || undefined,
          };

          this.stateManager.addVault(vault);
          
          // Invalidate cache when new vault is added
          this.invalidateLiveVaultsCache();

          // Only notify if vault is not expired
          if (!isExpired) {
            // Notify if vault is not filled
            if (!vault.isFilled) {
              await this.notifier.notifyNewVault(vault, false);
            } else {
              await this.notifier.notifyNewVault(vault, true);
            }
          } else {
            console.log(`Vault ${ammAddress} is expired (maturity: ${maturity}, latestFTime: ${latestFTime}), skipping notification`);
          }
        }
      }
    } catch (error) {
      console.error('Error monitoring new vaults:', error);
    }
  }

  private async monitorCapUpdates(fromBlock: number, toBlock: number): Promise<void> {
    const vaults = this.stateManager.getAllVaults();

    for (const vault of vaults) {
      try {
        const ammContract = new ethers.Contract(vault.address, AMMABI, this.provider);
        const filter = ammContract.filters.TotalSupplyCapUpdated();
        const events = await ammContract.queryFilter(filter, fromBlock, toBlock);

        // Check if vault is expired before monitoring cap updates
        const marketContract = new ethers.Contract(vault.marketAddress, MarketABI, this.provider);
        const latestFTime = await marketContract.getLatestFTime();
        const isExpired = latestFTime >= vault.maturity;

        if (isExpired) {
          return; // Skip expired vaults
        }

        for (const event of events) {
          if (event instanceof ethers.EventLog && event.args && event.args.length >= 1) {
            const newCap = event.args[0] as bigint;
            const oldCap = vault.totalSupplyCap;
            
            console.log(`Cap updated for ${vault.address}: ${oldCap} -> ${newCap}`);

            // Get current supply
            const currentSupply = await ammContract.totalSupply();
            
            // Update vault state
            const wasFilled = vault.isFilled;
            const isNowFilled = this.isVaultFilled(currentSupply, newCap);
            
            this.stateManager.updateVault(vault.address, {
              totalSupplyCap: newCap,
              lastKnownTotalSupply: currentSupply,
              isFilled: isNowFilled,
              lastCheckedBlock: event.blockNumber,
            });
            
            // Invalidate cache when cap is updated
            this.invalidateLiveVaultsCache();

            // Notify about cap raise (only for live vaults)
            await this.notifier.notifyCapRaised(
              { ...vault, totalSupplyCap: newCap, lastKnownTotalSupply: currentSupply },
              oldCap,
              newCap,
              currentSupply
            );

            // If vault was filled and is now available, notify
            if (wasFilled && !isNowFilled) {
              await this.notifier.notifyNewVault(
                { ...vault, totalSupplyCap: newCap, lastKnownTotalSupply: currentSupply, isFilled: false },
                false
              );
            }
          }
        }
      } catch (error) {
        console.error(`Error monitoring cap updates for ${vault.address}:`, error);
      }
    }
  }

  private async checkAllVaultStatuses(): Promise<void> {
    const allVaults = this.stateManager.getAllVaults();
    console.log(`Checking status for ${allVaults.length} vaults...`);
    
    // Check all vaults in parallel (with some concurrency limit to avoid overwhelming RPC)
    const BATCH_SIZE = 5;
    for (let i = 0; i < allVaults.length; i += BATCH_SIZE) {
      const batch = allVaults.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(vault => this.checkVaultStatus(vault))
      );
    }
  }

  private async checkVaultStatus(vault: VaultState): Promise<void> {
    try {
      // Check if vault is expired
      const marketContract = new ethers.Contract(vault.marketAddress, MarketABI, this.provider);
      const latestFTime = await marketContract.getLatestFTime();
      const isExpired = latestFTime >= vault.maturity;

      if (isExpired) {
        console.log(`Vault ${vault.address} is expired, skipping status check`);
        return;
      }

      // Backfill token symbol if missing
      if (!vault.depositTokenSymbol) {
        const tokenSymbol = await this.fetchDepositTokenSymbol(vault.marketAddress);
        if (tokenSymbol) {
          this.stateManager.updateVault(vault.address, { depositTokenSymbol: tokenSymbol });
          vault.depositTokenSymbol = tokenSymbol;
        }
      }

      const ammContract = new ethers.Contract(vault.address, AMMABI, this.provider);
      const [totalSupply, totalSupplyCap] = await Promise.all([
        ammContract.totalSupply(),
        ammContract.totalSupplyCap(),
      ]);

      const wasFilled = vault.isFilled;
      const isNowFilled = this.isVaultFilled(totalSupply, totalSupplyCap);

      // Update if cap changed
      if (totalSupplyCap !== vault.totalSupplyCap) {
        console.log(`Cap changed for ${vault.address}: ${vault.totalSupplyCap} -> ${totalSupplyCap}`);
        // Invalidate cache when cap changes
        this.invalidateLiveVaultsCache();
        await this.notifier.notifyCapRaised(
          { ...vault, totalSupplyCap, lastKnownTotalSupply: totalSupply },
          vault.totalSupplyCap,
          totalSupplyCap,
          totalSupply
        );
      }

      // Update if fill status changed
      if (wasFilled !== isNowFilled) {
        // Invalidate cache when fill status changes
        this.invalidateLiveVaultsCache();
        if (isNowFilled) {
          // Vault became filled
          await this.notifier.notifyVaultFilled({
            ...vault,
            totalSupplyCap,
            lastKnownTotalSupply: totalSupply,
            isFilled: true,
          });
        } else if (wasFilled) {
          // Vault was filled but is now available again (withdrawals happened)
          await this.notifier.notifyVaultAvailable(
            {
              ...vault,
              totalSupplyCap,
              lastKnownTotalSupply: totalSupply,
              isFilled: false,
            },
            totalSupply
          );
        }
      }

      this.stateManager.updateVault(vault.address, {
        totalSupplyCap,
        lastKnownTotalSupply: totalSupply,
        isFilled: isNowFilled,
      });
    } catch (error) {
      console.error(`Error checking vault status for ${vault.address}:`, error);
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log('Stopping Vault Monitor...');
  }
}

