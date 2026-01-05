# AWS Deployment Guide

## Recommendation: AWS Lightsail

**Why Lightsail over EC2:**
- ✅ **Simpler setup** - One-click deployment, pre-configured
- ✅ **Fixed pricing** - Predictable monthly costs ($3.50-$10/month)
- ✅ **Includes data transfer** - First 1TB included
- ✅ **Perfect for single-instance apps** - No need for complex infrastructure
- ✅ **Easy management** - Simple dashboard, automatic snapshots

**When to use EC2 instead:**
- Need auto-scaling or load balancing
- Require specific instance types or configurations
- Need to integrate with other AWS services extensively
- Have complex networking requirements

## Lightsail Instance Recommendations

### Option 1: $3.50/month (Recommended for Start)
- **Instance**: 512 MB RAM, 1 vCPU, 20 GB SSD
- **Good for**: Testing, low-traffic monitoring
- **Limitations**: May struggle with large block ranges during backfill

### Option 2: $5/month (Recommended for Production)
- **Instance**: 1 GB RAM, 1 vCPU, 40 GB SSD
- **Good for**: Production use, handles backfills well
- **Best balance**: Cost vs performance

### Option 3: $10/month (For Heavy Usage)
- **Instance**: 2 GB RAM, 1 vCPU, 60 GB SSD
- **Good for**: Multiple bots, high-frequency monitoring

## Setup Steps

### 1. Create Lightsail Instance

1. Go to [AWS Lightsail Console](https://lightsail.aws.amazon.com/)
2. Click "Create instance"
3. Choose:
   - **Platform**: Linux/Unix
   - **Blueprint**: Node.js (or Ubuntu if Node.js not available)
   - **Instance plan**: $5/month (1 GB RAM recommended)
4. Name your instance (e.g., `boros-vault-monitor`)
5. Click "Create instance"

### 2. Connect to Instance

1. Wait for instance to be running
2. Click on your instance
3. Click "Connect using SSH" (opens browser-based terminal)
   - Or use SSH: `ssh bitnami@<your-instance-ip>` (if using Node.js blueprint)
   - Or use SSH key from Lightsail account page

### 3. Install Dependencies

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js (if not pre-installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git
sudo apt-get install -y git

# Install PM2 for process management
sudo npm install -g pm2
```

### 4. Clone and Setup Project

```bash
# Clone your repository (or upload files)
git clone <your-repo-url> boros-vault-monitor
cd boros-vault-monitor

# Install dependencies
npm install

# Build the project
npm run build
```

### 5. Configure Environment

```bash
# Create .env file
nano .env
```

Add your configuration:
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_or_channel_id
RPC_URL=https://arb1.arbitrum.io/rpc
# Or use private RPC for better rate limits
# RPC_URL=https://arbitrum-mainnet.infura.io/v3/YOUR_KEY
AMM_FACTORY_ADDRESS=0x3205e972714B52512c837AE6f5FCFDeB07f0f23C
MARKET_HUB_ADDRESS=0x1080808080f145b14228443212e62447C112ADaD
POLL_INTERVAL_MS=12000
STATE_FILE=./vault-state.json
```

Save and exit (Ctrl+X, then Y, then Enter)

### 6. Start with PM2

```bash
# Start the bot
pm2 start dist/index.js --name boros-vault-monitor

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions it prints
```

### 7. Monitor and Manage

```bash
# View logs
pm2 logs boros-vault-monitor

# View status
pm2 status

# Restart
pm2 restart boros-vault-monitor

# Stop
pm2 stop boros-vault-monitor
```

## Alternative: EC2 Setup (If You Prefer)

### EC2 Instance Recommendations

**t3.micro** (Free tier eligible, or ~$7.50/month):
- 1 vCPU, 1 GB RAM
- Good for testing

**t3.small** (~$15/month):
- 2 vCPU, 2 GB RAM
- Better for production

### EC2 Setup Steps

1. Launch EC2 instance:
   - AMI: Ubuntu Server 22.04 LTS
   - Instance type: t3.micro or t3.small
   - Storage: 8-20 GB gp3
   - Security group: Allow SSH (port 22) from your IP

2. Connect via SSH:
   ```bash
   ssh -i your-key.pem ubuntu@<ec2-public-ip>
   ```

3. Follow steps 3-7 from Lightsail guide above

## Cost Comparison

| Service | Instance | Monthly Cost | Notes |
|---------|----------|--------------|-------|
| **Lightsail** | 512 MB | $3.50 | Basic, may be slow |
| **Lightsail** | 1 GB | $5.00 | **Recommended** |
| **Lightsail** | 2 GB | $10.00 | For heavy usage |
| **EC2** | t3.micro | $7.50 | Free tier eligible (first year) |
| **EC2** | t3.small | $15.00 | More resources |

**Additional Costs:**
- Data transfer: First 1TB free on Lightsail, then $0.09/GB
- EC2 data transfer: $0.09/GB after free tier
- Storage: Included in Lightsail, ~$0.10/GB/month on EC2

## Monitoring and Alerts

### Setup CloudWatch Alarms (Optional)

1. Go to CloudWatch in AWS Console
2. Create alarm for:
   - CPU utilization > 80%
   - Memory utilization > 80%
   - Instance status check failures

### Health Checks

Create a simple health check script:

```bash
# Check if bot is running
pm2 list | grep boros-vault-monitor

# Check recent logs for errors
pm2 logs boros-vault-monitor --lines 50 | grep -i error
```

## Backup Strategy

### Automatic Snapshots (Lightsail)

1. Go to Lightsail → Snapshots
2. Enable automatic daily snapshots
3. Keep last 7 snapshots (free)

### Manual Backup

```bash
# Backup state file
cp vault-state.json vault-state.json.backup

# Or use AWS S3
aws s3 cp vault-state.json s3://your-bucket/backups/
```

## Security Best Practices

1. **Use private RPC**: Use Infura/Alchemy instead of public RPC
2. **Restrict SSH**: Only allow SSH from your IP
3. **Keep updated**: Regularly update system packages
4. **Use environment variables**: Never commit secrets to git
5. **Enable firewall**: Use Lightsail firewall or EC2 security groups

## Troubleshooting

### Bot stops running
```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs boros-vault-monitor

# Restart
pm2 restart boros-vault-monitor
```

### Out of memory
- Upgrade to larger instance
- Or optimize polling interval

### RPC rate limiting
- Use private RPC (Infura/Alchemy)
- Increase POLL_INTERVAL_MS

## Alternative: Serverless (Advanced)

For truly serverless deployment, consider:
- **AWS Lambda** + **EventBridge** (cron)
- **AWS ECS Fargate** (containerized)
- **AWS App Runner** (simpler container service)

These require more setup but can be more cost-effective for low-usage scenarios.

