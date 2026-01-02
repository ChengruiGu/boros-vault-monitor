# Quick Start Guide

## 1. Get Telegram Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow instructions
3. Copy the bot token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## 2. Get Your Chat ID

### Option A: Personal Chat
1. Start a conversation with your bot
2. Send any message to your bot
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find `"chat":{"id":123456789}` in the response - that's your chat ID

### Option B: Channel
1. Create a channel
2. Add your bot as administrator
3. Send a message to the channel
4. Visit the same URL above to get the channel ID (usually negative number like `-1001234567890`)

## 3. Setup

```bash
# Install dependencies
cd vault-monitor
npm install

# Copy environment file
cp env.example .env

# Edit .env and add:
# - TELEGRAM_BOT_TOKEN
# - TELEGRAM_CHAT_ID
```

## 4. Run

```bash
# Build
npm run build

# Start
npm start
```

You should receive a test message: "🤖 Vault Monitor Bot is running!"

## 5. Test Notifications

The bot will automatically:
- ✅ Monitor new vault creation
- ✅ Alert when cap is raised
- ✅ Notify when vaults become available

## Troubleshooting

**No messages received?**
- Check bot token is correct
- Verify chat ID (must start conversation with bot first)
- Check bot has permission to send messages

**Missing events?**
- Check RPC endpoint is working
- Consider using private RPC (Infura/Alchemy) for better reliability

**High CPU/Memory?**
- Increase `POLL_INTERVAL_MS` in `.env` (default: 12000ms)

