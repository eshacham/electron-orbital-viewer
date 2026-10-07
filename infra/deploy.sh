#!/bin/bash
# Deploys the site and the on-demand compute stack (spec 2026-10-05 §10).
#
#   infra/deploy.sh [all]          compute stack, worker image, then the site built against it (the usual run)
#   infra/deploy.sh site           build the frontend (with the compute stack's settings if it exists) and deploy the site
#   infra/deploy.sh compute        the compute stack only (needs the site stack, infra/owner.env and the image in ECR)
#   infra/deploy.sh image          build the ARM64 worker image with OrbStack's docker and push it (no-op if ECR has it)
#   infra/deploy.sh destroy-compute  empty the worker repository, then destroy the compute stack (site and results stay)
#
#   ANOMALY_MONITOR=on|off         compute phases only: create (or remove) the cost-anomaly monitor. Unset keeps
#                                  whatever the deployed stack has (off on a first deploy), so a routine redeploy
#                                  never drops it silently. Turn it on only once the app/component cost-allocation
#                                  tags are active (Ruling D14).
#
# Order matters because each stack needs something from the other: the
# compute stack's CORS and Cognito redirect URLs need the site's CloudFront
# origin (a site stack output), and the site's build needs the compute
# stack's API URL and Cognito settings (VITE_* variables baked in by Vite).
# So: the site stack must exist first (the first ever run deploys it without
# jobs settings), then compute, then the site again with the settings.
# Each phase is one foreground command that finishes inside ten minutes on
# an update; a first compute deploy can take longer -- if the command is cut
# off, CloudFormation carries on, and running the same phase again resumes.
#
# Kept to macOS /bin/bash 3.2: no associative arrays, no ${var,,}, no mapfile.
# Sourcing it (as infra/tests/unit/test_deploy_script.py does) only defines
# the functions: the phases below run when it is executed.

# Exit on error
set -e

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
SITE_STACK=ElectronOrbitalViewerStack
COMPUTE_STACK=ElectronOrbitalViewerComputeStack
WORKER_REPOSITORY=electron-orbital-viewer-worker
PHASE="${1:-all}"

# Both stacks live in us-east-1 (the compute stack's subnets name
# us-east-1a/b). Pinned here, for the AWS CLI and for the CDK CLI, which
# resolves AWS_REGION before any profile: a shell or profile pointing
# elsewhere would otherwise make `output` find no site stack, and `all` would
# take that for a first run and build a second site in the wrong region.
REGION=us-east-1
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
DUMMY_COMPUTE_CONTEXT=(-c dataBucketName=unused -c siteOrigin=https://unused.invalid
                       -c alertEmail=unused@example.com -c imageTag=unused)

usage() {
  sed -n '2,13p' "$0"
}

output() {
  local value
  value=$(aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text 2>/dev/null || true)
  [ "$value" = "None" ] && value=""
  echo "$value"
}

resolved_region() {
  # The region the AWS CLI will actually use (local; no API call). Handles
  # both `region : us-east-1 : env : ...` (CLI v2) and the older columns.
  aws configure list 2>/dev/null | awk '{ gsub(/:/, " "); if ($1 == "region") { print $2; exit } }'
}

check_region() {
  # The assertion behind the pin above: refuse before any stack lookup if the
  # CLI resolves anything but us-east-1.
  local resolved
  resolved=$(resolved_region)
  if [ "$resolved" != "$REGION" ]; then
    echo "The AWS CLI resolves region '${resolved:-none}', not $REGION; refusing to look up or deploy stacks." >&2
    exit 1
  fi
}

check_credentials() {
  # `output` reads a failed lookup as "no such stack" (that is how the first
  # ever run is recognised), so a wrong region (above) or expired or missing
  # credentials must stop the script here, not send `all` down the first-run path.
  check_region
  if ! aws sts get-caller-identity --query Account --output text >/dev/null; then
    echo "The AWS CLI has no working credentials; refusing to guess which stacks exist." >&2
    exit 1
  fi
}

CDK_READY=""
setup_cdk() {
  [ -n "$CDK_READY" ] && return
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
  cdk bootstrap aws://${AWS_ACCOUNT}/${REGION}
  CDK_READY=1
}

build_site() {
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
}

check_molecule_data() {
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
    CLOUDFRONT_DOMAIN=$(output "$SITE_STACK" CloudFrontURL)
    if [ -z "$CLOUDFRONT_DOMAIN" ]; then
      CLOUDFRONT_DOMAIN="https://d3rhfcclqjt4tf.cloudfront.net"
    fi
    STATUS=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$CLOUDFRONT_DOMAIN/molecules/$DATA_VERSION/index.json" || echo "000")
    if [ "$STATUS" != "200" ]; then
      echo "Molecule data $DATA_VERSION is not published (index.json answered $STATUS at $CLOUDFRONT_DOMAIN). Run tools/molecules/publish.py $DATA_VERSION first." >&2
      exit 1
    fi
    echo "Molecule data $DATA_VERSION is published; proceeding."
  fi
}

