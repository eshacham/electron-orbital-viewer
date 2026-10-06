#!/bin/bash

# Exit on error
set -e

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Building React application with production minification..."
cd "$PROJECT_ROOT"
npm run build

# The owner's dashboard (/admin.html) is a second Vite entry whose code must
# never reach the viewer's bundle (Phase 6B-2, spec §9.4). The Jest
# import-graph test guards the sources; this guards what is about to ship --
# a dependency or chunking change can merge the two without any source
# changing. Non-zero refuses the deploy (set -e).
echo "Checking the dashboard stays out of the main bundle..."
node tools/check_admin_split.mjs dist

# Refuse to deploy app code that reads a molecule data version which was
# never published (spec §4.5): the app bundles MOLECULE_DATA_VERSION from
# src/molecules/data_version.ts and fetches /molecules/$DATA_VERSION/...
# through CloudFront at runtime, where a missing key answers 403, never
# index.html -- a silent mismatch here would ship a Bonds mode that cannot
# load anything. Fails closed throughout: a file that exists but does not
# parse, or two version files that disagree, refuse to deploy rather than
# silently skipping the check.
VERSION_PY="$PROJECT_ROOT/tools/molecules/version.py"
DATA_VERSION_TS="$PROJECT_ROOT/src/molecules/data_version.ts"
if [ -f "$VERSION_PY" ]; then
  DATA_VERSION=$(sed -n 's/^DATA_VERSION = "\(.*\)"/\1/p' "$VERSION_PY")
  if [ -z "$DATA_VERSION" ]; then
    echo "$VERSION_PY exists but DATA_VERSION could not be parsed; refusing to deploy blind." >&2
    exit 1
  fi
  # The bundle is what actually decides which version the deployed app reads
  # (tested by tests/molecules/data_version.test.ts, but that test lives in
  # the source tree this script is about to ship from, not in the build
  # output) -- cross-checked here too, rather than trusting version.py alone.
  if [ -f "$DATA_VERSION_TS" ]; then
    BUNDLE_VERSION=$(sed -n "s/^export const MOLECULE_DATA_VERSION = '\\(.*\\)';/\\1/p" "$DATA_VERSION_TS")
    if [ -z "$BUNDLE_VERSION" ]; then
      echo "$DATA_VERSION_TS exists but MOLECULE_DATA_VERSION could not be parsed; refusing to deploy blind." >&2
      exit 1
    fi
    if [ "$BUNDLE_VERSION" != "$DATA_VERSION" ]; then
      echo "$VERSION_PY (DATA_VERSION=$DATA_VERSION) and $DATA_VERSION_TS (MOLECULE_DATA_VERSION=$BUNDLE_VERSION) disagree; refusing to deploy a bundle that may read the wrong data version." >&2
      exit 1
    fi
  fi
  # Prefer the stack's own CloudFrontURL output (the same lookup publish.py's
  # distribution_url() makes) over the hard-coded domain, so this check
  # tracks the real distribution even if it is ever recreated; fall back only
  # if the stack cannot be queried yet (e.g. credentials not configured).
  CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks --stack-name ElectronOrbitalViewerStack \
    --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" --output text 2>/dev/null || true)
  if [ -z "$CLOUDFRONT_DOMAIN" ] || [ "$CLOUDFRONT_DOMAIN" = "None" ]; then
    CLOUDFRONT_DOMAIN="https://d3rhfcclqjt4tf.cloudfront.net"
  fi
  STATUS=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$CLOUDFRONT_DOMAIN/molecules/$DATA_VERSION/index.json" || echo "000")
  if [ "$STATUS" != "200" ]; then
    echo "Molecule data $DATA_VERSION is not published (index.json answered $STATUS at $CLOUDFRONT_DOMAIN). Run tools/molecules/publish.py $DATA_VERSION first." >&2
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
