# Spec: On-Demand Molecule Generation (Phase 6B)

**Status:** approved section by section 2026-10-04/05 (brainstorm Sections 1–6);
the owner waived reading the written spec ("commit it … go to planning").
**Extends:** `2026-09-25-beyond-isolated-atoms.md` (its §3 principles, §4.2 data
format and §4.5 data storage bind here too). Removes nothing.
**Depends on:** Phase 6 as planned in
`docs/superpowers/plans/2026-09-25-phase-6-molecule-library.md` — its Molecules
mode, its per-molecule builder (`build_library.build_molecule`, `run_dft`,
`optimise_steps`) and its generalisation of the diatomic-only code paths
(HANDOFF "For Phase 6"). This spec adds a second tier of molecules to that
mode; it does not rebuild the mode.

---

## 1. Goal

The app must not be limited to a curated list. When a molecule is not in the
validated library, the owner can ask for it, the app computes it with the
same open pipeline, shows how it did so, and keeps the result for everyone
who has the link. This phase is owner-only: it exists to measure what
generation costs and how long it takes, molecule by molecule, before anyone
else can trigger it.

**Hard limits:** generation is behind a Cognito login only the owner holds;
compute spend is capped at **$10 per calendar month in total** (§7).

## 2. Scope

**In:** recipe A `single` and recipe B `optimise` (§8); the job API, job
table, cost meter, deterministic worker sizing, worker image, local backend
and local→AWS mode; the request panel, live status, provenance panel, the
`computed` tier in Molecules mode, the owner dashboard `/admin.html`;
the AWS compute stack, budgets, alarms; tests and a staged rollout.

**Later, separate plan:** recipe C `scan` (AWS Batch array jobs, optional
CCSD(T) energies), which also feeds the bond-type catalogue sub-project.

**Out:** public or paid access, per-user data, in-browser computation,
EC2 workers beyond Fargate's largest size, elements beyond Kr, WAF, a
staging environment (it arrives with the public phase, as its own stack).

## 3. Architecture

One job API, two interchangeable backends:

```
browser ──/api/v1──▶ AWS:   API Gateway HTTP API (Cognito JWT) ─▶ api Lambda ─▶ DynamoDB (jobs, meter)
                                                                    └─▶ AWS Batch (Fargate / Fargate Spot) ─▶ worker ─▶ S3 molecules/jobs/{key}/
                     local: Vite dev server proxy ─▶ local job server (127.0.0.1) ─▶ worker subprocess ─▶ tools/molecules/out/jobs/{key}/
results ◀── /molecules/jobs/{key}/… (CloudFront in AWS; the dev server's local-first middleware locally)
```

- **One implementation of the job logic:** a Python package `tools/jobs/`
  (canonicalisation and hashing, PubChem resolution, the sizing rule, prices
  and the cost meter, request validation, the route handlers) behind two
  storage/compute adapters — DynamoDB + Batch, and filesystem + subprocess.
  The `api` Lambda and the local job server import the same handlers, so
  local and AWS cannot drift.
- **One worker image**, run by Batch on Fargate (ARM64) and locally (OrbStack's
  Docker, or straight from `tools/molecules/.venv`).
- The browser calls the API at its own `execute-api` URL in AWS; CORS allows
  only the CloudFront origin and the dev-server origins (§10.2). The dev
  server proxies `/api` to the local job server or to the AWS API, per the
  owner's "where jobs run" choice (§9.6).

## 4. API

API Gateway **HTTP API**, `$default` stage with auto-deploy, versioned paths.
Every route requires a valid Cognito access token (JWT authorizer) in AWS;
the local server binds to 127.0.0.1 and has no auth.

| Route | Purpose |
|---|---|
| `POST /api/v1/jobs/preview` | Resolve and size a request without writing anything: canonical job, key, formula, electron count, basis-function count, sizing decision, reservation, month remaining, and the existing job's status if the key is known. Refusals come back here with their reason. |
| `POST /api/v1/jobs` | Submit. `201` with `{key, status}` for a new job; `200` with the existing record for a known key (§6.3). `{"retry": true}` re-queues a `FAILED` key. |
| `GET /api/v1/jobs/{key}` | Status record: status, stage, heartbeat time, latest energy, log tail, prediction, actuals, reserved and actual cost. |
| `GET /api/v1/jobs?month=YYYY-MM[&status=…]` | The month's jobs (owner dashboard, the computed list). |
| `GET /api/v1/costs?month=YYYY-MM` | The meter (spent, reserved, cap, remaining), daily spend, month-end projection, and the latest Cost Explorer figure. |

