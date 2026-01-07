import { config } from 'dotenv';

config();

export const CONFIG = {
  // Telegram Bot Configuration
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',

  // Blockchain Configuration
  RPC_URL: process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc',
  AMM_FACTORY_ADDRESS: process.env.AMM_FACTORY_ADDRESS || '0x3205e972714B52512c837AE6f5FCFDeB07f0f23C',
  MARKET_HUB_ADDRESS: process.env.MARKET_HUB_ADDRESS || '0x1080808080f145b14228443212e62447C112ADaD',
  
  // Monitoring Configuration
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || '12000'), // 12 seconds (Arbitrum block time ~12s)
  START_BLOCK: process.env.START_BLOCK ? parseInt(process.env.START_BLOCK) : undefined,
  FILLED_THRESHOLD_PERCENT: parseFloat(process.env.FILLED_THRESHOLD_PERCENT || '98'), // Vault is considered filled at this utilization % (default 98%)
  
  // State file
  STATE_FILE: process.env.STATE_FILE || './vault-state.json',
};

// Validate required config
if (!CONFIG.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

if (!CONFIG.TELEGRAM_CHAT_ID) {
  throw new Error('TELEGRAM_CHAT_ID is required');
}

