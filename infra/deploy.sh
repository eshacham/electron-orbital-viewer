#!/bin/bash

# Exit on error
set -e

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Building React application with production minification..."
cd "$PROJECT_ROOT"
npm run build

echo "Deploying to AWS using CDK..."
cd "$SCRIPT_DIR"

# Clean up any existing virtual environment
rm -rf .venv

# Create a fresh virtual environment
python -m venv .venv
source .venv/bin/activate

# Install CDK dependencies
pip install -r requirements.txt

# Bootstrap the AWS environment with explicit account and region
echo "Bootstrapping AWS environment..."
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
cdk bootstrap aws://${AWS_ACCOUNT}/${AWS_REGION}

# Deploy the stack
cdk deploy --require-approval never

echo "Deployment complete!"
