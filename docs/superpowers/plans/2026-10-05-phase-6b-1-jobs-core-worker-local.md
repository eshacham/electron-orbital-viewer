# Phase 6B-1 — Jobs Core, Worker and Local Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can ask for any H–Kr molecule by name, SMILES or XYZ on their Mac, and get Phase 6's molecule files plus a full provenance record. The job runs through the same API, sizing rule, cost meter and worker that AWS will use in 6B-3.

**Architecture:** A Python package `tools/jobs/` holds all job logic: canonical identity and hashing, PubChem resolution, the deterministic sizing rule, prices and the micro-dollar meter, and the route handlers. It sits behind two narrow interfaces, `Store` and `Runner`. This plan ships the filesystem `FileStore` and the subprocess `LocalRunner`; 6B-3 adds DynamoDB and Batch behind the same interfaces. The worker generates `input.py`, executes it to get PySCF's `mol`/`mf`, and hands them to Phase 6's file writer, which is extracted here from `build_molecule`. A stdlib HTTP server exposes the handlers on 127.0.0.1:8787, and the Vite dev server proxies `/api` to it.

**Tech Stack:** Python 3.12, PySCF 2.8.0, geomeTRIC (from Phase 6), `rfc8785` 0.1.4, pytest; stdlib `http.server`, `urllib`, `fcntl`; OrbStack's `docker buildx` for the ARM64 worker image; Vite 6 proxy config.

**Spec:** `docs/superpowers/specs/2026-10-05-on-demand-generation-design.md` (binding: §3, §4, §5, §6, §7, §8, §12, §13 steps 1–3). Parent spec `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md` §3, §4.2.

**Prerequisite:** Phase 6 (`docs/superpowers/plans/2026-09-25-phase-6-molecule-library.md`) is complete and merged. Task 1 checks every Phase 6 name this plan uses.

## Global Constraints

- **Money is integer micro-dollars** everywhere inside `tools/jobs` (`int`, 1 USD = 1_000_000). Only `model.public_view` and the `costs` response convert to USD floats, rounded to 6 decimals.
- **Compute cap:** `CAP_MICROS = 8_800_000` ($8.80 of the $10/month, spec §6.4). A job is charged to the UTC month it was submitted in.
- **Key** = lowercase hex SHA-256 of `rfc8785.dumps(canonical_job)`. Coordinates in Å rounded to **10⁻⁵** (`round(x, 5) + 0.0`, so −0.0 becomes 0.0), atoms sorted by (Z, x, y, z). `computeVersion = 1`. Geometry source, image digest and commit are **not** in the key.
- **Recipes** (method fixed, never client-chosen): `single` = B3LYP/def2-TZVPD; `optimise` = B3LYP/def2-SVP geomeTRIC optimisation, then B3LYP/def2-TZVPD (the Phase 6 library's property method — owner decision 2026-10-05). RKS for closed shells, ROKS for open shells. Elements **Z 1–36** only.
- **Sizes:** S 2 vCPU/8 GB, M 4/16, L 16/64, XL 32/244. Smallest size with memory ≥ **2 ×** predicted. Timeout = clamp(**3 ×** predicted, **600 s**, ceiling), with ceilings **single 3600 s, optimise 7200 s**. **Spot** when predicted ≤ 3600 s, else on-demand. Spot allows **3** attempts, on-demand 1. Reservation = attempts × cost(timeout).
- **Prices** (us-east-1 Linux/ARM, retrieved 2026-10-04): on-demand $0.03238/vCPU-h, $0.00356/GB-h; Spot $0.01034/vCPU-h, $0.00114/GB-h; local $0.
- **Statuses:** `QUEUED`, `STARTING`, `RUNNING`, `DONE`, `FAILED`. Heartbeat every **30 s**; the log tail is the last **20** lines, at most **4096** bytes.
- **Request limits:** XYZ ≤ **65536** bytes and ≤ **200** atoms. Name ≤ **200** characters. Request body ≤ **131072** bytes. Atoms closer than **0.3 Å** are refused. |coordinate| ≤ **1000 Å**.
- **Error codes** (JSON `{"error": {"code", "message"}}`): `invalid-request` 400, `not-found` 404, `unknown-compound` 422, `no-3d-structure` 422, `element-out-of-range` 422, `invalid-geometry` 422, `bad-multiplicity` 422, `too-large` 422, `too-long` 422, `budget` 422, `paused` 503, `pubchem-unavailable` 503, `body-too-large` 413.
- **`tools/jobs` must import without PySCF or NumPy**, except `worker.py`, `make_basis_counts.py` and `calibrate.py`. The `api` Lambda in 6B-3 ships without them. Task 6 has a test that enforces this.
- **Python commands** run from the repo root with the Phase 5 venv: `tools/molecules/.venv/bin/python -m pytest tools/jobs -q`. Long PySCF tests are gated behind `JOBS_SLOW=1`.
- **Foreground only.** Never background a command, and never let one Bash call run past ~9 minutes. Use the Bash tool's 600000 ms timeout. A server needed by a test is started and stopped inside the same single command (`python -m jobs.local_server & PID=$!; …; kill $PID`).
- **Docker means OrbStack's `docker` CLI** (`/usr/local/bin/docker`, buildx available). Images are `linux/arm64`.
- **Dependencies:** add only `rfc8785==0.1.4` (Python). No new npm dependencies.
- British spelling in comments and messages; comments explain *why*, in the register of `tools/molecules/build_library.py`.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **The same molecule typed differently**: atoms in another order, `-0.0`, extra trailing digits, or lower-case symbols. A person expects one job, not a duplicate bill. Test: Task 2, `test_key_ignores_order_sign_of_zero_and_digits_past_1e5`.
2. **A double-click on Submit**: two simultaneous submissions of a new molecule. Expect one job and one reservation, with the second caller following the first. Test: Task 5, `test_concurrent_create_reserves_once`.
3. **The meter exactly at the cap**: a reservation that lands exactly on the cap is accepted, and one micro-dollar more is refused, without a partial reservation left behind. Test: Task 5, `test_cap_is_inclusive_and_refusal_leaves_no_reservation`.
4. **A worker that dies mid-run** (crash, kill, or out of memory locally). Expect the job to become `FAILED` with a reason and its reservation to be released, never stuck in `RUNNING`. Test: Task 10, `test_crashed_worker_is_failed_and_settled`.
5. **PubChem down or slow**: expect a 503 `pubchem-unavailable` with a readable message, not a 500. A name resolved before still works from the cache. Tests: Task 3, `test_network_failure_is_pubchem_unavailable`; Task 6, `test_cached_name_needs_no_pubchem`.

## File structure

```
tools/jobs/
  __init__.py            package docstring
  conftest.py            sys.path for `jobs` and tools/molecules; warning filter
  errors.py              JobRefused (code, message, status)
  elements.py            SYMBOLS (Z 1–36), atomic_number(token)
  canonical.py           parse_xyz, check_atoms, electron_count, default/validated multiplicity, formula, canonical_job, job_key, RECIPES
  basis_counts.json      per-element basis-function counts, def2-SVP and def2-TZVPD (generated)
  basis_counts.py        basis_functions(atoms, basis) — no PySCF
  make_basis_counts.py   regenerates basis_counts.json from PySCF
  pubchem.py             resolve(kind, text, fetch) → geometry; parse_sdf; urllib_fetch
  prices.py              PRICES, CAP_MICROS, cost_micros, billed_seconds
  sizing.py              SIZES, CONSTANTS, SIZING_VERSION, decide(job, local)
  model.py               new_record, public_view, usd, month_of, utc timestamps
  store.py               Store protocol, FileStore, BudgetExhausted
  runner.py              Runner protocol, NullRunner, LocalRunner
  handlers.py            Api: preview, submit, get, list, costs; handle(method, path, query, body)
  sink.py                Sink protocol, LocalSink
  input_template.py      render_input(job, key, start=None) → input.py text
  worker.py              run_job(...), CLI `python -m jobs.worker run <key> …`
  local_server.py        127.0.0.1:8787 HTTP server over Api
  cli.py                 enqueue / submit --wait / generation on|off (local)
  calibrate.py           fits sizing constants from timings.json
  Dockerfile             ARM64 worker image
  README.md              how to run all of it
  tests/                 one test file per module, fixtures/pubchem/*
.dockerignore            allow-list for the worker image build
tools/molecules/build_library.py   (modify) extract write_molecule_files from build_molecule
tools/molecules/requirements.txt / requirements.lock   (modify) + rfc8785
vite.config.ts           (modify) /api → 127.0.0.1:8787; /api/aws → JOBS_AWS_API_URL
.gitignore               (modify) tools/jobs/.state/
```

---

### Task 1: Contracts, package scaffold and the basis-function table

**Files:**
- Create: `tools/jobs/__init__.py`, `tools/jobs/conftest.py`, `tools/jobs/errors.py`, `tools/jobs/elements.py`, `tools/jobs/basis_counts.py`, `tools/jobs/make_basis_counts.py`, `tools/jobs/basis_counts.json`, `tools/jobs/tests/__init__.py` (empty), `tools/jobs/tests/test_contracts.py`, `tools/jobs/tests/test_basis_counts.py`
- Modify: `tools/molecules/requirements.txt`, `tools/molecules/requirements.lock`, `.gitignore`

**Interfaces:**
- Consumes (Phase 6, checked here): `build_library.build_molecule`, `build_library.run_dft`, `build_library.BudgetExceeded`, `build_library.GRID_POINTS_TRIES`, `build_library.BUDGET_BYTES`, `optimise.make_dft`, `generate.basis_json`, the `geometric` package.
- Produces: `errors.JobRefused(code: str, message: str, status: int = 422)` with `.code`, `.message`, `.status`; `elements.SYMBOLS: tuple[str, ...]` (index 0 = 'H'), `elements.atomic_number(token: str) -> int` (raises `JobRefused('element-out-of-range')` / `JobRefused('invalid-geometry')`); `basis_counts.COUNTS: dict[str, dict[str, int]]`, `basis_counts.basis_functions(atoms: list[list], basis: str) -> int`, where `atoms` are `[Z, x, y, z]`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/jobs/tests/test_contracts.py
"""Every Phase 6 name this plan builds on. A failure means Phase 6 shipped a
different name: fix the uses in this plan's later tasks, never Phase 6."""
import importlib


def test_phase_6_builder_names():
    build_library = importlib.import_module('build_library')
    for name in ('build_molecule', 'run_dft', 'BudgetExceeded', 'GRID_POINTS_TRIES', 'BUDGET_BYTES'):
        assert hasattr(build_library, name), name
    assert hasattr(importlib.import_module('optimise'), 'make_dft')
    assert hasattr(importlib.import_module('generate'), 'basis_json')


def test_geometric_and_rfc8785_are_installed():
    importlib.import_module('geometric')
    importlib.import_module('rfc8785')


def test_jobs_package_imports():
    assert importlib.import_module('jobs').__doc__
```

```python
# tools/jobs/tests/test_basis_counts.py
import json
import os
from pathlib import Path

import pytest

from jobs.basis_counts import COUNTS, basis_functions
from jobs.elements import SYMBOLS, atomic_number
from jobs.errors import JobRefused


def test_symbols_cover_h_to_kr():
    assert len(SYMBOLS) == 36 and SYMBOLS[0] == 'H' and SYMBOLS[35] == 'Kr'


@pytest.mark.parametrize('token,z', [('H', 1), ('h', 1), ('CL', 17), ('cl', 17), ('Kr', 36), ('8', 8)])
def test_atomic_number_accepts_symbols_any_case_and_numbers(token, z):
    assert atomic_number(token) == z


@pytest.mark.parametrize('token,code', [('Rb', 'element-out-of-range'), ('37', 'element-out-of-range'),
                                        ('Xx', 'invalid-geometry'), ('0', 'invalid-geometry')])
def test_atomic_number_refuses(token, code):
    with pytest.raises(JobRefused) as e:
        atomic_number(token)
    assert e.value.code == code


def test_known_counts():
    # PySCF 2.8.0, spherical functions (measured 2026-10-05).
    assert COUNTS['def2-SVP']['H'] == 5 and COUNTS['def2-SVP']['O'] == 14
    assert COUNTS['def2-TZVPD']['H'] == 9 and COUNTS['def2-TZVPD']['O'] == 40 and COUNTS['def2-TZVPD']['Kr'] == 57


def test_water_benzene_caffeine():
    water = [[8, 0, 0, 0], [1, 0, 0, 1], [1, 0, 1, 0]]
    assert basis_functions(water, 'def2-TZVPD') == 58
    assert basis_functions(water, 'def2-SVP') == 24
    benzene = [[6, 0, 0, i] for i in range(6)] + [[1, 0, 1, i] for i in range(6)]
    assert basis_functions(benzene, 'def2-TZVPD') == 276
    caffeine = [[6, 0, 0, i] for i in range(8)] + [[7, 0, 1, i] for i in range(4)] + \
               [[8, 0, 2, i] for i in range(2)] + [[1, 0, 3, i] for i in range(10)]
    assert basis_functions(caffeine, 'def2-TZVPD') == 614


@pytest.mark.skipif(os.environ.get('JOBS_SLOW') != '1', reason='builds 72 PySCF molecules')
def test_table_matches_pyscf():
    from jobs.make_basis_counts import counts
    assert counts() == json.loads((Path(__file__).parents[1] / 'basis_counts.json').read_text())
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs -q`
Expected: collection errors, `ModuleNotFoundError: No module named 'jobs'` (no conftest yet).

- [ ] **Step 3: Add the dependency and the ignore rule**

Append to `tools/molecules/requirements.txt`:

```
# On-demand jobs (Phase 6B): RFC 8785 canonical JSON for job keys.
rfc8785==0.1.4
```

Then run `uv pip install --python tools/molecules/.venv/bin/python rfc8785==0.1.4`, and regenerate the lock with `uv pip freeze --python tools/molecules/.venv/bin/python > tools/molecules/requirements.lock`. Check `git diff tools/molecules/requirements.lock`: it should add only the `rfc8785` line.

Append to `.gitignore`:

```
# Local job backend state (Phase 6B): job records, meter, resolution cache
tools/jobs/.state/
```

- [ ] **Step 4: Write the scaffold**

```python
# tools/jobs/__init__.py
"""On-demand molecule generation (spec docs/superpowers/specs/2026-10-05-on-demand-generation-design.md).

Everything here except worker.py, make_basis_counts.py and calibrate.py
imports without PySCF or NumPy: the AWS api Lambda (Phase 6B-3) ships this
package alone, so the chemistry it needs is in committed tables instead.
"""
```

```python
# tools/jobs/conftest.py
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))                  # `import jobs`
sys.path.insert(0, str(TOOLS / 'molecules'))    # Phase 5/6's flat generator modules


def pytest_configure(config):
    # Same notice Phase 5's conftest silences: PySCF 2.3+ B3LYP is the VWN-RPA variant.
    config.addinivalue_line(
        'filterwarnings',
        r'ignore:Since PySCF-2\.3, B3LYP \(and B3P86\) are changed to the VWN-RPA variant:UserWarning',
    )
```

```python
# tools/jobs/errors.py
class JobRefused(Exception):
    """A request the service will not run, with the reason a person reads.

    `code` is stable (the UI and tests match on it); `message` is prose;
    `status` is the HTTP status the handlers answer with.
    """

    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
```

```python
# tools/jobs/elements.py
from jobs.errors import JobRefused

# H–Kr: heavier elements need effective core potentials, whose core the
# renderer's all-electron density cannot represent (spec §5.1).
SYMBOLS = ('H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
           'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr')
_BY_SYMBOL = {s.lower(): i + 1 for i, s in enumerate(SYMBOLS)}
# Rb onwards, so a real element beyond the range is named as such rather than "unknown".
_BEYOND = {'rb', 'sr', 'y', 'zr', 'nb', 'mo', 'tc', 'ru', 'rh', 'pd', 'ag', 'cd', 'in', 'sn', 'sb', 'te', 'i', 'xe',
           'cs', 'ba', 'la', 'ce', 'pr', 'nd', 'pm', 'sm', 'eu', 'gd', 'tb', 'dy', 'ho', 'er', 'tm', 'yb', 'lu',
           'hf', 'ta', 'w', 're', 'os', 'ir', 'pt', 'au', 'hg', 'tl', 'pb', 'bi', 'po', 'at', 'rn', 'fr', 'ra',
           'ac', 'th', 'pa', 'u', 'np', 'pu', 'am', 'cm', 'bk', 'cf', 'es', 'fm', 'md', 'no', 'lr', 'rf', 'db',
           'sg', 'bh', 'hs', 'mt', 'ds', 'rg', 'cn', 'nh', 'fl', 'mc', 'lv', 'ts', 'og'}


def _out_of_range(name):
    return JobRefused('element-out-of-range',
                      f'{name} is beyond krypton; this phase computes H–Kr only (heavier elements need effective '
                      'core potentials, which the renderer cannot show)')


def atomic_number(token: str) -> int:
    t = token.strip()
    if t.isdigit():
        z = int(t)
        if 1 <= z <= 36:
            return z
        if 37 <= z <= 118:
            raise _out_of_range(f'Element {z}')
        raise JobRefused('invalid-geometry', f'{t} is not an atomic number')
    if t.lower() in _BY_SYMBOL:
        return _BY_SYMBOL[t.lower()]
    if t.lower() in _BEYOND:
        raise _out_of_range(t.capitalize())
    raise JobRefused('invalid-geometry', f'"{t}" is not an element symbol')
```

```python
# tools/jobs/make_basis_counts.py
"""Regenerates basis_counts.json from PySCF: run after a PySCF upgrade.

    tools/molecules/.venv/bin/python -m jobs.make_basis_counts   (from tools/)
"""
import json
from pathlib import Path

from jobs.elements import SYMBOLS

BASES = ('def2-SVP', 'def2-TZVPD')


def counts():
    from pyscf import gto
    # spin = Z mod 2 only so PySCF accepts the lone atom; it does not change the count.
    return {basis: {s: gto.M(atom=f'{s} 0 0 0', basis=basis, spin=(i + 1) % 2, verbose=0).nao_nr()
                    for i, s in enumerate(SYMBOLS)} for basis in BASES}


if __name__ == '__main__':
    path = Path(__file__).with_name('basis_counts.json')
    path.write_text(json.dumps(counts(), indent=1) + '\n')
    print(f'wrote {path}')
```

```python
# tools/jobs/basis_counts.py
import json
from pathlib import Path

from jobs.elements import SYMBOLS

# Committed output of make_basis_counts.py, so sizing needs no PySCF (spec §7.1).
COUNTS: dict[str, dict[str, int]] = json.loads(Path(__file__).with_name('basis_counts.json').read_text())


def basis_functions(atoms, basis: str) -> int:
    table = COUNTS[basis]
    return sum(table[SYMBOLS[int(a[0]) - 1]] for a in atoms)