image_tag() {
  # A content address of everything the worker image is built from (the
  # .dockerignore allow-list), so an unchanged worker is never rebuilt or
  # pushed twice, and a changed one always gets a new tag. Committed content
  # only: the tag is the worker's identity in every job's provenance.
  # Documentation is left out, here and from the image (.dockerignore), so
  # a README edit is not a new worker (final review I2: it was, and the next
  # `compute` named a tag ECR did not have).
  # Every git call is checked: a git that cannot run (an x86_64 process on
  # Apple silicon, where /usr/bin/git's shim fails) used to hash nothing,
  # and the empty listing's hash became a real tag.
  local paths=(tools/jobs ':(exclude)tools/jobs/tests' ':(exclude,glob)tools/jobs/**/*.md'
               ':(glob)tools/molecules/*.py' tools/molecules/requirements.lock .dockerignore)
  local changes listing
  if ! changes=$(git -C "$PROJECT_ROOT" status --porcelain -- "${paths[@]}"); then
    echo "git could not read the worker image's inputs in $PROJECT_ROOT; refusing to guess its tag." >&2
    return 1
  fi
  if [ -n "$changes" ]; then
    echo "Uncommitted changes in the worker image's inputs (${paths[*]}); commit them first." >&2
    return 1
  fi
  if ! listing=$(git -C "$PROJECT_ROOT" ls-files -s -- "${paths[@]}") || [ -z "$listing" ]; then
    echo "git listed none of the worker image's inputs in $PROJECT_ROOT; refusing to guess its tag." >&2
    return 1
  fi
  printf '%s\n' "$listing" | shasum -a 256 | cut -c1-16
}

image_in_ecr() {
  aws ecr describe-images --repository-name "$WORKER_REPOSITORY" --image-ids imageTag="$1" >/dev/null 2>&1
}

anomaly_monitor() {
  # Ruling D14: CreateAnomalyMonitor on a cost-allocation tag Billing has not
  # activated yet can roll back the whole compute deploy, so the monitor is
  # off until the owner turns it on. Once on, it stays on: an unset
  # ANOMALY_MONITOR follows the deployed stack, so a later routine deploy
  # cannot quietly delete a cost guard.
  local types err
  case "${ANOMALY_MONITOR:-}" in
    on|off) echo "$ANOMALY_MONITOR"; return ;;
    "") ;;
    *) echo "ANOMALY_MONITOR must be 'on' or 'off' (got '$ANOMALY_MONITOR')." >&2; return 1 ;;
  esac
  # Only "the stack does not exist" means off. Any other failure (throttling,
  # permissions) aborts: guessing off would delete an enabled monitor. The
  # resource types come back one per line and are matched with grep, so the
  # answer is the same however many pages the CLI fetched.
  err=$(mktemp)
  if ! types=$(aws cloudformation list-stack-resources --stack-name "$COMPUTE_STACK" \
      --query 'StackResourceSummaries[].ResourceType' --output text 2>"$err"); then
    if grep -q 'does not exist' "$err"; then
      rm -f "$err"; echo off; return
    fi
    echo "Could not tell whether $COMPUTE_STACK has the anomaly monitor; set ANOMALY_MONITOR=on or off explicitly:" >&2
    cat "$err" >&2; rm -f "$err"; return 1
  fi
  rm -f "$err"
  if printf '%s\n' "$types" | tr -s '\t ' '\n\n' | grep -qx 'AWS::CE::AnomalyMonitor'; then echo on; else echo off; fi
}

deploy_compute() {
  local bucket origin tag monitor
  bucket=$(output "$SITE_STACK" MoleculeDataBucketName)
  origin=$(output "$SITE_STACK" CloudFrontURL)
  if [ -z "$bucket" ] || [ -z "$origin" ]; then
    echo "The site stack $SITE_STACK has no MoleculeDataBucketName/CloudFrontURL outputs; run '$0 site' first." >&2
    exit 1
  fi
  # The owner's file is read here and never written, printed or committed
  # (Ruling D23): the address only travels as the alertEmail context value.
  if [ ! -f "$SCRIPT_DIR/owner.env" ]; then
    echo "infra/owner.env is missing: create it with one line, ALERT_EMAIL=<your email> (it is gitignored)." >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/owner.env"
  [ -n "$ALERT_EMAIL" ] || { echo "infra/owner.env sets no ALERT_EMAIL." >&2; exit 1; }
  tag=$(image_tag)
  monitor=$(anomaly_monitor)
  # Refused, not warned (final review I2): the job definition would name an
  # image ECR does not have, and every new job would fail to pull it. Only
  # a first deploy, which creates the repository, goes ahead without it
  # (`all` pushes the image straight after).
  if [ -n "$(output "$COMPUTE_STACK" WorkerRepositoryUri)" ] && ! image_in_ecr "$tag"; then
    echo "Worker image $tag is not in ECR. Refusing to deploy a job definition that names it: every new job would fail to pull its image. Run '$0 image' first (or '$0 all')." >&2
    exit 1
  fi
  # cdk synthesises the whole app, and the site stack's asset is dist/.
  [ -d "$PROJECT_ROOT/dist" ] || build_site
  setup_cdk
  cd "$SCRIPT_DIR"
  echo "Deploying $COMPUTE_STACK (worker image tag $tag, anomaly monitor $monitor)..."
  cdk deploy "$COMPUTE_STACK" --require-approval never \
    -c dataBucketName="$bucket" -c siteOrigin="$origin" -c alertEmail="$ALERT_EMAIL" -c imageTag="$tag" \
    -c anomalyMonitor="$monitor"
}

