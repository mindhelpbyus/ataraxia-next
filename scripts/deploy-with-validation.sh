#!/bin/bash

# Deploy with Validation Script
# Comprehensive deployment script with pre-deployment validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --skip-validation    Skip pre-deployment validation"
    echo "  --environment ENV    Deployment environment (dev|staging|prod)"
    echo "  --stack-name NAME    CDK stack name"
    echo "  --region REGION      AWS region"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy with full validation"
    echo "  $0 --environment prod                 # Deploy to production"
    echo "  $0 --skip-validation                  # Skip validation (not recommended)"
    echo "  $0 --stack-name AtaraxiaStack         # Custom stack name"
}

# Default values
SKIP_VALIDATION=false
ENVIRONMENT="dev"
STACK_NAME="AtaraxiaStack"
REGION=""
DRY_RUN=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main deployment function
main() {
    print_status $BLUE "🚀 Starting Ataraxia Deployment Process"
    print_status $BLUE "Environment: $ENVIRONMENT"
    print_status $BLUE "Stack Name: $STACK_NAME"
    echo ""

    # Step 1: Pre-deployment validation
    if [[ "$SKIP_VALIDATION" == "false" ]]; then
        print_status $BLUE "🔍 Step 1: Pre-deployment validation"
        
        if [[ -f "scripts/pre-deploy-check.sh" ]]; then
            if ./scripts/pre-deploy-check.sh; then
                print_status $GREEN "   ✅ Pre-deployment validation passed"
            else
                print_status $RED "   ❌ Pre-deployment validation failed"
                print_status $RED "   Fix validation errors before deployment"
                exit 1
            fi
        else
            print_status $YELLOW "   ⚠️  Pre-deployment check script not found"
        fi
    else
        print_status $YELLOW "⚠️  Skipping pre-deployment validation (not recommended)"
    fi

    # Step 2: Environment-specific configuration
    print_status $BLUE "🔧 Step 2: Loading environment configuration"
    
    case $ENVIRONMENT in
        "dev"|"development")
            ENV_FILE=".env.development"
            ;;
        "staging")
            ENV_FILE=".env.staging"
            ;;
        "prod"|"production")
            ENV_FILE=".env.production"
            ;;
        *)
            ENV_FILE=".env"
            ;;
    esac

    if [[ -f "$ENV_FILE" ]]; then
        print_status $GREEN "   ✅ Loading configuration from: $ENV_FILE"
        set -a
        source "$ENV_FILE"
        set +a
    else
        print_status $YELLOW "   ⚠️  Environment file $ENV_FILE not found, using .env"
        if [[ -f ".env" ]]; then
            set -a
            source ".env"
            set +a
        fi
    fi

    # Set region if provided
    if [[ -n "$REGION" ]]; then
        export AWS_REGION="$REGION"
        export CDK_DEFAULT_REGION="$REGION"
    fi

    # Step 3: Build and prepare
    print_status $BLUE "🏗️  Step 3: Building application"
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        print_status $YELLOW "   📦 Installing dependencies..."
        npm install
    fi

    # Build TypeScript if needed
    if [[ -f "tsconfig.json" ]]; then
        print_status $YELLOW "   🔨 Building TypeScript..."
        npm run build || npx tsc
    fi

    # Step 4: CDK Bootstrap (if needed)
    print_status $BLUE "🏗️  Step 4: CDK Bootstrap check"
    
    if ! cdk bootstrap --show-template >/dev/null 2>&1; then
        print_status $YELLOW "   🔧 Bootstrapping CDK..."
        cdk bootstrap
    else
        print_status $GREEN "   ✅ CDK already bootstrapped"
    fi

    # Step 5: CDK Diff (show changes)
    print_status $BLUE "📊 Step 5: Reviewing deployment changes"
    
    print_status $YELLOW "   📋 Changes to be deployed:"
    cdk diff "$STACK_NAME" || true

    # Step 6: Confirmation (unless dry run)
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status $YELLOW "🔍 DRY RUN: Would deploy stack '$STACK_NAME' to environment '$ENVIRONMENT'"
        print_status $YELLOW "   No actual deployment performed"
        exit 0
    fi

    # Interactive confirmation for production
    if [[ "$ENVIRONMENT" == "prod" ]] || [[ "$ENVIRONMENT" == "production" ]]; then
        echo ""
        print_status $YELLOW "⚠️  PRODUCTION DEPLOYMENT WARNING"
        print_status $YELLOW "   You are about to deploy to PRODUCTION environment"
        print_status $YELLOW "   This will affect live users and data"
        echo ""
        read -p "Are you sure you want to continue? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            print_status $YELLOW "   Deployment cancelled by user"
            exit 0
        fi
    fi

    # Step 7: Deploy
    print_status $BLUE "🚀 Step 6: Deploying to AWS"
    
    print_status $YELLOW "   🔄 Starting CDK deployment..."
    
    # Deploy with progress monitoring
    if cdk deploy "$STACK_NAME" --require-approval never --progress events; then
        print_status $GREEN "   ✅ Deployment successful!"
    else
        print_status $RED "   ❌ Deployment failed!"
        exit 1
    fi

    # Step 8: Post-deployment validation
    print_status $BLUE "🔍 Step 7: Post-deployment validation"
    
    # Wait a moment for services to start
    print_status $YELLOW "   ⏳ Waiting for services to initialize..."
    sleep 10

    # Get stack outputs
    STACK_OUTPUTS=$(cdk output "$STACK_NAME" --json 2>/dev/null || echo "{}")
    
    # Extract API Gateway URL if available
    API_URL=$(echo "$STACK_OUTPUTS" | jq -r '.ApiGatewayUrl // empty' 2>/dev/null || echo "")
    
    if [[ -n "$API_URL" ]]; then
        print_status $YELLOW "   🔍 Testing deployed API..."
        
        # Test health endpoint
        if curl -s -f "$API_URL/health" >/dev/null; then
            print_status $GREEN "   ✅ API health check passed"
        else
            print_status $YELLOW "   ⚠️  API health check failed (may need more time)"
        fi
    fi

    # Step 9: Generate deployment report
    print_status $BLUE "📊 Step 8: Generating deployment report"
    
    DEPLOYMENT_REPORT="deployment-report-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$DEPLOYMENT_REPORT" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "environment": "$ENVIRONMENT",
  "stackName": "$STACK_NAME",
  "region": "${AWS_REGION:-us-west-2}",
  "status": "SUCCESS",
  "outputs": $STACK_OUTPUTS,
  "deployedBy": "$(whoami)",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF

    print_status $GREEN "   ✅ Deployment report saved: $DEPLOYMENT_REPORT"

    # Step 10: Success summary
    echo ""
    print_status $GREEN "🎉 DEPLOYMENT COMPLETE!"
    print_status $GREEN "   Environment: $ENVIRONMENT"
    print_status $GREEN "   Stack: $STACK_NAME"
    print_status $GREEN "   Region: ${AWS_REGION:-us-west-2}"
    
    if [[ -n "$API_URL" ]]; then
        print_status $GREEN "   API URL: $API_URL"
    fi
    
    echo ""
    print_status $BLUE "📋 Next Steps:"
    echo "   1. Monitor CloudWatch logs for any issues"
    echo "   2. Run integration tests"
    echo "   3. Update DNS records if needed"
    echo "   4. Notify team of successful deployment"
    
    if [[ -f "$DEPLOYMENT_REPORT" ]]; then
        echo "   5. Review deployment report: $DEPLOYMENT_REPORT"
    fi
}

# Error handling
trap 'print_status $RED "❌ Deployment failed with error on line $LINENO"' ERR

# Run main function
main "$@"