```

Generate the table: `cd tools && ../tools/molecules/.venv/bin/python -m jobs.make_basis_counts && cd ..`. The file must contain exactly these values (measured with PySCF 2.8.0 on 2026-10-05/06):

```json
{"def2-SVP": {"H": 5, "He": 5, "Li": 9, "Be": 9, "B": 14, "C": 14, "N": 14, "O": 14, "F": 14, "Ne": 14, "Na": 15, "Mg": 18, "Al": 18, "Si": 18, "P": 18, "S": 18, "Cl": 18, "Ar": 18, "K": 24, "Ca": 24, "Sc": 31, "Ti": 31, "V": 31, "Cr": 31, "Mn": 31, "Fe": 31, "Co": 31, "Ni": 31, "Cu": 31, "Zn": 31, "Ga": 32, "Ge": 32, "As": 32, "Se": 32, "Br": 32, "Kr": 32},
 "def2-TZVPD": {"H": 9, "He": 9, "Li": 17, "Be": 22, "B": 37, "C": 37, "N": 37, "O": 40, "F": 40, "Ne": 40, "Na": 35, "Mg": 35, "Al": 43, "Si": 43, "P": 43, "S": 46, "Cl": 46, "Ar": 46, "K": 36, "Ca": 36, "Sc": 48, "Ti": 48, "V": 48, "Cr": 48, "Mn": 48, "Fe": 48, "Co": 48, "Ni": 48, "Cu": 48, "Zn": 51, "Ga": 54, "Ge": 54, "As": 54, "Se": 57, "Br": 57, "Kr": 57}}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs -q && JOBS_SLOW=1 tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_basis_counts.py -q`
Expected: all pass. If a `test_contracts` name is missing, apply the rule in that file's docstring, record the mapping in the commit message, and continue.

- [ ] **Step 6: Commit**

```bash
git add tools/jobs .gitignore tools/molecules/requirements.txt tools/molecules/requirements.lock
git commit -m "feat(jobs): package scaffold, element range and the basis-function table (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Canonical job document and key

**Files:**
- Create: `tools/jobs/canonical.py`, `tools/jobs/tests/test_canonical.py`

**Interfaces:**
- Consumes: `elements.atomic_number`, `errors.JobRefused`.
- Produces: `COMPUTE_VERSION = 1`; `RECIPES: dict[str, dict]` (`{'single': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': None}, 'optimise': {..., 'optimiseBasis': 'def2-SVP'}}`); `parse_xyz(text: str) -> list[list]` (`[Z, x, y, z]`, Å); `check_atoms(atoms) -> None`; `electron_count(atoms, charge: int) -> int`; `multiplicity_for(electrons: int, requested: int | None) -> int`; `formula(atoms) -> str` (Hill order, e.g. `'C8H10N4O2'`, `'H2O'`); `canonical_atoms(atoms) -> list[list]`; `canonical_job(recipe: str, atoms, charge: int, multiplicity: int, method: dict | None = None) -> dict`; `job_key(job: dict) -> str`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/jobs/tests/test_canonical.py
import pytest

from jobs.canonical import (RECIPES, canonical_atoms, canonical_job, check_atoms, electron_count, formula, job_key,
                            multiplicity_for, parse_xyz)
from jobs.errors import JobRefused

WATER = [[1, 0.0, -0.75545, -0.47116], [1, 0.0, 0.75545, -0.47116], [8, 0.0, 0.0, 0.11779]]


def test_pinned_keys():
    # Pinned 2026-10-06 (def2-TZVPD) with rfc8785 0.1.4; a change here silently orphans every stored result.
    assert job_key(canonical_job('single', WATER, 0, 1)) == 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa'
    assert job_key(canonical_job('optimise', WATER, 0, 1)) == '03e7648c54cbaf4888bb69434e8fb27b5a6091792ac0179f64981300902ab129'
    assert job_key(canonical_job('single', WATER, 1, 2)) == '7ccc1f468a6ecd3449b16bcb0dd483d36509971f523d770cdf3717f570753a5a'


def test_key_ignores_order_sign_of_zero_and_digits_past_1e5():
    shuffled = [[8, -0.0, 0.0, 0.117791], [1, 0.0, 0.755451, -0.471159], [1, 0.0, -0.75545, -0.47116]]
    assert job_key(canonical_job('single', shuffled, 0, 1)) == job_key(canonical_job('single', WATER, 0, 1))


def test_canonical_document_shape():
    job = canonical_job('optimise', WATER, 0, 1)
    assert job == {'computeVersion': 1, 'recipe': 'optimise',
                   'method': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'},
                   'molecule': {'atoms': canonical_atoms(WATER), 'charge': 0, 'multiplicity': 1}}
    assert RECIPES['single']['optimiseBasis'] is None


def test_method_override_is_for_tests_only_but_changes_the_key():
    small = canonical_job('single', WATER, 0, 1, method={'xc': 'B3LYP', 'basis': 'def2-SVP', 'optimiseBasis': None})
    assert job_key(small) != job_key(canonical_job('single', WATER, 0, 1))


def test_unknown_recipe():
    with pytest.raises(JobRefused) as e:
        canonical_job('scan', WATER, 0, 1)
    assert e.value.code == 'invalid-request'


def test_parse_xyz_with_and_without_header():
    text = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nh 0 -0.75545 -0.47116\n'
    assert parse_xyz(text) == [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]
    assert parse_xyz('8 0 0 0.11779\n1 0 0.75545 -0.47116\n1 0 -0.75545 -0.47116') == parse_xyz(text)


@pytest.mark.parametrize('text,code', [
    ('', 'invalid-geometry'),
    ('3\nwater\nO 0 0 0\nH 0 0 1\n', 'invalid-geometry'),              # header says 3, two atoms follow
    ('O 0 0\n', 'invalid-geometry'),                                    # missing z
    ('O 0 0 nan\n', 'invalid-geometry'),
    ('O 0 0 1e9\n', 'invalid-geometry'),
    ('Rb 0 0 0\n', 'element-out-of-range'),
    ('O 0 0 0\nH 0 0 0.1\n', 'invalid-geometry'),                       # closer than 0.3 Å
    ('H 0 0 0\n' * 1, None),
])
def test_parse_and_check_refusals(text, code):
    if code is None:
        check_atoms(parse_xyz(text))
        return
    with pytest.raises(JobRefused) as e:
        check_atoms(parse_xyz(text))
    assert e.value.code == code


def test_size_limits():
    with pytest.raises(JobRefused) as e:
        parse_xyz('H 0 0 0\n' + 'x' * 65536)
    assert e.value.code == 'invalid-geometry'
    many = ''.join(f'H 0 0 {i}\n' for i in range(201))
    with pytest.raises(JobRefused) as e:
        check_atoms(parse_xyz(many))
    assert e.value.code == 'invalid-geometry'


def test_electrons_and_multiplicity():
    assert electron_count(WATER, 0) == 10 and electron_count(WATER, 1) == 9
    assert multiplicity_for(10, None) == 1 and multiplicity_for(9, None) == 2
    assert multiplicity_for(10, 3) == 3
    for electrons, requested in ((10, 2), (9, 1), (10, 0), (2, 5)):
        with pytest.raises(JobRefused) as e:
            multiplicity_for(electrons, requested)
        assert e.value.code == 'bad-multiplicity'
    with pytest.raises(JobRefused) as e:
        electron_count([[1, 0, 0, 0]], 1)
    assert e.value.code == 'bad-multiplicity'


def test_hill_formula():
    assert formula(WATER) == 'H2O'
    caffeine = [[6, 0, 0, i] for i in range(8)] + [[1, 1, 0, i] for i in range(10)] + \
               [[7, 2, 0, i] for i in range(4)] + [[8, 3, 0, i] for i in range(2)]
    assert formula(caffeine) == 'C8H10N4O2'
    assert formula([[17, 0, 0, 0], [11, 0, 0, 2.4]]) == 'ClNa'      # no carbon: alphabetical
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_canonical.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'jobs.canonical'`.

- [ ] **Step 3: Implement**

```python
# tools/jobs/canonical.py
"""The job's identity (spec §5.2): a canonical JSON document and its SHA-256.

The key is built from the resolved geometry, never from a name, so a
PubChem structure that changes is a new calculation rather than a silently
different old one. Provenance (where the geometry came from, which image
ran it) stays out of the document: rebuilding the image must not orphan
every stored result.
"""
import hashlib
import math
from collections import Counter

import rfc8785

from jobs.elements import SYMBOLS, atomic_number
from jobs.errors import JobRefused

COMPUTE_VERSION = 1
RECIPES = {
    'single': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': None},
    'optimise': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'},
}
MAX_XYZ_BYTES = 65536
MAX_ATOMS = 200
MIN_SEPARATION = 0.3      # Å: closer than any real bond, so a typo rather than a molecule
MAX_COORD = 1000.0        # Å


def _invalid(message):
    return JobRefused('invalid-geometry', message)


def parse_xyz(text: str) -> list[list]:
    if len(text.encode()) > MAX_XYZ_BYTES:
        raise _invalid(f'the XYZ text is over {MAX_XYZ_BYTES} bytes')
    lines = [line.strip() for line in text.strip().splitlines()]
    if not lines or not lines[0]:
        raise _invalid('no atoms given')
    declared = None
    if lines[0].isdigit():
        declared = int(lines[0])
        lines = lines[2:]
    atoms = []
    for line in lines:
        if not line:
            continue
        parts = line.split()
        if len(parts) < 4:
            raise _invalid(f'"{line}" needs an element and three coordinates')
        try:
            xyz = [float(v) for v in parts[1:4]]
        except ValueError:
            raise _invalid(f'"{line}" has a coordinate that is not a number')
        if not all(math.isfinite(v) and abs(v) <= MAX_COORD for v in xyz):
            raise _invalid(f'"{line}" has a coordinate that is not finite or beyond {MAX_COORD:g} Å')
        atoms.append([atomic_number(parts[0]), *xyz])
    if declared is not None and declared != len(atoms):
        raise _invalid(f'the header says {declared} atoms but {len(atoms)} follow')
    return atoms


def check_atoms(atoms) -> None:
    if not atoms:
        raise _invalid('no atoms given')
    if len(atoms) > MAX_ATOMS:
        raise _invalid(f'{len(atoms)} atoms; this phase accepts at most {MAX_ATOMS}')
    for i in range(len(atoms)):
        for j in range(i):
            d = math.dist(atoms[i][1:4], atoms[j][1:4])
            if d < MIN_SEPARATION:
                raise _invalid(f'atoms {j + 1} and {i + 1} are {d:.3f} Å apart (under {MIN_SEPARATION} Å)')


def electron_count(atoms, charge: int) -> int:
    electrons = sum(int(a[0]) for a in atoms) - int(charge)
    if electrons < 1:
        raise JobRefused('bad-multiplicity', f'charge {charge:+d} leaves no electrons')
    return electrons


def multiplicity_for(electrons: int, requested: int | None) -> int:
    if requested is None:
        return 1 if electrons % 2 == 0 else 2
    # 2S + 1 with S from unpaired electrons: their parity must match the electron count's.
    if requested < 1 or requested > electrons + 1 or (requested - 1) % 2 != electrons % 2:
        raise JobRefused('bad-multiplicity', f'multiplicity {requested} is impossible with {electrons} electrons')
    return requested


def formula(atoms) -> str:
    counts = Counter(SYMBOLS[int(a[0]) - 1] for a in atoms)
    order = (['C', 'H'] + sorted(s for s in counts if s not in ('C', 'H'))) if 'C' in counts else sorted(counts)
    return ''.join(f'{s}{counts[s] if counts[s] > 1 else ""}' for s in order if s in counts)


def _round(v: float) -> float:
    return round(float(v), 5) + 0.0      # + 0.0 turns -0.0 into 0.0


def canonical_atoms(atoms) -> list[list]:
    return sorted([int(a[0]), _round(a[1]), _round(a[2]), _round(a[3])] for a in atoms)


def canonical_job(recipe: str, atoms, charge: int, multiplicity: int, method: dict | None = None) -> dict:
    if recipe not in RECIPES:
        raise JobRefused('invalid-request', f'unknown recipe "{recipe}"; choose one of {", ".join(RECIPES)}', 400)
    return {'computeVersion': COMPUTE_VERSION, 'recipe': recipe, 'method': dict(method or RECIPES[recipe]),
            'molecule': {'atoms': canonical_atoms(atoms), 'charge': int(charge), 'multiplicity': int(multiplicity)}}


def job_key(job: dict) -> str:
    return hashlib.sha256(rfc8785.dumps(job)).hexdigest()
```

- [ ] **Step 4: Run them to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_canonical.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/canonical.py tools/jobs/tests/test_canonical.py
git commit -m "feat(jobs): canonical job document and its RFC 8785 SHA-256 key (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PubChem resolution

**Files:**
- Create: `tools/jobs/pubchem.py`, `tools/jobs/tests/test_pubchem.py`, `tools/jobs/tests/fixtures/pubchem/` (recorded responses)

**Interfaces:**
- Consumes: `elements.SYMBOLS` (via `atomic_number`), `errors.JobRefused`.
- Produces: `BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'`; `Fetch = Callable[[str, bytes | None], tuple[int, bytes]]`; `urllib_fetch(url, data=None) -> tuple[int, bytes]` (10 s timeout; HTTP errors return their status; network errors raise `OSError`); `normalise_query(kind: str, text: str) -> str`; `parse_sdf(text: str) -> tuple[list[list], int]` (atoms `[Z, x, y, z]` and the total formal charge); `resolve(kind: str, text: str, fetch: Fetch = urllib_fetch, today: Callable[[], str] = …) -> dict` returning `{'cid': int, 'title': str, 'atoms': [[Z, x, y, z], …], 'charge': int, 'retrievedAt': 'YYYY-MM-DD'}`. `kind` is `'name'` or `'smiles'`.

- [ ] **Step 1: Record the fixtures** (network; one command)

```bash
F=tools/jobs/tests/fixtures/pubchem; mkdir -p $F; B=https://pubchem.ncbi.nlm.nih.gov/rest/pug
curl -s "$B/compound/name/water/cids/JSON" > $F/name_water.json
curl -s "$B/compound/cid/962/record/SDF?record_type=3d" > $F/cid_962_3d.sdf
curl -s "$B/compound/cid/962/property/Title/JSON" > $F/cid_962_title.json
curl -s "$B/compound/name/caffeine/cids/JSON" > $F/name_caffeine.json
curl -s "$B/compound/cid/2519/record/SDF?record_type=3d" > $F/cid_2519_3d.sdf
curl -s "$B/compound/cid/2519/property/Title/JSON" > $F/cid_2519_title.json
curl -s -X POST --data-urlencode "smiles=CN1C=NC2=C1C(=O)N(C(=O)N2C)C" "$B/compound/smiles/cids/JSON" > $F/smiles_caffeine.json
curl -s "$B/compound/cid/5234/record/SDF?record_type=3d" -o $F/cid_5234_3d.txt -w '%{http_code}\n'
curl -s "$B/compound/name/ammonium/cids/JSON" > $F/name_ammonium.json
head -c 300 $F/name_water.json $F/smiles_caffeine.json $F/name_ammonium.json; head -5 $F/cid_962_3d.sdf
```

Expected: water → CID 962, caffeine name and SMILES → CID 2519, NaCl (CID 5234) prints `404` (no 3D conformer). Read the ammonium CID from `name_ammonium.json` (expected 223), then record its SDF and title the same way (`cid_<cid>_3d.sdf`, `cid_<cid>_title.json`). Its SDF carries `M  CHG` with +1. If PubChem returns other CIDs than these, use the returned ones throughout this task's tests.

- [ ] **Step 2: Write the failing tests**

```python
# tools/jobs/tests/test_pubchem.py
import json
from pathlib import Path
from urllib.parse import quote

import pytest

from jobs.errors import JobRefused
from jobs.pubchem import BASE, normalise_query, parse_sdf, resolve

F = Path(__file__).parent / 'fixtures' / 'pubchem'
AMMONIUM = json.loads((F / 'name_ammonium.json').read_text())['IdentifierList']['CID'][0]


def fake_fetch(responses):
    calls = []

    def fetch(url, data=None):
        calls.append((url, data))
        if url not in responses:
            return 404, b'{"Fault": {"Code": "PUGREST.NotFound"}}'
        body = responses[url]
        return 200, body if isinstance(body, bytes) else (F / body).read_bytes()
    fetch.calls = calls
    return fetch


def standard_responses():
    return {
        f'{BASE}/compound/name/water/cids/JSON': 'name_water.json',
        f'{BASE}/compound/cid/962/record/SDF?record_type=3d': 'cid_962_3d.sdf',
        f'{BASE}/compound/cid/962/property/Title/JSON': 'cid_962_title.json',
        f'{BASE}/compound/name/caffeine/cids/JSON': 'name_caffeine.json',
        f'{BASE}/compound/smiles/cids/JSON': 'smiles_caffeine.json',
        f'{BASE}/compound/cid/2519/record/SDF?record_type=3d': 'cid_2519_3d.sdf',
        f'{BASE}/compound/cid/2519/property/Title/JSON': 'cid_2519_title.json',
        f'{BASE}/compound/name/{quote("sodium chloride")}/cids/JSON': b'{"IdentifierList": {"CID": [5234]}}',
        f'{BASE}/compound/name/ammonium/cids/JSON': 'name_ammonium.json',
        f'{BASE}/compound/cid/{AMMONIUM}/record/SDF?record_type=3d': f'cid_{AMMONIUM}_3d.sdf',
        f'{BASE}/compound/cid/{AMMONIUM}/property/Title/JSON': f'cid_{AMMONIUM}_title.json',
    }


def test_water_by_name():
    got = resolve('name', '  Water ', fake_fetch(standard_responses()), today=lambda: '2026-10-05')
    assert got['cid'] == 962 and got['title'].lower() == 'water' and got['charge'] == 0
    assert got['retrievedAt'] == '2026-10-05'
    assert sorted(a[0] for a in got['atoms']) == [1, 1, 8]


def test_caffeine_by_smiles_posts_the_smiles():
    fetch = fake_fetch(standard_responses())
    got = resolve('smiles', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', fetch)
    assert got['cid'] == 2519 and len(got['atoms']) == 24
    url, data = fetch.calls[0]
    assert url.endswith('/compound/smiles/cids/JSON') and data.startswith(b'smiles=')


def test_formal_charge_comes_from_the_sdf():
    assert resolve('name', 'ammonium', fake_fetch(standard_responses()))['charge'] == 1


def test_unknown_name():
    with pytest.raises(JobRefused) as e:
        resolve('name', 'notacompoundxyz', fake_fetch(standard_responses()))
    assert e.value.code == 'unknown-compound' and e.value.status == 422


def test_smiles_not_in_pubchem_is_cid_zero():
    fetch = fake_fetch({f'{BASE}/compound/smiles/cids/JSON': b'{"IdentifierList": {"CID": [0]}}'})
    with pytest.raises(JobRefused) as e:
        resolve('smiles', 'C1=CC=CC=C1XX', fetch)
    assert e.value.code == 'unknown-compound'


def test_no_3d_structure():
    with pytest.raises(JobRefused) as e:
        resolve('name', 'sodium chloride', fake_fetch(standard_responses()))
    assert e.value.code == 'no-3d-structure' and 'paste an XYZ' in e.value.message


def test_network_failure_is_pubchem_unavailable():
    def down(url, data=None):
        raise OSError('timed out')
    with pytest.raises(JobRefused) as e:
        resolve('name', 'water', down)
    assert e.value.code == 'pubchem-unavailable' and e.value.status == 503


def test_server_error_is_pubchem_unavailable():
    with pytest.raises(JobRefused) as e:
        resolve('name', 'water', lambda url, data=None: (503, b'busy'))
    assert e.value.code == 'pubchem-unavailable'


def test_parse_sdf_water():
    atoms, charge = parse_sdf((F / 'cid_962_3d.sdf').read_text())
    assert atoms[0] == [8, 0.0, 0.0, 0.0] and charge == 0 and len(atoms) == 3


def test_normalise_query():
    assert normalise_query('name', '  Caffeine   Anhydrous ') == 'name:caffeine anhydrous'
    assert normalise_query('smiles', ' CCO ') == 'smiles:CCO'
```