**Request body** (`POST /jobs` and `/jobs/preview`), strict schema, unknown
fields rejected:

```json
{ "recipe": "single" | "optimise",
  "molecule": { "name": "caffeine" } | { "smiles": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" } | { "xyz": "<XYZ text, ≤ 64 KB, ≤ 200 atoms>" },
  "charge": 0, "multiplicity": 1,
  "retry": false }
```

`charge` and `multiplicity` are optional (defaults in §5.1). Method and basis
are fixed per recipe this phase (§8), so the client never chooses them.

**Protections:** default route throttle 5 req/s (burst 10); `POST /jobs`
1 req/s (burst 5); API access logs; input validated before any record
exists; least-privilege IAM per Lambda and for the worker (writes only under
`molecules/jobs/`); no secrets in code.

## 5. Calculation identity and data format

### 5.1 Resolving a request to a geometry (in the handler, before hashing)

- **Name or SMILES** → PubChem PUG REST → CID → the CID's computed 3D
  conformer (SDF). Refused with "PubChem has no 3D structure for this
  compound; paste an XYZ instead" when none exists (salts, very large or
  flexible molecules). Resolutions are cached (`RESOLVE#<normalised query>`
  → CID, atoms, retrieval date) so a repeated name never re-contacts PubChem.
- **Pasted XYZ** is parsed (element symbols or atomic numbers, Å).
- **Charge** defaults to 0. **Multiplicity** defaults to the lowest spin the
  electron count allows (1 for even, 2 for odd); a multiplicity of the wrong
  parity is refused.
- **Elements:** H–Kr (Z 1–36) only. Heavier elements need effective core
  potentials, which the renderer's density cannot represent; refused with
  that reason.

### 5.2 The canonical job document and its key

```json
{ "computeVersion": 1,
  "recipe": "single",
  "method": { "xc": "B3LYP", "basis": "def2-TZVP", "optimiseBasis": null },
  "molecule": { "atoms": [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], …],
                "charge": 0, "multiplicity": 1 } }
```

- Atoms are `[Z, x, y, z]` in Å, each coordinate rounded to **10⁻⁵ Å**
  (`-0.0` written as `0.0`), sorted by (Z, x, y, z).
- **Key = lowercase hex SHA-256 of the RFC 8785 (JCS) serialisation** of this
  document (Python package `rfc8785`). Tests pin known keys.
- **Not in the key:** the geometry's source (CID, name, retrieval date,
  pasted), the image digest, the generator commit. These are provenance in
  `job.json`/`meta.json`. Rebuilding the image therefore never invalidates
  results; only a `computeVersion` bump (same inputs would now give
  different results) does.

### 5.3 Result layout

Identical in S3 (`molecules/jobs/{key}/`) and locally
(`tools/molecules/out/jobs/{key}/`):

| Path | Contents |
|---|---|
| `job.json` | The canonical document, the key, provenance (geometry source, image digest, PySCF version, generator commit), the sizing rule version and its prediction |
| `meta.json`, `basis.json`, `density.bin.gz`, `esp.bin.gz` | Phase 6's per-molecule files from `build_molecule`, unchanged in format (voxel-averaged density), plus `meta.tier = "computed"` and `meta.provenance` (§9.3) |
| `input.py` | The PySCF script that built `mol` and `mf` — the worker generates it, then executes it (§8.3) |
| `output.log` | PySCF's log, including every convergence attempt |
| `geometry.xyz` | The geometry computed on; for recipe B the optimised one, with `trajectory.xyz` beside it |
| `timings.json` | Wall time per stage, peak memory, size, capacity (Spot/on-demand or local), attempt number |
| `done.json` | SHA-256 of every file above; written last with `If-None-Match: *`. A folder without it is not a result |

