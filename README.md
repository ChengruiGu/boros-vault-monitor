# Boros Vault Monitor Bot

A Telegram bot that monitors Boros vault (AMM) creation and cap updates on Arbitrum, sending notifications when:
- A new vault is created (and cap is not reached)
- An existing vault's cap is raised
- A vault becomes available after being filled

## Features

- 🔔 Real-time notifications via Telegram
- 📊 Tracks vault capacity and fill status
- 💾 Persistent state management
- 🔄 Automatic monitoring of new vaults and cap updates
- ⚡ Efficient event-based monitoring
- 📋 `/liveVaults` command to list all active vaults with key information

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the instructions
3. Copy the bot token you receive

### 2. Get Chat ID (for Personal Chat)

1. Start a chat with your bot
2. Send a message to your bot
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find your chat ID in the response (it will be a number like `123456789`)

### 3. Get Channel ID (for Channel)

**Option A: Using a Public Channel**
1. Create a public channel in Telegram
2. Add your bot as an administrator (Channel Settings → Administrators → Add Administrator)
3. Give the bot permission to "Post Messages"
4. The channel ID is the channel username (e.g., `@your_channel_name`)

**Option B: Using a Private Channel**
1. Create a private channel in Telegram
2. Add your bot as an administrator (Channel Settings → Administrators → Add Administrator)
3. Give the bot permission to "Post Messages"
4. To get the channel ID:
   - Forward a message from your channel to [@userinfobot](https://t.me/userinfobot)
   - Or use this method:
     - Add [@RawDataBot](https://t.me/RawDataBot) to your channel
     - It will show the channel ID (usually starts with `-100`)
   - Or visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` after the bot posts a message
   - Look for `"chat":{"id":-1001234567890}` - the negative number is your channel ID

**Important Notes:**
- Channel IDs are usually negative numbers (e.g., `-1001234567890`)
- The bot **must** be an administrator of the channel
- The bot needs "Post Messages" permission
- For private channels, you can use the numeric ID (e.g., `-1001234567890`)
- For public channels, you can use the username (e.g., `@your_channel_name`)

### 2. Get Your Chat/Channel ID

**Easy Method (Recommended):**
1. Run the helper script:
   ```bash
   npm run get-telegram-id
   ```
2. For personal chat: Send a message to your bot
3. For channel: Add the bot as admin, then send a message in the channel
4. The script will display your Chat ID or Channel ID

**Manual Method:**
- See detailed instructions in the README below

### 3. Install Dependencies

```bash
cd vault-monitor
npm install
```

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `TELEGRAM_CHAT_ID`: Your Telegram chat ID
- `RPC_URL`: Arbitrum RPC endpoint (default works, but consider using Infura/Alchemy for better rate limits)

### 5. Build and Run

```bash
# Build TypeScript
npm run build

# Run the bot
npm start

# Or run in development mode
npm run dev
```

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (required) | - |
| `TELEGRAM_CHAT_ID` | Telegram chat ID (required) | - |
| `RPC_URL` | Arbitrum RPC endpoint | `https://arb1.arbitrum.io/rpc` |
| `AMM_FACTORY_ADDRESS` | AMM Factory contract address | `0x3205e972714B52512c837AE6f5FCFDeB07f0f23C` |
| `MARKET_HUB_ADDRESS` | Market Hub contract address | `0x1080808080f145b14228443212e62447C112ADaD` |
| `POLL_INTERVAL_MS` | Polling interval in milliseconds | `12000` (12 seconds) |
| `START_BLOCK` | Block number to start monitoring from | Latest block |
| `FILLED_THRESHOLD_PERCENT` | Utilization % at which vault is considered filled | `98` (98%) |
| `STATE_FILE` | Path to state file | `./vault-state.json` |

## How It Works

1. **New Vault Detection**: Monitors `AMMCreated` events from the AMM Factory
2. **Cap Update Detection**: Monitors `TotalSupplyCapUpdated` events from each AMM contract
3. **Status Checking**: Periodically checks if vaults are filled based on utilization threshold (default: 98%)
   - A vault is considered filled when: `(currentSupply / totalSupplyCap) * 100 >= FILLED_THRESHOLD_PERCENT`
   - This means vaults with only a few dollars remaining are still considered "practically filled"
4. **Expiration Filtering**: Automatically filters out expired vaults (maturity reached)
5. **Notifications**: Sends Telegram messages when:
   - New vault is created (with status: available or filled)
   - Vault cap is raised
   - Vault becomes available after being filled
6. **Commands**: 
   - `/liveVaults` - Lists all live (non-expired, non-filled) vaults with key information

## Commands

### `/liveVaults`

Returns a formatted list of all live vaults with:
- Vault name
- Deposit currency (token symbol)
- Expiration date
- Total cap
- Current amount deposited
- Available space
- Utilization percentage
- Direct link to Arbiscan

Vaults are sorted by utilization (lowest first - most available space).

## State Management

The bot maintains a `vault-state.json` file that tracks:
- All known vaults
- Their current cap and supply
- Last processed block number

This allows the bot to resume monitoring after restarts without missing events.

## Running as a Service

### Using PM2

```bash
npm install -g pm2
pm2 start dist/index.js --name vault-monitor
pm2 save
pm2 startup
```

### Using systemd

Create `/etc/systemd/system/vault-monitor.service`:

```ini
[Unit]
Description=Boros Vault Monitor Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/vault-monitor
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable vault-monitor
sudo systemctl start vault-monitor
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed AWS deployment instructions.

**Quick recommendation**: Use **AWS Lightsail** ($5/month) for the simplest setup.

## Troubleshooting

### Bot not sending messages
- Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct
- Make sure you've started a conversation with the bot
- Check bot permissions if using a channel

### Missing events
- Check RPC endpoint is working: `curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $RPC_URL`
- Consider using a private RPC (Infura/Alchemy) for better rate limits
- Adjust `START_BLOCK` to reprocess from a specific block

### High RPC usage
- Increase `POLL_INTERVAL_MS` to poll less frequently
- Use a private RPC endpoint with higher rate limits

## License

MIT