push_image() {
  local repo tag registry commit
  repo=$(output "$COMPUTE_STACK" WorkerRepositoryUri)
  if [ -z "$repo" ]; then
    echo "No worker repository yet (the compute stack is not deployed); skipping the image."
    return 0
  fi
  tag=$(image_tag)
  if image_in_ecr "$tag"; then
    echo "Worker image $tag is already in ECR."
    return 0
  fi
  registry="${repo%%/*}"
  # Read before the build, so a git that cannot run stops here rather than
  # baking an empty commit into every job's provenance.
  commit=$(git -C "$PROJECT_ROOT" rev-parse HEAD)
  aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
  cd "$PROJECT_ROOT"
  # OrbStack's docker; a plain manifest (no provenance/SBOM index) so ECR's
  # keep-the-last-5 rule counts images, not attestations. The tag is the
  # content hash above; GENERATOR_COMMIT is the commit the image was built at,
  # which every AWS job's provenance (meta.json, job.json) reports (D10).
  docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile --provenance=false --sbom=false \
    --build-arg GENERATOR_COMMIT="$commit" \
    -t "$repo:$tag" --push .
  echo "Pushed $repo:$tag"
}

deploy_site() {
  local api_url authority client_id domain
  api_url=$(output "$COMPUTE_STACK" JobsApiUrl)
  authority=$(output "$COMPUTE_STACK" CognitoAuthority)
  client_id=$(output "$COMPUTE_STACK" UserPoolClientId)
  domain=$(output "$COMPUTE_STACK" CognitoDomain)
  if [ -n "$api_url" ]; then
    # Read by the 6B-2 interface at build time (import.meta.env.VITE_*).
    export VITE_JOBS_API_URL="$api_url" VITE_COGNITO_AUTHORITY="$authority" \
           VITE_COGNITO_CLIENT_ID="$client_id" VITE_COGNITO_DOMAIN="$domain"
    echo "Building with the jobs API at $api_url"
  else
    echo "No compute stack yet: building without the jobs settings (owner sign-in stays hidden)."
  fi
  build_site
  check_molecule_data
  setup_cdk
  cd "$SCRIPT_DIR"
  echo "Deploying $SITE_STACK..."
  cdk deploy "$SITE_STACK" --require-approval never
  if [ -n "$api_url" ]; then
    echo "For the dev server's 'AWS' choice, put this line in .env.local at the repo root:"
    echo "JOBS_AWS_API_URL=$api_url"
  fi
}

destroy_compute() {
  local ids
  # Everything that can fail before the destroy goes first: the app must
  # synthesise (the site stack's asset is dist/) before any image is deleted,
  # or a failed destroy would leave a live stack whose jobs cannot pull their
  # image. The context values only have to be present for the app to define
  # the stack.
  [ -d "$PROJECT_ROOT/dist" ] || build_site
  setup_cdk
  cd "$SCRIPT_DIR"
  cdk synth "$COMPUTE_STACK" "${DUMMY_COMPUTE_CONTEXT[@]}" >/dev/null
  # The repository is also EmptyOnDelete; emptying it here as well means the
  # destroy never stalls on a repository that still holds images.
  ids=$(aws ecr list-images --repository-name "$WORKER_REPOSITORY" --query 'imageIds' --output json 2>/dev/null || echo '[]')
  if [ "$ids" != "[]" ]; then
    aws ecr batch-delete-image --repository-name "$WORKER_REPOSITORY" --image-ids "$ids" >/dev/null
  fi
  cdk destroy "$COMPUTE_STACK" --force "${DUMMY_COMPUTE_CONTEXT[@]}"
  echo "The jobs table is retained (job history and meters); delete it by hand if you want it gone."
  echo "A redeploy creates a new, empty table, so this month's meter starts again at \$0; the \$10 Budget still counts the month."
  echo "The live site still points at the deleted API and sign-in: run '$0 site' to rebuild it without them."
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "$PHASE" in
    all|site|compute|image|destroy-compute) check_credentials ;;
    -h|--help|help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac

  case "$PHASE" in
    all)
      if [ -z "$(output "$SITE_STACK" CloudFrontURL)" ]; then
        deploy_site            # first ever run: the compute stack needs the site's origin
      fi
      push_image               # an existing repository gets the image before the job definition names it
      deploy_compute
      push_image               # a repository created just now gets it here
      deploy_site
      ;;
    site) deploy_site ;;
    compute) deploy_compute ;;
    image) push_image ;;
    destroy-compute) destroy_compute ;;
  esac

  echo "Deployment complete!"
fi
