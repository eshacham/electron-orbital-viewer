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

# Create a fresh virtual environment. `python3` with a `python` fallback:
# macOS ships no bare `python`, and this script failed at exactly this line
# on a stock machine with python3 and the CDK CLI both installed.
PYTHON_BIN="$(command -v python3 || command -v python)"
if [ -z "$PYTHON_BIN" ]; then
  echo "No python3 (or python) on PATH; the CDK app needs one." >&2
  exit 1
fi
"$PYTHON_BIN" -m venv .venv
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
