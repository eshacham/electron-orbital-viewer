#!/bin/bash

# Exit on error
set -e

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Building React application with production minification..."
cd "$PROJECT_ROOT"
npm run build

# Refuse to deploy app code that reads a molecule data version which was
# never published (spec §4.5): the app's loader fetches
# /molecules/$DATA_VERSION/... from this CloudFront distribution (the same
# domain publish.py's distribution_url() resolves from the stack's
# CloudFrontURL output), and a missing key answers 403, never index.html, so
# a silent mismatch here would ship a Bonds mode that cannot load anything.
DATA_VERSION=$(sed -n 's/^DATA_VERSION = "\(.*\)"/\1/p' "$PROJECT_ROOT/tools/molecules/version.py")
if [ -n "$DATA_VERSION" ]; then
  MOLECULE_DATA_CDN="https://d3rhfcclqjt4tf.cloudfront.net"
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$MOLECULE_DATA_CDN/molecules/$DATA_VERSION/index.json")
  if [ "$STATUS" != "200" ]; then
    echo "Molecule data $DATA_VERSION is not published (index.json answered $STATUS). Run tools/molecules/publish.py $DATA_VERSION first." >&2
    exit 1
  fi
  echo "Molecule data $DATA_VERSION is published; proceeding."
fi

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
