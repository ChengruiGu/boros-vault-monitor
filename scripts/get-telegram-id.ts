import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Helper script to get your Telegram Chat ID or Channel ID
 * 
 * Usage:
 *   npx ts-node scripts/get-telegram-id.ts
 * 
 * Make sure TELEGRAM_BOT_TOKEN is set in your .env file
 */

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is not set in .env file');
    console.log('\nPlease add TELEGRAM_BOT_TOKEN to your .env file');
    process.exit(1);
  }
  
  const bot = new TelegramBot(botToken, { polling: true });
  
  console.log('🤖 Bot is running...');
  console.log('📝 Instructions:');
  console.log('   1. For personal chat: Send any message to your bot');
  console.log('   2. For channel: Add bot as admin, then send a message in the channel');
  console.log('   3. Press Ctrl+C to stop\n');
  
  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type;
    const chatTitle = msg.chat.title || msg.chat.first_name || 'Unknown';
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Chat/Channel Information:');
    console.log('='.repeat(60));
    console.log(`Type: ${chatType}`);
    console.log(`Title/Name: ${chatTitle}`);
    console.log(`Chat ID: ${chatId}`);
    
    if (chatType === 'channel') {
      const username = (msg.chat as any).username;
      if (username) {
        console.log(`Channel Username: @${username}`);
        console.log(`\n💡 You can use either:`);
        console.log(`   - Channel ID: ${chatId}`);
        console.log(`   - Channel Username: @${username}`);
      } else {
        console.log(`\n💡 Use this Channel ID in your .env:`);
        console.log(`   TELEGRAM_CHAT_ID=${chatId}`);
      }
    } else {
      console.log(`\n💡 Use this Chat ID in your .env:`);
      console.log(`   TELEGRAM_CHAT_ID=${chatId}`);
    }
    
    console.log('='.repeat(60));
  });
  
  // Handle channel posts (when bot receives updates from channel)
  bot.on('channel_post', (msg) => {
    const chatId = msg.chat.id;
    const chatTitle = msg.chat.title || 'Unknown';
    const username = (msg.chat as any).username;
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Channel Information:');
    console.log('='.repeat(60));
    console.log(`Title: ${chatTitle}`);
    console.log(`Channel ID: ${chatId}`);
    
    if (username) {
      console.log(`Channel Username: @${username}`);
      console.log(`\n💡 You can use either:`);
      console.log(`   - Channel ID: ${chatId}`);
      console.log(`   - Channel Username: @${username}`);
    } else {
      console.log(`\n💡 Use this Channel ID in your .env:`);
      console.log(`   TELEGRAM_CHAT_ID=${chatId}`);
    }
    
    console.log('='.repeat(60));
  });
  
  // Keep the script running
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping bot...');
    bot.stopPolling();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