- [ ] **Step 3: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_pubchem.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'jobs.pubchem'`.

- [ ] **Step 4: Implement**

```python
# tools/jobs/pubchem.py
"""Name or SMILES → PubChem CID → its computed 3D conformer (spec §5.1).

PubChem's 3D conformers are MMFF94-optimised and exist for most small
compounds, not for salts or very large or flexible ones; those are refused
with a suggestion to paste an XYZ. Stdlib only: this runs in the api Lambda.
"""
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import quote, urlencode

from jobs.elements import atomic_number
from jobs.errors import JobRefused

BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'
TIMEOUT_SECONDS = 10
Fetch = Callable[[str, 'bytes | None'], 'tuple[int, bytes]']


def urllib_fetch(url, data=None):
    request = urllib.request.Request(url, data=data, headers={'User-Agent': 'electron-orbital-viewer/6B'})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def normalise_query(kind: str, text: str) -> str:
    text = text.strip()
    return f'name:{" ".join(text.lower().split())}' if kind == 'name' else f'smiles:{text}'


def _get(fetch, url, data=None):
    try:
        status, body = fetch(url, data)
    except OSError as e:
        raise JobRefused('pubchem-unavailable', f'PubChem did not answer ({e}); try again, or paste an XYZ', 503)
    if status >= 500 or status in (429, 503):
        raise JobRefused('pubchem-unavailable', f'PubChem is unavailable (HTTP {status}); try again, or paste an XYZ', 503)
    return status, body


def parse_sdf(text: str):
    lines = text.splitlines()
    count = int(lines[3][0:3])
    atoms = []
    for line in lines[4:4 + count]:
        x, y, z = float(line[0:10]), float(line[10:20]), float(line[20:30])
        atoms.append([atomic_number(line[31:34].strip()), x, y, z])
    charge = 0
    for line in lines[4 + count:]:
        if line.startswith('M  CHG'):
            fields = line.split()[3:]
            charge += sum(int(fields[i + 1]) for i in range(0, len(fields), 2))
        if line.startswith('M  END'):
            break
    return atoms, charge


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def resolve(kind: str, text: str, fetch: Fetch = urllib_fetch, today: Callable[[], str] = _today) -> dict:
    text = text.strip()
    if kind == 'name':
        status, body = _get(fetch, f'{BASE}/compound/name/{quote(" ".join(text.split()))}/cids/JSON')
    else:
        status, body = _get(fetch, f'{BASE}/compound/smiles/cids/JSON', urlencode({'smiles': text}).encode())
    cids = json.loads(body).get('IdentifierList', {}).get('CID', []) if status == 200 else []
    if not cids or cids[0] == 0:
        raise JobRefused('unknown-compound', f'PubChem does not know "{text}"')
    cid = int(cids[0])
    status, body = _get(fetch, f'{BASE}/compound/cid/{cid}/record/SDF?record_type=3d')
    if status != 200:
        raise JobRefused('no-3d-structure', f'PubChem has no 3D structure for CID {cid}; paste an XYZ instead')
    atoms, charge = parse_sdf(body.decode())
    status, body = _get(fetch, f'{BASE}/compound/cid/{cid}/property/Title/JSON')
    title = json.loads(body)['PropertyTable']['Properties'][0]['Title'] if status == 200 else text
    return {'cid': cid, 'title': title, 'atoms': atoms, 'charge': charge, 'retrievedAt': today()}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_pubchem.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/jobs/pubchem.py tools/jobs/tests/test_pubchem.py tools/jobs/tests/fixtures
git commit -m "feat(jobs): PubChem name/SMILES resolution to a 3D conformer (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Prices and the deterministic sizing rule

**Files:**
- Create: `tools/jobs/prices.py`, `tools/jobs/sizing.py`, `tools/jobs/tests/test_sizing.py`

**Interfaces:**
- Consumes: `basis_counts.basis_functions`, `errors.JobRefused`.
- Produces:
  - `prices.RETRIEVED = '2026-10-04'`; `prices.PRICES: dict[str, dict[str, float]]` (keys `'on-demand'`, `'spot'`, `'local'`, each `{'vcpuHour', 'gbHour'}`); `prices.CAP_MICROS = 8_800_000`; `prices.BILLING_MINIMUM_SECONDS = 60`; `prices.billed_seconds(seconds: float) -> int`; `prices.cost_micros(capacity: str, vcpu: int, memory_gb: float, seconds: float) -> int` (rounds up).
  - `sizing.Size(name, vcpu, memory_gb)`; `sizing.SIZES`; `sizing.SIZING_VERSION: int` (0 until Task 11 calibrates); `sizing.CONSTANTS: dict[str, float]` (`m0, m2, t0, t3, g`); `sizing.HEADROOM = 2.0`, `TIMEOUT_FACTOR = 3.0`, `MIN_TIMEOUT_SECONDS = 600`, `CEILING_SECONDS = {'single': 3600, 'optimise': 7200}`, `SPOT_LIMIT_SECONDS = 3600`, `SPOT_ATTEMPTS = 3`, `OPEN_SHELL_FACTOR = 1.5`; `sizing.decide(job: dict, local: bool = False) -> dict` returning the **Decision** `{'version', 'size', 'vcpu', 'memoryGB', 'capacity', 'attempts', 'basisFunctions', 'predictedSeconds', 'predictedMemoryGB', 'timeoutSeconds', 'reservationMicros', 'predictedCostMicros'}`. It raises `JobRefused('too-large')` or `JobRefused('too-long')`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/jobs/tests/test_sizing.py
import pytest

from jobs import sizing
from jobs.canonical import canonical_job
from jobs.errors import JobRefused
from jobs.prices import CAP_MICROS, billed_seconds, cost_micros

WATER = [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]]


def carbons(n):
    return [[6, 0.0, 0.0, 1.5 * i] for i in range(n)]


def test_prices():
    assert cost_micros('on-demand', 2, 8, 3600) == 93_240         # 2·0.03238 + 8·0.00356 = $0.09324
    assert cost_micros('spot', 2, 8, 3600) == 29_800              # 2·0.01034 + 8·0.00114 = $0.02980
    assert cost_micros('local', 32, 244, 3600) == 0
    assert cost_micros('on-demand', 2, 8, 1) == 26                # rounds up, never down
    assert billed_seconds(5) == 60 and billed_seconds(60.2) == 61
    assert CAP_MICROS == 8_800_000


def test_water_single_is_small_spot_with_the_floor_timeout():
    d = sizing.decide(canonical_job('single', WATER, 0, 1))
    assert (d['size'], d['vcpu'], d['memoryGB'], d['capacity'], d['attempts']) == ('S', 2, 8, 'spot', 3)
    assert d['basisFunctions'] == 58 and d['timeoutSeconds'] == 600
    assert d['reservationMicros'] == 3 * cost_micros('spot', 2, 8, 600)
    assert d['version'] == sizing.SIZING_VERSION


def test_local_backend_reserves_nothing_but_still_sizes():
    d = sizing.decide(canonical_job('single', WATER, 0, 1), local=True)
    assert d['capacity'] == 'local' and d['attempts'] == 1 and d['reservationMicros'] == 0 and d['size'] == 'S'


def test_memory_picks_the_smallest_size_with_headroom(monkeypatch):
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 'm0': 0.0, 'm2': 4.0, 't3': 1.0})
    # 120 carbons → N = 4440 (def2-TZVPD) → 4·4.44² = 78.9 GB predicted → needs 157.7 GB → XL
    assert sizing.decide(canonical_job('single', carbons(120), 0, 1))['size'] == 'XL'
    # 30 carbons → N = 1110 → 4.93 GB → 9.86 GB → M
    assert sizing.decide(canonical_job('single', carbons(30), 0, 1))['size'] == 'M'


def test_too_large_for_xl(monkeypatch):
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 'm0': 0.0, 'm2': 20.0, 't3': 1.0})
    with pytest.raises(JobRefused) as e:
        sizing.decide(canonical_job('single', carbons(120), 0, 1))
    assert e.value.code == 'too-large' and 'largest Fargate worker' in e.value.message


def test_too_long_for_the_recipe_ceiling(monkeypatch):
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't3': 1e7})
    with pytest.raises(JobRefused) as e:
        sizing.decide(canonical_job('single', carbons(40), 0, 1))
    assert e.value.code == 'too-long'


def test_long_jobs_run_on_demand_with_one_attempt(monkeypatch):
    # Pick t3 so the prediction lands between 1 h and the 2 h optimise ceiling.
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 't3': 1.0, 'g': 0.0})
    job = canonical_job('optimise', carbons(10), 0, 1)
    seconds = sizing.predict_seconds(job, sizing.SIZES[0])
    scale = 5400 / seconds
    monkeypatch.setattr(sizing, 'CONSTANTS', {**sizing.CONSTANTS, 't0': 0.0, 't3': scale, 'g': 0.0})
    d = sizing.decide(job)
    assert d['capacity'] == 'on-demand' and d['attempts'] == 1 and d['timeoutSeconds'] == 7200


def test_open_shell_takes_longer():
    closed = sizing.predict_seconds(canonical_job('single', WATER, 0, 1), sizing.SIZES[0])
    opened = sizing.predict_seconds(canonical_job('single', WATER, 1, 2), sizing.SIZES[0])
    assert opened == pytest.approx(1.5 * closed)


def test_optimise_costs_more_than_single_and_steps_are_capped():
    single = sizing.predict_seconds(canonical_job('single', WATER, 0, 1), sizing.SIZES[0])
    optimise = sizing.predict_seconds(canonical_job('optimise', WATER, 0, 1), sizing.SIZES[0])
    assert optimise > single
    assert sizing.optimisation_steps(3) == 16 and sizing.optimisation_steps(200) == 100


def test_more_vcpus_are_faster_but_not_linearly():
    job = canonical_job('single', carbons(20), 0, 1)
    s, m = sizing.predict_seconds(job, sizing.SIZES[0]), sizing.predict_seconds(job, sizing.SIZES[1])
    assert s / m == pytest.approx(2 ** 0.8)


def test_decision_is_deterministic():
    job = canonical_job('optimise', carbons(12), 0, 1)
    assert sizing.decide(job) == sizing.decide(job)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_sizing.py -q`
Expected: FAIL, `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# tools/jobs/prices.py
"""What a Fargate second costs (spec §7.5), us-east-1, Linux/ARM64.

The meter charges these; the daily Cost Explorer figure (Phase 6B-3) is the
check that they still match the bill. Spot prices move: if AWS's figure
drifts from the meter's, update this table and RETRIEVED together.
"""
import math

RETRIEVED = '2026-10-04'
PRICES = {
    'on-demand': {'vcpuHour': 0.03238, 'gbHour': 0.00356},
    'spot': {'vcpuHour': 0.01034, 'gbHour': 0.00114},
    'local': {'vcpuHour': 0.0, 'gbHour': 0.0},
}
CAP_MICROS = 8_800_000              # $8.80 of compute; $1.20 of the $10 is kept for fixed costs (spec §6.4)
BILLING_MINIMUM_SECONDS = 60        # Fargate bills per second with a one-minute minimum


def billed_seconds(seconds: float) -> int:
    return max(BILLING_MINIMUM_SECONDS, math.ceil(seconds))


def cost_micros(capacity: str, vcpu: int, memory_gb: float, seconds: float) -> int:
    p = PRICES[capacity]
    dollars = seconds / 3600 * (vcpu * p['vcpuHour'] + memory_gb * p['gbHour'])
    return math.ceil(round(dollars * 1_000_000, 6))     # round first so 93240.0000001 is not 93241
```

```python
# tools/jobs/sizing.py
"""The app chooses the worker, deterministically (spec §7).

Memory ~ N² (matrices, DIIS history, the integration grid); one DFT single
point ~ N^3.5 on one vCPU, sped up by c^0.8 on c vCPUs (PySCF's threading is
good, not perfect). Version 0 carries seed constants; Task 11 fits version 1
from local runs and Phase 6B-3 refits version 2 from the AWS ladder. Every
job records the version and the prediction so the fit can be checked.
"""
import math
from dataclasses import dataclass

from jobs.basis_counts import basis_functions
from jobs.errors import JobRefused
from jobs.prices import cost_micros


@dataclass(frozen=True)
class Size:
    name: str
    vcpu: int
    memory_gb: int


SIZES = (Size('S', 2, 8), Size('M', 4, 16), Size('L', 16, 64), Size('XL', 32, 244))
SIZING_VERSION = 0
CONSTANTS = {'m0': 0.5, 'm2': 2.0, 't0': 5.0, 't3': 2400.0, 'g': 1.5}
HEADROOM = 2.0
TIMEOUT_FACTOR = 3.0
MIN_TIMEOUT_SECONDS = 600
CEILING_SECONDS = {'single': 3600, 'optimise': 7200}
SPOT_LIMIT_SECONDS = 3600
SPOT_ATTEMPTS = 3
OPEN_SHELL_FACTOR = 1.5


def speedup(vcpu: int) -> float:
    return vcpu ** 0.8


def single_point_seconds(n: int, vcpu: int) -> float:
    c = CONSTANTS
    return (c['t0'] + c['t3'] * (n / 1000) ** 3.5) / speedup(vcpu)


def predicted_memory_gb(n: int) -> float:
    return CONSTANTS['m0'] + CONSTANTS['m2'] * (n / 1000) ** 2


def optimisation_steps(atom_count: int) -> int:
    return min(10 + 2 * atom_count, 100)


def predict_seconds(job: dict, size: Size) -> float:
    atoms, method = job['molecule']['atoms'], job['method']
    seconds = single_point_seconds(basis_functions(atoms, method['basis']), size.vcpu)
    if method['optimiseBasis']:
        step = (1 + CONSTANTS['g']) * single_point_seconds(basis_functions(atoms, method['optimiseBasis']), size.vcpu)
        seconds += optimisation_steps(len(atoms)) * step
    if job['molecule']['multiplicity'] > 1:
        seconds *= OPEN_SHELL_FACTOR
    return seconds


