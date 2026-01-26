#!/bin/bash

# Start Deployment Dashboard
# Unified deployment system for local and AWS CDK deployments

echo "🚀 Starting Ataraxia Deployment Dashboard..."
echo ""
echo "Features:"
echo "  ✅ Local development server management"
echo "  ✅ AWS CDK deployment automation"
echo "  ✅ Real-time API endpoint testing"
echo "  ✅ Live deployment logs"
echo "  ✅ WebSocket-based updates"
echo ""

# Load environment variables
if [ -f .env ]; then
    echo "📋 Loading environment configuration..."
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Environment loaded"
else
    echo "⚠️  No .env file found, using defaults"
fi

# Check if required dependencies are installed
echo ""
echo "🔍 Checking dependencies..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

if ! npm list express &> /dev/null; then
    echo "📦 Installing required dependencies..."
    npm install express ws axios
fi

echo "✅ Dependencies ready"

# Start the deployment API server
echo ""
echo "🚀 Starting deployment dashboard server..."
echo "📡 Dashboard URL: http://localhost:3012"
echo "🔌 WebSocket: ws://localhost:3012"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
node deployment-api-server.js