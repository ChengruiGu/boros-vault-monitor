#!/usr/bin/env node

/**
 * Simple GitHub webhook server for auto-deployment
 * 
 * Usage:
 *   1. Set GITHUB_WEBHOOK_SECRET in your environment
 *   2. Run: node scripts/webhook-server.js
 *   3. Configure GitHub webhook to point to: http://your-server:3000/webhook
 * 
 * For production, use PM2:
 *   pm2 start scripts/webhook-server.js --name webhook-server
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

const PORT = process.env.WEBHOOK_PORT || 3000;
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = path.join(__dirname, 'deploy.sh');

// Simple webhook server
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        
        // Verify webhook secret if provided
        if (SECRET) {
          const signature = req.headers['x-hub-signature-256'];
          if (!signature) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Missing signature');
            return;
          }
          
          const hmac = crypto.createHmac('sha256', SECRET);
          const digest = 'sha256=' + hmac.update(body).digest('hex');
          
          if (signature !== digest) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Invalid signature');
            return;
          }
        }
        
        // Only process push events to main/master branch
        if (payload.ref === 'refs/heads/main' || payload.ref === 'refs/heads/master') {
          console.log(`[${new Date().toISOString()}] Deployment triggered by push to ${payload.ref}`);
          
          // Run deployment script
          exec(`bash ${DEPLOY_SCRIPT}`, (error, stdout, stderr) => {
            if (error) {
              console.error(`Deployment error: ${error}`);
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end(`Deployment failed: ${error.message}`);
              return;
            }
            
            console.log(stdout);
            if (stderr) console.error(stderr);
            
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Deployment triggered successfully');
          });
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Ignored (not main/master branch)');
        }
      } catch (error) {
        console.error('Error processing webhook:', error);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`Error: ${error.message}`);
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
  if (!SECRET) {
    console.warn('WARNING: GITHUB_WEBHOOK_SECRET not set. Webhook is unsecured!');
  }
});