def decide(job: dict, local: bool = False) -> dict:
    n = basis_functions(job['molecule']['atoms'], job['method']['basis'])
    memory = predicted_memory_gb(n)
    fitting = [s for s in SIZES if s.memory_gb >= HEADROOM * memory]
    if not fitting:
        raise JobRefused('too-large', f'predicted {memory:.0f} GB of memory (N = {n}): beyond the largest Fargate '
                                      f'worker ({SIZES[-1].memory_gb} GB with {HEADROOM:g}× headroom)')
    size = fitting[0]
    seconds = predict_seconds(job, size)
    ceiling = CEILING_SECONDS[job['recipe']]
    if seconds > ceiling:
        raise JobRefused('too-long', f'predicted {seconds / 3600:.1f} h on {size.name}: longer than this phase allows '
                                     f'for {job["recipe"]} ({ceiling / 3600:g} h)')
    timeout = int(min(max(math.ceil(TIMEOUT_FACTOR * seconds), MIN_TIMEOUT_SECONDS), ceiling))
    if local:
        capacity, attempts = 'local', 1
    elif seconds <= SPOT_LIMIT_SECONDS:
        capacity, attempts = 'spot', SPOT_ATTEMPTS
    else:
        capacity, attempts = 'on-demand', 1
    return {'version': SIZING_VERSION, 'size': size.name, 'vcpu': size.vcpu, 'memoryGB': size.memory_gb,
            'capacity': capacity, 'attempts': attempts, 'basisFunctions': n,
            'predictedSeconds': round(seconds, 1), 'predictedMemoryGB': round(memory, 2),
            'timeoutSeconds': timeout,
            'reservationMicros': attempts * cost_micros(capacity, size.vcpu, size.memory_gb, timeout),
            'predictedCostMicros': cost_micros(capacity, size.vcpu, size.memory_gb, seconds)}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_sizing.py -q`
Expected: PASS. If `test_long_jobs_run_on_demand_with_one_attempt` lands its prediction on the wrong side of 3600 s, the scale arithmetic is wrong. Fix the test's arithmetic, not the rule.

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/prices.py tools/jobs/sizing.py tools/jobs/tests/test_sizing.py
git commit -m "feat(jobs): Fargate prices and the deterministic worker-sizing rule (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Job records and the file store with its meter

**Files:**
- Create: `tools/jobs/model.py`, `tools/jobs/store.py`, `tools/jobs/tests/test_store.py`

**Interfaces:**
- Consumes: `errors.JobRefused`, `prices.CAP_MICROS`.
- Produces:
  - `model.STATUSES = ('QUEUED', 'STARTING', 'RUNNING', 'DONE', 'FAILED')`, `model.ACTIVE = {'QUEUED', 'STARTING', 'RUNNING'}`; `model.utc_now() -> datetime`; `model.iso(dt) -> str` (`'2026-10-05T12:00:00Z'`); `model.month_of(dt) -> 'YYYY-MM'`; `model.usd(micros: int) -> float`.
  - `model.new_record(*, key, job, decision, name, formula, electron_count, geometry_source, backend, now) -> dict`. The record's fields: `key, status='QUEUED', attempt=1, recipe, job, name, formula, electronCount, basisFunctions, geometrySource, sizing` (the decision without `reservationMicros`), `reservedMicros, actualMicros=0, settled=False, month, submittedAt, startedAt=None, endedAt=None, heartbeatAt=None, stage=None, latestEnergyHartree=None, logTail=[], actual=None, error=None, backend, runnerJobId=None`.
  - `model.public_view(record) -> dict`: the record minus `settled` and `runnerJobId`, with `reservedUsd`, `actualUsd` (null until settled) and `resultUrl = '/molecules/jobs/<key>/'` in place of the micro fields.
  - `store.BudgetExhausted(JobRefused)` (code `'budget'`).
  - `store.Store` (Protocol) and `store.FileStore(root: Path, cap_micros: int = CAP_MICROS)` with:
    - `get_job(key) -> dict | None`;
    - `create_job(record) -> tuple[bool, dict]`: atomically creates the job if its key is absent and reserves `record['reservedMicros']` in `record['month']`. Returns `(False, existing)` when the key exists. Raises `BudgetExhausted` and writes nothing when the cap would be passed;
    - `requeue_failed(key, decision, now) -> dict`: FAILED → QUEUED, `attempt + 1`, a new reservation charged to `month_of(now)` (the record's `month` moves with it), `settled=False`. Raises `JobRefused('invalid-request', 409)` if the job is not FAILED, and `BudgetExhausted` if over the cap;
    - `claim(key, attempt, now) -> bool`: → RUNNING. Allowed from QUEUED or STARTING, or from RUNNING with a lower recorded attempt;
    - `update_job(key, changes, expect_status: set | None = None) -> bool`;
    - `settle(key, actual_micros) -> bool`: exactly once per reservation;
    - `list_jobs(month, status=None) -> list[dict]`, sorted by `submittedAt`;
    - `meter(month) -> dict` (`{'spent', 'reserved', 'committed', 'cap'}`, in micros);
    - `get_resolution(query) -> dict | None`, `put_resolution(query, value)`;
    - `generation_enabled() -> bool`, `set_generation_enabled(enabled: bool)`;
    - `get_billing(month) -> dict | None`, `put_billing(month, value)`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/jobs/tests/test_store.py
import threading
from datetime import datetime, timezone

import pytest

from jobs.errors import JobRefused
from jobs.model import new_record, public_view
from jobs.store import BudgetExhausted, FileStore

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
DECISION = {'version': 0, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'spot', 'attempts': 3,
            'basisFunctions': 58, 'predictedSeconds': 20.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 1_000, 'predictedCostMicros': 10}


def record(key='a' * 64, reservation=1_000, now=NOW):
    return new_record(key=key, job={'recipe': 'single'}, decision={**DECISION, 'reservationMicros': reservation},
                      name='water', formula='H2O', electron_count=10,
                      geometry_source={'kind': 'pubchem', 'cid': 962}, backend='local', now=now)


@pytest.fixture
def store(tmp_path):
    return FileStore(tmp_path, cap_micros=10_000)


def test_create_get_and_dedupe(store):
    created, rec = store.create_job(record())
    assert created and rec['status'] == 'QUEUED' and rec['month'] == '2026-10'
    created, again = store.create_job(record())
    assert not created and again['key'] == rec['key']
    assert store.meter('2026-10') == {'spent': 0, 'reserved': 1_000, 'committed': 1_000, 'cap': 10_000}


def test_cap_is_inclusive_and_refusal_leaves_no_reservation(store):
    assert store.create_job(record('a' * 64, 9_000))[0]
    assert store.create_job(record('b' * 64, 1_000))[0]          # lands exactly on the cap: accepted
    with pytest.raises(BudgetExhausted) as e:
        store.create_job(record('c' * 64, 1))
    assert e.value.code == 'budget'
    assert store.get_job('c' * 64) is None
    assert store.meter('2026-10')['committed'] == 10_000


def test_concurrent_create_reserves_once(store):
    results = []
    threads = [threading.Thread(target=lambda: results.append(store.create_job(record())[0])) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(True) == 1
    assert store.meter('2026-10')['reserved'] == 1_000


def test_settle_exactly_once(store):
    store.create_job(record())
    assert store.settle('a' * 64, 300)
    assert not store.settle('a' * 64, 300)
    assert store.meter('2026-10') == {'spent': 300, 'reserved': 0, 'committed': 300, 'cap': 10_000}
    assert store.get_job('a' * 64)['actualMicros'] == 300


def test_claim_rules(store):
    store.create_job(record())
    assert store.claim('a' * 64, 1, NOW)
    assert not store.claim('a' * 64, 1, NOW)                      # a duplicate copy of attempt 1
    assert store.claim('a' * 64, 2, NOW)                          # a Batch retry after a Spot reclaim
    assert store.get_job('a' * 64)['attempt'] == 2


def test_requeue_only_failed_and_reserves_again(store):
    store.create_job(record())
    with pytest.raises(JobRefused) as e:
        store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert e.value.status == 409
    store.update_job('a' * 64, {'status': 'FAILED', 'error': {'code': 'x', 'message': 'y'}})
    store.settle('a' * 64, 100)
    rec = store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, NOW)
    assert rec['status'] == 'QUEUED' and rec['attempt'] == 2 and rec['error'] is None and not rec['settled']
    assert store.meter('2026-10') == {'spent': 100, 'reserved': 500, 'committed': 600, 'cap': 10_000}


def test_a_retry_in_a_later_month_is_charged_to_that_month(store):
    store.create_job(record())
    store.update_job('a' * 64, {'status': 'FAILED'})
    store.settle('a' * 64, 100)
    november = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)
    rec = store.requeue_failed('a' * 64, {**DECISION, 'reservationMicros': 500}, november)
    assert rec['month'] == '2026-11'
    assert store.meter('2026-10') == {'spent': 100, 'reserved': 0, 'committed': 100, 'cap': 10_000}
    assert store.meter('2026-11')['reserved'] == 500
    store.settle('a' * 64, 40)
    assert store.meter('2026-11') == {'spent': 40, 'reserved': 0, 'committed': 40, 'cap': 10_000}


def test_update_with_expected_status(store):
    store.create_job(record())
    assert not store.update_job('a' * 64, {'status': 'DONE'}, expect_status={'RUNNING'})
    assert store.update_job('a' * 64, {'stage': 'SCF'}, expect_status={'QUEUED'})
    assert store.get_job('a' * 64)['stage'] == 'SCF'


def test_list_resolution_config_billing(store):
    store.create_job(record('b' * 64, now=NOW.replace(second=0)))
    store.create_job(record('a' * 64, now=NOW.replace(second=1)))
    assert [r['key'] for r in store.list_jobs('2026-10')] == ['b' * 64, 'a' * 64]      # by submission time, not key
    assert store.list_jobs('2026-10', status='DONE') == [] and store.list_jobs('2026-09') == []
    store.put_resolution('name:water', {'cid': 962})
    assert store.get_resolution('name:water') == {'cid': 962} and store.get_resolution('name:x') is None
    assert store.generation_enabled()
    store.set_generation_enabled(False)
    assert not store.generation_enabled()
    assert store.get_billing('2026-10') is None
    store.put_billing('2026-10', {'usd': 0.12})
    assert store.get_billing('2026-10') == {'usd': 0.12}


def test_public_view_converts_money_and_hides_internals(store):
    store.create_job(record())
    view = public_view(store.get_job('a' * 64))
    assert view['reservedUsd'] == 0.001 and view['actualUsd'] is None
    assert view['resultUrl'] == '/molecules/jobs/' + 'a' * 64 + '/'
    for hidden in ('settled', 'runnerJobId', 'reservedMicros', 'actualMicros'):
        assert hidden not in view
    store.settle('a' * 64, 250)
    assert public_view(store.get_job('a' * 64))['actualUsd'] == 0.00025
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_store.py -q`
Expected: FAIL, `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# tools/jobs/model.py
from datetime import datetime, timezone

STATUSES = ('QUEUED', 'STARTING', 'RUNNING', 'DONE', 'FAILED')
ACTIVE = {'QUEUED', 'STARTING', 'RUNNING'}
_HIDDEN = ('settled', 'runnerJobId', 'reservedMicros', 'actualMicros')


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def month_of(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime('%Y-%m')


def usd(micros: int) -> float:
    return round(micros / 1_000_000, 6)


def new_record(*, key, job, decision, name, formula, electron_count, geometry_source, backend, now) -> dict:
    sizing = {k: v for k, v in decision.items() if k != 'reservationMicros'}
    return {'key': key, 'status': 'QUEUED', 'attempt': 1, 'recipe': job['recipe'], 'job': job, 'name': name,
            'formula': formula, 'electronCount': electron_count, 'basisFunctions': decision['basisFunctions'],
            'geometrySource': geometry_source, 'sizing': sizing, 'reservedMicros': decision['reservationMicros'],
            'actualMicros': 0, 'settled': False, 'month': month_of(now), 'submittedAt': iso(now),
            'startedAt': None, 'endedAt': None, 'heartbeatAt': None, 'stage': None, 'latestEnergyHartree': None,
            'logTail': [], 'actual': None, 'error': None, 'backend': backend, 'runnerJobId': None}


def public_view(record: dict) -> dict:
    view = {k: v for k, v in record.items() if k not in _HIDDEN}
    view['reservedUsd'] = usd(record['reservedMicros'])
    view['actualUsd'] = usd(record['actualMicros']) if record['settled'] else None
    view['resultUrl'] = f'/molecules/jobs/{record["key"]}/'
    return view
```

```python
# tools/jobs/store.py
"""Where job records and the meter live (spec §6).

Store is the contract both backends meet: FileStore here (local), DynamoDB
in Phase 6B-3. Its methods are the conditional operations the AWS version
makes in one DynamoDB transaction, so the local backend exercises the same
semantics: create-if-absent together with the reservation, settle exactly
once, claim only from a state that allows it.
"""
import fcntl
import hashlib
import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol

from jobs.errors import JobRefused
from jobs.model import iso, month_of
from jobs.prices import CAP_MICROS


class BudgetExhausted(JobRefused):
    def __init__(self, meter: dict):
        super().__init__('budget', f'Monthly budget reached: ${meter["spent"] / 1e6:.2f} spent, '
                                   f'${meter["reserved"] / 1e6:.2f} reserved of ${meter["cap"] / 1e6:.2f}')


class Store(Protocol):
    def get_job(self, key: str) -> dict | None: ...
    def create_job(self, record: dict) -> tuple[bool, dict]: ...
    def requeue_failed(self, key: str, decision: dict, now) -> dict: ...
    def claim(self, key: str, attempt: int, now) -> bool: ...
    def update_job(self, key: str, changes: dict, expect_status: set | None = None) -> bool: ...
    def settle(self, key: str, actual_micros: int) -> bool: ...
    def list_jobs(self, month: str, status: str | None = None) -> list[dict]: ...
    def meter(self, month: str) -> dict: ...
    def get_resolution(self, query: str) -> dict | None: ...
    def put_resolution(self, query: str, value: dict) -> None: ...
    def generation_enabled(self) -> bool: ...
    def set_generation_enabled(self, enabled: bool) -> None: ...
    def get_billing(self, month: str) -> dict | None: ...
    def put_billing(self, month: str, value: dict) -> None: ...


class FileStore:
    """JSON files under one directory, every read-modify-write under one
    flock: the local server's threads and the worker subprocess (or a
    container with the directory mounted) all write here."""

    def __init__(self, root, cap_micros: int = CAP_MICROS):
        self.root = Path(root)
        self.cap = cap_micros
        for sub in ('jobs', 'resolve'):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    @contextmanager
    def _locked(self):
        with open(self.root / '.lock', 'a') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def _read(self, path: Path, default=None):
        return json.loads(path.read_text()) if path.exists() else default

    def _write(self, path: Path, value) -> None:
        tmp = path.with_suffix(path.suffix + '.tmp')
        tmp.write_text(json.dumps(value, indent=1, ensure_ascii=False))
        os.replace(tmp, path)          # atomic: a reader never sees half a record

    def _job_path(self, key):
        return self.root / 'jobs' / f'{key}.json'

    def _meter_path(self, month):
        return self.root / f'meter-{month}.json'

    def _meter(self, month):
        m = self._read(self._meter_path(month), {'spent': 0, 'reserved': 0, 'committed': 0})
        return {**m, 'cap': self.cap}

    def _reserve(self, month, micros):
        m = self._meter(month)
        if m['committed'] + micros > self.cap:
            raise BudgetExhausted(m)
        self._write(self._meter_path(month), {'spent': m['spent'], 'reserved': m['reserved'] + micros,
                                              'committed': m['committed'] + micros})

    def get_job(self, key):
        return self._read(self._job_path(key))

    def create_job(self, record):
        with self._locked():
            existing = self.get_job(record['key'])
            if existing is not None:
                return False, existing
            self._reserve(record['month'], record['reservedMicros'])
            self._write(self._job_path(record['key']), record)
            return True, record

    def requeue_failed(self, key, decision, now):
        with self._locked():
            rec = self.get_job(key)
            if rec is None or rec['status'] != 'FAILED':
                raise JobRefused('invalid-request', 'only a failed job can be retried', 409)
            if not rec['settled']:
                raise JobRefused('invalid-request', 'the failed attempt is still being settled; retry in a minute', 409)
            # A retry is a new submission: it is charged to the month it is made in (spec §6.4).
            month = month_of(now)
            self._reserve(month, decision['reservationMicros'])
            rec.update({'status': 'QUEUED', 'attempt': rec['attempt'] + 1, 'error': None, 'settled': False,
                        'month': month,
                        'reservedMicros': decision['reservationMicros'],
                        'sizing': {k: v for k, v in decision.items() if k != 'reservationMicros'},
                        'submittedAt': iso(now), 'startedAt': None, 'endedAt': None, 'heartbeatAt': None,
                        'stage': None, 'logTail': [], 'actual': None, 'runnerJobId': None})
            self._write(self._job_path(key), rec)
            return rec

    def claim(self, key, attempt, now):
        with self._locked():
            rec = self.get_job(key)
            allowed = rec is not None and (rec['status'] in ('QUEUED', 'STARTING') or
                                           (rec['status'] == 'RUNNING' and rec['attempt'] < attempt))
            if not allowed:
                return False
            rec.update({'status': 'RUNNING', 'attempt': max(attempt, rec['attempt']), 'startedAt': iso(now),
                        'heartbeatAt': iso(now)})
            self._write(self._job_path(key), rec)
            return True

    def update_job(self, key, changes, expect_status=None):
        with self._locked():
            rec = self.get_job(key)
            if rec is None or (expect_status is not None and rec['status'] not in expect_status):
                return False
            rec.update(changes)
            self._write(self._job_path(key), rec)
            return True

    def settle(self, key, actual_micros):
        with self._locked():
            rec = self.get_job(key)
            if rec is None or rec['settled']:
                return False
            m = self._meter(rec['month'])
            self._write(self._meter_path(rec['month']), {
                'spent': m['spent'] + actual_micros, 'reserved': m['reserved'] - rec['reservedMicros'],
                'committed': m['committed'] + actual_micros - rec['reservedMicros']})
            rec.update({'settled': True, 'actualMicros': rec['actualMicros'] + actual_micros})
            self._write(self._job_path(key), rec)
            return True

    def list_jobs(self, month, status=None):
        records = [json.loads(p.read_text()) for p in (self.root / 'jobs').glob('*.json')]
        chosen = [r for r in records if r['month'] == month and (status is None or r['status'] == status)]
        return sorted(chosen, key=lambda r: (r['submittedAt'], r['key']))

    def meter(self, month):
        return self._meter(month)

    def _resolve_path(self, query):
        return self.root / 'resolve' / f'{hashlib.sha256(query.encode()).hexdigest()}.json'

    def get_resolution(self, query):
        return self._read(self._resolve_path(query))

    def put_resolution(self, query, value):
        self._write(self._resolve_path(query), value)

    def generation_enabled(self):
        return self._read(self.root / 'config.json', {'generationEnabled': True})['generationEnabled']

    def set_generation_enabled(self, enabled):
        self._write(self.root / 'config.json', {'generationEnabled': bool(enabled)})

    def get_billing(self, month):
        return self._read(self.root / f'billing-{month}.json')

    def put_billing(self, month, value):
        self._write(self.root / f'billing-{month}.json', value)
```

- [ ] **Step 4: Run them to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_store.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/model.py tools/jobs/store.py tools/jobs/tests/test_store.py
git commit -m "feat(jobs): job records and the file store with an exactly-once micro-dollar meter (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The API handlers

**Files:**
- Create: `tools/jobs/runner.py` (protocol and `NullRunner` only; `LocalRunner` comes in Task 10), `tools/jobs/handlers.py`, `tools/jobs/tests/test_handlers.py`, `tools/jobs/tests/test_no_chemistry_imports.py`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces:
  - `runner.Runner` (Protocol): `submit(record: dict) -> str`, which returns a runner job id and may raise.
  - `runner.NullRunner()`: returns `'null'` and records submitted keys in `.submitted`.
  - `handlers.Api(store, runner, resolve=pubchem.resolve, now=model.utc_now, backend='local')`, with:
    - `handle(method: str, path: str, query: dict[str, str], body: bytes | None) -> tuple[int, dict]`;
    - `preview(body: dict) -> dict`, `submit(body: dict) -> tuple[int, dict]`, `get(key) -> dict`, `list(query) -> dict`, `costs(query) -> dict`.
- **Response shapes, consumed by 6B-2 and 6B-3, exactly:**
  - `POST /api/v1/jobs/preview` → `200 {"key", "job", "name", "formula", "electronCount", "basisFunctions", "atoms": [[Z, x, y, z] Å], "charge", "multiplicity", "geometrySource", "decision": {"ok": true, "sizing": <Decision minus reservationMicros>, "reservedUsd"} | {"ok": false, "error": {"code", "message"}}, "existing": <public view> | null, "meter": <Meter>, "generationEnabled": bool}`.
  - `POST /api/v1/jobs` → `201 <public view>` (new), `200 <public view>` (known key, or retry of a FAILED one).
  - `GET /api/v1/jobs/{key}` → `200 <public view>`.
  - `GET /api/v1/jobs?month=YYYY-MM[&status=S]` → `200 {"month", "jobs": [<public view>…]}`.
  - `GET /api/v1/costs[?month=YYYY-MM]` → `200 <Meter> + {"projectionUsd", "daily": [{"date": "YYYY-MM-DD", "usd"}], "billing": {…} | null, "pricesRetrieved"}`.
  - **Meter:** `{"month", "capUsd", "spentUsd", "reservedUsd", "remainingUsd"}`.
  - **`geometrySource`:** `{"kind": "pubchem", "cid", "title", "query", "retrievedAt"}` or `{"kind": "xyz"}`.
  - **Errors:** `{"error": {"code", "message"}}` with the Global Constraints status.

- [ ] **Step 1: Write the failing tests**