While a job runs, each attempt writes to `attempts/{n}/` (`input.py`,
`output.log`, `timings.json`); on success the result files are written at
the root, `done.json` last. A failed attempt leaves its `attempts/{n}/`
files (so a failure can be read) and nothing at the root. Root files are
never overwritten.

**Unlisted results:** the bucket stays private behind CloudFront's Origin
Access Control with no listing, so a result is reachable only by its key.

## 6. Job lifecycle

### 6.1 States

`QUEUED → STARTING → RUNNING → DONE | FAILED`. `STARTING` is Batch's
RUNNABLE/STARTING (capacity and image pull); `RUNNING` is set by the worker.

### 6.2 Submit

The handler validates, resolves (§5.1), canonicalises (§5.2), sizes (§7),
and then, in **one DynamoDB transaction**:

- `Put` the job record with `attribute_not_exists(pk)` (or, for a retry, an
  `Update` conditional on `status = FAILED`, incrementing `attempt`), and
- `Update` the month's meter with the reservation (§6.4).

Only after the transaction succeeds does it call `batch:SubmitJob` and store
the Batch job id. A Batch submission error marks the job `FAILED` and
releases the reservation in the same way settlement does.

### 6.3 Deduplication

| Existing status | Response |
|---|---|
| `DONE` | The record and result link, immediately |
| `QUEUED` / `STARTING` / `RUNNING` | The record; the client follows it |
| `FAILED` | The record and its error; re-queued only on `retry: true` |

### 6.4 The meter, and why the cap is hard

All money is integer **micro-dollars**. Item `METER#YYYY-MM` holds
`spent`, `reserved` and `committed = spent + reserved` (DynamoDB conditions
cannot add attributes, so the sum is stored).

- **Reserve at submit:** `ADD committed :w, reserved :w` with condition
  `attribute_not_exists(committed) OR committed <= :capMinusW`, where `:w` is
  the job's worst case (§7.4) and the cap is **$8.80** of compute (the other
  $1.20 of the $10 is set aside for fixed costs, §11). Refused with "Monthly
  budget reached: $X spent, $Y reserved" when the condition fails.
- **Settle at the end** (DONE or FAILED): `ADD spent :actual, reserved -:w,
  committed (:actual - :w)`, conditional on the job record's `settled` flag
  being unset, set in the same transaction — settlement happens exactly once.
- **Billed seconds** = the ECS task's `pullStartedAt` → `stoppedAt` for every
  attempt (Fargate bills from image pull, per second, 1-minute minimum),
  read with `ecs:DescribeTasks` by the reconcile Lambda when Batch reports
  the attempt finished; if the task is no longer describable, the Batch
  attempt's `startedAt` → `stoppedAt` + 60 s. Actual cost = Σ attempts of
  billed seconds × that attempt's capacity price (§7.5).
- A job is charged to the month it was submitted in.

### 6.5 Running

- The worker's first act is a conditional `STARTING → RUNNING` write with its
  attempt number; if that fails (a duplicate copy), it exits without work.
- Every **30 s** it heartbeats: stage (`"SCF"`, `"optimisation step 4"`),
  latest energy, the last 20 lines of the log (≤ 4 KB), peak memory so far.
