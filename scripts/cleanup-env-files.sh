#!/bin/bash

# Environment Files Cleanup Script
# Consolidates multiple .env files into a clean, organized structure

set -e

echo "🧹 Cleaning up environment files..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Create backup directory
BACKUP_DIR="env-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

print_status $BLUE "📂 Backing up existing .env files to: $BACKUP_DIR"

# List of .env files to clean up (keep only essential ones)
CLEANUP_FILES=(
    ".env.bak"
    ".env.deployment" 
    ".env.prisma"
    ".env.unified"
    ".env.complete"
    ".env.dev"
)

KEEP_FILES=(
    ".env"              # Main environment file
    ".env.aws"          # AWS-specific configuration
    ".env.local"        # Local development overrides
)

TEMPLATE_FILES=(
    ".env.template"
    ".env.production.template"
    ".env.development.template"
)

# Backup and remove unnecessary files
for file in "${CLEANUP_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        print_status $YELLOW "   📦 Backing up: $file"
        cp "$file" "$BACKUP_DIR/"
        rm "$file"
        print_status $GREEN "   ✅ Removed: $file"
    fi
done

# Show what we're keeping
print_status $BLUE "📋 Keeping essential files:"
for file in "${KEEP_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        print_status $GREEN "   ✅ Keeping: $file"
    else
        print_status $YELLOW "   ⚠️  Missing: $file"
    fi
done

print_status $BLUE "📋 Template files:"
for file in "${TEMPLATE_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        print_status $GREEN "   ✅ Template: $file"
    fi
done

echo ""
print_status $GREEN "🎉 Environment files cleanup complete!"
print_status $BLUE "📁 Backup saved in: $BACKUP_DIR"

echo ""
echo "Recommended .env file structure:"
echo "  .env              - Main configuration (shared across environments)"
echo "  .env.aws          - AWS-specific settings"
echo "  .env.local        - Local development overrides (gitignored)"
echo "  .env.template     - Template for new developers"
echo ""
echo "Environment-specific files (create as needed):"
echo "  .env.development  - Development environment"
echo "  .env.staging      - Staging environment" 
echo "  .env.production   - Production environment"