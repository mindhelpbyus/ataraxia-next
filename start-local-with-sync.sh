#!/bin/bash

# Start Local Development with Database Synchronization
# Ensures database sync before starting local development
set -e

echo "🚀 Starting local development with database synchronization..."

# Set local environment variables
export NODE_ENV=local
export DATABASE_URL=postgresql://ataraxia_user:ataraxia_password@localhost:5432/ataraxia_db
export DATABASE_SCHEMA=ataraxia
export LOG_LEVEL=debug

echo "✅ Local environment variables configured"

# STEP 1: CRITICAL - Database Synchronization Check
echo ""
echo "🔥 STEP 1: CRITICAL DATABASE SYNCHRONIZATION CHECK"
echo "=================================================="
node database-sync-system.js

# Check if database sync was successful
if [ $? -ne 0 ]; then
    echo ""
    echo "💥 LOCAL DEVELOPMENT ABORTED!"
    echo "❌ Database synchronization failed"
    echo "🔧 Please fix database sync issues before starting local development"
    echo ""
    echo "💡 Common fixes:"
    echo "   - Ensure PostgreSQL is running: brew services start postgresql"
    echo "   - Check database exists: createdb ataraxia_db"
    echo "   - Check user exists: createuser ataraxia_user"
    echo "   - Run migrations manually if needed"
    exit 1
fi

echo ""
echo "✅ Database synchronization successful - starting local development"

# STEP 2: Install dependencies if needed
echo ""
echo "📦 STEP 2: Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

# STEP 3: Build if needed
echo ""
echo "🔨 STEP 3: Building application..."
if [ ! -d "dist" ]; then
    echo "Building TypeScript..."
    npm run build
else
    echo "✅ Build directory exists"
fi

# STEP 4: Start local API server
echo ""
echo "🚀 STEP 4: Starting local API server..."
echo "📱 Local API will be available at: http://localhost:3010"
echo "📊 API Explorer will be available at: http://localhost:3010/api-explorer"
echo ""
echo "🔍 Database Status:"
echo "   - Local database: ✅ Synced with ataraxia schema"
echo "   - Connection: postgresql://ataraxia_user:***@localhost:5432/ataraxia_db"
echo "   - Schema: ataraxia"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the local API server
node local-api-server.js