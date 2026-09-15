#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=========================================="
echo "🚀 EL SCORE OS - STAGING DEPLOYMENT SCRIPT"
echo "=========================================="

PROJECT_DIR="/var/www/elscore-os"
cd $PROJECT_DIR

echo -e "\n📦 1. Pulling latest code from GitHub (main branch)..."
git pull origin main

echo -e "\n📥 2. Installing dependencies..."
pnpm install

echo -e "\n🗄️  3. Applying Database Migrations & Generating Prisma Client..."
cd apps/api
pnpm dlx prisma generate
pnpm dlx prisma migrate deploy

echo -e "\n🏗️  4. Building API (NestJS)..."
pnpm run build

echo -e "\n🏗️  5. Building Web (Next.js)..."
cd ../web
# Remove old build cache to prevent standalone issues
rm -rf .next
pnpm run build

echo -e "\n📂 6. Copying Next.js static assets to standalone..."
cp -r .next/static .next/standalone/apps/web/.next/ 2>/dev/null || echo "Static copy already handled or failed"
cp -r public .next/standalone/apps/web/ 2>/dev/null || true

echo -e "\n🔄 7. Restarting PM2 services..."
cd $PROJECT_DIR
pm2 restart ecosystem.config.js
pm2 save

echo -e "\n=========================================="
echo "✅ DEPLOYMENT SUCCESSFUL!"
echo "=========================================="
pm2 status
