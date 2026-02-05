#!/bin/bash

# Start Ataraxia-Next Auth Service with Node.js Express Server
# No SAM CLI required - uses simple Express wrapper

set -e

echo "🚀 Starting Ataraxia-Next Local Auth Service (Node.js)..."
echo "📊 Database: Real AWS RDS PostgreSQL"
echo "🔥 Firebase: Real Production Firebase"
echo "🔐 Cognito: Real Production Cognito"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
fi

# Generate Prisma client
print_status "Generating Prisma client..."
npm run prisma:generate

# Build the project
print_status "Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix TypeScript errors."
    exit 1
fi

print_success "Build completed successfully"

# Create logs directory
mkdir -p logs

print_status "Starting Node.js Express server..."
print_warning "⚠️  This will interact with REAL production data!"
print_status ""

# Start the Node.js server
node local-server.js