```python
# tools/jobs/tests/test_handlers.py
import json
from datetime import datetime, timezone

import pytest

from jobs.handlers import Api
from jobs.runner import NullRunner
from jobs.store import FileStore

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'
WATER_KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa'


def fake_resolve(kind, text, *a, **k):
    if text.strip().lower() == 'water':
        return {'cid': 962, 'title': 'Water', 'charge': 0, 'retrievedAt': '2026-10-10',
                'atoms': [[8, 0, 0, 0.11779], [1, 0, 0.75545, -0.47116], [1, 0, -0.75545, -0.47116]]}
    from jobs.errors import JobRefused
    raise JobRefused('unknown-compound', f'PubChem does not know "{text}"')


@pytest.fixture
def api(tmp_path):
    return Api(FileStore(tmp_path, cap_micros=8_800_000), NullRunner(), resolve=fake_resolve,
               now=lambda: NOW, backend='aws')


def call(api, method, path, body=None, query=None):
    raw = json.dumps(body).encode() if body is not None else None
    return api.handle(method, path, query or {}, raw)


def test_preview_by_xyz_writes_nothing(api):
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['key'] == WATER_KEY
    assert body['formula'] == 'H2O' and body['electronCount'] == 10 and body['basisFunctions'] == 58
    assert body['decision']['ok'] and body['decision']['sizing']['size'] == 'S'
    assert body['existing'] is None and body['geometrySource'] == {'kind': 'xyz'}
    assert body['meter'] == {'month': '2026-10', 'capUsd': 8.8, 'spentUsd': 0.0, 'reservedUsd': 0.0, 'remainingUsd': 8.8}
    assert api.store.get_job(WATER_KEY) is None


def test_submit_by_name_then_dedupe(api):
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'name': 'water'}})
    assert status == 201 and view['key'] == WATER_KEY and view['status'] == 'QUEUED'
    assert view['geometrySource'] == {'kind': 'pubchem', 'cid': 962, 'title': 'Water', 'query': 'water',
                                      'retrievedAt': '2026-10-10'}
    assert api.runner.submitted == [WATER_KEY] and api.store.get_job(WATER_KEY)['runnerJobId'] == 'null'
    status, again = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and again['key'] == WATER_KEY and api.runner.submitted == [WATER_KEY]


def test_cached_name_needs_no_pubchem(api):
    call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'name': 'Water'}})

    def down(*a, **k):
        from jobs.errors import JobRefused
        raise JobRefused('pubchem-unavailable', 'down', 503)
    api.resolve = down
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'name': ' water '}})
    assert status == 200 and body['key'] == WATER_KEY


def test_failed_job_is_retried_only_on_request(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'FAILED', 'error': {'code': 'scf-not-converged', 'message': 'm'}})
    api.store.settle(WATER_KEY, 10)
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and view['status'] == 'FAILED' and len(api.runner.submitted) == 1
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'retry': True})
    assert status == 200 and view['status'] == 'QUEUED' and view['attempt'] == 2 and len(api.runner.submitted) == 2


def test_runner_failure_marks_the_job_failed_and_releases_the_money(api):
    def broken(record):
        raise RuntimeError('Batch said no')
    api.runner.submit = broken
    status, view = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 201 and view['status'] == 'FAILED' and view['error']['code'] == 'submit-failed'
    assert api.store.meter('2026-10')['reserved'] == 0


def test_paused_refuses_new_jobs_but_not_known_ones(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.set_generation_enabled(False)
    assert call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})[0] == 200
    status, body = call(api, 'POST', '/api/v1/jobs', {'recipe': 'optimise', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 503 and body['error']['code'] == 'paused'


def test_budget_refusal(api):
    api.store.cap = 1
    status, body = call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 422 and body['error']['code'] == 'budget'
    status, body = call(api, 'POST', '/api/v1/jobs/preview', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    assert status == 200 and body['decision'] == {'ok': False, 'error': {'code': 'budget', 'message': body['decision']['error']['message']}}


@pytest.mark.parametrize('body,code,status', [
    ({'recipe': 'single'}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'name': 'water', 'xyz': WATER_XYZ}}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'name': 'x' * 201}}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'colour': 'red'}, 'invalid-request', 400),
    ({'recipe': 'scan', 'molecule': {'xyz': WATER_XYZ}}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'charge': 'one'}, 'invalid-request', 400),
    ({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}, 'multiplicity': 2}, 'bad-multiplicity', 422),
    ({'recipe': 'single', 'molecule': {'name': 'unobtainium'}}, 'unknown-compound', 422),
    ({'recipe': 'single', 'molecule': {'xyz': 'Rb 0 0 0'}}, 'element-out-of-range', 422),
])
def test_refusals(api, body, code, status):
    got_status, got = call(api, 'POST', '/api/v1/jobs', body)
    assert (got_status, got['error']['code']) == (status, code)


def test_malformed_json_and_routes(api):
    assert api.handle('POST', '/api/v1/jobs', {}, b'{not json')[1]['error']['code'] == 'invalid-request'
    assert api.handle('GET', '/api/v1/jobs/' + 'f' * 64, {}, None)[0] == 404
    assert api.handle('GET', '/api/v1/jobs/not-a-key', {}, None)[0] == 404
    assert api.handle('DELETE', '/api/v1/jobs', {}, None)[0] == 404
    assert api.handle('GET', '/api/v1/jobs', {'month': '2026-13x'}, None)[0] == 400


def test_get_and_list(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    status, view = api.handle('GET', f'/api/v1/jobs/{WATER_KEY}', {}, None)
    assert status == 200 and view['key'] == WATER_KEY
    status, listing = api.handle('GET', '/api/v1/jobs', {'month': '2026-10'}, None)
    assert listing['month'] == '2026-10' and [j['key'] for j in listing['jobs']] == [WATER_KEY]
    assert api.handle('GET', '/api/v1/jobs', {'month': '2026-10', 'status': 'DONE'}, None)[1]['jobs'] == []


def test_costs_projection_and_daily(api):
    call(api, 'POST', '/api/v1/jobs', {'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}})
    api.store.update_job(WATER_KEY, {'status': 'DONE', 'endedAt': '2026-10-09T08:00:00Z'})
    api.store.settle(WATER_KEY, 100_000)                         # $0.10 spent by day 10 of 31
    status, costs = api.handle('GET', '/api/v1/costs', {}, None)
    assert status == 200 and costs['month'] == '2026-10' and costs['spentUsd'] == 0.1
    assert costs['daily'] == [{'date': '2026-10-09', 'usd': 0.1}]
    assert costs['projectionUsd'] == pytest.approx(0.1 * 31 / 10, abs=1e-6)
    assert costs['billing'] is None and costs['pricesRetrieved'] == '2026-10-04'
```

```python
# tools/jobs/tests/test_no_chemistry_imports.py
"""The api Lambda ships tools/jobs without PySCF or NumPy (spec §7.1)."""
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2]


def test_api_modules_import_without_pyscf_or_numpy():
    code = ("import sys; sys.modules['pyscf'] = None; sys.modules['numpy'] = None; "
            "import jobs.handlers, jobs.store, jobs.runner, jobs.sizing, jobs.pubchem, jobs.canonical, jobs.model")
    result = subprocess.run([sys.executable, '-c', code], cwd=TOOLS, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_handlers.py tools/jobs/tests/test_no_chemistry_imports.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'jobs.handlers'`.

- [ ] **Step 3: Implement**

```python
# tools/jobs/runner.py
"""Starts a queued job somewhere. LocalRunner (Task 10) runs the worker as a
subprocess; BatchRunner (Phase 6B-3) submits to AWS Batch."""
from typing import Protocol


class Runner(Protocol):
    def submit(self, record: dict) -> str: ...


class NullRunner:
    """Accepts jobs and runs nothing: tests, and `cli enqueue` for the container smoke test."""

    def __init__(self):
        self.submitted = []

    def submit(self, record):
        self.submitted.append(record['key'])
        return 'null'
```

```python
# tools/jobs/handlers.py
"""The job API's routes (spec §4), independent of any web framework.

The local server and the api Lambda both call Api.handle, so local and AWS
answer identically by construction.
"""
import calendar
import json
import re

from jobs import pubchem, sizing
from jobs.basis_counts import basis_functions
from jobs.canonical import canonical_job, check_atoms, electron_count, formula, job_key, multiplicity_for, parse_xyz
from jobs.errors import JobRefused
from jobs.model import ACTIVE, STATUSES, iso, month_of, new_record, public_view, usd, utc_now
from jobs.prices import RETRIEVED
from jobs.store import BudgetExhausted

KEY = re.compile(r'^[0-9a-f]{64}$')
MONTH = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')
MAX_NAME = 200
_FIELDS = {'recipe', 'molecule', 'charge', 'multiplicity', 'retry'}


def _bad(message):
    return JobRefused('invalid-request', message, 400)


class Api:
    def __init__(self, store, runner, resolve=pubchem.resolve, now=utc_now, backend='local'):
        self.store, self.runner, self.resolve, self.now, self.backend = store, runner, resolve, now, backend

    # -- routing -----------------------------------------------------------
    def handle(self, method, path, query, body):
        try:
            if method == 'POST' and path == '/api/v1/jobs/preview':
                return 200, self.preview(self._json(body))
            if method == 'POST' and path == '/api/v1/jobs':
                return self.submit(self._json(body))
            if method == 'GET' and path == '/api/v1/jobs':
                return 200, self.list(query)
            if method == 'GET' and path.startswith('/api/v1/jobs/'):
                return 200, self.get(path.rsplit('/', 1)[1])
            if method == 'GET' and path == '/api/v1/costs':
                return 200, self.costs(query)
            raise JobRefused('not-found', f'no route {method} {path}', 404)
        except JobRefused as e:
            return e.status, {'error': {'code': e.code, 'message': e.message}}

    @staticmethod
    def _json(body):
        try:
            value = json.loads(body or b'')
        except (ValueError, UnicodeDecodeError):
            raise _bad('the request body is not JSON')
        if not isinstance(value, dict):
            raise _bad('the request body must be a JSON object')
        return value

    # -- request → canonical job ---------------------------------------------
    def _request(self, body):
        unknown = set(body) - _FIELDS
        if unknown:
            raise _bad(f'unknown field(s): {", ".join(sorted(unknown))}')
        molecule = body.get('molecule')
        if not isinstance(molecule, dict) or len(molecule) != 1 or next(iter(molecule)) not in ('name', 'smiles', 'xyz'):
            raise _bad('molecule must be exactly one of {"name"}, {"smiles"} or {"xyz"}')
        kind, text = next(iter(molecule.items()))
        if not isinstance(text, str) or not text.strip():
            raise _bad(f'molecule.{kind} must be a non-empty string')
        if kind != 'xyz' and len(text) > MAX_NAME:
            raise _bad(f'molecule.{kind} is over {MAX_NAME} characters')
        for field in ('charge', 'multiplicity'):
            if body.get(field) is not None and (not isinstance(body[field], int) or isinstance(body[field], bool)):
                raise _bad(f'{field} must be an integer')
        if not isinstance(body.get('retry', False), bool):
            raise _bad('retry must be true or false')
        return body.get('recipe'), kind, text, body.get('charge'), body.get('multiplicity'), body.get('retry', False)

    def _geometry(self, kind, text):
        if kind == 'xyz':
            atoms = parse_xyz(text)
            return atoms, 0, {'kind': 'xyz'}, None
        query = pubchem.normalise_query(kind, text)
        found = self.store.get_resolution(query)
        if found is None:
            found = self.resolve(kind, text)
            self.store.put_resolution(query, found)
        source = {'kind': 'pubchem', 'cid': found['cid'], 'title': found['title'], 'query': text.strip(),
                  'retrievedAt': found['retrievedAt']}
        return found['atoms'], found['charge'], source, found['title']

    def _prepare(self, body):
        recipe, kind, text, charge, multiplicity, retry = self._request(body)
        atoms, default_charge, source, title = self._geometry(kind, text)
        check_atoms(atoms)
        charge = default_charge if charge is None else charge
        electrons = electron_count(atoms, charge)
        multiplicity = multiplicity_for(electrons, multiplicity)
        job = canonical_job(recipe, atoms, charge, multiplicity)
        f = formula(atoms)
        return {'job': job, 'key': job_key(job), 'formula': f, 'name': title or f, 'electrons': electrons,
                'source': source, 'retry': retry}

    def _decide(self, job):
        return sizing.decide(job, local=self.backend == 'local')

    def _meter(self, month):
        m = self.store.meter(month)
        return {'month': month, 'capUsd': usd(m['cap']), 'spentUsd': usd(m['spent']),
                'reservedUsd': usd(m['reserved']), 'remainingUsd': usd(max(m['cap'] - m['committed'], 0))}

    # -- routes ------------------------------------------------------------
    def preview(self, body):
        p = self._prepare(body)
        month = month_of(self.now())
        try:
            d = self._decide(p['job'])
            meter = self.store.meter(month)
            if meter['committed'] + d['reservationMicros'] > meter['cap']:
                raise BudgetExhausted(meter)
            decision = {'ok': True, 'sizing': {k: v for k, v in d.items() if k != 'reservationMicros'},
                        'reservedUsd': usd(d['reservationMicros'])}
        except JobRefused as e:
            decision = {'ok': False, 'error': {'code': e.code, 'message': e.message}}
        existing = self.store.get_job(p['key'])
        mol = p['job']['molecule']
        return {'key': p['key'], 'job': p['job'], 'name': p['name'], 'formula': p['formula'],
                'electronCount': p['electrons'],
                'basisFunctions': basis_functions(mol['atoms'], p['job']['method']['basis']),
                'atoms': mol['atoms'], 'charge': mol['charge'], 'multiplicity': mol['multiplicity'],
                'geometrySource': p['source'], 'decision': decision,
                'existing': public_view(existing) if existing else None,
                'meter': self._meter(month), 'generationEnabled': self.store.generation_enabled()}

    def submit(self, body):
        p = self._prepare(body)
        existing = self.store.get_job(p['key'])
        if existing is not None and not (existing['status'] == 'FAILED' and p['retry']):
            return 200, public_view(existing)
        if not self.store.generation_enabled():
            raise JobRefused('paused', 'Generation is paused by the owner (infra/jobs.sh resume)', 503)
        decision = self._decide(p['job'])
        if existing is not None:
            record, status = self.store.requeue_failed(p['key'], decision, self.now()), 200
        else:
            created, record = self.store.create_job(new_record(
                key=p['key'], job=p['job'], decision=decision, name=p['name'], formula=p['formula'],
                electron_count=p['electrons'], geometry_source=p['source'], backend=self.backend, now=self.now()))
            if not created:
                return 200, public_view(record)     # lost a race with an identical submission
            status = 201
        try:
            self.store.update_job(p['key'], {'runnerJobId': self.runner.submit(record)})
        except Exception as e:                       # the runner's own error, shown to the owner verbatim
            self.store.update_job(p['key'], {'status': 'FAILED', 'endedAt': iso(self.now()),
                                             'error': {'code': 'submit-failed', 'message': str(e)}})
            self.store.settle(p['key'], 0)
        return status, public_view(self.store.get_job(p['key']))

    def get(self, key):
        record = self.store.get_job(key) if KEY.match(key) else None
        if record is None:
            raise JobRefused('not-found', f'no job {key}', 404)
        return public_view(record)

    def _month(self, query):
        month = query.get('month') or month_of(self.now())
        if not MONTH.match(month):
            raise _bad('month must be YYYY-MM')
        return month

    def list(self, query):
        month, status = self._month(query), query.get('status')
        if status is not None and status not in STATUSES:
            raise _bad(f'status must be one of {", ".join(STATUSES)}')
        return {'month': month, 'jobs': [public_view(r) for r in self.store.list_jobs(month, status)]}

    def costs(self, query):
        month = self._month(query)
        records = self.store.list_jobs(month)
        meter = self.store.meter(month)
        daily = {}
        for r in records:
            if r['settled'] and r['actualMicros'] and r['endedAt']:
                day = r['endedAt'][:10]
                daily[day] = daily.get(day, 0) + r['actualMicros']
        now = self.now()
        year, mon = map(int, month.split('-'))
        days = calendar.monthrange(year, mon)[1]
        elapsed = days if month < month_of(now) else max(now.day, 1)
        queued = sum(r['sizing']['predictedCostMicros'] for r in records if r['status'] in ACTIVE)
        return {**self._meter(month), 'projectionUsd': usd(round(meter['spent'] * days / elapsed) + queued),
                'daily': [{'date': d, 'usd': usd(v)} for d, v in sorted(daily.items())],
                'billing': self.store.get_billing(month), 'pricesRetrieved': RETRIEVED}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs -q`
Expected: PASS (all task files so far).

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/runner.py tools/jobs/handlers.py tools/jobs/tests/test_handlers.py tools/jobs/tests/test_no_chemistry_imports.py
git commit -m "feat(jobs): preview, submit, status, list and cost routes over Store and Runner (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Extract Phase 6's file writer so the worker can reuse it