- On success: result files, `done.json`, then `DONE` with timings. On error:
  the reason (`SCF did not converge`, `out of memory`, `timed out`, a Python
  exception's last line), then `FAILED`.

### 6.6 Never stuck

The `reconcile` Lambda receives Batch "Job State Change" events
(EventBridge) and also sweeps every 15 minutes. A job whose Batch job has
ended without the worker reporting (out of memory, Spot reclaimed after the
last retry, timeout), or whose heartbeat is older than 5 minutes while Batch
says it is not running, is marked `FAILED` with Batch's reason and settled.

### 6.7 Watching

The app polls `GET /jobs/{key}` every 5 s while a job is not terminal and
shows the stage, elapsed time and the cost so far (billed-so-far estimate).

## 7. Sizing: the app decides, by a deterministic, versioned rule

No manual override. The rule is pure Python in `tools/jobs/sizing.py`, with
`SIZING_VERSION` and its constants committed; every job records the version
and the prediction.

### 7.1 Inputs

Recipe; closed or open shell; electron count; atom count; **N**, the number
of basis functions, summed from a committed per-element table
(`tools/jobs/basis_counts.json`, Z 1–36, for def2-SVP and def2-TZVP,
generated once from PySCF with spherical functions). The API needs no
chemistry package.

### 7.2 Predictions

- **Memory:** `mem_GB = m0 + m2 · (N/1000)²` (matrices, DIIS history and the
  integration grid).
- **Time of one DFT single point** on `c` vCPUs:
  `t_s = (t0 + t3 · (N/1000)^3.5) / speedup(c)`, `speedup(c) = c^0.8`.
- **Recipe B:** `steps = min(10 + 2 · atoms, 100)` optimisation steps, each
  one SVP single point plus its gradient (`g ·` the SVP single-point time),
  then one TZVP single point.
- Open shells multiply time by 1.5 (ROKS convergence).
- **Version 1's constants** (`m0, m2, t0, t3, g`) are fitted from local runs
  on the Mac during the implementation plan (H₂O, benzene, caffeine) and
  committed; **version 2** is refitted from the AWS calibration ladder (§13).

### 7.3 Choosing the worker

| Size | vCPU | Memory (GB) |
|---|---|---|
| S | 2 | 8 |
| M | 4 | 16 |
| L | 16 | 64 |
| XL | 32 | 244 |

The **smallest size with memory ≥ 2 × predicted memory**. Refused when even
XL does not fit ("beyond the largest Fargate worker"). XL depends on AWS Batch
accepting a 32 vCPU/244 GB Fargate job definition; the infrastructure plan's
first task verifies it, and if Batch refuses, XL is dropped and refusals start
above L.

### 7.4 Timeout, capacity and reservation

- **Timeout** = clamp(3 × predicted time, 10 min, recipe ceiling), ceilings
  **single 1 h, optimise 2 h**. A prediction longer than the ceiling is
  refused ("longer than this phase allows").
- **Capacity:** Fargate **Spot** when predicted time ≤ 60 min, else
  **on-demand**. Spot jobs retry up to 2 times on a Spot interruption only.
- **Reservation (worst case)** = Σ over the allowed attempts of
  timeout × that size's price — 3 attempts on Spot, 1 on-demand.

### 7.5 Prices

`tools/jobs/prices.py`, us-east-1 Linux/ARM, with the retrieval date
(2026-10-04): Fargate on-demand $0.03238 per vCPU-hour and $0.00356 per
GB-hour; Fargate Spot $0.01034 and $0.00114. The daily Cost Explorer figure
(§11) is the check that these are right.

## 8. The worker

### 8.1 Image

Python 3.12, PySCF 2.8.0, geomeTRIC, NumPy, the `tools/molecules` generator
and `tools/jobs`; Linux ARM64; built with `docker buildx` on **OrbStack** and
pushed to ECR by `infra/deploy.sh`. Entry point: `worker run <key>
[--local <out-root>]`; it reads `job.json` from S3 (or the local folder).

### 8.2 Recipes

| Recipe | What | Method | Caveat shown in the UI |
|---|---|---|---|
| **A `single`** | One SCF at the given geometry, then Phase 6's files | B3LYP/def2-TZVP; RKS for closed shells, ROKS for open shells (Phase 6's `run_dft`) | "Geometry is PubChem's force-field conformer (or as pasted), not optimised." |
| **B `optimise`** | geomeTRIC optimisation (`optimise_steps` at def2-SVP), then A at the optimised geometry | B3LYP/def2-SVP optimisation, B3LYP/def2-TZVP single point | "No dispersion correction and no frequency check: not confirmed to be a minimum." |

Recipe B writes each step's geometry to `attempts/{n}/trajectory.xyz`; a
retried attempt resumes from the last geometry.

### 8.3 Transparency

`input.py` is generated from the canonical job (molecule, basis, functional,
grids, the convergence ladder) and **executed by the worker** to produce
`mol` and `mf`; post-processing (grids, ESP, orbital selection, `meta.json`)
is Phase 6's `build_library` at the commit recorded in provenance. `input.py`
runs on its own with PySCF installed and reproduces the SCF.

