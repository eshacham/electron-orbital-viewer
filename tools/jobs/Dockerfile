# tools/jobs/Dockerfile — the on-demand worker (spec §8.1). Build context: the repo root.
#   docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile \
#     --build-arg GENERATOR_COMMIT=$(git rev-parse HEAD) -t orbital-viewer-worker:local --load .
#
# 6B-3 builds this same Dockerfile as a CDK asset, so nothing here may assume
# a local checkout beyond the generator and tools/jobs (see .dockerignore).
FROM --platform=linux/arm64 python:3.12-slim
# D2 (preflight controller correction): the image has no git and no .git, so
# write_molecule_files's commit stamp would otherwise be a FileNotFoundError
# (no git binary) or an empty string (no repo). The build is told the commit
# once, as a build arg, and the worker reads it from the environment instead
# of shelling out (tools/jobs/worker.py:_run, JOBS_GENERATOR_COMMIT).
ARG GENERATOR_COMMIT=unknown
ENV JOBS_GENERATOR_COMMIT=${GENERATOR_COMMIT}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/tools:/app/tools/molecules
WORKDIR /app
COPY tools/molecules/requirements.lock /app/requirements.lock
# geometric has no linux/aarch64 wheel and builds from its sdist here: it is
# pure Python, so this is slow but expected (D12). Stop and raise a ruling
# only if pyscf, numpy, scipy or h5py start building from source instead —
# that would mean the lock pins a version with no aarch64 wheel.
RUN pip install --no-cache-dir -r /app/requirements.lock
COPY tools/molecules/*.py /app/tools/molecules/
COPY tools/jobs /app/tools/jobs
# The worker writes files PySCF and geomeTRIC need no root for.
RUN useradd --uid 10001 worker
USER worker
ENTRYPOINT ["python", "-m", "jobs.worker"]
