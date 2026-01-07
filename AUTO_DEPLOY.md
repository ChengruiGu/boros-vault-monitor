# Auto-Deployment Setup

This guide shows you how to set up automatic deployment so that when you push to GitHub, your bot automatically pulls the latest code, builds, and restarts.

## Option 1: GitHub Webhook (Recommended)

This method uses a webhook server that GitHub calls when you push code.

### Step 1: Set up Webhook Server

1. **Make the deploy script executable:**
   ```bash
   chmod +x scripts/deploy.sh
   ```

2. **Set a webhook secret (optional but recommended):**
   ```bash
   # Generate a random secret
   openssl rand -hex 32
   
   # Add to your .env file
   echo "GITHUB_WEBHOOK_SECRET=your-secret-here" >> .env
   ```

3. **Start the webhook server with PM2:**
   ```bash
   pm2 start scripts/webhook-server.js --name webhook-server
   pm2 save
   ```

### Step 2: Set up HTTPS (Required for Production)

GitHub requires HTTPS when using webhook secrets. See the "Using HTTPS for Webhook" section below for detailed instructions.

**Quick option:** Use nginx + Let's Encrypt (free SSL):
```bash
# Install nginx and certbot
sudo apt install nginx certbot python3-certbot-nginx

# Configure nginx (see detailed instructions below)
# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

### Step 3: Configure GitHub Webhook

1. Go to your GitHub repository
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `https://your-domain.com/webhook` (use HTTPS!)
   - **Content type**: `application/json`
   - **Secret**: The same secret you set in `.env`
   - **Events**: Select "Just the push event"
   - **Active**: ✓

4. Click **Add webhook**

**Note:** If you don't have a domain yet, you can use ngrok for testing (see below), but use nginx + Let's Encrypt for production.

### Step 4: Test

1. Make a small change and push to GitHub:
   ```bash
   git commit --allow-empty -m "Test deployment"
   git push origin main
   ```

2. Check the webhook server logs:
   ```bash
   pm2 logs webhook-server
   ```

3. Check the deployment logs:
   ```bash
   tail -f deploy.log
   ```

4. Verify the bot restarted:
   ```bash
   pm2 logs boros-vault-monitor --lines 20
   ```

## Option 2: Cron Job (Simpler, but less efficient)

This method periodically checks for new commits and deploys if found.

### Step 1: Make deploy script executable

```bash
chmod +x scripts/deploy.sh
```

### Step 2: Set up cron job

```bash
# Edit crontab
crontab -e

# Add this line to check every 5 minutes:
*/5 * * * * cd /path/to/boros-vault-monitor && bash scripts/deploy.sh >> deploy.log 2>&1
```

Replace `/path/to/boros-vault-monitor` with your actual project path.

### Step 3: Test

1. Push a change to GitHub
2. Wait up to 5 minutes (or adjust cron interval)
3. Check the deployment log:
   ```bash
   tail -f deploy.log
   ```

## Option 3: Manual Trigger

You can also run the deployment script manually:

```bash
bash scripts/deploy.sh
```

## Security Considerations

### For Webhook Server:

1. **Use HTTPS**: If exposing to the internet, use a reverse proxy (nginx) with SSL
2. **Set a strong secret**: Use `GITHUB_WEBHOOK_SECRET`
3. **Firewall**: Only allow webhook port from GitHub IPs (or use a VPN)
4. **Run as non-root user**: The webhook server should run as a regular user

### For Cron Job:

- Less secure (no authentication)
- But safer if server is not exposed to internet
- Good for internal deployments

## Troubleshooting

### Webhook not triggering

1. Check webhook server is running:
   ```bash
   pm2 status
   pm2 logs webhook-server
   ```

2. Check GitHub webhook delivery:
   - Go to Settings → Webhooks → Your webhook
   - Click "Recent Deliveries"
   - Check for errors

3. Test webhook endpoint manually:
   ```bash
   curl -X POST http://localhost:3000/webhook \
     -H "Content-Type: application/json" \
     -d '{"ref":"refs/heads/main"}'
   ```

### Deployment fails

1. Check deployment log:
   ```bash
   tail -f deploy.log
   ```

2. Check PM2 logs:
   ```bash
   pm2 logs boros-vault-monitor
   ```

3. Verify git repository:
   ```bash
   git status
   git remote -v
   ```

### Bot not restarting

1. Check PM2 status:
   ```bash
   pm2 status
   ```

2. Manually restart:
   ```bash
   pm2 restart boros-vault-monitor
   ```

## Using HTTPS for Webhook (Recommended)

GitHub requires HTTPS for webhooks when using a secret. Here are the best options:

### Option A: nginx Reverse Proxy with Let's Encrypt (Recommended)

This is the most common and secure approach.

#### Step 1: Install nginx and Certbot

```bash
# On Ubuntu/Debian
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# On Amazon Linux
sudo yum install nginx certbot python3-certbot-nginx
```

#### Step 2: Configure nginx

Create nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/webhook
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain
    
    location /webhook {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /health {
        proxy_pass http://localhost:3000;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/webhook /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

#### Step 3: Get SSL Certificate with Let's Encrypt

```bash
# Get free SSL certificate
sudo certbot --nginx -d your-domain.com

# Certbot will automatically:
# - Get SSL certificate
# - Configure nginx for HTTPS
# - Set up auto-renewal
```

#### Step 4: Update GitHub Webhook

Point GitHub webhook to: `https://your-domain.com/webhook`

#### Step 5: Verify

Test the webhook endpoint:

```bash
curl https://your-domain.com/health
# Should return: OK
```

### Option B: Direct HTTPS in Node.js (Advanced)

If you prefer not to use nginx, you can configure HTTPS directly in the webhook server:

1. **Get SSL certificates** (Let's Encrypt or your own)
2. **Update `scripts/webhook-server.js`** to use HTTPS:

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('/path/to/private-key.pem'),
  cert: fs.readFileSync('/path/to/certificate.pem')
};

const server = https.createServer(options, (req, res) => {
  // ... rest of the code
});
```

### Option C: ngrok (For Development/Testing)

For quick testing without a domain:

```bash
# Install ngrok
# Download from https://ngrok.com/download

# Start your webhook server
pm2 start scripts/webhook-server.js --name webhook-server

# In another terminal, expose it
ngrok http 3000

# Use the HTTPS URL ngrok provides:
# Example: https://abc123.ngrok.io/webhook
```

**Note:** ngrok URLs change on free tier. Use nginx + Let's Encrypt for production.

### Option D: Cloudflare Tunnel (Free Alternative)

If you don't have a domain or want to avoid port forwarding:

1. Create a Cloudflare account
2. Install `cloudflared`:
   ```bash
   # On Linux
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
   chmod +x /usr/local/bin/cloudflared
   ```

3. Create a tunnel:
   ```bash
   cloudflared tunnel create webhook
   cloudflared tunnel route dns webhook your-subdomain.yourdomain.com
   cloudflared tunnel run webhook --url http://localhost:3000
   ```

4. Use: `https://your-subdomain.yourdomain.com/webhook`

### Security Notes

- **Always use HTTPS** when exposing webhooks to the internet
- **Set a strong `GITHUB_WEBHOOK_SECRET`** - this is required for HTTPS webhooks
- **Keep certificates updated** - Let's Encrypt auto-renews, but verify it's working
- **Use firewall rules** - Only allow necessary ports (443 for HTTPS, 80 for Let's Encrypt)

## Notes

- The deployment script will only deploy if there are new commits
- It preserves your `.env` file and `vault-state.json`
- PM2 will automatically restart the bot
- All deployment actions are logged to `deploy.log`

