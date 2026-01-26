#!/bin/bash

# Ataraxia-Next Local Development Startup Script
# Starts the serverless backend with your proven business logic

echo "🚀 Starting Ataraxia-Next Local Development Environment..."

# Build the project
echo "📦 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix TypeScript errors."
    exit 1
fi

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
npm run prisma:generate

# Start SAM local
echo "🔥 Starting SAM Local API..."
echo "📍 API will be available at: http://localhost:3001"
echo "📍 Same port as your current Ataraxia_backend for seamless frontend integration"
echo ""
echo "🔗 Your frontend at http://localhost:3000 will work without any changes!"
echo ""

sam local start-api \
  --template-file template.yaml \
  --port 3001 \
  --host 0.0.0.0 \
  --parameter-overrides Environment=local \
  --warm-containers EAGER \
  --log-file logs/sam-local.log

echo "✅ Ataraxia-Next started successfully!"