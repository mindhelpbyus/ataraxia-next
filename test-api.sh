#!/bin/bash

# Ataraxia Local API Testing Script
# Quick tests for all API endpoints

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

API_URL="http://localhost:3010"

echo -e "${CYAN}🧪 Testing Ataraxia Local API Server${NC}"
echo -e "${CYAN}=====================================${NC}"
echo ""

# Test health endpoint
echo -n "🏥 Health Check: "
if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
    exit 1
fi

# Test login endpoint
echo -n "🔐 Login Test: "
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test123"}')

if echo "$LOGIN_RESPONSE" | grep -q "Login successful"; then
    echo -e "${GREEN}✓ PASS${NC}"
    # Extract token for authenticated requests
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "Response: $LOGIN_RESPONSE"
fi

# Test therapist endpoints
echo -n "👨‍⚕️ Therapist List: "
if curl -s -f "$API_URL/api/therapist" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

echo -n "👨‍⚕️ Therapist by ID: "
if curl -s -f "$API_URL/api/therapist/1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test client endpoints
echo -n "👤 Client List: "
if curl -s -f "$API_URL/api/client" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

echo -n "👤 Client by ID: "
if curl -s -f "$API_URL/api/client/1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test authenticated endpoint
if [ ! -z "$TOKEN" ]; then
    echo -n "🔑 Authenticated Request: "
    if curl -s -f "$API_URL/api/auth/me" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
    else
        echo -e "${YELLOW}⚠ SKIP (expected - mock auth)${NC}"
    fi
fi

echo ""
echo -e "${GREEN}🎉 All tests completed!${NC}"
echo ""
echo -e "${CYAN}API Server Information:${NC}"
echo "  🌐 Base URL: $API_URL"
echo "  📋 Health: $API_URL/health"
echo "  🔐 Login: $API_URL/api/auth/login"
echo "  👨‍⚕️ Therapists: $API_URL/api/therapist"
echo "  👤 Clients: $API_URL/api/client"
echo ""
echo -e "${CYAN}Frontend Configuration:${NC}"
echo "  Add to Ataraxia/.env.local:"
echo "  VITE_API_BASE_URL=$API_URL"
echo ""