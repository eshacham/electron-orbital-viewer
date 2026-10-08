#!/bin/bash
# Runs a tools/molecules Python command inside the on-demand worker's image (Linux ARM64, OrbStack's docker),
# with this checkout mounted at /repo (Phase 6D spec §6): pyscf-dispersion, which PySCF's B3LYP-D3(BJ) needs,
# has no build that runs on Apple-silicon macOS, and generating the library in the image the jobs run in
# also makes it reproducible. The code that runs is the checkout's (/repo), not the image's copy.
#
#   docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile \
#     --build-arg GENERATOR_COMMIT=$(git rev-parse HEAD) -t orbital-viewer-worker:local --load .
#   tools/molecules/in_image.sh tools/molecules/build_library.py --only h2o
#   tools/molecules/in_image.sh -m pytest tools/molecules/tests/test_dispersion.py -q -p no:cacheprovider
#
# The image has no git, so the commit every meta.json records is worked out here, by generate.git_commit's
# rule (HEAD, '-dirty' when tools/molecules has uncommitted changes), and passed in.
# Kept to macOS /bin/bash 3.2.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: tools/molecules/in_image.sh <python arguments>" >&2
  exit 2
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${MOLECULES_IMAGE:-orbital-viewer-worker:local}"
commit=$(git -C "$REPO" rev-parse HEAD)
if [ -n "$(git -C "$REPO" status --porcelain -- tools/molecules)" ]; then
  commit="$commit-dirty"
fi

exec docker run --rm --platform linux/arm64 --user "$(id -u):$(id -g)" \
  -e MOLECULES_GENERATOR_COMMIT="$commit" \
  -e OMP_NUM_THREADS="${OMP_NUM_THREADS:-8}" \
  -e PYSCF_MAX_MEMORY="${PYSCF_MAX_MEMORY:-12000}" \
  -e PYTHONPATH=/repo/tools:/repo/tools/molecules \
  -e HOME=/tmp \
  -v "$REPO":/repo -w /repo \
  --entrypoint python "$IMAGE" "$@"
