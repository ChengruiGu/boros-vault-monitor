#!/bin/bash

# Auto-deployment script for boros-vault-monitor
# This script pulls latest code, builds, and restarts the bot

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PM2_NAME="boros-vault-monitor"
LOG_FILE="$PROJECT_DIR/deploy.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Starting deployment ==="

# Change to project directory
cd "$PROJECT_DIR"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    log "ERROR: Not a git repository"
    exit 1
fi

# Get current commit hash
OLD_COMMIT=$(git rev-parse HEAD)
log "Current commit: $OLD_COMMIT"

# Fetch latest changes
log "Fetching latest changes from origin..."
git fetch origin

# Check if there are new commits
NEW_COMMIT=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null)

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
    log "No new commits. Already up to date."
    exit 0
fi

log "New commit detected: $NEW_COMMIT"
log "Pulling latest code..."

# Pull latest code
git pull origin main 2>/dev/null || git pull origin master 2>/dev/null

# Install/update dependencies
log "Installing dependencies..."
npm install

# Build the project
log "Building project..."
npm run build

# Restart the bot with PM2
log "Restarting bot with PM2..."
pm2 restart "$PM2_NAME" || pm2 start dist/index.js --name "$PM2_NAME"

# Save PM2 configuration
pm2 save

log "=== Deployment complete ==="
log "Old commit: $OLD_COMMIT"
log "New commit: $NEW_COMMIT"

