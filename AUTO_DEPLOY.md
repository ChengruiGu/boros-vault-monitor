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

### Step 2: Configure GitHub Webhook

1. Go to your GitHub repository
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `http://your-server-ip:3000/webhook`
   - **Content type**: `application/json`
   - **Secret**: The same secret you set in `.env`
   - **Events**: Select "Just the push event"
   - **Active**: ✓

4. Click **Add webhook**

### Step 3: Test

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

## Advanced: Using nginx as Reverse Proxy

If you want to use HTTPS and a domain:

```nginx
# /etc/nginx/sites-available/webhook
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location /webhook {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Then point GitHub webhook to: `https://your-domain.com/webhook`

## Notes

- The deployment script will only deploy if there are new commits
- It preserves your `.env` file and `vault-state.json`
- PM2 will automatically restart the bot
- All deployment actions are logged to `deploy.log`

