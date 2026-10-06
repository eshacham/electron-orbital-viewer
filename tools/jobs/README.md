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
| `store.py` | `Store` contract + `FileStore`: create/claim/update/settle, the meter |
| `input_template.py` | Renders `input.py`, the exact PySCF script a job runs |
| `handlers.py` | `Api.handle`: the HTTP routes, framework-independent |
| `local_server.py` | Runs `Api` on `127.0.0.1:8787` for the Vite dev server to proxy to |
| `runner.py` | `LocalRunner` (subprocess) and `NullRunner`; `BatchRunner` is 6B-3 |
| `sink.py` | `Sink` contract + `LocalSink`, writing to `tools/molecules/out/jobs/`; `S3Sink` is 6B-3 |
| `worker.py` | Runs one job end to end: claim, execute, write Phase 6's files, settle. Imports PySCF |
| `make_basis_counts.py` | Regenerates `basis_counts.json` from PySCF after a PySCF upgrade |
| `calibrate.py` | Fits `sizing.CONSTANTS` from finished jobs' `timings.json`/`job.json` |
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

## CLI

Run from `tools/`, with the venv, for anything that touches PySCF:

```bash
python -m jobs.cli enqueue --name water              # queue without running
python -m jobs.cli enqueue --smiles "CCO"             # queue by SMILES
python -m jobs.cli enqueue --xyz path/to/molecule.xyz # queue a pasted geometry
python -m jobs.cli submit --name benzene --wait       # run to completion in the foreground
python -m jobs.cli generation off|on                  # the local kill switch (spec §10)
```

`enqueue` only creates the job record (via `NullRunner`) — it is what the
container smoke test below uses to hand the worker image something to run.
`submit --wait` runs the worker in-process and prints the final status
(`DONE`, `FAILED worker-error: …`, or `duplicate` for an existing job).

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
runner or the CLI's own `--wait`, so settle it by hand to keep the local
meter's book tidy:

```bash
cd tools && ../tools/molecules/.venv/bin/python -c "from jobs.store import FileStore; from jobs.local_server import STATE_ROOT; FileStore(STATE_ROOT).settle('$KEY', 0)"; cd ..
```

## Where state and results live

- `tools/jobs/.state/` — `FileStore`'s job records and the meter (gitignored).
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
the comment with the machine the samples came from. Version 1 (current) was
fitted from water, benzene and caffeine on an Apple M2 Pro — see
`docs/HANDOFF.md`'s "Phase 6B-1" section for the constants and their
measured-vs-predicted table.

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
