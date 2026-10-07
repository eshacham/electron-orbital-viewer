# `tools/jobs` — on-demand molecule generation

Spec: `docs/superpowers/specs/2026-10-05-on-demand-generation-design.md`. This
package answers the question Phase 6's fixed library cannot: "compute this
one molecule I just typed or pasted." A request is canonicalised into a job
key, sized and priced before it runs, queued, run by a worker (locally as a
subprocess, on AWS in Phase 6B-3 as a Batch job in the image this directory
builds), and the result lands next to Phase 6's own `tools/molecules/out/`
so the same viewer renders both.

## Module map

| module | responsibility |
| --- | --- |
| `__init__.py` | Package docstring: everything here except `worker.py`, `make_basis_counts.py` and `calibrate.py` imports without PySCF or NumPy |
| `elements.py` | Symbol/Z tables, Z 1–36 only (spec §5.1) |
| `errors.py` | `JobRefused`: a refusal code, message and HTTP status a person reads |
| `canonical.py` | The job's identity: `canonical_job`, `job_key` (SHA-256 of `rfc8785.dumps`) |
| `pubchem.py` | Name/SMILES → PubChem CID → 3D conformer, stdlib only |
| `basis_counts.py` | Loads `basis_counts.json`, the committed PySCF-free basis-function table |
| `sizing.py` | `decide()`: size, timeout, capacity, attempts, reservation — deterministic, no PySCF |
| `prices.py` | Fargate us-east-1 Linux/ARM prices, retrieved 2026-10-04 |
| `model.py` | Job record shape, statuses, `public_view` (hides store bookkeeping) |
| `store.py` | `Store` contract + `FileStore`: create/claim/update/settle, the meter (derived from the records), `jobs_with_backend` for the runner's start-up sweep |
| `input_template.py` | Renders `input.py`, the exact PySCF script a job runs |
| `handlers.py` | `Api.handle`: the HTTP routes, framework-independent; an unexpected error answers 500 `internal-error`, never a dropped connection |
| `local_server.py` | Runs `Api` on `127.0.0.1:8787` for the Vite dev server to proxy to |
| `runner.py` | `LocalRunner` (subprocess, one job at a time, recovers what a stopped server left at start-up) and `NullRunner`; `BatchRunner` is 6B-3 |
| `sink.py` | `Sink` contract + `LocalSink`, writing to `tools/molecules/out/jobs/`; `S3Sink` is 6B-3 |
| `worker.py` | Runs one job end to end: claim, execute, write Phase 6's files, record the outcome. Never settles — the runner or `cli --wait` does (Ruling T5-b). Imports PySCF |
| `make_basis_counts.py` | Regenerates `basis_counts.json` from PySCF after a PySCF upgrade |
| `calibrate.py` | Fits `sizing.CONSTANTS` from finished jobs' `timings.json`/`job.json`: local (version 1), or `--aws` with the speedup probe (version 2) |
| `cli.py` | `enqueue`/`submit`/`generation`, see below |

## Running locally

From the repo root:

```bash
cd tools && ../tools/molecules/.venv/bin/python -m jobs.local_server
```

This serves the job API on `127.0.0.1:8787`, backed by `FileStore` under
`tools/jobs/.state/` and a `LocalRunner` that executes jobs as subprocesses.
Then, from the repo root:

```bash
npm run dev
```

The Vite dev server proxies `/api` to the local server (see
`vite.config.ts`), so the UI (6B-2) talks to the same `Api.handle` the AWS
Lambda will in 6B-3. `/molecules/jobs/<key>/…` is served from
`tools/molecules/out/jobs/` by the existing local-molecules middleware, the
same way Phase 6's library files are.

**Sizing figures are Fargate estimates, even for a local job.** Every
decision carries `estimateFor: "fargate"`: the size, predicted time and
timeout are what the job would get on AWS. A local run is not time-limited
(nothing enforces `timeoutSeconds` here), costs $0, and runs on this Mac's
PySCF, which is single-threaded (`lib.num_threads() == 1`) — so it takes
longer than the estimate whenever the estimate assumes more than one vCPU.