### 8.4 Convergence and failure

A fixed ladder, each attempt logged: DIIS (max 100 cycles) → level shift
0.3 Ha → second-order (`newton()`). All three failing → `FAILED`, "SCF did
not converge". A `BudgetExceeded` from `build_molecule` (files over 3 MB at
every grid size) → `FAILED` with that reason. Out-of-memory, timeouts and
Spot interruptions are reported by Batch and recorded by `reconcile` (§6.6).

### 8.5 Orbitals and labels

Phase 6's selection (all occupied plus the most valence-like virtuals) and
labels (point-group irreps when PySCF finds symmetry, else HOMO−n / LUMO+n
with energies).

## 9. The interface

### 9.1 Molecules mode: two tiers

Phase 6's library gains a tier on every entry: **validated** (the curated,
benchmarked data, v2) and **computed** (on request, not benchmarked), each
with a badge and a one-line explanation, always visible on the molecule.
Absent `tier` means validated (v1/v2 files predate it). The owner sees a
"Computed" category listing the month's `DONE` jobs (`GET /jobs?status=DONE`);
nobody else sees a list. A computed molecule's share link
(`…#mode=molecules&job=<key>`) opens for anyone, reading
`/molecules/jobs/<key>/`. The loader takes a base URL per entry (versioned
library path, or the jobs path) instead of one global base.

### 9.2 Request panel (owner only)

Name / SMILES / XYZ input, recipe A or B, optional charge and multiplicity →
**Preview** (`/jobs/preview`): ball-and-stick of the resolved structure,
formula, charge, multiplicity, electron count, N, and the sizing decision
(size, Spot or on-demand, predicted time and memory, reservation, what
remains of the month). Refusals show their reason here. **Submit**; a known
key turns the button into "Already computed — open it" or "Already running —
follow it".

### 9.3 Live status and provenance

- Status: the state, stage, latest energy, log tail, elapsed time and cost so
  far, polled every 5 s; `DONE` opens the molecule in the viewer.
- **"How this was computed"** on every molecule (both tiers): method and
  basis, geometry source (PubChem CID with a link, pasted, optimised), the
  recipe's caveats, links to `input.py`, `output.log`, `geometry.xyz`,
  `job.json`, and for computed molecules the time and cost.
- `meta.provenance` = `{ jobKey, computeVersion, recipe, geometrySource
  {kind, cid?, name?, retrievedAt?}, caveats[], generatorCommit, imageDigest,
  pyscfVersion, sizingVersion, size, capacity, wallSeconds, costUsd }`.

### 9.4 Owner dashboard `/admin.html`

A second Vite entry (its code stays out of the main bundle), behind the same
sign-in:

- **Jobs table** (plain MUI `Table`, sorting and filters by month, status,
  recipe, size): molecule, recipe, method, size, capacity, status and stage,
  queued/started/ended, predicted vs actual time and memory, reserved vs
  actual cost, links to the result and its files.
- **Cost panel:** spent, reserved, remaining of the cap; **projection** =
  spent × (days in month ÷ days elapsed) + the predicted cost of everything
  queued or running; a small hand-drawn SVG daily-spend chart; beside our
  meter, AWS's billed figure from Cost Explorer (a day behind).

### 9.5 Sign-in

A discreet "Owner sign-in" link in the menu → Cognito managed login with TOTP
MFA, via `oidc-client-ts` (authorization code + PKCE). Access token in memory
only; refresh token in `sessionStorage` (closing the tab signs out). Redirect
URIs: the CloudFront origin's `/` and `/admin.html`, and the same on the dev
server origins.

### 9.6 Running locally

On the dev server the owner chooses where jobs run: **This Mac** (the local
job server; $0; timings tagged `local` and excluded from AWS calibration) or
**AWS** (proxied, with the Cognito token).

### 9.7 Layout

Phase 6's layout contract applies: the request panel and status sit in the
side panel on desktop and the phone sheet's Explore tab; `/admin.html` is
desktop-first and its table scrolls horizontally on a phone.

