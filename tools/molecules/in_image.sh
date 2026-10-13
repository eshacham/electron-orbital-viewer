#!/bin/bash
# Runs a tools/molecules Python command inside the on-demand worker's image (Linux ARM64, OrbStack's docker),
# with this checkout mounted read-only at /repo (Phase 6D spec §6): pyscf-dispersion, which PySCF's
# B3LYP-D3(BJ) needs, has no build that runs on Apple-silicon macOS, and generating the library in the
# image the jobs run in also makes it reproducible. The code that runs is the checkout's (/repo), not the
# image's copy.
#
# Review fix round 1: the checkout is read-only. Only the generator's real write targets are bind-mounted
# read-write, each individually -- so a stray or mistaken invocation can never overwrite published data, the
# job store under tools/jobs/.state, or anything else in the checkout. PySCF's own scratch files go to /tmp
# inside the container (HOME=/tmp below), which needs no mount.
#
# Final review M3: the version directory bound read-write is version.py's DATA_VERSION, and only while that
# version is unpublished (no tools/molecules/manifest/<version>.json). Once published -- v3 since Task 15 --
# its local copy is immutable like v2's and stays read-only, unless MOLECULES_WRITE_VERSION names it: an
# explicit statement of which version is being generated. Naming any other version is refused.
#
#   docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile \
#     --build-arg GENERATOR_COMMIT=$(git rev-parse HEAD) -t orbital-viewer-worker:local --load .
#   MOLECULES_WRITE_VERSION=v4 tools/molecules/in_image.sh tools/molecules/build_library.py --only h2o
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
VERSION=$(sed -n 's/^DATA_VERSION = "\(v[0-9][0-9]*\)".*/\1/p' "$REPO/tools/molecules/version.py")
if [ -z "$VERSION" ]; then
  echo "tools/molecules/in_image.sh: no DATA_VERSION found in tools/molecules/version.py" >&2
  exit 5
fi
WRITE="${MOLECULES_WRITE_VERSION:-}"
if [ -n "$WRITE" ] && [ "$WRITE" != "$VERSION" ]; then
  echo "tools/molecules/in_image.sh: MOLECULES_WRITE_VERSION=$WRITE, but version.py's DATA_VERSION is $VERSION;" \
    "the generator writes only the version it builds" >&2
  exit 5
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "tools/molecules/in_image.sh: docker not found on PATH -- install OrbStack (it provides the docker CLI)" >&2
  exit 3
fi

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

# The generator's only legitimate write targets (build_library.py, generate.py, optimise.py): the library
# version being generated (above), the reference-energy cache (generate.py's CACHE_DIR), the seven committed
# geometries (optimise.py's GEOMETRY_DIR) and the validation summary build_library.py derives from them every
# run (write_validation_rows, unconditional). Created here so a clean checkout has them to bind; everything
# else in the repo stays read-only via the :ro mount below.
CACHE_DIR="$REPO/tools/molecules/.cache"
GEOMETRY_DIR="$REPO/tools/molecules/geometries"
VALIDATION_DIR="$REPO/src/validation/generated"
mkdir -p "$CACHE_DIR" "$GEOMETRY_DIR" "$VALIDATION_DIR"
OUT_BIND=()
if [ -f "$REPO/tools/molecules/manifest/$VERSION.json" ] && [ "$WRITE" != "$VERSION" ]; then
  echo "tools/molecules/in_image.sh: out/$VERSION is published (manifest/$VERSION.json), so it stays read-only;" \
    "set MOLECULES_WRITE_VERSION=$VERSION to generate into it" >&2
else
  mkdir -p "$REPO/tools/molecules/out/$VERSION"
  OUT_BIND=(-v "$REPO/tools/molecules/out/$VERSION:/repo/tools/molecules/out/$VERSION")
fi

exec docker run --rm --platform linux/arm64 --user "$(id -u):$(id -g)" \
  -e MOLECULES_GENERATOR_COMMIT="$commit" \
  -e OMP_NUM_THREADS="${OMP_NUM_THREADS:-8}" \
  -e PYSCF_MAX_MEMORY="${PYSCF_MAX_MEMORY:-12000}" \
  -e PYTHONPATH=/repo/tools:/repo/tools/molecules \
  -e HOME=/tmp \
  -v "$REPO":/repo:ro \
  ${OUT_BIND[@]+"${OUT_BIND[@]}"} \
  -v "$CACHE_DIR":/repo/tools/molecules/.cache \
  -v "$GEOMETRY_DIR":/repo/tools/molecules/geometries \
  -v "$VALIDATION_DIR":/repo/src/validation/generated \
  -w /repo \
  --entrypoint python "$IMAGE" "$@"
