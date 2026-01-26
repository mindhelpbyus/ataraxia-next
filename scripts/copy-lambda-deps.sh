#!/bin/bash

# Copy only essential dependencies for Lambda function
echo "Copying essential Lambda dependencies..."

# Create node_modules directory in dist
mkdir -p dist/node_modules

# Copy jsonwebtoken and its direct dependencies only
echo "Copying jsonwebtoken..."
cp -r node_modules/jsonwebtoken dist/node_modules/ 2>/dev/null || true
cp -r node_modules/jws dist/node_modules/ 2>/dev/null || true
cp -r node_modules/jwa dist/node_modules/ 2>/dev/null || true
cp -r node_modules/ms dist/node_modules/ 2>/dev/null || true
cp -r node_modules/semver dist/node_modules/ 2>/dev/null || true
cp -r node_modules/ecdsa-sig-formatter dist/node_modules/ 2>/dev/null || true
cp -r node_modules/safe-buffer dist/node_modules/ 2>/dev/null || true
cp -r node_modules/buffer-equal-constant-time dist/node_modules/ 2>/dev/null || true

# Copy pg (PostgreSQL client) and all its dependencies
echo "Copying pg..."
cp -r node_modules/pg dist/node_modules/ 2>/dev/null || true
cp -r node_modules/pg-types dist/node_modules/ 2>/dev/null || true
cp -r node_modules/pg-pool dist/node_modules/ 2>/dev/null || true
cp -r node_modules/pg-connection-string dist/node_modules/ 2>/dev/null || true
cp -r node_modules/pg-protocol dist/node_modules/ 2>/dev/null || true
cp -r node_modules/pg-int8 dist/node_modules/ 2>/dev/null || true
cp -r node_modules/postgres-array dist/node_modules/ 2>/dev/null || true
cp -r node_modules/postgres-bytea dist/node_modules/ 2>/dev/null || true
cp -r node_modules/postgres-date dist/node_modules/ 2>/dev/null || true
cp -r node_modules/postgres-interval dist/node_modules/ 2>/dev/null || true
cp -r node_modules/pgpass dist/node_modules/ 2>/dev/null || true
cp -r node_modules/xtend dist/node_modules/ 2>/dev/null || true

# Copy only essential AWS SDK components (for auth service only)
echo "Copying essential AWS SDK components..."
# Skip AWS SDK for therapist/client functions to reduce size
# mkdir -p dist/node_modules/@aws-sdk
# cp -r node_modules/@aws-sdk/client-cognito-identity-provider dist/node_modules/@aws-sdk/ 2>/dev/null || true
# cp -r node_modules/@aws-sdk/client-secrets-manager dist/node_modules/@aws-sdk/ 2>/dev/null || true

# Copy AWS SDK core dependencies (only if they exist)
# cp -r node_modules/@aws-sdk/types dist/node_modules/@aws-sdk/ 2>/dev/null || true
# cp -r node_modules/@smithy dist/node_modules/ 2>/dev/null || true

echo "Essential dependencies copied successfully!"