**Files:**
- Modify: `tools/molecules/build_library.py` (`build_molecule`)
- Test: `tools/molecules/tests/test_build_library.py` (Phase 6's tests, unchanged, must still pass) and a new test in `tools/jobs/tests/test_write_molecule_files.py`

**Interfaces:**
- Consumes: Phase 6's `build_molecule` body as it is on disk now. The code below follows the Phase 6 plan. If review fixes changed the real function, extract **the real one** with the same seam.
- Produces: `build_library.write_molecule_files(out: Path, mol, mf, fields: dict, grid_points=GRID_POINTS_TRIES, budget=BUDGET_BYTES) -> dict`. It writes `basis.json`, `density.bin.gz`, `esp.bin.gz` and `meta.json` into `out`, and returns the meta dict. `fields` supplies `id`, `name`, `formula`, `geometrySource`, `references` (list of JSON references), `multiplicity`, `method` (the string written to `meta.method.density`/`energies`, e.g. `'B3LYP/def2-TZVPD'` — taken from the caller, never re-derived from PySCF objects), plus optional extra keys that are merged into meta last (`geometryOptimisation`, `caveat`, `tier`, `provenance`). It raises `BudgetExceeded` as before. **The v2 library's files must be reproducible byte for byte by `build_molecule` after the refactor** (same keys, same order, same values).

- [ ] **Step 1: Write the failing test**

```python
# tools/jobs/tests/test_write_molecule_files.py
import json

from build_library import run_dft, write_molecule_files


def test_writes_phase_6_files_from_any_scf(tmp_path):
    mol, mf = run_dft([('H', (0, 0, 0)), ('H', (0, 0, 0.74))], 0, 'def2-SVP', 'B3LYP')
    meta = write_molecule_files(tmp_path, mol, mf, {
        'id': 'k' * 64, 'name': 'Hydrogen', 'formula': 'H2', 'geometrySource': 'pasted XYZ', 'method': 'B3LYP/def2-SVP',
        'references': [], 'multiplicity': 1, 'tier': 'computed', 'provenance': {'jobKey': 'k' * 64}},
        grid_points=(32,))
    assert {p.name for p in tmp_path.iterdir()} == {'meta.json', 'density.bin.gz', 'esp.bin.gz', 'basis.json'}
    on_disk = json.loads((tmp_path / 'meta.json').read_text())
    assert on_disk == meta and meta['tier'] == 'computed' and meta['method']['density'] == 'B3LYP/def2-SVP'
    assert abs(meta['densityIntegral'] - 2) < 0.02
```

- [ ] **Step 2: Run it to verify it fails**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_write_molecule_files.py -q`
Expected: FAIL, `ImportError: cannot import name 'write_molecule_files'`.

- [ ] **Step 3: Extract the writer**

Phase 6 shipped `build_molecule` with the D1/D2/D25/T7-O3 corrections (see `tools/molecules/build_library.py`: `library_basis_json`, `check_density`, `provenance(_commit())`, `PROPERTY_BASIS = 'def2-TZVPD'`, `meta['caveat']`). Extract its body verbatim into `write_molecule_files`; the only changes are where five values come from (`fields` instead of `entry`/arguments). In `tools/molecules/build_library.py`, replace `build_molecule` with:

```python
_FIELD_KEYS = ('id', 'name', 'formula', 'geometrySource', 'references', 'multiplicity', 'method')


def write_molecule_files(out, mol, mf, fields, grid_points=GRID_POINTS_TRIES, budget=BUDGET_BYTES):
    """Phase 6's per-molecule files for an SCF that has already run. Shared
    with the on-demand worker (tools/jobs/worker.py), which brings its own
    geometry and convergence ladder but must write exactly what the library
    writes, so the app reads both the same way. Writes into `out` directly:
    the worker points it at a scratch folder and copies only a finished set."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    dm = total_dm(mf)
    coords = mol.atom_coords()
    orbitals = orbital_table(mol, mf)
    (out / 'basis.json').write_text(json.dumps(library_basis_json(mol, mf, orbitals), separators=(',', ':')))
    dipole = np.asarray(mf.dip_moment(unit='Debye', verbose=0), dtype=float)
    extra = {k: v for k, v in fields.items() if k not in _FIELD_KEYS}
    for points in grid_points:
        grid, esp_grid = grid_for(coords, points), grid_for(coords, points // 2)
        raw_density = voxel_averaged_density(mol, dm, grid)
        check_density(raw_density)               # D25: before compaction hides it
        density = compact_float32(raw_density, floor=DENSITY_FLOOR)
        check_box(density)
        esp_coords = esp_grid.coords()
        esp = esp_on_points(mol, dm, esp_coords)
        write_float32_gz(out / 'density.bin.gz', density)
        write_float32_gz(out / 'esp.bin.gz', compact_float32(esp))
        meta = {
            'id': fields['id'], 'name': fields['name'], 'formula': fields['formula'],
            'atoms': [{'Z': int(mol.atom_charge(i)), 'position': [float(v) for v in coords[i]]} for i in range(mol.natm)],
            'geometrySource': fields['geometrySource'],
            'method': {'density': fields['method'], 'energies': fields['method']},
            'totalEnergyHartree': float(mf.e_tot),
            'dipoleDebye': float(np.linalg.norm(dipole)),
            'dipoleVectorDebye': [float(v) for v in dipole],
            'orbitals': orbitals,
            'grid': grid.as_meta(),
            'espGrid': esp_grid.as_meta(),
            'espRangeOnSurface': list(esp_surface_range(esp, eval_density(mol, dm, esp_coords))),
            'electronCount': int(mol.nelectron),
            'densityIntegral': float(density.astype(np.float64).sum() * grid.spacing ** 3),
            'multiplicity': fields['multiplicity'],
            'symmetry': {'pointGroup': mol.topgroup, 'labelGroup': mol.groupname},
            'references': fields['references'],
            'generator': {**provenance(_commit()), 'script': 'tools/molecules/build_library.py'},
            **extra,
        }
        (out / 'meta.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False) + '\n')
        if _size(out) <= budget:
            return meta
    raise BudgetExceeded(f'{fields["id"]}: {_size(out)} bytes at {grid_points[-1]}³ exceeds {budget}')


def build_molecule(entry, out_root=OUT_ROOT, basis=PROPERTY_BASIS, xc='B3LYP', grid_points=GRID_POINTS_TRIES, budget=BUDGET_BYTES):
    atoms, optimisation = geometry_for(entry)
    mol, mf = run_dft(atoms, entry.spin, basis, xc)
    fields = {'id': entry.id, 'name': entry.name, 'formula': entry.formula, 'geometrySource': entry.geometry_source,
              'references': [_reference_json(r) for r in entry.references], 'multiplicity': entry.spin + 1,
              'method': f'{xc}/{basis}'}
    if optimisation:
        fields['geometryOptimisation'] = optimisation
    if entry.caveat:
        fields['caveat'] = entry.caveat      # Ruling T7-O3 (Phase 6)
    write_molecule_files(Path(out_root) / entry.id, mol, mf, fields, grid_points, budget)
    return {'id': entry.id, 'name': entry.name, 'formula': entry.formula, 'category': entry.category, 'tags': list(entry.tags)}
```

Key order in `meta.json` must match Phase 6's (the `**extra` lands where `geometryOptimisation` and `caveat` were appended before). **Prove reproducibility:** rebuild one shipped library molecule into a scratch folder with the refactored code and compare it with `tools/molecules/out/v2/<id>/` — every file byte-identical except `meta.json`'s `generator.commit` (and `dataVersion` if it differs). Use a small one (`h2o`, about 15 s): `tools/molecules/.venv/bin/python -c "import build_library as b, library as l; b.build_molecule(l.by_id('h2o'), out_root='/tmp/v2check')"` from `tools/molecules`, then `cmp`/a JSON diff. Report the result.

Also fold in the Phase 6 final review's carry for this file family: `orbitals.orbital_table`'s position == index guard is a bare `assert` (a no-op under `python -O`); make it `raise ValueError(...)` with the same condition, since the worker now runs it at request time.

- [ ] **Step 4: Run both suites**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_write_molecule_files.py tools/molecules/tests/test_build_library.py -q`
Expected: PASS. Phase 6's tests are unchanged and still green.

- [ ] **Step 5: Commit**

```bash
git add tools/molecules/build_library.py tools/jobs/tests/test_write_molecule_files.py
git commit -m "refactor(molecules): write_molecule_files, so on-demand jobs write what the library writes (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `input.py` — the script the worker runs and anyone can rerun

**Files:**
- Create: `tools/jobs/input_template.py`, `tools/jobs/tests/test_input_template.py`

**Interfaces:**
- Consumes: `elements.SYMBOLS`.
- Produces: `render_input(job: dict, key: str, start: list | None = None) -> str`. The returned text defines `SCFNotConverged`, `OptimisationNotConverged`, `make_dft(mol)`, `converge(mol, on_stage)`, `optimise(atoms, on_stage, on_step)` and `build(on_stage=…, on_step=…) -> (mol, mf, info)`, and runs `build` under `if __name__ == '__main__'`. The callback contracts are `on_stage(stage: str, energy: float | None)` and `on_step(step: int, energy: float, atoms: list[tuple[str, tuple[float, float, float]]])`. `info` is `{}` for `single` and `{'steps': int, 'converged': True}` for `optimise`. `start` (atoms as `[(symbol, (x, y, z))]`) overrides the job's geometry when resuming an optimisation. The PySCF log goes to `output.log` in the working directory.

- [ ] **Step 1: Write the failing tests**

```python
# tools/jobs/tests/test_input_template.py
import os
import runpy
import subprocess
import sys

import pytest

from jobs.canonical import canonical_job
from jobs.input_template import render_input

H2 = [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.74]]
SMALL = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': None}


def test_rendered_script_is_self_describing():
    text = render_input(canonical_job('single', H2, 0, 1), 'k' * 64)
    assert "BASIS = 'def2-TZVPD'" in text and "XC = 'B3LYP'" in text and 'OPTIMISE_BASIS = None' in text
    assert "('H', (0.0, 0.0, 0.74))" in text and 'kkkk' in text
    compile(text, 'input.py', 'exec')


def test_build_returns_a_converged_scf_and_logs(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', H2, 0, 1, method=SMALL), 'k' * 64))
    stages = []
    mol, mf, info = runpy.run_path('input.py', run_name='jobs_input')['build'](on_stage=lambda s, e=None: stages.append(s))
    assert mf.converged and info == {} and stages[0].startswith('SCF')
    assert (tmp_path / 'output.log').read_text().count('converged SCF energy') >= 1


def test_open_shell_uses_roks(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', [[1, 0, 0, 0]], 0, 2, method=SMALL), 'k' * 64))
    mol, mf, _ = runpy.run_path('input.py', run_name='jobs_input')['build']()
    assert type(mf).__name__.startswith('ROKS') and mol.spin == 1


def test_ladder_reaches_second_order_and_then_gives_up(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(canonical_job('single', H2, 0, 1, method=SMALL), 'k' * 64))
    ns = runpy.run_path('input.py', run_name='jobs_input')
    stages = []
    ns['converge'].__globals__['MAX_CYCLES'] = (1, 1, 1)      # force every rung to stop early
    with pytest.raises(ns['SCFNotConverged']):
        ns['build'](on_stage=lambda s, e=None: stages.append(s))
    assert [s for s in stages if s.startswith('SCF (')] == ['SCF (DIIS)', 'SCF (level shift 0.3 Ha)', 'SCF (second-order)']


@pytest.mark.skipif(os.environ.get('JOBS_SLOW') != '1', reason='a short geomeTRIC run')
def test_optimise_reports_steps_and_runs_standalone(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    stretched = [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.9]]
    method = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'}
    (tmp_path / 'input.py').write_text(render_input(canonical_job('optimise', stretched, 0, 1, method=method), 'k' * 64))
    steps = []
    mol, mf, info = runpy.run_path('input.py', run_name='jobs_input')['build'](on_step=lambda n, e, a: steps.append((n, e, a)))
    assert info['converged'] and info['steps'] == len(steps) >= 2
    assert abs(mol.atom_coord(1)[2] - mol.atom_coord(0)[2]) * 0.529177 < 0.85
    run = subprocess.run([sys.executable, 'input.py'], cwd=tmp_path, capture_output=True, text=True)
    assert run.returncode == 0 and 'E =' in run.stdout
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_input_template.py -q`
Expected: FAIL, `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# tools/jobs/input_template.py
"""Renders input.py: the exact PySCF script a job runs (spec §8.3).

The worker writes this file and then executes it, so what the owner reads
is what ran, not a description of it. It runs on its own with PySCF and
geomeTRIC installed and reproduces the SCF; grids, ESP and the orbital table
come from tools/molecules/build_library.py at the commit in provenance.
"""
from jobs.elements import SYMBOLS

TEMPLATE = '''"""Job {key}

Recipe {recipe}: {description}
Reproduce with PySCF 2.8 and geomeTRIC installed:  python input.py
Generated by electron-orbital-viewer tools/jobs (spec 2026-10-05 on-demand generation).
"""
from pyscf import dft, gto

ATOMS = {atoms}   # Å
CHARGE = {charge}
SPIN = {spin}   # 2S = multiplicity - 1
XC = {xc!r}
BASIS = {basis!r}
OPTIMISE_BASIS = {optimise_basis!r}
MAX_STEPS = 100
MAX_CYCLES = (100, 200, 50)   # DIIS, level shift, second order
LOG = 'output.log'
_log = None


class SCFNotConverged(RuntimeError):
    pass


class OptimisationNotConverged(RuntimeError):
    pass


def _quiet(stage, energy=None):
    pass


def molecule(atoms, basis):
    global _log
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, charge=CHARGE, spin=SPIN, symmetry=True, verbose=0)
    _log = _log or open(LOG, 'a')     # one log for every molecule built, appended in order
    mol.stdout, mol.verbose = _log, 4
    return mol


def make_dft(mol):
    # As tools/molecules/optimise.make_dft: RKS for closed shells, ROKS (one orbital set) for open ones.
    mf = dft.RKS(mol) if mol.spin == 0 else dft.ROKS(mol)
    mf.xc = XC
    mf.grids.level = 4
    mf.conv_tol = 1e-10
    return mf


def converge(mol, on_stage):
    rungs = (('DIIS', {{}}), ('level shift 0.3 Ha', {{'level_shift': 0.3}}), ('second-order', None))
    dm = None
    for (label, options), cycles in zip(rungs, MAX_CYCLES):
        stage = f'SCF ({{label}})'
        on_stage(stage, None)
        mf = make_dft(mol)
        if options is None:
            mf = mf.newton()
        else:
            for name, value in options.items():
                setattr(mf, name, value)
        mf.max_cycle = cycles
        mf.callback = lambda env, stage=stage: on_stage(stage, env.get('e_tot'))
        mf.kernel(dm0=dm)
        if mf.converged:
            return mf
        dm = mf.make_rdm1()
    raise SCFNotConverged('SCF did not converge (DIIS, level shift 0.3 Ha, second-order)')


def optimise(atoms, on_stage, on_step):
    from pyscf.geomopt.geometric_solver import kernel as geometric_kernel
    mol = molecule(atoms, OPTIMISE_BASIS)
    steps = []

    def callback(envs):
        m = envs['mol']
        coords = m.atom_coords(unit='Angstrom')
        frame = [(m.atom_pure_symbol(i), tuple(float(c) for c in coords[i])) for i in range(m.natm)]
        steps.append(frame)
        on_stage(f'optimisation step {{len(steps)}}', float(envs['energy']))
        on_step(len(steps), float(envs['energy']), frame)

    try:
        converged, mol_eq = geometric_kernel(make_dft(mol), maxsteps=MAX_STEPS, callback=callback)
    except Exception as e:      # geomeTRIC raises its own NotConvergedError past MAX_STEPS
        raise OptimisationNotConverged(f'optimisation did not converge in {{MAX_STEPS}} steps ({{e}})')
    if not converged:
        raise OptimisationNotConverged(f'optimisation did not converge in {{MAX_STEPS}} steps')
    coords = mol_eq.atom_coords(unit='Angstrom')
    final = [(mol_eq.atom_pure_symbol(i), tuple(float(c) for c in coords[i])) for i in range(mol_eq.natm)]
    return final, {{'steps': len(steps), 'converged': True}}


def build(on_stage=_quiet, on_step=lambda step, energy, atoms: None, start=None):
    atoms, info = (start or ATOMS), {{}}
    if OPTIMISE_BASIS:
        atoms, info = optimise(atoms, on_stage, on_step)
    mol = molecule(atoms, BASIS)
    mf = converge(mol, on_stage)
    return mol, mf, info


if __name__ == '__main__':
    mol, mf, info = build(on_stage=lambda stage, energy=None: print(stage, '' if energy is None else energy))
    print('E =', mf.e_tot, 'Ha', info)
'''

DESCRIPTIONS = {
    'single': 'one B3LYP SCF at the given geometry',
    'optimise': 'B3LYP geomeTRIC optimisation in OPTIMISE_BASIS, then one SCF in BASIS',
}


def render_input(job: dict, key: str, start=None) -> str:
    mol, method = job['molecule'], job['method']
    atoms = start or [(SYMBOLS[a[0] - 1], (a[1], a[2], a[3])) for a in mol['atoms']]
    return TEMPLATE.format(key=key, recipe=job['recipe'], description=DESCRIPTIONS[job['recipe']],
                           atoms=repr([(s, tuple(float(c) for c in xyz)) for s, xyz in atoms]),
                           charge=mol['charge'], spin=mol['multiplicity'] - 1, xc=method['xc'],
                           basis=method['basis'], optimise_basis=method['optimiseBasis'])
```

The worker passes `start` through `render_input`, not through `build(start=...)`, so the file on disk always shows the geometry it actually began from. `build`'s `start` parameter is there for people rerunning the script by hand.

- [ ] **Step 4: Run them to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_input_template.py -q && JOBS_SLOW=1 tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_input_template.py -q -k optimise`
Expected: PASS, then 1 passed (well under a minute at STO-3G).

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/input_template.py tools/jobs/tests/test_input_template.py
git commit -m "feat(jobs): input.py, the runnable script every job executes and publishes (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The worker

**Files:**
- Create: `tools/jobs/sink.py`, `tools/jobs/worker.py`, `tools/jobs/tests/test_worker.py`

**Interfaces:**
- Consumes: `Store` (Task 5), `render_input` (Task 8), `build_library.write_molecule_files`/`BudgetExceeded`/`GRID_POINTS_TRIES` (Task 7), `model.iso/utc_now`.
- Produces:
  - `sink.Sink` (Protocol): `put_attempt(key, attempt, name, data: bytes)`, `get_attempt(key, attempt, name) -> bytes | None`, `put_result(key, name, data: bytes)` (refuses to overwrite), and `put_done(key, data: bytes)` (refuses to overwrite).
  - `sink.LocalSink(out_root: Path)`, which writes `<out_root>/jobs/<key>/…` and `<out_root>/jobs/<key>/attempts/<n>/…`.
  - `worker.CAVEATS: dict[str, list[str]]`.
  - `worker.run_job(key, store, sink, attempt=1, backend='local', grid_points=GRID_POINTS_TRIES, heartbeat_seconds=30, image_digest='local') -> str`, which returns `'DONE'`, `'FAILED'` or `'duplicate'`.
  - The CLI: `python -m jobs.worker run <key> --local <out_root> --state <state_root> [--attempt N] [--grid-points 96,88,80]`. 6B-3 adds `--aws`.
  - The record fields the worker writes:
    - while running: `stage`, `latestEnergyHartree`, `logTail` (≤ 20 lines, ≤ 4096 bytes), `heartbeatAt`, `peakMemoryGB`;
    - at the end: `status`, `endedAt`, `actual = {'wallSeconds', 'peakMemoryGB', 'threads'}`, `error = {'code', 'message'}` or `None`.
  - Error codes: `scf-not-converged`, `optimisation-not-converged`, `output-too-large`, `out-of-memory`, `worker-error`.
  - The `done.json` shape: `{'key', 'files': {name: sha256}, 'writtenAt'}`.
  - The `meta.provenance` shape: `{jobKey, computeVersion, recipe, geometrySource, caveats, generatorCommit, imageDigest, pyscfVersion, sizingVersion, size, capacity, wallSeconds, costUsd: null}`. `costUsd` is always null in the immutable meta, because settlement happens after the files are written (6B-3's reconcile). The UI reads the cost from the job record instead.

- [ ] **Step 1: Write the failing tests**

```python
# tools/jobs/tests/test_worker.py
import hashlib
import json
from datetime import datetime, timezone

import pytest

from jobs.canonical import canonical_job, job_key
from jobs.model import new_record
from jobs.sink import LocalSink
from jobs.store import FileStore
from jobs.worker import run_job

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
SVP = {'xc': 'B3LYP', 'basis': 'def2-SVP', 'optimiseBasis': None}
DECISION = {'version': 0, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'local', 'attempts': 1,
            'basisFunctions': 10, 'predictedSeconds': 5.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 0, 'predictedCostMicros': 0}


def queue(store, atoms, charge=0, mult=1, method=SVP):
    job = canonical_job('single', atoms, charge, mult, method=method)
    key = job_key(job)
    store.create_job(new_record(key=key, job=job, decision=DECISION, name='hydrogen', formula='H2', electron_count=2,
                                geometry_source={'kind': 'xyz'}, backend='local', now=NOW))
    return key


@pytest.fixture
def env(tmp_path):
    return FileStore(tmp_path / 'state'), LocalSink(tmp_path / 'out'), tmp_path / 'out' / 'jobs'


def test_h2_end_to_end(env):
    store, sink, jobs = env
    key = queue(store, [[1, 0, 0, 0], [1, 0, 0, 0.74]])
    assert run_job(key, store, sink, grid_points=(32,), heartbeat_seconds=0.2) == 'DONE'
    root = jobs / key
    names = {p.name for p in root.iterdir() if p.is_file()}
    assert names == {'meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz', 'job.json', 'input.py',
                     'output.log', 'geometry.xyz', 'timings.json', 'done.json'}
    done = json.loads((root / 'done.json').read_text())
    for name, digest in done['files'].items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest
    assert set(done['files']) == names - {'done.json'}
    meta = json.loads((root / 'meta.json').read_text())
    assert meta['tier'] == 'computed' and meta['id'] == key and meta['provenance']['costUsd'] is None
    assert meta['provenance']['caveats'] and meta['geometrySource'] == 'pasted XYZ'
    rec = store.get_job(key)
    assert rec['status'] == 'DONE' and rec['actual']['wallSeconds'] > 0 and rec['error'] is None
    assert rec['logTail'] and len('\n'.join(rec['logTail']).encode()) <= 4096
    timings = json.loads((root / 'timings.json').read_text())
    assert timings['backend'] == 'local' and timings['attempt'] == 1 and timings['stages'][0]['name'].startswith('SCF')
    assert (root / 'attempts' / '1' / 'input.py').exists()


def test_a_duplicate_copy_does_no_work(env):
    store, sink, jobs = env
    key = queue(store, [[1, 0, 0, 0], [1, 0, 0, 0.74]])
    store.claim(key, 1, NOW)
    assert run_job(key, store, sink, grid_points=(32,)) == 'duplicate'
    assert not (jobs / key).exists()


def test_scf_failure_keeps_the_attempt_files_and_writes_no_result(env, monkeypatch):
    store, sink, jobs = env
    key = queue(store, [[1, 0, 0, 0], [1, 0, 0, 0.74]])
    import jobs.input_template as template
    monkeypatch.setattr(template, 'TEMPLATE', template.TEMPLATE.replace('MAX_CYCLES = (100, 200, 50)', 'MAX_CYCLES = (1, 1, 1)'))
    assert run_job(key, store, sink, grid_points=(32,)) == 'FAILED'
    rec = store.get_job(key)
    assert rec['error']['code'] == 'scf-not-converged' and rec['status'] == 'FAILED'
    assert (jobs / key / 'attempts' / '1' / 'output.log').exists()
    assert not (jobs / key / 'done.json').exists() and not (jobs / key / 'meta.json').exists()


def test_result_files_are_never_overwritten(env):
    store, sink, jobs = env
    sink.put_result('k' * 64, 'meta.json', b'{}')
    with pytest.raises(FileExistsError):
        sink.put_result('k' * 64, 'meta.json', b'{}')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_worker.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'jobs.sink'`.

- [ ] **Step 3: Implement the sink**

```python
# tools/jobs/sink.py
"""Where a job's files go (spec §5.3). LocalSink writes under
tools/molecules/out/jobs/, which the dev server already serves at
/molecules/jobs/; S3Sink (Phase 6B-3) writes the same names to S3."""
from pathlib import Path
from typing import Protocol


class Sink(Protocol):
    def put_attempt(self, key: str, attempt: int, name: str, data: bytes) -> None: ...
    def get_attempt(self, key: str, attempt: int, name: str) -> bytes | None: ...
    def put_result(self, key: str, name: str, data: bytes) -> None: ...
    def put_done(self, key: str, data: bytes) -> None: ...


class LocalSink:
    def __init__(self, out_root):
        self.root = Path(out_root) / 'jobs'

    def put_attempt(self, key, attempt, name, data):
        path = self.root / key / 'attempts' / str(attempt) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get_attempt(self, key, attempt, name):
        path = self.root / key / 'attempts' / str(attempt) / name
        return path.read_bytes() if path.exists() else None

    def put_result(self, key, name, data):
        path = self.root / key / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'xb') as handle:      # 'x': a result, once written, is never replaced
            handle.write(data)

    def put_done(self, key, data):
        self.put_result(key, 'done.json', data)
```

- [ ] **Step 4: Implement the worker**

```python
# tools/jobs/worker.py
"""Runs one job: claim it, execute input.py, write Phase 6's files plus the
provenance record, done.json last (spec §6.5, §8).

Imports PySCF (through input.py and build_library) and so is excluded from
the no-chemistry rule the api modules keep.
"""
import argparse
import hashlib
import json
import os
import resource
import runpy
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path

from jobs.input_template import render_input
from jobs.model import iso, utc_now
from jobs.sink import LocalSink
from jobs.store import FileStore

LOG_TAIL_LINES = 20
LOG_TAIL_BYTES = 4096
CAVEATS = {
    'single': ['The geometry is not optimised: it is PubChem\'s computed 3D conformer or as pasted.'],
    'optimise': ['B3LYP/def2-SVP optimisation without a dispersion correction.',
                 'No frequency check: the structure is not confirmed to be a minimum.'],
}


def _peak_memory_gb():
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(rss / 1024 ** 3 if sys.platform == 'darwin' else rss / 1024 ** 2, 3)   # bytes on macOS, KiB on Linux


def _tail(path: Path):
    if not path.exists():
        return []
    lines = path.read_text(errors='replace').splitlines()[-LOG_TAIL_LINES:]
    while lines and len('\n'.join(lines).encode()) > LOG_TAIL_BYTES:
        lines = lines[1:]
    return lines


def _xyz(atoms, comment):
    return '\n'.join([str(len(atoms)), comment] + [f'{s} {x:.6f} {y:.6f} {z:.6f}' for s, (x, y, z) in atoms]) + '\n'


def _geometry_source_text(source, recipe):
    origin = f'PubChem CID {source["cid"]} 3D conformer (retrieved {source["retrievedAt"]})' \
        if source['kind'] == 'pubchem' else 'pasted XYZ'
    return f'B3LYP/def2-SVP optimised from {origin}' if recipe == 'optimise' else origin


def _commit():
    try:
        from build_library import _commit as commit
        return commit()
    except Exception:
        return 'unknown'


class Progress:
    """What the heartbeat reports, updated from PySCF's callbacks."""

    def __init__(self):
        self.lock = threading.Lock()
        self.stage, self.energy, self.stages = None, None, []

    def on_stage(self, stage, energy=None):
        with self.lock:
            if stage != self.stage:
                self.stages.append({'name': stage, 'start': time.monotonic()})
                self.stage = stage
            if energy is not None:
                self.energy = float(energy)

    def durations(self, end):
        out = []
        for i, s in enumerate(self.stages):
            stop = self.stages[i + 1]['start'] if i + 1 < len(self.stages) else end
            out.append({'name': s['name'], 'seconds': round(stop - s['start'], 2)})
        return out


def run_job(key, store, sink, attempt=1, backend='local', grid_points=None, heartbeat_seconds=30, image_digest='local'):
    import pyscf
    from build_library import GRID_POINTS_TRIES, BudgetExceeded, write_molecule_files

    if not store.claim(key, attempt, utc_now()):
        return 'duplicate'
    record = store.get_job(key)
    job, recipe = record['job'], record['recipe']
    progress, stop = Progress(), threading.Event()
    work = Path(tempfile.mkdtemp(prefix=f'job-{key[:8]}-'))
    log = work / 'output.log'
    frames = []

    start = None
    if recipe == 'optimise' and attempt > 1:       # resume from the last geometry a reclaimed attempt reached
        previous = sink.get_attempt(key, attempt - 1, 'trajectory.xyz')
        if previous:
            lines = previous.decode().strip().splitlines()
            count = int(lines[0])
            last = lines[-count:]
            start = [(p[0], (float(p[1]), float(p[2]), float(p[3]))) for p in (line.split() for line in last)]
    input_text = render_input(job, key, start=start)
    (work / 'input.py').write_text(input_text)

    def beat():
        while not stop.wait(heartbeat_seconds):
            with progress.lock:
                stage, energy = progress.stage, progress.energy
            store.update_job(key, {'heartbeatAt': iso(utc_now()), 'stage': stage, 'latestEnergyHartree': energy,
                                   'logTail': _tail(log), 'peakMemoryGB': _peak_memory_gb()}, expect_status={'RUNNING'})

    def on_step(step, energy, atoms):
        frames.append(_xyz(atoms, f'step {step} E={energy:.10f}'))
        sink.put_attempt(key, attempt, 'trajectory.xyz', ''.join(frames).encode())

    heart = threading.Thread(target=beat, daemon=True)
    heart.start()
    began, cwd = time.monotonic(), os.getcwd()
    error = None
    try:
        os.chdir(work)                              # geomeTRIC writes its scratch files to the working directory
        ns = runpy.run_path(str(work / 'input.py'), run_name='jobs_input')
        mol, mf, info = ns['build'](on_stage=progress.on_stage, on_step=on_step)
        progress.on_stage('writing files')
        source = record['geometrySource']
        coords = mol.atom_coords(unit='Angstrom')
        final_atoms = [(mol.atom_pure_symbol(i), tuple(float(c) for c in coords[i])) for i in range(mol.natm)]
        wall = round(time.monotonic() - began, 2)
        fields = {
            'id': key, 'name': record['name'], 'formula': record['formula'],
            'geometrySource': _geometry_source_text(source, recipe), 'references': [],
            'method': f"{job['method']['xc']}/{job['method']['basis']}",
            'multiplicity': job['molecule']['multiplicity'], 'tier': 'computed',
            'provenance': {'jobKey': key, 'computeVersion': job['computeVersion'], 'recipe': recipe,
                           'geometrySource': source, 'caveats': CAVEATS[recipe], 'generatorCommit': _commit(),
                           'imageDigest': image_digest, 'pyscfVersion': pyscf.__version__,
                           'sizingVersion': record['sizing']['version'], 'size': record['sizing']['size'],
                           'capacity': record['sizing']['capacity'], 'wallSeconds': wall, 'costUsd': None},
        }
        if info:
            fields['geometryOptimisation'] = info
        write_molecule_files(work / 'result', mol, mf, fields, grid_points or GRID_POINTS_TRIES)
    except Exception as e:
        error = _classify(e)
    finally:
        os.chdir(cwd)
        stop.set()
        heart.join()

    ended = time.monotonic()
    actual = {'wallSeconds': round(ended - began, 2), 'peakMemoryGB': _peak_memory_gb(),
              'threads': _threads()}
    timings = {'attempt': attempt, 'backend': backend, 'size': record['sizing']['size'],
               'vcpu': record['sizing']['vcpu'], 'memoryGB': record['sizing']['memoryGB'],
               'capacity': record['sizing']['capacity'], 'stages': progress.durations(ended), **actual,
               'startedAt': record['startedAt'], 'endedAt': iso(utc_now())}
    for name, data in (('input.py', input_text.encode()), ('output.log', log.read_bytes() if log.exists() else b''),
                       ('timings.json', json.dumps(timings, indent=1).encode())):
        sink.put_attempt(key, attempt, name, data)

    if error is None:
        files = {name: (work / 'result' / name).read_bytes()
                 for name in ('meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz')}
        files.update({'job.json': json.dumps({'key': key, 'job': job, 'geometrySource': record['geometrySource'],
                                              'sizing': record['sizing'], 'imageDigest': image_digest,
                                              'generatorCommit': _commit()}, indent=1).encode(),
                      'input.py': input_text.encode(), 'output.log': log.read_bytes(),
                      'geometry.xyz': _xyz(final_atoms, f'{record["formula"]} job {key}').encode(),
                      'timings.json': json.dumps(timings, indent=1).encode()})
        if frames:
            files['trajectory.xyz'] = ''.join(frames).encode()
        for name, data in files.items():
            sink.put_result(key, name, data)
        sink.put_done(key, json.dumps({'key': key, 'files': {n: hashlib.sha256(d).hexdigest() for n, d in files.items()},
                                       'writtenAt': iso(utc_now())}, indent=1).encode())
    store.update_job(key, {'status': 'FAILED' if error else 'DONE', 'endedAt': iso(utc_now()), 'stage': None,
                           'actual': actual, 'error': error, 'logTail': _tail(log)}, expect_status={'RUNNING'})
    return 'FAILED' if error else 'DONE'


def _threads():
    try:
        from pyscf import lib
        return lib.num_threads()
    except Exception:
        return os.cpu_count()


def _classify(e):
    name = type(e).__name__
    if name == 'SCFNotConverged':
        return {'code': 'scf-not-converged', 'message': str(e)}
    if name == 'OptimisationNotConverged':
        return {'code': 'optimisation-not-converged', 'message': str(e)}
    if name == 'BudgetExceeded':
        return {'code': 'output-too-large', 'message': str(e)}
    if isinstance(e, MemoryError):
        return {'code': 'out-of-memory', 'message': 'the calculation ran out of memory'}
    last = traceback.format_exception_only(e)[-1].strip()
    return {'code': 'worker-error', 'message': last[:500]}


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m jobs.worker')
    sub = parser.add_subparsers(dest='command', required=True)
    run = sub.add_parser('run')
    run.add_argument('key')
    run.add_argument('--local', required=True, help='out root, e.g. tools/molecules/out')
    run.add_argument('--state', required=True, help='FileStore root, e.g. tools/jobs/.state')
    run.add_argument('--attempt', type=int, default=1)
    run.add_argument('--grid-points', default=None, help='comma-separated, e.g. 96,88,80')
    args = parser.parse_args(argv)
    grid = tuple(int(v) for v in args.grid_points.split(',')) if args.grid_points else None
    status = run_job(args.key, FileStore(args.state), LocalSink(args.local), attempt=args.attempt, grid_points=grid,
                     image_digest=os.environ.get('JOBS_IMAGE_DIGEST', 'local'))
    print(status)
    return 0 if status in ('DONE', 'duplicate') else 1


if __name__ == '__main__':
    sys.exit(main())
```

`run_job` is long because it is one sequence. If review asks for it, split out `_write_result(...)` (everything under `if error is None`) as a private function, but keep the order intact: attempt files, then result files, then `done.json`, then the status.

- [ ] **Step 5: Run them to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_worker.py -q`
Expected: PASS within about a minute (H₂ at def2-SVP on a 32³ grid).

- [ ] **Step 6: Commit**

```bash
git add tools/jobs/sink.py tools/jobs/worker.py tools/jobs/tests/test_worker.py
git commit -m "feat(jobs): the worker — claim, run input.py, write the files and provenance, done.json last (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Local runner, local server, CLI and the dev-server proxy

**Files:**
- Modify: `tools/jobs/runner.py` (add `LocalRunner`), `vite.config.ts`
- Create: `tools/jobs/local_server.py`, `tools/jobs/cli.py`, `tools/jobs/tests/test_local.py`

**Interfaces:**
- Consumes: `Api` (Task 6), `FileStore`, `worker` CLI (Task 9).
- Produces:
  - `runner.LocalRunner(store, out_root, state_root, python=sys.executable, worker_args=())`, which runs one job at a time on a daemon thread. Before launching it sets `STARTING` (only if the job is still QUEUED); after the process exits it marks any non-terminal job `FAILED` (`worker-crashed`) and always settles it at 0.
  - `local_server.REPO`, `local_server.STATE_ROOT = REPO/'tools/jobs/.state'`, `local_server.OUT_ROOT = REPO/'tools/molecules/out'`, `local_server.make_server(api, host='127.0.0.1', port=8787) -> ThreadingHTTPServer`, `local_server.main()`.
  - The CLI (`python -m jobs.cli`):
    - `enqueue (--name N | --smiles S | --xyz FILE) [--recipe single|optimise]` uses a `NullRunner` and prints the key;
    - `submit … --wait` runs the job synchronously and prints the final status;
    - `generation on|off`.
  - The dev-server proxy: `/api/aws/*` goes to `JOBS_AWS_API_URL` with `/aws` stripped, only when that environment variable is set; `/api/*` goes to `http://127.0.0.1:8787`.

- [ ] **Step 1: Write the failing tests**

```python
# tools/jobs/tests/test_local.py
import json
import sys
import threading
import time
import urllib.request
from datetime import datetime, timezone

from jobs.canonical import canonical_job, job_key
from jobs.handlers import Api
from jobs.local_server import make_server
from jobs.model import new_record
from jobs.runner import LocalRunner, NullRunner
from jobs.store import FileStore

WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'
NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
DECISION = {'version': 0, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'local', 'attempts': 1,
            'basisFunctions': 10, 'predictedSeconds': 5.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 0, 'predictedCostMicros': 0}


def test_server_round_trip(tmp_path):
    api = Api(FileStore(tmp_path), NullRunner(), backend='local')
    server = make_server(api, port=0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    try:
        req = urllib.request.Request(f'{base}/api/v1/jobs', method='POST', headers={'Content-Type': 'application/json'},
                                     data=json.dumps({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}}).encode())
        with urllib.request.urlopen(req) as r:
            assert r.status == 201 and json.loads(r.read())['status'] == 'QUEUED'
        with urllib.request.urlopen(f'{base}/api/v1/costs?month=2026-10') as r:
            assert 'spentUsd' in json.loads(r.read())
        try:
            urllib.request.urlopen(f'{base}/api/v1/jobs/' + '0' * 64)
        except urllib.error.HTTPError as e:
            assert e.code == 404 and json.loads(e.read())['error']['code'] == 'not-found'
        big = urllib.request.Request(f'{base}/api/v1/jobs', method='POST', data=b'x' * 131073)
        try:
            urllib.request.urlopen(big)
        except urllib.error.HTTPError as e:
            assert e.code == 413
    finally:
        server.shutdown()


def test_crashed_worker_is_failed_and_settled(tmp_path):
    store = FileStore(tmp_path / 'state')
    job = canonical_job('single', [[1, 0, 0, 0], [1, 0, 0, 0.74]], 0, 1)
    key = job_key(job)
    store.create_job(new_record(key=key, job=job, decision={**DECISION, 'reservationMicros': 5}, name='H2',
                                formula='H2', electron_count=2, geometry_source={'kind': 'xyz'}, backend='local', now=NOW))
    # A "worker" that dies at once, as a segfault or a kill would.
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python=sys.executable,
                         worker_args=('-c', 'import sys; sys.exit(9)'))
    runner.submit(store.get_job(key))
    for _ in range(100):
        if store.get_job(key)['status'] == 'FAILED':
            break
        time.sleep(0.05)
    rec = store.get_job(key)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'worker-crashed' and '9' in rec['error']['message']
    assert rec['settled'] and store.meter(rec['month'])['reserved'] == 0
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_local.py -q`
Expected: FAIL, `ImportError` (no `LocalRunner` or `local_server`).

- [ ] **Step 3: Implement the runner, server and CLI**

Append to `tools/jobs/runner.py`:

```python
import os
import queue
import subprocess
import sys
import threading
from pathlib import Path

from jobs.model import iso, utc_now

TOOLS = Path(__file__).resolve().parents[1]


class LocalRunner:
    """One job at a time on this Mac: a second PySCF run beside the first
    would only make both slower and spoil the timings sizing learns from.
    Plays the part reconcile plays in AWS: a worker that dies without
    reporting is marked FAILED here, and every local job settles at $0."""

    def __init__(self, store, out_root, state_root, python=sys.executable, worker_args=()):
        self.store, self.out_root, self.state_root = store, Path(out_root), Path(state_root)
        self.python, self.worker_args = python, tuple(worker_args)
        self.queue = queue.Queue()
        threading.Thread(target=self._loop, daemon=True).start()

    def submit(self, record):
        self.queue.put(record['key'])
        return f'local-{record["key"][:12]}'

    def _command(self, key):
        if self.worker_args:             # tests substitute a stand-in process
            return [self.python, *self.worker_args]
        attempt = self.store.get_job(key)['attempt']
        return [self.python, '-m', 'jobs.worker', 'run', key, '--local', str(self.out_root),
                '--state', str(self.state_root), '--attempt', str(attempt)]

    def _loop(self):
        while True:
            key = self.queue.get()
            self.store.update_job(key, {'status': 'STARTING'}, expect_status={'QUEUED'})
            env = {**os.environ, 'PYTHONPATH': f'{TOOLS}:{TOOLS / "molecules"}'}
            result = subprocess.run(self._command(key), cwd=TOOLS, env=env, capture_output=True, text=True)
            rec = self.store.get_job(key)
            if rec['status'] not in ('DONE', 'FAILED'):
                last = (result.stderr.strip().splitlines() or [''])[-1][:300]
                self.store.update_job(key, {'status': 'FAILED', 'endedAt': iso(utc_now()), 'stage': None,
                                            'error': {'code': 'worker-crashed',
                                                      'message': f'worker exited with {result.returncode}: {last}'}})
            self.store.settle(key, 0)
```

```python
# tools/jobs/local_server.py
"""The job API on this Mac (spec §12): 127.0.0.1:8787, no auth, the same
handlers the api Lambda runs. The Vite dev server proxies /api here.

    tools/molecules/.venv/bin/python -m jobs.local_server      (from tools/)
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

from jobs.handlers import Api
from jobs.runner import LocalRunner
from jobs.store import FileStore

REPO = Path(__file__).resolve().parents[2]
STATE_ROOT = REPO / 'tools' / 'jobs' / '.state'
OUT_ROOT = REPO / 'tools' / 'molecules' / 'out'
MAX_BODY = 131072


def make_server(api, host='127.0.0.1', port=8787):
    class Handler(BaseHTTPRequestHandler):
        def _answer(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _dispatch(self, method):
            url = urlparse(self.path)
            length = int(self.headers.get('Content-Length') or 0)
            if length > MAX_BODY:
                return self._answer(413, {'error': {'code': 'body-too-large', 'message': f'over {MAX_BODY} bytes'}})
            body = self.rfile.read(length) if length else None
            self._answer(*api.handle(method, url.path, dict(parse_qsl(url.query)), body))

        def do_GET(self):
            self._dispatch('GET')

        def do_POST(self):
            self._dispatch('POST')

        def log_message(self, fmt, *args):
            sys.stderr.write(f'jobs {self.command} {self.path} {fmt % args}\n')

    return ThreadingHTTPServer((host, port), Handler)


def main():
    store = FileStore(STATE_ROOT)
    api = Api(store, LocalRunner(store, OUT_ROOT, STATE_ROOT), backend='local')
    server = make_server(api)
    print(f'jobs API on http://127.0.0.1:{server.server_address[1]} (state {STATE_ROOT}, results {OUT_ROOT}/jobs)')
    server.serve_forever()


if __name__ == '__main__':
    main()
```

```python
# tools/jobs/cli.py
"""Local conveniences (run from tools/):

    python -m jobs.cli enqueue --name water              # queue without running (container smoke test)
    python -m jobs.cli submit --name benzene --wait      # run to completion in the foreground
    python -m jobs.cli generation off|on                 # the local kill switch
"""
import argparse
import json
import sys
from pathlib import Path

from jobs.handlers import Api
from jobs.local_server import OUT_ROOT, STATE_ROOT
from jobs.runner import NullRunner
from jobs.store import FileStore
from jobs.worker import run_job
from jobs.sink import LocalSink


def _body(args):
    if args.xyz:
        molecule = {'xyz': Path(args.xyz).read_text()}
    else:
        molecule = {'name': args.name} if args.name else {'smiles': args.smiles}
    return json.dumps({'recipe': args.recipe, 'molecule': molecule}).encode()


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m jobs.cli')
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('enqueue', 'submit'):
        p = sub.add_parser(name)
        g = p.add_mutually_exclusive_group(required=True)
        g.add_argument('--name')
        g.add_argument('--smiles')
        g.add_argument('--xyz')
        p.add_argument('--recipe', default='single', choices=('single', 'optimise'))
        if name == 'submit':
            p.add_argument('--wait', action='store_true', required=True)
    gen = sub.add_parser('generation')
    gen.add_argument('state', choices=('on', 'off'))
    args = parser.parse_args(argv)

    store = FileStore(STATE_ROOT)
    if args.command == 'generation':
        store.set_generation_enabled(args.state == 'on')
        print(f'generation {args.state}')
        return 0
    status, view = Api(store, NullRunner(), backend='local').handle('POST', '/api/v1/jobs', {}, _body(args))
    if status >= 400:
        print(json.dumps(view), file=sys.stderr)
        return 1
    print(view['key'])
    if args.command == 'submit' and view['status'] in ('QUEUED', 'STARTING'):
        result = run_job(view['key'], store, LocalSink(OUT_ROOT))
        store.settle(view['key'], 0)
        print(result)
        return 0 if result in ('DONE', 'duplicate') else 1
    print(view['status'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 4: Proxy `/api` in the dev server**

In `vite.config.ts`, change `export default defineConfig({...})` to the function form, so it can read `JOBS_AWS_API_URL`, and add two proxy entries **before** `'/molecules'`:

```ts
import { defineConfig, loadEnv } from 'vite';
// …
export default defineConfig(({ mode }) => {
  // Where "AWS" jobs go in development (Phase 6B-3 prints this URL after
  // deploying the compute stack). Unset, /api/aws falls through to the local
  // server, which answers 404 -- the UI says AWS is not configured.
  const jobsAwsApiUrl = loadEnv(mode, process.cwd(), '').JOBS_AWS_API_URL;
  return {
    // …everything that was in the object before, unchanged, except `server.proxy`:
    server: {
      watch: { usePolling: true, interval: 100 },
      proxy: {
        ...(jobsAwsApiUrl ? {
          '/api/aws': { target: jobsAwsApiUrl, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/aws/, '/api') },
        } : {}),
        // The local job server (tools/jobs/local_server.py, spec §12).
        '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
        '/molecules': { target: MOLECULE_DATA_CDN, changeOrigin: true },
      },
    },
  };
});
```

Run: `npx tsc --noEmit -p . && npx vite build`
Expected: both succeed. The production build is unaffected because `server` is dev-only.

- [ ] **Step 5: Run the tests, then the local end-to-end (spec §13 step 2)**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs -q`
Expected: PASS.

Then, in **one** foreground command (about 1–3 minutes: H₂O at def2-TZVPD plus Phase 6's grids):

```bash
cd tools && (../tools/molecules/.venv/bin/python -m jobs.local_server > /tmp/jobs-server.log 2>&1 & echo $! > /tmp/jobs-server.pid) && sleep 1 && \
KEY=$(curl -s -X POST localhost:8787/api/v1/jobs -H 'Content-Type: application/json' -d '{"recipe":"single","molecule":{"name":"water"}}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["key"])') && echo $KEY && \
for i in $(seq 1 60); do S=$(curl -s localhost:8787/api/v1/jobs/$KEY | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["status"],d.get("stage"))'); echo "$S"; case "$S" in DONE*|FAILED*) break;; esac; sleep 5; done; \
curl -s -X POST localhost:8787/api/v1/jobs -H 'Content-Type: application/json' -d '{"recipe":"single","molecule":{"name":"water"}}' -o /dev/null -w 'resubmit %{http_code}\n'; \
ls ../tools/molecules/out/jobs/$KEY; kill $(cat /tmp/jobs-server.pid); cd ..
```

Expected: the status passes through `STARTING` and `RUNNING SCF (DIIS)` to `DONE`. The resubmission prints `resubmit 200`. The folder holds the ten files from Task 9's test. If the loop ends without `DONE`, read `/tmp/jobs-server.log` and the job's `attempts/1/output.log`.

- [ ] **Step 6: Commit**

```bash
git add tools/jobs/runner.py tools/jobs/local_server.py tools/jobs/cli.py tools/jobs/tests/test_local.py vite.config.ts
git commit -m "feat(jobs): local runner and server, CLI, and the dev-server /api proxy (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Calibrate sizing version 1 from local runs

**Files:**
- Create: `tools/jobs/calibrate.py`, `tools/jobs/tests/test_calibrate.py`
- Modify: `tools/jobs/sizing.py` (`SIZING_VERSION = 1`, fitted `CONSTANTS`), `tools/jobs/tests/test_sizing.py` (pinned version)

**Interfaces:**
- Consumes: `timings.json` and `job.json` from finished local jobs (Task 9), and `sizing.speedup`/`basis_counts.basis_functions`.
- Produces: `calibrate.fit(samples: list[dict]) -> dict` → `{'m0', 'm2', 't3'}`. Each sample is `{'basisFunctions': int, 'scfSeconds': float, 'threads': int, 'peakMemoryGB': float}`. `t0` and `g` keep their seeds until 6B-3's AWS fit. Also `calibrate.samples_from(job_dirs) -> list[dict]` and a CLI `python -m jobs.calibrate <job_dir>…` that prints the fit as JSON.

- [ ] **Step 1: Write the failing test**

```python
# tools/jobs/tests/test_calibrate.py
import pytest

from jobs.calibrate import fit
from jobs.sizing import speedup


def test_fit_recovers_known_constants():
    m0, m2, t0, t3 = 0.4, 3.0, 5.0, 1800.0
    samples = [{'basisFunctions': n, 'threads': 8, 'peakMemoryGB': m0 + m2 * (n / 1000) ** 2,
                'scfSeconds': (t0 + t3 * (n / 1000) ** 3.5) / speedup(8)} for n in (58, 276, 614)]
    got = fit(samples, t0=t0)
    assert got['m0'] == pytest.approx(m0, rel=1e-6) and got['m2'] == pytest.approx(m2, rel=1e-6)
    assert got['t3'] == pytest.approx(t3, rel=1e-6)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_calibrate.py -q`
Expected: FAIL, `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# tools/jobs/calibrate.py
"""Fits the sizing rule's constants from finished jobs (spec §7.2).

Least squares, closed form: memory is linear in (N/1000)², and SCF time ×
speedup(threads) − t0 is proportional to (N/1000)^3.5. Only the SCF stages
count toward t3; optimisation steps calibrate g, which needs AWS runs
(Phase 6B-3).

    python -m jobs.calibrate ../tools/molecules/out/jobs/<key> …   (from tools/)
"""
import json
import sys
from pathlib import Path

from jobs.basis_counts import basis_functions
from jobs.sizing import CONSTANTS, speedup


def fit(samples, t0=None):
    t0 = CONSTANTS['t0'] if t0 is None else t0
    xs = [(s['basisFunctions'] / 1000) ** 2 for s in samples]
    ys = [s['peakMemoryGB'] for s in samples]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    m2 = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    m0 = my - m2 * mx
    us = [(s['basisFunctions'] / 1000) ** 3.5 for s in samples]
    vs = [s['scfSeconds'] * speedup(s['threads']) - t0 for s in samples]
    t3 = sum(u * v for u, v in zip(us, vs)) / sum(u * u for u in us)
    return {'m0': m0, 'm2': m2, 't3': t3}


def samples_from(job_dirs):
    out = []
    for d in map(Path, job_dirs):
        timings = json.loads((d / 'timings.json').read_text())
        job = json.loads((d / 'job.json').read_text())['job']
        out.append({'basisFunctions': basis_functions(job['molecule']['atoms'], job['method']['basis']),
                    'scfSeconds': sum(s['seconds'] for s in timings['stages'] if s['name'].startswith('SCF')),
                    'threads': timings['threads'], 'peakMemoryGB': timings['peakMemoryGB']})
    return out


if __name__ == '__main__':
    samples = samples_from(sys.argv[1:])
    print(json.dumps({'samples': samples, 'fit': fit(samples)}, indent=1))
```

- [ ] **Step 4: Run it to verify it passes**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_calibrate.py -q`
Expected: PASS.

- [ ] **Step 5: Measure: benzene, then caffeine, one foreground command each**

`H₂O` already ran in Task 10. Each of the next two must finish inside one Bash call. If benzene takes longer than 8 minutes, stop and report: the Mac is far slower than assumed, and caffeine would not fit in one call.

```bash
cd tools && time ../tools/molecules/.venv/bin/python -m jobs.cli submit --name benzene --wait; cd ..
cd tools && time ../tools/molecules/.venv/bin/python -m jobs.cli submit --name caffeine --wait; cd ..
```

Expected: each prints its key and then `DONE`. Then fit:

```bash
cd tools && ../tools/molecules/.venv/bin/python -m jobs.calibrate $(../tools/molecules/.venv/bin/python -c "
import json, pathlib
for d in sorted(pathlib.Path('molecules/out/jobs').iterdir()):
    f = d / 'job.json'
    if f.exists():
        j = json.loads(f.read_text())
        if j['job']['recipe'] == 'single' and j['geometrySource'].get('title', '').lower() in ('water', 'benzene', 'caffeine'):
            print(d)
"); cd ..
```

Expected: JSON with three samples and the fit.

- [ ] **Step 6: Commit version 1**

In `tools/jobs/sizing.py`, set `SIZING_VERSION = 1`. Set `CONSTANTS` to the fitted `m0`, `m2` and `t3`, rounded to 3 significant figures, keeping `t0 = 5.0` and `g = 1.5`. Add a comment with the date, the machine (`sysctl -n machdep.cpu.brand_string`) and the three molecules. Clamp: if the fit gives `m0 < 0.2`, use 0.2 (Python and PySCF alone take that much). If the fitted `m2` is negative, keep the seed 2.0, and say so in the comment and the commit message: three small molecules may not show the N² term above the baseline.

In `test_sizing.py`, `test_water_single_is_small_spot_with_the_floor_timeout` still holds. Add:

```python
def test_version_1_is_calibrated():
    assert sizing.SIZING_VERSION == 1 and sizing.CONSTANTS['t0'] == 5.0 and sizing.CONSTANTS['g'] == 1.5
```

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs -q`
Expected: PASS.

```bash
git add tools/jobs/calibrate.py tools/jobs/tests/test_calibrate.py tools/jobs/sizing.py tools/jobs/tests/test_sizing.py
git commit -m "feat(jobs): sizing version 1, fitted from water, benzene and caffeine on this Mac (Phase 6B-1)

<the fitted constants and the machine>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The worker image under OrbStack, and the docs

**Files:**
- Create: `tools/jobs/Dockerfile`, `.dockerignore`, `tools/jobs/README.md`
- Modify: `docs/HANDOFF.md` (a "Phase 6B-1" section)

**Interfaces:**
- Consumes: the worker CLI (Task 9) and `cli enqueue` (Task 10).
- Produces: the image `orbital-viewer-worker:local` (linux/arm64), with entry point `python -m jobs.worker`. 6B-3 builds the same Dockerfile as a CDK asset.

- [ ] **Step 1: Write the image files**

```dockerfile
# tools/jobs/Dockerfile — the on-demand worker (spec §8.1). Build context: the repo root.
#   docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile -t orbital-viewer-worker:local --load .
FROM --platform=linux/arm64 python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/tools:/app/tools/molecules
WORKDIR /app
COPY tools/molecules/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r /app/requirements.lock
COPY tools/molecules/*.py /app/tools/molecules/
COPY tools/jobs /app/tools/jobs
# The worker writes files PySCF and geomeTRIC need no root for.
RUN useradd --uid 10001 worker
USER worker
ENTRYPOINT ["python", "-m", "jobs.worker"]
```

```
# .dockerignore — the worker image needs only the generator and tools/jobs (allow-list).
*
!tools/molecules/*.py
!tools/molecules/requirements.lock
!tools/jobs/
tools/jobs/.state/
tools/jobs/tests/
**/__pycache__/
```

- [ ] **Step 2: Build it** (one foreground command; the first build takes several minutes)

Run: `docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile -t orbital-viewer-worker:local --load . 2>&1 | tail -20`
Expected: `naming to docker.io/library/orbital-viewer-worker:local` (or the equivalent). If `pip` starts **building** PySCF, h5py or SciPy from source (`Building wheel for pyscf`), stop and report: the lock pins a version without a linux/aarch64 wheel, and the fix is a lock choice, which is a ruling for the controller.

- [ ] **Step 3: Container smoke test (spec §13 step 3)**, one foreground command

The UID-10001 user must be able to write the mounted directories, so pass `--user $(id -u):$(id -g)`:

```bash
cd tools && KEY=$(../tools/molecules/.venv/bin/python -m jobs.cli enqueue --name methane | head -1) && cd .. && echo $KEY && \
docker run --rm --user $(id -u):$(id -g) -v "$PWD/tools/jobs/.state:/state" -v "$PWD/tools/molecules/out:/out" \
  orbital-viewer-worker:local run $KEY --local /out --state /state && \
python3 -c "import json;d=json.load(open('tools/jobs/.state/jobs/$KEY.json'));print(d['status'],d['actual'])" && \
ls tools/molecules/out/jobs/$KEY && tools/molecules/.venv/bin/python -c "
import json,hashlib,pathlib; r=pathlib.Path('tools/molecules/out/jobs/$KEY'); d=json.loads((r/'done.json').read_text())
assert all(hashlib.sha256((r/n).read_bytes()).hexdigest()==h for n,h in d['files'].items()); print('checksums ok')"
```

Expected: the container prints `DONE`, the record shows `DONE` with `actual.threads` and a Linux `peakMemoryGB`, and the script prints `checksums ok`. The job settles when the local runner or CLI handles it. Here neither ran, so settle by hand to keep the local meter tidy: `cd tools && ../tools/molecules/.venv/bin/python -c "from jobs.store import FileStore; from jobs.local_server import STATE_ROOT; FileStore(STATE_ROOT).settle('$KEY', 0)"; cd ..`.

- [ ] **Step 4: Write `tools/jobs/README.md`**

It must cover:

- what the package is (spec link);
- the module map from this plan's file structure, one line per module;
- **running locally:** start `python -m jobs.local_server` from `tools/` with the venv, then `npm run dev`. The UI (6B-2) talks to `/api`;
- the CLI commands;
- the image build and the smoke command from Steps 2–3;
- where state and results live;
- that `tools/jobs` must stay free of PySCF and NumPy outside `worker.py`, `make_basis_counts.py` and `calibrate.py`, and why;
- how to recalibrate (Task 11's commands);
- that keys are pinned, so changing canonicalisation requires a `computeVersion` bump.

- [ ] **Step 5: Add a "Phase 6B-1" section to `docs/HANDOFF.md`**

Cover:

- what shipped;
- the sizing version 1 constants and the machine they came from;
- the rulings made in this plan:
  - `meta.provenance.costUsd` is always null, and the cost comes from the job record;
  - the charge default comes from PubChem's SDF formal charge, so ammonium is +1 (spec §5.1 says 0; 0 remains the default for a pasted XYZ);
  - the worker reads the canonical job from the store record rather than a `job.json` in S3, and writes `job.json` with the results;
  - `/api/aws` is a path prefix rather than a header (spec §12);
- what 6B-3 must add behind the interfaces: `DynamoStore`, `BatchRunner`, `S3Sink`, `worker --aws`, and settlement in reconcile.

- [ ] **Step 6: Final check and commit**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs tools/molecules -q && npx tsc --noEmit -p .`
Expected: PASS.

```bash
git add tools/jobs/Dockerfile .dockerignore tools/jobs/README.md docs/HANDOFF.md
git commit -m "feat(jobs): ARM64 worker image, verified under OrbStack; README and handoff (Phase 6B-1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
