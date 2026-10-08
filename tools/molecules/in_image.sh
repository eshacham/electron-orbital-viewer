#!/bin/bash
# Runs a tools/molecules Python command inside the on-demand worker's image (Linux ARM64, OrbStack's docker),
# with this checkout mounted read-only at /repo (Phase 6D spec §6): pyscf-dispersion, which PySCF's
# B3LYP-D3(BJ) needs, has no build that runs on Apple-silicon macOS, and generating the library in the
# image the jobs run in also makes it reproducible. The code that runs is the checkout's (/repo), not the
# image's copy.
#
# Review fix round 1: the checkout is read-only. Only the generator's real write targets are bind-mounted
# read-write, each individually -- so a stray or mistaken invocation (version.py's DATA_VERSION is still
# "v2"; Task 14 moves it to "v3") can never overwrite the published tools/molecules/out/v2 data, the job
# store under tools/jobs/.state, or anything else in the checkout. PySCF's own scratch files go to /tmp
# inside the container (HOME=/tmp below), which needs no mount.
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

if ! command -v docker >/dev/null 2>&1; then
  echo "tools/molecules/in_image.sh: docker not found on PATH -- install OrbStack (it provides the docker CLI)" >&2
  exit 3
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${MOLECULES_IMAGE:-orbital-viewer-worker:local}"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "tools/molecules/in_image.sh: image '$IMAGE' not found -- build it first:" >&2
  echo "  docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile --build-arg GENERATOR_COMMIT=\$(git rev-parse HEAD) -t $IMAGE --load ." >&2
  exit 4
fi

commit=$(git -C "$REPO" rev-parse HEAD)
if [ -n "$(git -C "$REPO" status --porcelain -- tools/molecules)" ]; then
  commit="$commit-dirty"
fi

# The generator's only legitimate write targets (build_library.py, generate.py, optimise.py): the new
# library version, the reference-energy cache (generate.py's CACHE_DIR), the seven committed geometries
# (optimise.py's GEOMETRY_DIR) and the validation summary build_library.py derives from them every run
# (write_validation_rows, unconditional). Created here so a clean checkout has them to bind; everything
# else in the repo stays read-only via the :ro mount below.
OUT_V3="$REPO/tools/molecules/out/v3"
CACHE_DIR="$REPO/tools/molecules/.cache"
GEOMETRY_DIR="$REPO/tools/molecules/geometries"
VALIDATION_DIR="$REPO/src/validation/generated"
mkdir -p "$OUT_V3" "$CACHE_DIR" "$GEOMETRY_DIR" "$VALIDATION_DIR"

exec docker run --rm --platform linux/arm64 --user "$(id -u):$(id -g)" \
  -e MOLECULES_GENERATOR_COMMIT="$commit" \
  -e OMP_NUM_THREADS="${OMP_NUM_THREADS:-8}" \
  -e PYSCF_MAX_MEMORY="${PYSCF_MAX_MEMORY:-12000}" \
  -e PYTHONPATH=/repo/tools:/repo/tools/molecules \
  -e HOME=/tmp \
  -v "$REPO":/repo:ro \
  -v "$OUT_V3":/repo/tools/molecules/out/v3 \
  -v "$CACHE_DIR":/repo/tools/molecules/.cache \
  -v "$GEOMETRY_DIR":/repo/tools/molecules/geometries \
  -v "$VALIDATION_DIR":/repo/src/validation/generated \
  -w /repo \
  --entrypoint python "$IMAGE" "$@"