## 10. Infrastructure

### 10.1 Stacks

A new **`ElectronOrbitalViewerComputeStack`** beside the existing
`ElectronOrbitalViewerStack`, which is unchanged. The compute stack imports
the data bucket by name (`-c dataBucketName=…`, read by `deploy.sh` from the
site stack's `MoleculeDataBucketName` output), so no CloudFormation export
couples them. `cdk destroy` on the compute stack removes every fixed cost and
leaves the site and all results.

### 10.2 Contents

| Piece | Configuration |
|---|---|
| VPC | 2 public subnets, **no NAT**; free gateway endpoints for S3 and DynamoDB; tasks get a public IP (image pull, logs); security group with no inbound rules |
| ECR | One repository, ARM64 images, lifecycle keeps the last 5 |
| Batch | Two Fargate compute environments (`FARGATE_SPOT`, `FARGATE`), max 32 vCPU each, one queue each; one job definition (ARM64) with size and timeout set per submission; retry strategy: up to 3 attempts, retry only when the status reason matches a Spot interruption; tags propagated to tasks |
| DynamoDB | On-demand; table `jobs` (pk) with GSI `byMonth` (month, submittedAt); meter and resolution items in the same table; point-in-time recovery on |
| Lambdas | Python 3.12, ARM64: `api` (behind the HTTP API), `reconcile` (Batch events + 15-min schedule), `billing` (daily Cost Explorer `GetCostAndUsage` filtered by tag) |
| API | HTTP API, JWT authorizer (Cognito), throttles (§4), CORS: the CloudFront origin, `http://localhost:5173`, `http://localhost:5391` |
| Cognito | User pool, self sign-up off, TOTP MFA required, strong password policy, 60-min access token, 12-h refresh token; managed login domain; one public app client (PKCE); the owner's user created from the CLI |
| Kill switch | A `CONFIG` item `generationEnabled`; `infra/jobs.sh pause|resume` flips it; `POST /jobs` refuses while paused |
| Tags | `app=electron-orbital-viewer`, `component=compute` on everything; the owner activates both as cost-allocation tags once (takes ~24 h) |

## 11. Budgets, observability and cost

- **AWS Budget** $10/month (cost), emails at 50/80/100 %; at 100 % a budget
  action attaches a deny-`batch:SubmitJob` policy to the `api` role — a second
  stop independent of the meter. **Cost Anomaly Detection** on.
- **Logs:** structured JSON with the job key; 30-day retention for every log
  group (Lambdas, Batch, API access).
- **Alarms** (SNS email): errors on each of the 3 Lambdas, API 5xx, an
  EventBridge rule on Batch `FAILED`, and a `reconcile` sweep that found stale
  jobs — 6 of the 10 free alarms. No custom metrics, X-Ray, Container
  Insights, WAF or flow logs.

**Monthly cost** (us-east-1 prices retrieved 2026-10-04/05):

| Item | $/month |
|---|---|
| ECR (~1 GB image) | 0.10 |
| Cost Explorer API (31 calls) | 0.31 |
| DynamoDB, Lambda, API Gateway, S3, SNS at owner volume | < 0.10 |
| CloudWatch logs and alarms, Cognito, Budgets, gateway endpoints | 0.00 (free tiers) |
| **Fixed total** | **≈ 0.50 (budgeted 1.20)** |
| Compute (Fargate, incl. public IPv4 while running) | ≤ 8.80, enforced by the meter |

## 12. Local development

- `uv run python -m jobs.local_server` (127.0.0.1, port 8787) serves the
  handlers over the filesystem adapter; jobs run as worker subprocesses one at
  a time; results go to `tools/molecules/out/jobs/{key}/`, which the dev
  server's existing local-first middleware already serves under `/molecules/`.
- The dev server proxies `/api` to 8787 (This Mac) or to the AWS API URL
  (AWS), switched by a header the app sets from the owner's choice.
- The worker image runs locally under OrbStack for the container smoke test.

## 13. Testing and rollout — shortest first, never waiting on a long job

1. **Unit tests:** pinned keys for canonical documents; `-0.0`/rounding/order
   invariance; the sizing rule's decisions at fixed inputs; prices and
   reservations; meter transactions and exactly-once settlement against
   `moto`; handler validation and refusals; PubChem resolution against
   recorded responses; CDK assertions; the worker on H₂ and H₂O at def2-SVP
   (seconds).
2. **Local end-to-end:** H₂O, recipe A, on the Mac (under a minute);
   resubmitting returns `DONE` without running.
3. **Container smoke:** the same job in the worker image under OrbStack.
4. **First AWS job:** deploy the compute stack; H₂O, recipe A (size S,
   Spot), about 3 minutes with the cold start. Check the files and
   `done.json` checksums, the meter settling to billed seconds, the dashboard
   row, and dedupe.
5. **Calibration ladder,** each step only after the previous passed: A on
   benzene, then caffeine; B on H₂O, then ethanol. I start only jobs the rule
   predicts under **10 minutes**, and the ladder's spend is capped at **$1**.
   Then sizing version 2 is fitted from predicted vs actual and committed.
6. **Expensive molecules** (C₆₀, larger drugs, open-shell complexes) are the
   owner's to start from the UI; the dashboard shows prediction, reservation
   and actuals.
7. **Recipe C** comes in its own plan after A and B are calibrated.

## 14. Reconciliations made while writing this up

The approved sections disagreed in a few places; each is settled here.

1. **API origin:** Section 1 said same-origin via CloudFront `/api/*`;
   Section 6 said the API's own URL with CORS. **CORS on the `execute-api`
   URL** — it keeps the site stack untouched and independent of the compute
   stack (§10.1).
2. **Coordinate rounding:** 10⁻⁵ Å (Section 2) over 10⁻⁴ Å (Section 4); it
   preserves PubChem's four decimals and typical pasted precision.
3. **Geometry source and the key:** Section 2 listed the source inside the
   canonical molecule; with a retrieval date in the key, every re-resolution
   would be a new job. The source is **provenance, not identity** (§5.2).
4. **Open shells:** Section 4 said UKS; Phase 6's builder uses ROKS (one
   orbital set, a SOMO). **ROKS**, to reuse `run_dft` unchanged; UKS is a
   later option.
