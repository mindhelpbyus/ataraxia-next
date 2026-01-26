#!/bin/bash

# Ataraxia Integration Test Script
# Tests the complete flow: Local API Server + Original LoginPage

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

API_URL="http://localhost:3010"
FRONTEND_URL="http://localhost:3000"

echo -e "${CYAN}🧪 Ataraxia Integration Test${NC}"
echo -e "${CYAN}============================${NC}"
echo ""

# Test 1: API Server Health
echo -n "🏥 API Server Health: "
if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL - API Server not running${NC}"
    echo "   Start with: cd Ataraxia-Next && npm run local:start"
    exit 1
fi

# Test 2: Frontend Health
echo -n "🌐 Frontend Health: "
if curl -s -f "$FRONTEND_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL - Frontend not running${NC}"
    echo "   Start with: cd Ataraxia && npm run dev"
    exit 1
fi

# Test 3: Login API
echo -n "🔐 Login API Test: "
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"therapist@example.com","password":"test123"}')

if echo "$LOGIN_RESPONSE" | grep -q "Login successful"; then
    echo -e "${GREEN}✓ PASS${NC}"
    
    # Extract user details
    USER_ROLE=$(echo "$LOGIN_RESPONSE" | grep -o '"role":"[^"]*"' | cut -d'"' -f4)
    USER_EMAIL=$(echo "$LOGIN_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
    echo "   👤 User: $USER_EMAIL ($USER_ROLE)"
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "   Response: $LOGIN_RESPONSE"
fi

# Test 4: Therapist Endpoints
echo -n "👨‍⚕️ Therapist API: "
THERAPIST_RESPONSE=$(curl -s "$API_URL/api/therapist")
if echo "$THERAPIST_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✓ PASS${NC}"
    THERAPIST_COUNT=$(echo "$THERAPIST_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    echo "   📊 Found $THERAPIST_COUNT therapists"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 5: Client Endpoints
echo -n "👤 Client API: "
CLIENT_RESPONSE=$(curl -s "$API_URL/api/client")
if echo "$CLIENT_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✓ PASS${NC}"
    CLIENT_COUNT=$(echo "$CLIENT_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    echo "   📊 Found $CLIENT_COUNT clients"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Integration Test Complete!${NC}"
echo ""
echo -e "${CYAN}System Status:${NC}"
echo "  🌐 Frontend:     $FRONTEND_URL (Original LoginPage with all design elements)"
echo "  🔧 API Server:   $API_URL (Local development server)"
echo "  🗄️  Database:     PostgreSQL (optional - using mock data)"
echo "  🔐 Auth:         Cognito-compatible (mock responses for development)"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo "  1. Open $FRONTEND_URL in your browser"
echo "  2. Try logging in with any email/password combination"
echo "  3. The original LoginPage design is preserved with all animations"
echo "  4. Backend calls go to local server (no CDK deployment needed)"
echo ""
echo -e "${CYAN}Management Commands:${NC}"
echo "  ./test-api.sh                    - Test API endpoints"
echo "  ./start-local-api.sh stop        - Stop API server"
echo "  ./start-local-api.sh restart     - Restart API server"
echo "  ./start-local-api.sh status      - Check API server status"
echo ""