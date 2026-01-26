#!/bin/bash

# Ataraxia Local API Server - Start Script
# Provides local testing without CDK deployment issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SERVER_FILE="$PROJECT_ROOT/local-api-server.js"
PID_FILE="$PROJECT_ROOT/.local-api.pid"
LOG_FILE="$PROJECT_ROOT/logs/local-api.log"
API_PORT="${API_PORT:-3010}"

# Ensure logs directory exists
mkdir -p "$PROJECT_ROOT/logs"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║        🚀 Ataraxia Local API Server - No CDK Required        ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing_tools+=("Node.js")
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
    
    log_success "All prerequisites are installed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$PROJECT_ROOT"
    
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        npm install
    else
        log_info "Dependencies already installed"
    fi
    
    log_success "Dependencies ready"
}

# Stop existing server
stop_server() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Stopping existing server (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
            log_success "Server stopped"
        fi
        rm -f "$PID_FILE"
    fi
    
    # Kill any remaining node processes running the server
    pkill -f "local-api-server.js" 2>/dev/null || true
}

# Start server
start_server() {
    log_info "Starting Ataraxia Local API Server..."
    
    cd "$PROJECT_ROOT"
    
    # Set environment variables
    export API_PORT="$API_PORT"
    export NODE_ENV="development"
    export LOG_LEVEL="debug"
    
    # Start server in background with logging
    node "$SERVER_FILE" >> "$LOG_FILE" 2>&1 &
    local pid=$!
    
    # Store PID
    echo $pid > "$PID_FILE"
    
    log_success "Server started (PID: $pid)"
    
    # Wait for server to be ready
    log_info "Waiting for server to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
            log_success "Server is ready and responding"
            return 0
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_error "Server failed to start or is not responding"
            log_error "Check logs at: $LOG_FILE"
            return 1
        fi
        
        log_info "Attempt $attempt/$max_attempts: Waiting for server..."
        sleep 1
        ((attempt++))
    done
}

# Validate server
validate_server() {
    log_info "Validating server endpoints..."
    
    local endpoints=(
        "/health"
        "/api/auth/me"
        "/api/therapist"
        "/api/client"
    )
    
    local failed=0
    
    for endpoint in "${endpoints[@]}"; do
        if curl -s -f "http://localhost:$API_PORT$endpoint" > /dev/null 2>&1; then
            log_success "✓ GET $endpoint"
        else
            log_warning "✗ GET $endpoint (may require auth)"
            # Don't count auth endpoints as failures
            if [[ ! "$endpoint" =~ "/api/auth/" ]]; then
                ((failed++))
            fi
        fi
    done
    
    if [ $failed -eq 0 ]; then
        log_success "All endpoints validated"
        return 0
    else
        log_warning "$failed endpoint(s) failed validation"
        return 1
    fi
}