**Stopping the server mid-job.** The runner's queue lives in memory, so when
a new `LocalRunner` starts it sweeps every local record once, in every month:
`QUEUED` jobs are queued again; `STARTING` jobs, and `RUNNING` ones whose
heartbeat is more than 90 s old, become `FAILED` (`worker-crashed`, "the
local server stopped before this job finished") and settle at $0; a
finished job that was never settled is settled. A `RUNNING` job with a live
heartbeat is left alone — `cli submit --wait`, in another terminal, may be
running it. A worker stopped by Ctrl-C marks its own attempt `FAILED` on the
way out.

## CLI

Run from `tools/`, with the venv, for anything that touches PySCF:

```bash
python -m jobs.cli enqueue --name water              # queue without running
python -m jobs.cli enqueue --smiles "CCO"             # queue by SMILES
python -m jobs.cli enqueue --xyz path/to/molecule.xyz # queue a pasted geometry
python -m jobs.cli submit --name benzene --wait       # run to completion in the foreground
python -m jobs.cli submit --xyz no2.xyz --multiplicity 2 --wait   # --charge N / --multiplicity M, as the API takes them
python -m jobs.cli submit --name water --retry --wait # run a FAILED job again, as a new attempt
python -m jobs.cli generation off|on                  # the local kill switch (spec §10)
```

`enqueue` only creates the job record (via `NullRunner`) — it is what the
container smoke test below uses to hand the worker image something to run.
`submit --wait` runs the worker in-process, as the record's current attempt
(a retried job is attempt 2 or later), settles the job at $0, and prints the
final status (`DONE`, `FAILED worker-error: …`, or `duplicate` for an
existing job). Ctrl-C during `--wait` marks the job `FAILED`
(`worker-crashed`) and settles it before the interrupt ends the command.

## The worker image

Built once, run the same way locally and (in 6B-3) on AWS Batch:

```bash
docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile \
  --build-arg GENERATOR_COMMIT=$(git rev-parse HEAD) \
  -t orbital-viewer-worker:local --load .
```

Build context is the repo root. `.dockerignore` allow-lists only
`tools/molecules/*.py`, `tools/molecules/requirements.lock` and
`tools/jobs/` (minus `.state/` and `tests/`), so the image cannot see the
Electron app or anything else in the tree.

`--build-arg GENERATOR_COMMIT=…` matters: the image has no `git` binary and
no `.git` directory, so `write_molecule_files`'s commit stamp would
otherwise be a hard failure (no `git`) or an empty string (no repo). The
Dockerfile sets `ARG GENERATOR_COMMIT=unknown` right after `FROM` and
`ENV JOBS_GENERATOR_COMMIT=${GENERATOR_COMMIT}`; `worker.py` reads
`JOBS_GENERATOR_COMMIT` from the environment instead of shelling out to
`git` when it is set, so every file produced in the container — `meta.json`'s
`generator.commit`, its `provenance.generatorCommit`, and `job.json`'s
`generatorCommit` — carries the commit the image was built at.

`geometric` has no `linux/aarch64` wheel and builds from its sdist during
the `pip install` step — it is pure Python, so this is slow (a few seconds)
but expected. Stop and raise it as a build issue only if `pyscf`, `numpy`,
`scipy` or `h5py` start building from source instead: that means the lock
pins a version with no aarch64 wheel, which is a lock choice, not something
to work around in the Dockerfile.

### Container smoke test (spec §13 step 3)

The image runs as uid 10001; pass `--user $(id -u):$(id -g)` so it can write
the mounted host directories:

```bash
cd tools && KEY=$(../tools/molecules/.venv/bin/python -m jobs.cli enqueue --name methane | head -1) && cd .. && echo $KEY && \
docker run --rm --user $(id -u):$(id -g) -v "$PWD/tools/jobs/.state:/state" -v "$PWD/tools/molecules/out:/out" \
  orbital-viewer-worker:local run $KEY --local /out --state /state && \
python3 -c "import json;d=json.load(open('tools/jobs/.state/jobs/$KEY.json'));print(d['status'],d['actual'])" && \
ls tools/molecules/out/jobs/$KEY && tools/molecules/.venv/bin/python -c "
import json,hashlib,pathlib; r=pathlib.Path('tools/molecules/out/jobs/$KEY'); d=json.loads((r/'done.json').read_text())
assert all(hashlib.sha256((r/n).read_bytes()).hexdigest()==h for n,h in d['files'].items()); print('checksums ok')"
```

Expect the container to print `DONE`, the record to show `DONE` with
`actual.threads` (Linux PySCF is OpenMP-enabled, so this is normally greater
than 1 — a local Mac run shows 1, see below) and a Linux `peakMemoryGB`, and
the script to print `checksums ok`. Nothing ran this job through the local
runner or the CLI's own `--wait`, so it is not settled yet; the next local
server start settles it (the runner's start-up sweep), or settle it by hand:

```bash
cd tools && ../tools/molecules/.venv/bin/python -c "from jobs.store import FileStore; from jobs.local_server import STATE_ROOT; FileStore(STATE_ROOT).settle('$KEY', 0)"; cd ..
```

## Where state and results live

- `tools/jobs/.state/` — `FileStore`'s job records (`jobs/`), the PubChem
  resolution cache (`resolve/`) and the kill switch (`config.json`);
  gitignored. There is no meter file: the meter is summed from the job
  records' own reservations and charges (Ruling T5-a).
- `tools/molecules/out/jobs/<key>/` — a job's result files once it reaches
  `DONE`: `meta.json`, `basis.json`, `density.bin.gz`, `esp.bin.gz`,
  `geometry.xyz`, `input.py`, `output.log`, `timings.json`, `job.json`, and
  `done.json` (written last — its presence is what says the set is
  complete). Served at `/molecules/jobs/<key>/…` by the same middleware that
  serves Phase 6's library.

## Why this package stays free of PySCF and NumPy

Phase 6B-3 ships the `api` Lambda from this package alone — the request
handling, canonicalisation, sizing, pricing and the store, none of which
need chemistry. Only `worker.py` (runs the calculation), `make_basis_counts.py`
(regenerates the PySCF-derived basis table) and `calibrate.py` (fits sizing
constants from finished jobs' own numbers) import PySCF or NumPy, and all
three run only on a worker, never inside the request path. `test_no_chemistry_imports.py`
enforces this with an import-time check; keep any new PySCF/NumPy use inside
those three files, or the Lambda's deployment package balloons and the
`import` guarantee breaks.

## Recalibrating sizing

`sizing.CONSTANTS` is versioned (`SIZING_VERSION`) and fitted from real job
timings, not guessed. To refit after new local runs (Task 11's method):

```bash
cd tools && ../tools/molecules/.venv/bin/python -m jobs.calibrate \
  ../tools/molecules/out/jobs/<water-key> \
  ../tools/molecules/out/jobs/<benzene-key> \
  ../tools/molecules/out/jobs/<caffeine-key>
```

This prints the fitted `{m0, m2, t3, f2}` (least squares: memory is linear
in `(N/1000)²`; `SCF seconds × speedup(threads) − t0` is proportional to
`(N/1000)^3.5`; `f2` is fitted through the origin against `(N/1000)²` from
the `writing files` stage alone, with no `speedup` divided out — Phase 6's
grid-writing code is not threaded, Ruling D14). Round to three significant
figures, bump `SIZING_VERSION`, update `CONSTANTS` in `sizing.py`, and date
the comment with the machine the samples came from. Version 1 was fitted
from water, benzene and caffeine on an Apple M2 Pro (see `docs/HANDOFF.md`'s
"Phase 6B-1" section). Version 2, the current one, comes from AWS runs and
the speedup probe, and divides the files term by a speedup of its own (see
"In AWS" below and HANDOFF's "Phase 6B-3"). A local refit can no longer
replace it: this Mac's PySCF has no OpenMP, so its runs say nothing about
how a Fargate worker's vCPUs speed a job up.

## Keys are pinned

`job_key` is the SHA-256 of `rfc8785.dumps(canonical_job)`, and
`canonical.py`'s rounding, sorting and field set are exactly what every
stored job was keyed with. Changing how a job is canonicalised (rounding,
atom ordering, which fields enter the document) changes every future key for
molecules that have already been computed, silently splitting one molecule's
history across two keys or colliding two different ones. Any such change
must bump `computeVersion`, which is itself part of the canonical document,
so a version bump always produces new keys rather than reinterpreting old
ones.

## In AWS (Phase 6B-3)

The same handlers run in the `api` Lambda behind API Gateway and Cognito, with AWS adapters behind the same interfaces:

| Interface | Local (6B-1) | AWS (6B-3) |
|---|---|---|
| `Store` | `FileStore` (`tools/jobs/.state/`) | `DynamoStore`: one table; meter `METER#YYYY-MM`, resolutions `RESOLVE#…`, `CONFIG`, `BILLING#YYYY-MM`; GSI `byMonth` |
| `Runner` | `LocalRunner` (a subprocess) | `BatchRunner`: Fargate Spot or on-demand, size and timeout per job, retries only on a Spot interruption |
| `Sink` | `LocalSink` (`tools/molecules/out/jobs/`) | `S3Sink`: `molecules/jobs/<key>/` in the data bucket, result files written once (`If-None-Match: *`) |
| settlement | `LocalRunner`, at $0 | `reconcile.py`: Batch events plus a 15-minute sweep, billed seconds from ECS, exactly once |

- `tests/test_store.py` is the `Store` contract and runs against both backends (DynamoDB on moto). Run all with `tools/molecules/.venv/bin/python -m pytest tools/jobs -q`.
- `python -m jobs.worker run <key> --aws` is what Batch runs. It reads `JOBS_TABLE` and `DATA_BUCKET`, and the attempt is `JOB_ATTEMPT_OFFSET + AWS_BATCH_JOB_ATTEMPT`. At claim it writes its own `AWS_BATCH_JOB_ID` as the record's `runnerJobId` where none is (`Store.note_runner_job_id`), because the api can lose the id SubmitJob returned (a Lambda timeout after the call) and reconcile finds a run by that id.
- Root result files are written `no-cache` and only `done.json` `immutable`: until `done.json` exists a root may still be cleared and rewritten (D7), so nothing there may sit at the edge for a year.
- `reconcile.py` fails a job that has waited 30 minutes in Batch's queue as `no-capacity`, unless the wait is the app's own doing. Each compute environment holds 32 vCPU (`batch_runner.MAX_VCPUS`, which the stack imports), so a job queued behind the owner's own running jobs, or behind jobs ahead of it on the same queue, waits on. Its clock restarts when one of them ends. It settles a record left `FAILED` or `DONE` without a Batch job id and never settled (a settle that failed) at what its worker reported. Once a day (the sweep in 00:00–00:15 UTC) it also scans every month for unsettled records, not only this month and last.
- Expected refusals are 4xx (`paused` 409, `pubchem-unavailable` 424), so the API's 5xx alarm means a fault. PubChem calls time out at 6 s each, so a resolution's three calls fit in the api Lambda's 29 s.
- `python -m jobs.worker probe …` is the speedup probe (`probe.py`): benzene's SCF and file write timed at 32, 16, 8, 4 and 2 threads in one task, printed as one JSON line.
- Recalibrating from AWS: fetch the jobs' `job.json` and `timings.json` from CloudFront into one folder each, then run `python -m jobs.calibrate --aws [--probe probe.log] <folders>` (from `tools/`). It prints `compare` (each job's recorded prediction against its run), `fit` (unguarded, with notes), and `constants` and `guards`, which are ready for `sizing.CONSTANTS`. Commit a new `SIZING_VERSION` and redeploy (`infra/deploy.sh all`, or `image` then `compute`).
- On AWS a job's `peakMemoryGB` is not what it needs. `PYSCF_MAX_MEMORY` is 80 % of the worker's memory, so PySCF keeps the two-electron integrals in memory whenever they fit (benzene on S: 5.4 of its 6.1 GB). `calibrate` fits memory on the working set (`workingSetGB`), which leaves those integrals out.
- Deploying, the owner's controls and the owner actions are in `infra/README.md`.