5. **`result.json`** (Section 4) is dropped: Phase 6's `meta.json` already
   carries energies, the orbital table and the dipole.
6. **Live log:** Section 5 had the worker upload `output.log` each heartbeat;
   CloudFront would cache a changing file, so the **log tail travels in the
   heartbeat record** and the full log is written at the end of the attempt.
7. **Diatomic-only code paths:** Section 5 listed them for this phase; Phase 6
   generalises them for its polyatomic library, so this phase relies on it.
8. **Failed jobs' files:** Section 2 said a failed job writes no result files;
   Section 4 said its outputs are kept. Both hold: failures keep
   `attempts/{n}/` logs, and nothing is written at the result root (§5.3).
9. **CCSD(T) in sizing:** recipes A and B are DFT only, so the CCSD(T) terms
   of the sizing rule arrive with recipe C.

## 15. Plans and sequencing

1. **Phase 6** (existing plan): the validated library and Molecules mode.
   Known ruling for its execution: its Task 7 "copy v1 into v2 unchanged"
   cannot pass `publish.py`'s single-commit check; regenerate the ten
   diatomics at the same commit as the library (HANDOFF "For Phase 6").
2. **Phase 6B-1 — jobs core, worker and local backend:** `tools/jobs/`,
   the worker, the local server and the dev-server proxy; done when §13 steps
   1–3 pass.
3. **Phase 6B-2 — the interface:** computed tier, request panel, live status,
   provenance, `/admin.html`, sign-in; against the local backend.
4. **Phase 6B-3 — AWS:** the compute stack, deploy, budgets and alarms, and
   §13 steps 4–5.
5. **Phase 6B-4 — recipe C (scans)**, later.

## 16. Owner actions

- Create the Cognito user (a one-line CLI command the plan provides) and
  enrol the authenticator app on first sign-in.
- Confirm the SNS and Budgets email subscriptions.
- Activate the `app` and `component` cost-allocation tags in Billing.
