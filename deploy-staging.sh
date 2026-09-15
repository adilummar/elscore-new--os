#!/bin/bash
set -e

# EL SCORE OS - Staging Deployment Script
# 
# Instructions:
# 1. Place this file on your Hostinger KVM server in the project directory.
# 2. Make it executable: chmod +x deploy-staging.sh
# 3. Run it: ./deploy-staging.sh

echo "🚀 Starting EL SCORE OS Staging Deployment..."

# 1. Pull latest code
echo "📦 Pulling latest code from git (branch: develop/staging)..."
git fetch origin
# Adjust branch name below if you use a different branch for staging
git checkout main
git pull origin main

# 2. Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# 3. Build the application
echo "🔨 Building the application..."
pnpm run build

# 4. Run database migrations safely
echo "🗄️ Running database migrations..."
# Using migrate deploy which is safe for production/staging (does not reset data)
pnpm --filter api exec prisma migrate deploy

# (Optional) Seed the database if this is the first time running staging
# pnpm run db:seed

# 5. Restart Background Workers (BullMQ)
# If your workers run as a separate PM2 process, restart them here.
# echo "🔄 Restarting workers..."
# pm2 restart elscore-workers || pm2 start dist/worker.js --name "elscore-workers"

# 6. Restart API and Web using PM2
echo "🔄 Restarting services via PM2..."
# Assuming you use PM2 to manage your Node apps on Hostinger
# For API
pm2 restart elscore-api || pm2 start apps/api/dist/main.js --name "elscore-api"
# For Web (Next.js standalone)
# Note: Next.js standalone build outputs to apps/web/.next/standalone/server.js
# You might need to set HOST=0.0.0.0 PORT=3000 in your PM2 ecosystem file
pm2 restart elscore-web || pm2 start apps/web/.next/standalone/server.js --name "elscore-web"

echo "✅ Staging Deployment Completed Successfully!"
echo "Please verify the deployment at your staging URL."
