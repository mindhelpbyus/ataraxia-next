#!/bin/bash

# Stop Ataraxia-Next Local Development

echo "🛑 Stopping Ataraxia-Next Local Development..."

# Check if PID file exists
if [ -f .sam-local.pid ]; then
    PID=$(cat .sam-local.pid)
    
    if kill -0 $PID 2>/dev/null; then
        echo "📍 Stopping SAM Local (PID: $PID)..."
        kill $PID
        
        # Wait for process to stop
        sleep 2
        
        if kill -0 $PID 2>/dev/null; then
            echo "⚠️  Force killing SAM Local..."
            kill -9 $PID
        fi
        
        echo "✅ SAM Local stopped"
    else
        echo "⚠️  SAM Local process not running"
    fi
    
    rm -f .sam-local.pid
else
    echo "⚠️  No PID file found"
fi

# Clean up any remaining SAM processes
pkill -f "sam local start-api" 2>/dev/null || true

# Clean up temporary files
rm -f template.local.yaml

echo "🏁 Local development stopped"