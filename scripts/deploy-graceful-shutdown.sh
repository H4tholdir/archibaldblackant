#!/bin/bash

# Deploy graceful shutdown to production
# This script updates the backend code on the VPS and restarts the containers

set -e

VPS_HOST="91.98.136.198"
VPS_USER="deploy"
APP_DIR="/home/deploy/archibald-app"

echo "=== Deploying Graceful Shutdown to Production ==="
echo ""

# Step 1: Pull latest code on VPS
echo "1. Pulling latest code from GitHub..."
ssh ${VPS_USER}@${VPS_HOST} << 'ENDSSH'
cd /home/deploy/archibald-app
git pull origin master
ENDSSH

echo "✅ Code updated"
echo ""

# Step 2: Rebuild backend container
echo "2. Rebuilding backend container..."
ssh ${VPS_USER}@${VPS_HOST} << 'ENDSSH'
cd /home/deploy/archibald-app
docker-compose build backend
ENDSSH

echo "✅ Backend rebuilt"
echo ""

# Step 3: Restart containers (Docker will send SIGTERM)
echo "3. Restarting containers with graceful shutdown..."
ssh ${VPS_USER}@${VPS_HOST} << 'ENDSSH'
cd /home/deploy/archibald-app
docker-compose restart backend
ENDSSH

echo "✅ Backend restarted"
echo ""

# Step 4: Check health
echo "4. Checking server health..."
sleep 5
curl -s https://formicanera.com/api/health | jq '.'

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "📊 Monitor logs with:"
echo "   ssh ${VPS_USER}@${VPS_HOST} 'docker-compose -f /home/deploy/archibald-app/docker-compose.yml logs -f backend'"
