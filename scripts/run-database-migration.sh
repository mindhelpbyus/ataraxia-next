#!/bin/bash

# Database Migration Script for Universal Auth Provider Fields
# This script runs the database migration and regenerates Prisma client

set -e

echo "🔄 Running Database Migration for Universal Auth Provider Fields"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if database URL is set
if [ -z "$DATABASE_URL" ]; then
    print_error "DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL in your .env file"
    exit 1
fi

print_status "Database URL: ${DATABASE_URL}"

# Step 1: Run the database migration
print_status "Running database migration..."

# Use psql to run the migration SQL
if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -f database/migrations/001_add_auth_provider_fields.sql
    if [ $? -eq 0 ]; then
        print_success "Database migration completed successfully"
    else
        print_error "Database migration failed"
        exit 1
    fi
else
    print_error "psql command not found. Please install PostgreSQL client tools."
    echo "Alternative: Run the SQL migration manually:"
    echo "  1. Connect to your database"
    echo "  2. Execute the contents of database/migrations/001_add_auth_provider_fields.sql"
    exit 1
fi

# Step 2: Pull the updated schema from database
print_status "Pulling updated schema from database..."
npm run prisma:pull

if [ $? -eq 0 ]; then
    print_success "Schema pulled successfully"
else
    print_error "Schema pull failed"
    exit 1
fi

# Step 3: Generate Prisma client
print_status "Generating Prisma client..."
npm run prisma:generate

if [ $? -eq 0 ]; then
    print_success "Prisma client generated successfully"
else
    print_error "Prisma client generation failed"
    exit 1
fi

# Step 4: Verify the migration
print_status "Verifying migration..."

# Check if the new fields exist
VERIFICATION_SQL="
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('auth_provider_id', 'auth_provider_type', 'auth_provider_metadata')
ORDER BY column_name;
"

echo "Checking for new auth provider fields..."
psql "$DATABASE_URL" -c "$VERIFICATION_SQL"

if [ $? -eq 0 ]; then
    print_success "Migration verification completed"
else
    print_warning "Migration verification had issues, but migration may still be successful"
fi

echo ""
print_success "Database migration completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "  1. Build the project: npm run build"
echo "  2. Run migration script: npm run migrate:universal-auth"
echo "  3. Deploy infrastructure: npm run deploy:cdk:dev"
echo ""