# Test login endpoint
test_login() {
    log_info "Testing login endpoint..."
    
    local response=$(curl -s -X POST "http://localhost:$API_PORT/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"test123"}')
    
    if echo "$response" | grep -q "Login successful"; then
        log_success "✓ Login endpoint working"
        return 0
    else
        log_warning "✗ Login endpoint issue: $response"
        return 1
    fi
}

# Display server info
display_server_info() {
    log_success "🎉 Local API Server is ready!"
    echo ""
    echo -e "${CYAN}Server Information:${NC}"
    echo "  🌐 API URL:           http://localhost:$API_PORT"
    echo "  🔍 API Explorer:      http://localhost:$API_PORT/api-explorer"
    echo "  📝 Log File:          $LOG_FILE"
    echo "  🔑 Process ID:        $(cat $PID_FILE)"
    echo "  🏠 Environment:       Local Development"
    echo ""
    echo -e "${CYAN}🚀 Quick Start:${NC}"
    echo "  1. Open API Explorer: http://localhost:$API_PORT/api-explorer"
    echo "  2. Click 'Quick Login' to test authentication"
    echo "  3. Explore all endpoints with real data"
    echo ""
    echo -e "${CYAN}Frontend Configuration:${NC}"
    echo "  Add to your frontend .env.local:"
    echo "  VITE_API_BASE_URL=http://localhost:$API_PORT"
    echo ""
    echo -e "${CYAN}Test Commands:${NC}"
    echo "  # Test health"
    echo "  curl http://localhost:$API_PORT/health"
    echo ""
    echo "  # Test login"
    echo "  curl -X POST http://localhost:$API_PORT/api/auth/login \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"email\":\"test@example.com\",\"password\":\"test123\"}'"
    echo ""
    echo "  # Test therapists"
    echo "  curl http://localhost:$API_PORT/api/therapist"
    echo ""
    echo -e "${CYAN}Management Commands:${NC}"
    echo "  ./start-local-api.sh stop          - Stop the server"
    echo "  ./start-local-api.sh restart       - Restart the server"
    echo "  ./start-local-api.sh status        - Check server status"
    echo "  ./start-local-api.sh logs          - View server logs"
    echo "  ./start-local-api.sh test          - Run API tests"
    echo ""
}

# Show server status
show_status() {
    log_info "Checking server status..."
    
    echo ""
    echo -e "${CYAN}Server Status:${NC}"
    
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "  🟢 Status:            ${GREEN}Running${NC} (PID: $pid)"
            
            # Check if responding
            if curl -s -f "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
                echo -e "  📡 API:               ${GREEN}Responding${NC}"
            else
                echo -e "  📡 API:               ${RED}Not responding${NC}"
            fi
        else
            echo -e "  🔴 Status:            ${RED}Not running${NC} (stale PID file)"
            rm -f "$PID_FILE"
        fi
    else
        echo -e "  🔴 Status:            ${RED}Not running${NC}"
    fi
    
    echo -e "  🌐 API URL:           http://localhost:$API_PORT"
    echo -e "  📝 Log File:          $LOG_FILE"
    echo ""
}

# Show logs
show_logs() {
    log_info "Showing server logs..."
    
    if [ -f "$LOG_FILE" ]; then
        echo ""
        echo -e "${CYAN}Recent Logs (last 50 lines):${NC}"
        tail -n 50 "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

# Run API tests
run_tests() {
    log_info "Running API tests..."
    
    if ! curl -s -f "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
        log_error "Server is not running. Start it first with: ./start-local-api.sh"
        exit 1
    fi
    
    echo ""
    echo -e "${CYAN}API Test Results:${NC}"
    
    # Test health endpoint
    echo -n "  Health check: "
    if curl -s -f "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
    else
        echo -e "${RED}✗ FAIL${NC}"
    fi
    
    # Test login endpoint
    echo -n "  Login endpoint: "
    local login_response=$(curl -s -X POST "http://localhost:$API_PORT/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"test123"}')
    
    if echo "$login_response" | grep -q "Login successful"; then
        echo -e "${GREEN}✓ PASS${NC}"
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "    Response: $login_response"
    fi
    
    # Test therapist endpoint
    echo -n "  Therapist list: "
    if curl -s -f "http://localhost:$API_PORT/api/therapist" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
    else
        echo -e "${RED}✗ FAIL${NC}"
    fi
    
    # Test client endpoint
    echo -n "  Client list: "
    if curl -s -f "http://localhost:$API_PORT/api/client" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
    else
        echo -e "${RED}✗ FAIL${NC}"
    fi
    
    echo ""
}

# Display usage
display_usage() {
    echo -e "${BLUE}Usage:${NC}"
    echo "  $0 [command] [options]"
    echo ""
    echo -e "${BLUE}Commands:${NC}"
    echo "  start     Start the local API server (default)"
    echo "  stop      Stop the server"
    echo "  restart   Stop and restart the server"
    echo "  status    Show server status"
    echo "  logs      Show server logs"
    echo "  test      Run API tests"
    echo "  help      Show this help message"
    echo ""
    echo -e "${BLUE}Options:${NC}"
    echo "  --skip-deps          Skip dependency installation"
    echo "  --port PORT          Set API port (default: 3002)"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo "  $0                   # Start server"
    echo "  $0 --port 3003       # Start on port 3003"
    echo "  $0 stop              # Stop the server"
    echo "  $0 test              # Run API tests"
    echo ""
}

# Main startup function
start_local_api() {
    local skip_deps=false
    
    # Parse options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-deps)
                skip_deps=true
                shift
                ;;
            --port)
                API_PORT="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    log_header
    
    check_prerequisites
    
    if [ "$skip_deps" = false ]; then
        install_dependencies
    else
        log_warning "Skipping dependency installation"
    fi
    
    stop_server
    start_server || exit 1
    validate_server
    test_login
    display_server_info
}

# Handle script interruption
cleanup() {
    echo ""
    log_warning "Script interrupted"
    exit 130
}

trap cleanup INT TERM

# Main execution
case "${1:-start}" in
    "start")
        shift
        start_local_api "$@"
        ;;
    "stop")
        stop_server
        ;;
    "restart")
        stop_server
        sleep 2
        shift
        start_local_api "$@"
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "test")
        run_tests
        ;;
    "help"|"--help"|"-h")
        display_usage
        ;;
    *)
        log_error "Unknown command: $1"
        echo ""
        display_usage
        exit 1
        ;;
esac