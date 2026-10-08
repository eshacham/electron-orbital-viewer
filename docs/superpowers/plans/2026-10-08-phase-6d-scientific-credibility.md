# Phase 6D — Scientific Credibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chemist opening Molecules mode or a computed molecule finds nothing that contradicts what they know: orbitals carry full point-group labels, diffuse "LUMO" artefacts are named as such beside the antibonding orbital textbooks draw, the gap and the validation say what they are, and every on-demand calculation is B3LYP-D3(BJ) with a frequency check, inside a time budget, priced by sizing version 6 — shipped as library data v3.

**Architecture:** Three new Python pieces carry the science: `tools/molecules/point_group.py` (full-group labels by character projection on the SCF's own DFT grid), the virtual-orbital classification and LVMO in `tools/molecules/orbitals.py` (IAO valence character; valence virtual orbitals where no canonical virtual is valence), and `tools/molecules/dispersion.py` (D3(BJ) through PySCF's own `xc='B3LYP-D3BJ'` hook on Linux and on macOS). `build_library.write_molecule_files`, shared by the library and the worker, writes all of it, so library v3 and new jobs read alike. The worker's `input.py` gains symmetry-free geometry work, the frequency check and a time-budget hook; the worker writes `frequencies.json` and new provenance; sizing v6 prices the Hessian. The web client reads both v3/compute-version-2 metadata and the older shapes.

**Tech Stack:** Python 3.12 (`tools/molecules/.venv`), PySCF 2.8.0, NumPy 2.3.5 (pinned down from 2.5.3), geomeTRIC 1.1.1, pyscf-dispersion 1.5.0 (Linux) / dftd3 1.6.0 (macOS), pytest; TypeScript, React 19, MUI, Jest/ts-jest; OrbStack's `docker buildx` (linux/arm64); AWS Batch on Fargate, S3/CloudFront (deploys only through `infra/deploy.sh`).

**Spec:** `docs/superpowers/specs/2026-10-08-phase-6d-scientific-credibility-design.md` (binding). Context: `docs/superpowers/plans/2026-10-08-ROADMAP-v2.md` (phase 2), `docs/research/2026-10-08-user-needs-and-gaps.md` §4, `docs/research/2026-10-08-scans.md` §4.2 (the symmetry and DF-gradient reproductions), `docs/HANDOFF.md` (Phase 6, 6B-1…6B-3, 6C).

**Prerequisite:** branch from `main` at or after `573a9d8`. Before Task 1 run `tools/molecules/.venv/bin/python -m pytest tools/molecules tools/jobs -q` and `npx jest`; both must pass. If a name used below differs on disk, the code on disk wins: change this plan's use of it, never the existing code's meaning.

## Global Constraints

From the spec, verbatim (every task's requirements include these):

- "Label every MO, or degenerate set of MOs, by its irreducible representation in the molecule's full point group (`mol.topgroup`)"
- "Group MOs into degenerate sets by energy (|ΔE| < 1e-5 Ha)."
- "a set whose characters are not within 0.05 of an allowed integer/irrational value is reported unlabelled with a note, never mislabelled."
- "Numbering per irrep in energy order (1a₁, 2a₁, 1t₂ …), core included, as textbooks do."
- "Unsupported groups fall back to the subgroup label with the subgroup named ("b₂ in C2v, a subgroup of …"), never silently."
- "`LUMO` stays the lowest virtual (it is what the calculation gives); a new role `LVMO` (lowest valence virtual MO) marks the lowest valence virtual when it differs from the LUMO."
- "the LVMO described as "the antibonding orbital textbooks draw" and the diffuse LUMO captioned "positive/near-zero energy: an unbound, basis-set dependent state, not a bound orbital"."
- "Everywhere the HOMO–LUMO gap appears: "Kohn–Sham orbital gap — neither the optical gap (absorption) nor the fundamental gap (IP − EA)". Where an LVMO differs from the LUMO, show both gaps, labelled."
- "Bond lengths and angles of molecules whose geometry is taken from experiment are shown as "geometry from experiment (not a test of the method)" and excluded from any "agrees with experiment" summary; only optimised geometries count as validation. Dipoles and other properties computed at those geometries still count."
- "Recipe A (single): B3LYP-D3(BJ)/def2-TZVPD." "Recipe B (optimise): B3LYP-D3(BJ)/def2-SVP optimisation, frequency check (§7), then the recipe-A single point." "Library: the seven geometries optimised by the app are re-optimised at B3LYP-D3(BJ)/def2-TZVP; properties at B3LYP-D3(BJ)/def2-TZVPD."
- "D3 changes energies and gradients only; orbitals, density and ESP are unchanged at a given geometry. Total energies shown include D3 and say so."
- "**No imaginary frequency** below −50 cm⁻¹ → "true minimum (no imaginary frequencies)". Small imaginary values between −50 and 0 cm⁻¹ are reported as numerical noise, not as saddle points."
- "displace along the most negative mode by ±0.1 Å-scaled amplitude (both signs tried, lower energy kept), re-optimise once, and recheck. If still imaginary, the job finishes DONE with the structure labelled "saddle point (n imaginary frequencies), not a minimum" in provenance and in the viewer."
- "Frequencies, reduced masses and normal modes are stored in a new result file `frequencies.json` (feeds Phase 6E). Zero-point energy is reported."
- "Optimisations and the Hessian run with `symmetry=False`"
- "Before each new step it checks that the time left covers the predicted remaining work (frequency check + final single point + file writing, from the job's own sizing figures) with a 1.2× margin." … "the job DONE with "optimisation stopped by its time limit, not converged (max force …)" in provenance and the viewer. The owner is charged the actual cost as usual."
- "Sizing version 6 adds a Hessian term for recipe B: analytic Hessian cost ≈ `h` × (one def2-SVP gradient step) × atoms" … "Until measured, a conservative literature-based value is used and stated." "The quote's compute line includes the check; the details list it as "frequency check (confirms a minimum)"." "The D3 cost is negligible and not priced separately."
- "Library data version **v3** … Published immutably like v2; the app reads v3; v2 stays on S3."
- "Old computed jobs keep their recorded method and display it honestly ("computed before dispersion was added")." "The web client reads both old and new metadata."
- "**Out (later phases):** vibrational spectra and mode animation (6E — the frequencies computed here are stored so 6E can show them), charges and bond orders, conformer search, solvent models, NMR, UV-Vis."

Process rules for this plan (binding on every task):

- **Run every command from the repo root** `/Users/eyalshacham/conductor/workspaces/electron-orbital-viewer/nairobi` (or the executing worktree's root). Python: `tools/molecules/.venv/bin/python -m pytest …`. Long PySCF tests stay behind `JOBS_SLOW=1` / `MOLECULES_SLOW=1`, as today.
- **Foreground commands only.** Never background a command, never start a long-running server, no subagents. No single command runs past about 9 minutes: use the Bash tool's 600000 ms timeout and split long work into separate calls (one molecule per call, as `build_library.py --only` already allows). Each task states its expected durations so a multi-minute wait reads as normal.
- **Never touch `tools/jobs/.state/` or `tools/molecules/out/`** (the local job store, and the published v1/v2 data and local job results). The one exception is Task 14, which writes only the new directory `tools/molecules/out/v3/`. Reading `out/v2` (as the existing data tests do) is fine.
- **Never read `infra/owner.env`. Never `source` `infra/deploy.sh` or `infra/jobs.sh`.** A test that runs any script stubs `aws`, `cdk`, `docker`, `npm` and `node` first on `PATH` and sets `AWS_REGION=us-east-1`. Only Tasks 15–18 run `infra/deploy.sh` or call AWS, and each such step starts by **asking the controller for confirmation** (the controller asks the owner where it should).
- **Deploy order:** library data v3 is published (Task 15) before the site that reads it is deployed (Task 16); `infra/deploy.sh`'s data-version guard (`check_molecule_data`) refuses the site otherwise. Then: image, compute, site — each its own confirmed step.
- **Commits:** subject ends with `(Phase 6D)`; the message ends with a `Co-Authored-By:` trailer naming the model that makes the commit. The commands below use `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; a different model names itself instead. Stage files by path (`git add <paths>`), never `git add -A`. Never push.
- British spelling in comments, messages and UI text. Comments explain *why*, in the register of `tools/molecules/build_library.py`.

## Review Focus

1. **A degenerate set that matches no irrep** (an accidental degeneracy, a set cut in two, core combinations closer than 1e-5 Ha). Expected: the set is labelled `?` with a note naming its characters, never given the nearest irrep's name, and numbering of the other sets is unaffected. Test: Task 3, `test_a_partial_degenerate_set_is_left_unlabelled_not_mislabelled`.
2. **A supported group whose operations cannot be built at this geometry** (an optimised structure with noise beyond `OP_TOL` that PySCF still calls Td, or an unusual frame). Expected: labels fall back to PySCF's subgroup with `labels: 'subgroup'` and a note naming both groups; the job or build does not fail. Test: Task 3, `test_operations_not_found_fall_back_to_the_subgroup_with_a_note`.
3. **An open-shell molecule in recipe B** (PySCF 2.8 has no ROKS Hessian). Expected: geometry work and the frequency check run UKS, the final SCF stays ROKS, the job ends DONE with a frequency result. Test: Task 7, `test_an_open_shell_is_checked_with_uks`.
4. **A job whose time runs out, and a record sized before version 6.** Expected: a v6 job whose budget refuses the next step ends DONE "not converged" with every file and no frequency check; a v5 record (no `parts`) runs with no budget at all, as before. Tests: Task 8, `test_a_forced_short_time_limit_ends_done_not_converged_with_files` and `test_a_record_sized_before_version_6_has_no_time_budget`.
5. **Old data shapes in the new client**: computed jobs from before this phase (compute version 1, PySCF subgroup labels, no virtual classes, B3LYP without D3), and v2-shaped metas. Expected: they render; the list says virtuals are unclassified; the provenance says "computed before dispersion was added"; nothing claims a frequency check. Tests: Task 11, `renders v2-shaped orbitals without virtual classes, and says they are unclassified (Review Focus 5)`; Task 13, `a legacy job says it was computed before dispersion (Review Focus 5)`.

## Rulings this plan makes (where the spec could not be followed as written, or left a choice)

- **D3 on this Mac.** `pyscf-dispersion` cannot run here: its only macOS wheel (1.0.0, "universal2") holds x86_64-only libraries and calls `numpy.ctypeslib.load_library` without the path argument it requires; every later release (1.0.1–1.5.0) ships Linux (and macOS x86_64) wheels only (PyPI, checked 2026-10-08). Per spec §6, **library v3 is generated inside the worker image** (Linux ARM64 under OrbStack), where 1.5.0 installs. So that local tests and "This Mac" jobs still compute D3(BJ), `tools/molecules/dispersion.py` installs, on macOS only, a stand-in `pyscf.dispersion` module backed by the `dftd3` package 1.6.0 (simple-dftd3's own Python API, macOS arm64 wheels). Measured 2026-10-08: the two give bit-identical D3(BJ) energies for water and methane (−0.0005738788210828446 and −0.0019136930093918568 Ha) and the same SCF energy to 1e-14 Ha. The lock pins each with a platform marker.
- **NumPy 2.3.5, not a PySCF upgrade** (spec §8 left the choice). PySCF 2.8.0 with NumPy 2.3.5 runs density-fitted gradients (2.5.3 fails, as the scans research reproduced) and gives water's B3LYP/def2-SVP energy bit-identical to the current venv (−76.35814936671194 Ha both). PySCF 2.14.0 also works but changes the energy at 4e-11 Ha and is a provenance change.
- **Valence threshold 0.75, not 0.5.** Measured at def2-TZVPD (B3LYP, library geometries): water's LUMO is 55 % valence, ammonia's 50 %, methane's 36 %; clean valence virtuals are 77–99 % (PH₃ 2e 77 %, H₂S 80 %, C₂H₂ π* 80 %, HCN 85 %, C₂H₄ 87 %, benzene 92 %, CO₂ 2πu 97 %). At 0.5 water's LUMO would count as valence and fail the spec's own acceptance test; 0.75 separates every case measured. Every caption shows the percentage, so a borderline orbital is never hidden.
- **The LVMO may be a valence virtual orbital, not a canonical MO.** At def2-TZVPD no canonical virtual of water, ammonia or methane is valence: the σ* character is spread over many virtuals. Where a shipped canonical virtual is valence (CO₂'s 2πu), it is the LVMO. Otherwise the LVMO is the lowest valence virtual orbital (VVO): the Fock operator diagonalised in the virtual part of the IAO span (exactly n_MINAO − n_occ orbitals; measured: water 2, ammonia 3, methane 4), appended as an extra orbital row with its own coefficients, `kind: 'valence-virtual'`, and an energy that is an expectation value (water's a₁ σ* +5.0 eV, ammonia's +6.3 eV, methane's +8.6 eV), said so wherever it appears.
- **Open shells in recipe B run their geometry work UKS.** PySCF 2.8 has no ROKS Hessian (`NotImplementedError`), so the optimisation and frequency check of an open shell run UKS (consistent geometry and Hessian); the final property SCF stays ROKS, one orbital set, as now.
- **Frequencies are checked against experiment's harmonic values, not a literature B3LYP/def2-SVP set** (which could not be verified offline). Water's three (CCCBDB experimental ω: 1648.5, 3832.2, 3942.5 cm⁻¹) must agree within 5 %; measured B3LYP/def2-SVP: 1638.8, 3791.3, 3886.6 (−0.6, −1.1, −1.4 %). Ammonia's umbrella is checked to a range (950–1150 cm⁻¹; measured 1061.7).
- **The time budget also counts the next step itself**, not only "frequency check + final single point + file writing": a step started with exactly that much time left would end past it.
- **Linear molecules get σ/π/δ.** v2 shows CO₂, C₂H₂ and HCN in PySCF's `a1g`/`e1u` notation, not the "existing σ/π/δ labels" the spec assumed; v3 uses Bonds mode's own mapping (`labels.irrep_to_lambda`), a π pair sharing its number.
- **Compute version 2.** The recipes' method changes (`xc` `B3LYP-D3BJ`, the frequency check), so `canonical.COMPUTE_VERSION` becomes 2: new keys, old results never reused for the new method. A version-1 record that the owner retries keeps the recipe it was approved under (no D3 in its job, no frequency check, no time budget).
- **Initial `h` = 1.5.** Measured on this Mac (def2-SVP, one thread): the RKS Hessian costs 0.84 (ethanol) to 1.06 (water) SCF+gradient steps per atom; 1.5 allows for threading worse than the SCF's on Fargate. Consequence until the probe (Task 17): caffeine optimise is priced at 4106 s on L, past the Spot limit, so on-demand only.
- **The Hessian probe runs after the first deploy.** It needs `pyscf-dispersion` and the `--hessian-json` probe, which only the new image has; so Task 16 deploys with `h` = 1.5, Task 17 measures and refits, then redeploys image and compute.
- **A linear molecule is laid exactly on z for its harmonic analysis.** PySCF 2.8's `thermo.harmonic_analysis` recognises a linear rotor only by an exactly zero moment of inertia; an optimised CO₂ or OH, linear to ~1e-8 Å, is taken for a non-linear one and loses its last vibration (measured: OH with a 0.3 Å off-axis H gives no modes at all). `input.py`'s `on_axis` lays it on z for the analysis and turns the normal modes back into the molecule's frame.
- **h's refit stays sizing version 6** unless a job was sized with the provisional h before it (Task 17 checks the job list); then it becomes version 7, so that job's prediction stays checkable.
- **Labels stay plain text** (`1t2`, `1e1g`, `3a1'`), as the app shows them today; subscript typography would change every accessible name and file stem the tests and exports pin.

---

## File structure

```
tools/molecules/
  dispersion.py          NEW  XC/LABEL/method_label; ensure_d3() (pyscf-dispersion, or the macOS dftd3 stand-in); backend()
  point_group.py         NEW  TABLES, class_operations, characters, match_irrep, label_orbitals, irrep_of, number_labels
  orbitals.py            REWRITE  OrbitalTable; valence_characters; valence_virtuals; LVMO; orbital_table uses point_group
  build_library.py       MODIFY  D3 method; OrbitalTable into meta/basis.json; dispersion meta; validation geometrySource/notATest
  optimise.py            MODIFY  make_dft ensures D3; XC default; FINAL_METHOD 'B3LYP-D3(BJ)/def2-TZVP'
  library.py             MODIFY  OPTIMISED names D3(BJ)
  generate.py            MODIFY  git_commit honours MOLECULES_GENERATOR_COMMIT (generation inside the image)
  version.py             MODIFY  (Task 14) DATA_VERSION v3
  in_image.sh            NEW  runs a tools/molecules command inside the worker image, checkout mounted
  requirements.txt/.lock MODIFY  numpy 2.3.5; pyscf-dispersion (linux); dftd3 (darwin)
  geometries/*.xyz       MODIFY  (Task 14) re-optimised at B3LYP-D3(BJ)/def2-TZVP
  manifest/v3.json       NEW  (Task 14)
  tests/test_dispersion.py, test_in_image.py, test_point_group.py, test_virtuals.py   NEW
  tests/test_esp_orbitals.py, test_build_library.py, test_optimise.py, test_library_data.py   MODIFY
tools/jobs/
  input_template.py      REWRITE  string.Template; D3; symmetry-free geometry work; UKS for open shells; time-limit stop;
                                  (Task 7) frequency check, displacement, re-optimisation
  canonical.py           MODIFY  COMPUTE_VERSION 2; recipes B3LYP-D3BJ
  worker.py              MODIFY  TimeBudget, time_limit; method labels; frequencies.json; geometrySource summary; caveats
  sink.py                MODIFY  ROOT_RESULT_NAMES + frequencies.json
  sizing.py              MODIFY  version 6: h, frequency_seconds, budget_parts, decide()['parts']
  quotes.py              MODIFY  the compute note names the frequency check
  calibrate.py           MODIFY  'h' guard; read_hessian_probe; fit_hessian; --hessian-probe
  probe.py               MODIFY  measure_hessian; --hessian-json
  tests/…                MODIFY/NEW as each task says; fixtures/aws/hessian-probe.json NEW (Task 17)
src/
  molecules/types.ts, library_types.ts, orbital_display.ts, job_paths.ts   MODIFY
  components/MoleculeOrbitalList.tsx (REWRITE), MoleculeNav.tsx, ProvenancePanel.tsx (REWRITE), TierBadge.tsx, RequestPanel.tsx   MODIFY
  export/caption.ts, run_export.ts   MODIFY
  jobs/api_types.ts, jobs/format.ts   MODIFY
  validation/geometry_honesty.ts NEW; validation/references.ts MODIFY; validation/generated/*.json REGENERATED
  molecules/data_version.ts  MODIFY (Task 14) v3
  style.css              MODIFY
tests/
  molecules/molecule_nav.test.tsx, export/molecule_exports.test.ts, jobs/provenance_panel.test.tsx,
  jobs/format.test.ts, jobs/api_fixtures.test.ts, jobs/computed_loader.test.ts   MODIFY
  validation/geometry_honesty.test.ts, molecules/valence_threshold.test.ts   NEW
  jobs/fixtures/api/*.json   RE-RECORDED (Task 9, Task 17)
docs/HANDOFF.md, README.md   MODIFY (Task 18)
```

Task order and estimates (wall time for the executor, including test runs):

| # | Task | Estimate |
|---|---|---|
| 1 | Lock: NumPy 2.3.5 and D3(BJ) on Linux and macOS | 50 min |
| 2 | The worker image with the new lock, and running the generator inside it | 45 min |
| 3 | Full point-group labels by character projection | 90 min |
| 4 | Virtual classes, the LVMO and the new orbital table | 75 min |
| 5 | Library method B3LYP-D3(BJ), honest validation rows | 60 min |
| 6 | input.py: D3, symmetry-free geometry work, UKS, time-limit stop | 75 min |
| 7 | input.py: the frequency check | 75 min |
| 8 | Compute version 2 and the worker | 90 min |
| 9 | Sizing version 6 and the quote's frequency-check line | 75 min |
| 10 | The Hessian probe | 40 min |
| 11 | Web: labels, virtual classes, LVMO and gaps in the orbital list | 75 min |
| 12 | Web: captions and exports | 45 min |
| 13 | Web: provenance, legacy jobs, recipe text, validation honesty | 75 min |
| 14 | Library v3 generation inside the worker image | 2 h 30 min |
| 15 | Publish v3 (controller-confirmed) | 45 min |
| 16 | Deploy image, compute, site (controller-confirmed) | 45 min |
| 17 | Hessian probe on AWS and the refit (owner-approved) | 75 min |
| 18 | Owner check and documentation | 60 min |
| | **Total** | **≈ 20 h 45 min** |

---

### Task 1: Lock — NumPy 2.3.5 and D3(BJ) on Linux and macOS

**Estimate:** 50 min (the venv sync ~1 min; the two Python suites a few minutes each).

**Files:**
- Modify: `tools/molecules/requirements.txt`, `tools/molecules/requirements.lock`
- Create: `tools/molecules/dispersion.py`
- Test: `tools/molecules/tests/test_dispersion.py`

**Interfaces:**
- Consumes: PySCF 2.8.0's D3 hooks (`scf.dispersion.get_dispersion`, `grad.dispersion.get_dispersion`, `hessian.dispersion.get_dispersion`), which `import pyscf.dispersion.dftd3` and call `DFTD3Dispersion(mol, xc=..., version='d3bj', atm=...).get_dispersion(grad=...)`.
- Produces (`tools/molecules/dispersion.py`):
  - `XC: str = 'B3LYP-D3BJ'` (PySCF's xc string), `LABEL: str = 'B3LYP-D3(BJ)'`, `MODEL: str = 'D3(BJ)'`
  - `method_label(xc: str) -> str` — `'B3LYP-D3BJ'` → `'B3LYP-D3(BJ)'`, anything else unchanged
  - `ensure_d3() -> None` — makes `pyscf.dispersion.dftd3` importable (the real package, or the macOS stand-in); idempotent
  - `backend() -> str` — e.g. `'pyscf-dispersion 1.5.0'` or `'dftd3 1.6.0 (macOS stand-in for pyscf-dispersion)'`

- [ ] **Step 1: Write the failing test**

Create `tools/molecules/tests/test_dispersion.py`:

```python
"""B3LYP-D3(BJ) through PySCF's own hook on this platform (Phase 6D spec §6),
and the density-fitted gradient the NumPy pin restores (spec §8)."""
import sys

import numpy as np
import pytest
from pyscf import dft, gto

from dispersion import LABEL, MODEL, XC, backend, ensure_d3, method_label

WATER = 'O 0 0 0; H 0 0.757 0.587; H 0 -0.757 0.587'
METHANE = ('C 0 0 0; H 0.6276 0.6276 0.6276; H 0.6276 -0.6276 -0.6276; '
           'H -0.6276 0.6276 -0.6276; H -0.6276 -0.6276 0.6276')
# Two-body D3(BJ) energies with B3LYP's parameters (Hartree), from pyscf-dispersion 1.5.0 in the worker
# image (Linux ARM64) and the dftd3 1.6.0 stand-in on macOS: identical to every printed digit, 2026-10-08.
REFERENCE = {WATER: -0.0005738788210828446, METHANE: -0.0019136930093918568}


@pytest.mark.parametrize('atoms', [WATER, METHANE], ids=['water', 'methane'])
def test_d3bj_energy_matches_the_reference(atoms):
    ensure_d3()
    from pyscf.dispersion import dftd3
    mol = gto.M(atom=atoms, basis='sto-3g', verbose=0)
    energy = dftd3.DFTD3Dispersion(mol, xc='b3lyp', version='d3bj').get_dispersion()['energy']
    assert float(energy) == pytest.approx(REFERENCE[atoms], abs=1e-6)        # spec §12: to 1e-6 Ha
    assert float(energy) == pytest.approx(REFERENCE[atoms], abs=1e-12)       # and in fact to the last digit


def _scf(xc):
    ensure_d3()
    mf = dft.RKS(gto.M(atom=WATER, basis='def2-SVP', verbose=0))
    mf.xc, mf.grids.level, mf.conv_tol = xc, 4, 1e-10
    mf.kernel()
    return mf


def test_an_scf_named_b3lyp_d3bj_adds_exactly_the_d3_energy():
    # D3 does not touch the SCF, so the two runs' densities are the same and the totals differ by E(D3).
    plain, dispersed = _scf('B3LYP'), _scf(XC)
    assert dispersed.scf_summary['dispersion'] == pytest.approx(REFERENCE[WATER], abs=1e-9)
    assert dispersed.e_tot - plain.e_tot == pytest.approx(REFERENCE[WATER], abs=1e-8)


def test_the_gradient_carries_the_d3_gradient_and_the_hessian_runs():
    from pyscf.dispersion import dftd3
    plain, dispersed = _scf('B3LYP'), _scf(XC)
    d3 = dftd3.DFTD3Dispersion(dispersed.mol, xc='b3lyp', version='d3bj').get_dispersion(grad=True)['gradient']
    difference = dispersed.nuc_grad_method().kernel() - plain.nuc_grad_method().kernel()
    assert np.abs(difference - d3).max() < 1e-6
    hessian = dispersed.Hessian().kernel()
    assert hessian.shape == (3, 3, 3, 3) and np.isfinite(hessian).all()


def test_method_label_spells_d3bj_as_the_literature_does():
    assert method_label(XC) == LABEL == 'B3LYP-D3(BJ)' and MODEL == 'D3(BJ)'
    assert method_label('B3LYP') == 'B3LYP' and method_label('b3lyp-d3bj') == 'b3lyp-D3(BJ)'


def test_the_backend_names_its_package():
    name = backend()
    if sys.platform == 'linux':
        assert name == 'pyscf-dispersion 1.5.0'
    else:
        assert name == 'dftd3 1.6.0 (macOS stand-in for pyscf-dispersion)'


def test_numpy_is_pinned_below_2_4():
    assert tuple(int(p) for p in np.__version__.split('.')[:2]) < (2, 4)


def test_density_fitted_gradients_work_with_the_locked_numpy():
    # Scans research §4.2, pitfall 3: NumPy 2.4 changed einsum_path's contraction tuples, and PySCF 2.8.0's
    # DF gradients failed ("not enough values to unpack (expected 4, got 3)"). Phase 6B-4 needs them.
    mf = dft.RKS(gto.M(atom=WATER, basis='def2-SVP', verbose=0)).density_fit()
    mf.xc = 'B3LYP'
    mf.kernel()
    assert np.abs(mf.nuc_grad_method().kernel()).max() == pytest.approx(0.0124211, abs=1e-5)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_dispersion.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'dispersion'`.

- [ ] **Step 3: Pin the lock and sync the venv**

In `tools/molecules/requirements.txt`, replace the line `numpy>=1.26,<3` with:

```
# Phase 6D: NumPy 2.4 changed einsum_path's tuples and broke PySCF 2.8.0's density-fitted gradients
# (docs/research/2026-10-08-scans.md §4.2); 2.3.5 keeps every energy bit-identical.
numpy>=1.26,<2.4
```

and append:

```

# Phase 6D: B3LYP-D3(BJ). pyscf-dispersion is what PySCF 2.8 calls, but it has no build that runs on
# Apple-silicon macOS; there, tools/molecules/dispersion.py stands in with the dftd3 package (same model).
pyscf-dispersion==1.5.0; sys_platform == "linux"
dftd3==1.6.0; sys_platform == "darwin"
```

In `tools/molecules/requirements.lock`: change `numpy==2.5.3` to `numpy==2.3.5`; insert `dftd3==1.6.0 ; sys_platform == "darwin"` after `cryptography==50.0.2`; insert `pyscf-dispersion==1.5.0 ; sys_platform == "linux"` after `pyscf==2.8.0`. (`dftd3` needs `cffi` and `numpy`, both already locked; `pyscf-dispersion` needs `pyscf`.)

Run: `uv pip sync --python tools/molecules/.venv/bin/python tools/molecules/requirements.lock`
Expected: `- numpy==2.5.3`, `+ numpy==2.3.5`, `+ dftd3==1.6.0`, nothing else changed (pyscf-dispersion is skipped by its marker).

- [ ] **Step 4: Write `tools/molecules/dispersion.py`**

```python
"""B3LYP-D3(BJ) on every platform this project runs on (Phase 6D spec §6).

PySCF 2.8 adds Grimme's D3 to any SCF whose xc names it ('B3LYP-D3BJ'):
the energy (scf.dispersion), the gradient (grad.dispersion) and the Hessian
(hessian.dispersion, by finite differences of the D3 gradient). It does so
through the pyscf-dispersion package, which ships Linux aarch64 wheels (1.5.0,
the worker image) but nothing that runs on Apple-silicon macOS: its one macOS
wheel (1.0.0, 'universal2') holds x86_64-only libraries and calls
numpy.ctypeslib.load_library without the path that function requires
(checked 2026-10-08). On macOS, ensure_d3() installs a stand-in module under
the same name, backed by the dftd3 package (simple-dftd3's own Python API,
which has macOS arm64 wheels): the same model -- rational (Becke-Johnson)
damping with B3LYP's parameters, two-body only, as pyscf-dispersion's
'd3bj' computes it. tests/test_dispersion.py pins both to the same energies.
The library itself is generated inside the worker image (spec §6), so its
D3 comes from pyscf-dispersion; the stand-in serves local tests and This
Mac's jobs, and says so in provenance (backend()).
"""
import sys
import types
from importlib.metadata import version

import numpy as np

XC = 'B3LYP-D3BJ'            # PySCF's xc string
LABEL = 'B3LYP-D3(BJ)'       # as the literature, and every caption, writes it
MODEL = 'D3(BJ)'
_SUFFIX = '-D3BJ'


def method_label(xc: str) -> str:
    """'B3LYP-D3BJ' -> 'B3LYP-D3(BJ)'; any other xc unchanged."""
    return xc[:-len(_SUFFIX)] + '-D3(BJ)' if xc.upper().endswith(_SUFFIX) else xc


def ensure_d3() -> None:
    """Make `pyscf.dispersion.dftd3` importable: pyscf-dispersion where it is
    installed (Linux), else the dftd3-backed stand-in. Idempotent."""
    if 'pyscf.dispersion.dftd3' in sys.modules:
        return
    try:
        import pyscf.dispersion.dftd3  # noqa: F401
        return
    except ImportError:
        pass
    try:
        from dftd3.interface import DispersionModel, RationalDampingParam
    except ImportError as e:
        raise ImportError('B3LYP-D3(BJ) needs pyscf-dispersion (Linux) or dftd3 (macOS): '
                          'uv pip sync tools/molecules/requirements.lock') from e

    class DFTD3Dispersion:
        """The part of pyscf.dispersion.dftd3.DFTD3Dispersion PySCF 2.8 calls."""

        def __init__(self, mol, xc, version='d3bj', atm=False):
            if version != 'd3bj':
                raise NotImplementedError(f'the macOS D3 stand-in computes d3bj only, not {version}')
            self._model = DispersionModel(np.asarray(mol.atom_charges(), dtype=int),
                                          np.asarray(mol.atom_coords(), dtype=float))   # bohr, as dftd3 expects
            # atm: PySCF passes None or False for 'D3BJ' (two-body); dftd3 would otherwise add the ATM term.
            self._param = RationalDampingParam(method=xc.lower(), atm=bool(atm))

        def get_dispersion(self, grad=False):
            result = self._model.get_dispersion(self._param, grad=grad)
            out = {'energy': float(result['energy'])}
            if grad:
                out['gradient'] = np.asarray(result['gradient'], dtype=float)
            return out

    dftd3_module = types.ModuleType('pyscf.dispersion.dftd3')
    dftd3_module.DFTD3Dispersion = DFTD3Dispersion
    dftd3_module.BACKEND = f'dftd3 {version("dftd3")} (macOS stand-in for pyscf-dispersion)'
    dftd4_module = types.ModuleType('pyscf.dispersion.dftd4')     # PySCF imports it beside dftd3; never used
    package = types.ModuleType('pyscf.dispersion')
    package.__path__ = []
    package.dftd3, package.dftd4 = dftd3_module, dftd4_module
    sys.modules.update({'pyscf.dispersion': package, 'pyscf.dispersion.dftd3': dftd3_module,
                        'pyscf.dispersion.dftd4': dftd4_module})
    import pyscf
    pyscf.dispersion = package


def backend() -> str:
    """Which package computes D3 here, and its version, for provenance."""
    ensure_d3()
    stand_in = getattr(sys.modules['pyscf.dispersion.dftd3'], 'BACKEND', None)
    return stand_in or f'pyscf-dispersion {version("pyscf-dispersion")}'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_dispersion.py -q`
Expected: `8 passed` (about 30 s).

- [ ] **Step 6: Run both Python suites on the new NumPy**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules -q` (a few minutes), then `tools/molecules/.venv/bin/python -m pytest tools/jobs -q` (a few minutes).
Expected: all pass, skips as before. A failure here is a NumPy-2.3.5 regression: stop and report it, do not loosen a test.

- [ ] **Step 7: Commit**

```bash
git add tools/molecules/requirements.txt tools/molecules/requirements.lock tools/molecules/dispersion.py tools/molecules/tests/test_dispersion.py
git commit -m "build(molecules): NumPy 2.3.5 for DF gradients; B3LYP-D3(BJ) on Linux and macOS (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The worker image with the new lock, and running the generator inside it

**Estimate:** 45 min (the image build is 8–12 min: geomeTRIC builds from its sdist; a second build call resumes from the cache if the first is cut off).

**Files:**
- Create: `tools/molecules/in_image.sh`
- Test: `tools/molecules/tests/test_in_image.py`

**Interfaces:**
- Consumes: `tools/jobs/Dockerfile` (unchanged; it installs `tools/molecules/requirements.lock`, now with `pyscf-dispersion` on Linux), `generate.git_commit`'s dirty rule (re-implemented on the host here).
- Produces: `tools/molecules/in_image.sh <python args…>` — runs `python <args>` in image `${MOLECULES_IMAGE:-orbital-viewer-worker:local}` with the checkout at `/repo`, `PYTHONPATH=/repo/tools:/repo/tools/molecules`, the host's commit in `MOLECULES_GENERATOR_COMMIT` (with `-dirty` when `tools/molecules` is dirty), `OMP_NUM_THREADS=${OMP_NUM_THREADS:-8}`, `PYSCF_MAX_MEMORY=${PYSCF_MAX_MEMORY:-12000}`. Task 5 makes `generate.git_commit()` read `MOLECULES_GENERATOR_COMMIT`; Task 14 runs the whole generation through this script.

- [ ] **Step 1: Write the failing test**

Create `tools/molecules/tests/test_in_image.py`:

```python
"""tools/molecules/in_image.sh (Phase 6D): the docker command it would run. docker, aws, cdk, npm and node
are stubbed first on PATH -- no container ever starts here."""
import os
import stat
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / 'tools' / 'molecules' / 'in_image.sh'


def run(tmp_path, *args, **env):
    stubs = tmp_path / 'bin'
    stubs.mkdir()
    for name in ('docker', 'aws', 'cdk', 'npm', 'node'):
        stub = stubs / name
        stub.write_text('#!/bin/bash\nprintf "%s\\n" "$(basename "$0")" "$@" > "$STUB_LOG"\n')
        stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    log = tmp_path / 'argv'
    environ = {**os.environ, 'PATH': f'{stubs}:{os.environ["PATH"]}', 'STUB_LOG': str(log),
               'AWS_REGION': 'us-east-1', **env}
    done = subprocess.run(['bash', str(SCRIPT), *args], cwd=REPO, env=environ, capture_output=True, text=True)
    return done, (log.read_text().splitlines() if log.exists() else [])


def test_runs_python_in_the_worker_image_with_the_checkout_mounted(tmp_path):
    done, argv = run(tmp_path, 'tools/molecules/build_library.py', '--only', 'h2o')
    assert done.returncode == 0, done.stderr
    assert argv[:3] == ['docker', 'run', '--rm']
    assert argv[argv.index('--platform') + 1] == 'linux/arm64'
    assert f'{REPO}:/repo' in argv and argv[argv.index('-w') + 1] == '/repo'
    assert argv[argv.index('--entrypoint') + 1] == 'python'
    assert argv[-4:] == ['orbital-viewer-worker:local', 'tools/molecules/build_library.py', '--only', 'h2o']
    assert 'PYTHONPATH=/repo/tools:/repo/tools/molecules' in argv and 'HOME=/tmp' in argv
    assert 'OMP_NUM_THREADS=8' in argv and 'PYSCF_MAX_MEMORY=12000' in argv


def test_passes_the_hosts_commit_because_the_image_has_no_git(tmp_path):
    _, argv = run(tmp_path, '-c', 'pass')
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO, capture_output=True, text=True).stdout.strip()
    commit = next(a for a in argv if a.startswith('MOLECULES_GENERATOR_COMMIT=')).split('=', 1)[1]
    dirty = subprocess.run(['git', 'status', '--porcelain', 'tools/molecules'], cwd=REPO,
                           capture_output=True, text=True).stdout.strip()
    assert commit == head + ('-dirty' if dirty else '')


def test_threads_memory_and_image_can_be_overridden(tmp_path):
    _, argv = run(tmp_path, '-c', 'pass', OMP_NUM_THREADS='4', PYSCF_MAX_MEMORY='6000', MOLECULES_IMAGE='other:tag')
    assert 'OMP_NUM_THREADS=4' in argv and 'PYSCF_MAX_MEMORY=6000' in argv and 'other:tag' in argv


def test_refuses_to_run_with_nothing_to_run(tmp_path):
    done, argv = run(tmp_path)
    assert done.returncode == 2 and argv == [] and 'usage' in done.stderr
```

- [ ] **Step 2: Run it to verify it fails**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_in_image.py -q`
Expected: 4 failed (`bash: …/in_image.sh: No such file or directory`).

- [ ] **Step 3: Write `tools/molecules/in_image.sh`**

```bash
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
```

Run: `chmod +x tools/molecules/in_image.sh`

- [ ] **Step 4: Run the test to verify it passes**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_in_image.py -q`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add tools/molecules/in_image.sh tools/molecules/tests/test_in_image.py
git commit -m "build(molecules): run the generator inside the worker image (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Build the image locally with OrbStack's docker**

Run (timeout 600000 ms; if cut off, run it again — the layer cache resumes):
`docker buildx build --platform linux/arm64 -f tools/jobs/Dockerfile --build-arg GENERATOR_COMMIT=$(git rev-parse HEAD) -t orbital-viewer-worker:local --load .`
Expected: ends with `naming to docker.io/library/orbital-viewer-worker:local`. The pip step must install `pyscf_dispersion-1.5.0-py3-none-manylinux_2_17_aarch64` and `numpy-2.3.5-…aarch64` wheels; if pyscf, numpy, scipy or h5py build from source instead, stop and report (the Dockerfile's own rule).

- [ ] **Step 7: Run the D3 and DF tests on Linux, inside the image**

Run: `tools/molecules/in_image.sh -m pytest tools/molecules/tests/test_dispersion.py -q -p no:cacheprovider`
Expected: `8 passed`, with `test_the_backend_names_its_package` taking its Linux branch (`pyscf-dispersion 1.5.0`). Nothing to commit.

---

### Task 3: Full point-group labels by character projection

**Estimate:** 90 min (the test file runs about a minute: twelve small SCFs at def2-SVP).

**Files:**
- Create: `tools/molecules/point_group.py`
- Test: `tools/molecules/tests/test_point_group.py`

**Interfaces:**
- Consumes: `labels.irrep_to_lambda(group, irrep) -> (λ, parity)` (Bonds mode's D∞h/C∞v mapping, unchanged); PySCF's `mol.topgroup`, `mol.groupname`, `mol.irrep_name`, `mol.symm_orb`, `mol._symm_axes`, `symm.label_orb_symm`, `mf.grids`.
- Produces (`tools/molecules/point_group.py`), for Task 4:
  - `SET_TOL = 1e-5`, `CHI_TOL = 0.05`, `OP_TOL = 1e-3`, `UNLABELLED = '?'`, `LINEAR = ('Dooh', 'Coov')`
  - `TABLES: dict[str, tuple[list[tuple[str, int, tuple]], dict[str, list[int]]]]` for C3v, D3h, D3d, D6h, Td, Oh
  - `class SymmetryNotFound(RuntimeError)`
  - `number_labels(irreps: list[str]) -> list[str]` — per-irrep numbering, a degenerate pair's x/y components sharing one count (the old `orbitals.orbital_labels`, moved here)
  - `degenerate_sets(energies, indices, tol=SET_TOL) -> list[list[int]]`
  - `class_operations(group, x, z, extra_axes=()) -> list[np.ndarray]` — one 3×3 operation per class, in table order; raises `SymmetryNotFound`
  - `characters(mol, grids, mo, ops, centre) -> np.ndarray`
  - `match_irrep(group, chi, size) -> str | None`
  - `label_orbitals(mol, mf, indices) -> tuple[dict[int, str], dict, dict[int, str]]` — labels by MO index, the `symmetry` meta (`{'pointGroup', 'labelGroup', 'labels': 'full-group'|'subgroup'|'none', 'labelNote'?}`), and notes by MO index for unlabelled sets
  - `irrep_of(mol, mf, coeff) -> str` — the irrep (lower case, unnumbered) of one set of orthonormal orbitals, or `UNLABELLED`

- [ ] **Step 1: Write the failing test**

Create `tools/molecules/tests/test_point_group.py`:

```python
"""Full point-group orbital labels (Phase 6D spec §3), on the library's own geometries at def2-SVP:
textbook labels for the eight molecules PySCF labelled in a subgroup, plus water, N2 and CO2."""
import re

import numpy as np
import pytest
from pyscf import dft, gto

import point_group
from library import by_id
from point_group import TABLES, UNLABELLED, label_orbitals, match_irrep, number_labels


def scf(atoms, basis='def2-SVP'):
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, symmetry=True, verbose=0)
    mf = dft.RKS(mol)
    mf.xc, mf.grids.level, mf.conv_tol = 'B3LYP', 4, 1e-10
    mf.kernel()
    return mol, mf


def occupied_labels(atoms, virtuals=0):
    mol, mf = scf(atoms)
    kept = [i for i in range(len(mf.mo_occ)) if mf.mo_occ[i] > 0]
    kept += list(range(len(kept), len(kept) + virtuals))
    labels, symmetry, notes = label_orbitals(mol, mf, kept)
    return [labels[i] for i in kept], symmetry, notes


TEXTBOOK = {
    'ch4': ('Td', ['1a1', '2a1', '1t2', '1t2', '1t2']),
    'sih4': ('Td', ['1a1', '2a1', '1t2', '1t2', '1t2', '3a1', '2t2', '2t2', '2t2']),
    'nh3': ('C3v', ['1a1', '2a1', '1e', '1e', '3a1']),
    'ph3': ('C3v', ['1a1', '2a1', '1e', '1e', '3a1', '4a1', '2e', '2e', '5a1']),
    'c2h6': ('D3d', ['1a1g', '1a2u', '2a1g', '2a2u', '1eu', '1eu', '3a1g', '1eg', '1eg']),
    'bf3': ('D3h', ["1e'", "1e'", "1a1'", "2a1'", "3a1'", "2e'", "2e'", "4a1'", "3e'", "3e'", '1a2"',
                    "4e'", "4e'", '1e"', '1e"', "1a2'"]),
    'benzene': ('D6h', ['1a1g', '1e1u', '1e1u', '1e2g', '1e2g', '1b1u', '2a1g', '2e1u', '2e1u', '2e2g', '2e2g',
                        '3a1g', '2b1u', '1b2u', '3e1u', '3e1u', '1a2u', '3e2g', '3e2g', '1e1g', '1e1g']),
    'h2o': ('C2v', ['1a1', '2a1', '1b2', '3a1', '1b1']),
}


@pytest.mark.parametrize('molecule_id', sorted(TEXTBOOK))
def test_occupied_orbitals_carry_their_textbook_labels(molecule_id):
    group, expected = TEXTBOOK[molecule_id]
    labels, symmetry, notes = occupied_labels(list(by_id(molecule_id).atoms))
    assert labels == expected and notes == {}
    assert symmetry == {'pointGroup': group, 'labelGroup': group, 'labels': 'full-group'}


def test_benzene_lumo_is_1e2u():
    labels, _, _ = occupied_labels(list(by_id('benzene').atoms), virtuals=2)
    assert labels[-4:] == ['1e1g', '1e1g', '1e2u', '1e2u']


def test_sf6_homo_is_1t1g_and_its_occupied_irreps_add_up():
    labels, symmetry, _ = occupied_labels(list(by_id('sf6').atoms))
    assert symmetry['labelGroup'] == 'Oh' and labels[-3:] == ['1t1g'] * 3
    irreps = [re.sub(r'^\d+', '', label) for label in labels]
    counts = {irrep: irreps.count(irrep) for irrep in set(irreps)}
    assert counts == {'a1g': 5, 't1u': 15, 'eg': 6, 't2g': 3, 't2u': 3, 't1g': 3}      # 35 MOs, 70 electrons


def test_linear_molecules_read_sigma_pi_delta():
    labels, symmetry, _ = occupied_labels('N 0 0 -0.5488; N 0 0 0.5488')
    assert labels == ['1σg', '1σu', '2σg', '2σu', '1πu', '1πu', '3σg'] and symmetry['labelGroup'] == 'Dooh'
    labels, _, _ = occupied_labels(list(by_id('co2').atoms))
    assert labels[-2:] == ['1πg', '1πg'] and all(re.fullmatch(r'\d+[σπδ][gu]', label) for label in labels)


def test_a_degenerate_set_shares_one_label():
    mol, mf = scf(list(by_id('ch4').atoms))
    labels, _, _ = label_orbitals(mol, mf, [0, 1, 2, 3, 4])
    assert labels[2] == labels[3] == labels[4] == '1t2'


def test_a_partial_degenerate_set_is_left_unlabelled_not_mislabelled():
    # Review Focus 1: two of methane's three t2 orbitals carry characters no irrep of Td owns.
    mol, mf = scf(list(by_id('ch4').atoms))
    labels, symmetry, notes = label_orbitals(mol, mf, [0, 1, 2, 3])
    assert [labels[i] for i in range(4)] == ['1a1', '2a1', UNLABELLED, UNLABELLED]
    assert set(notes) == {2, 3} and notes[2] == notes[3] and 'match no single irrep of Td' in notes[2]
    assert symmetry['labels'] == 'full-group'


def test_an_unsupported_group_keeps_the_subgroup_and_says_so():
    allene = [('C', (0, 0, 0)), ('C', (0, 0, 1.31)), ('C', (0, 0, -1.31)), ('H', (0.93, 0, 1.87)),
              ('H', (-0.93, 0, 1.87)), ('H', (0, 0.93, -1.87)), ('H', (0, -0.93, -1.87))]
    labels, symmetry, _ = occupied_labels(allene)
    assert symmetry == {'pointGroup': 'D2d', 'labelGroup': 'D2', 'labels': 'subgroup',
                        'labelNote': 'irreducible representations of D2, a subgroup of D2d: '
                                     'full-group labels are not available for D2d'}
    assert all(re.fullmatch(r'\d+(a|b1|b2|b3)', label) for label in labels)


def test_operations_not_found_fall_back_to_the_subgroup_with_a_note(monkeypatch):
    # Review Focus 2: a supported group whose operations cannot be built at this geometry.
    def refuse(*args, **kwargs):
        raise point_group.SymmetryNotFound('no C3 axis')
    monkeypatch.setattr(point_group, 'class_operations', refuse)
    labels, symmetry, _ = occupied_labels(list(by_id('ch4').atoms))
    assert symmetry['labels'] == 'subgroup' and symmetry['labelGroup'] == 'D2'
    assert symmetry['labelNote'] == ('irreducible representations of D2, a subgroup of Td: the Td symmetry '
                                     'operations were not found at this geometry (no C3 axis)')
    assert labels[:2] == ['1a', '2a']


def test_no_symmetry_means_psi_labels():
    mol = gto.M(atom=list(by_id('h2o').atoms), unit='Angstrom', basis='sto-3g', verbose=0)
    mf = dft.RKS(mol)
    mf.kernel()
    labels, symmetry, _ = label_orbitals(mol, mf, [0, 1])
    assert labels == {0: 'ψ1', 1: 'ψ2'} and symmetry['labels'] == 'none'


@pytest.mark.parametrize('group', sorted(TABLES))
def test_every_character_table_is_orthonormal(group):
    classes, irreps = TABLES[group]
    sizes = np.array([size for _, size, _ in classes], dtype=float)
    order = sizes.sum()
    rows = {name: np.array(chars, dtype=float) for name, chars in irreps.items()}
    assert len(rows) == len(classes) and sum(row[0] ** 2 for row in rows.values()) == order
    for a in rows:
        for b in rows:
            assert (sizes * rows[a] * rows[b]).sum() / order == (1.0 if a == b else 0.0), (a, b)


def test_match_irrep_needs_every_character_within_tolerance_and_the_right_size():
    assert match_irrep('Td', np.array([3.0, 0.0, -1.0, -1.0, 1.0]), 3) == 'T2'
    assert match_irrep('Td', np.array([3.04, 0.04, -0.96, -1.04, 0.96]), 3) == 'T2'
    assert match_irrep('Td', np.array([3.0, 0.0, -1.0, -1.06, 1.0]), 3) is None
    assert match_irrep('Td', np.array([3.0, 0.0, -1.0, -1.0, 1.0]), 2) is None


def test_number_labels_counts_per_irrep_and_pairs_components():
    assert number_labels(['A1', 'A1', 'B2', 'A1', 'B1']) == ['1a1', '2a1', '1b2', '3a1', '1b1']
    assert number_labels(['A1g', 'E1uy', 'E1ux', 'A1g']) == ['1a1g', '1e1u', '1e1u', '2a1g']
```

- [ ] **Step 2: Run it to verify it fails**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_point_group.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'point_group'`.

- [ ] **Step 3: Write `tools/molecules/point_group.py`**

```python
"""Orbital labels in the molecule's full point group (Phase 6D spec §3).

PySCF labels orbitals only in D2h and its subgroups, so the library showed
methane's HOMO as b1/b2/b3 (D2) rather than t2 (Td), ammonia's lone pair as
4a' (Cs) rather than 3a1 (C3v), and benzene in D2h rather than D6h.
label_orbitals works in one of three regimes:

- full group PySCF already labels (D2h and its subgroups, C∞v, D∞h): PySCF's
  irreps, numbered per irrep in energy order. The linear groups read σ/π/δ
  through Bonds mode's own mapping (labels.irrep_to_lambda), a degenerate π
  pair sharing one number.
- projection (TABLES: C3v, D3h, D3d, D6h, Td, Oh): every MO, or set of MOs
  degenerate within SET_TOL, is labelled from its characters
  χ(R) = Σᵢ ⟨ψᵢ|R ψᵢ⟩ -- one operation R per class, integrated on the SCF's
  own DFT grid -- matched against the group's character table. A set whose
  characters are not all within CHI_TOL of one irrep's is left UNLABELLED,
  with a note: an accidental degeneracy, or numerical trouble, never a guess.
- subgroup: any other group (D2d, C3, Ih …), or a supported one whose
  operations cannot be built at this geometry, keeps PySCF's subgroup labels
  and says so (symmetry.labelNote) -- never silently.

Mulliken's notation, lower case for orbitals (a1, t2, e1g, a2"), with the core
counted, as textbooks number them. D6h follows Herzberg: C2' through atoms
(benzene's C and H), σv containing them; under it benzene's C 1s combination
that alternates round the ring is b1u.
"""
from __future__ import annotations

import numpy as np

SET_TOL = 1e-5            # Ha: MOs closer in energy than this form one degenerate set (spec §3)
CHI_TOL = 0.05            # a character further than this from the table's is no match (spec §3)
OP_TOL = 1e-3             # bohr: an operation must carry every nucleus onto one of the same element
BLOCK = 20000             # grid points per AO evaluation: bounds memory (SF6 at def2-TZVPD)
UNLABELLED = '?'
LINEAR = ('Dooh', 'Coov')


class SymmetryNotFound(RuntimeError):
    """A supported group's operations could not be built from this geometry."""


# Each group: its classes in table order -- (name, size, operation) -- and each irrep's characters in that
# order. An operation is ('E',), ('i',), ('C', n, k, axis) for C_n^k, ('S', n, k, axis) for S_n^k, or
# ('s', normal) for a mirror plane; the axes are named roles that _roles finds in the geometry.
TABLES = {
    'C3v': ([('E', 1, ('E',)), ('2C3', 2, ('C', 3, 1, 'z')), ('3σv', 3, ('s', 'v'))],
            {'A1': [1, 1, 1], 'A2': [1, 1, -1], 'E': [2, -1, 0]}),
    'D3h': ([('E', 1, ('E',)), ('2C3', 2, ('C', 3, 1, 'z')), ('3C2', 3, ('C', 2, 1, 'p')), ('σh', 1, ('s', 'z')),
             ('2S3', 2, ('S', 3, 1, 'z')), ('3σv', 3, ('s', 'v'))],
            {"A1'": [1, 1, 1, 1, 1, 1], "A2'": [1, 1, -1, 1, 1, -1], "E'": [2, -1, 0, 2, -1, 0],
             'A1"': [1, 1, 1, -1, -1, -1], 'A2"': [1, 1, -1, -1, -1, 1], 'E"': [2, -1, 0, -2, 1, 0]}),
    'D3d': ([('E', 1, ('E',)), ('2C3', 2, ('C', 3, 1, 'z')), ('3C2', 3, ('C', 2, 1, 'p')), ('i', 1, ('i',)),
             ('2S6', 2, ('S', 6, 1, 'z')), ('3σd', 3, ('s', 'v'))],
            {'A1g': [1, 1, 1, 1, 1, 1], 'A2g': [1, 1, -1, 1, 1, -1], 'Eg': [2, -1, 0, 2, -1, 0],
             'A1u': [1, 1, 1, -1, -1, -1], 'A2u': [1, 1, -1, -1, -1, 1], 'Eu': [2, -1, 0, -2, 1, 0]}),
    'D6h': ([('E', 1, ('E',)), ('2C6', 2, ('C', 6, 1, 'z')), ('2C3', 2, ('C', 3, 1, 'z')), ('C2', 1, ('C', 2, 1, 'z')),
             ("3C2'", 3, ('C', 2, 1, 'p')), ('3C2"', 3, ('C', 2, 1, 'q')), ('i', 1, ('i',)),
             ('2S3', 2, ('S', 3, 1, 'z')), ('2S6', 2, ('S', 6, 1, 'z')), ('σh', 1, ('s', 'z')),
             ('3σd', 3, ('s', 'dq')), ('3σv', 3, ('s', 'vp'))],
            {'A1g': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'A2g': [1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, -1],
             'B1g': [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1], 'B2g': [1, -1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1],
             'E1g': [2, 1, -1, -2, 0, 0, 2, 1, -1, -2, 0, 0], 'E2g': [2, -1, -1, 2, 0, 0, 2, -1, -1, 2, 0, 0],
             'A1u': [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1], 'A2u': [1, 1, 1, 1, -1, -1, -1, -1, -1, -1, 1, 1],
             'B1u': [1, -1, 1, -1, 1, -1, -1, 1, -1, 1, -1, 1], 'B2u': [1, -1, 1, -1, -1, 1, -1, 1, -1, 1, 1, -1],
             'E1u': [2, 1, -1, -2, 0, 0, -2, -1, 1, 2, 0, 0], 'E2u': [2, -1, -1, 2, 0, 0, -2, 1, 1, -2, 0, 0]}),
    'Td': ([('E', 1, ('E',)), ('8C3', 8, ('C', 3, 1, 'c3')), ('3C2', 3, ('C', 2, 1, 'a')),
            ('6S4', 6, ('S', 4, 1, 'a')), ('6σd', 6, ('s', 'd'))],
           {'A1': [1, 1, 1, 1, 1], 'A2': [1, 1, 1, -1, -1], 'E': [2, -1, 2, 0, 0],
            'T1': [3, 0, -1, 1, -1], 'T2': [3, 0, -1, -1, 1]}),
    'Oh': ([('E', 1, ('E',)), ('8C3', 8, ('C', 3, 1, 'c3')), ('6C2', 6, ('C', 2, 1, 'd')), ('6C4', 6, ('C', 4, 1, 'a')),
            ('3C2', 3, ('C', 2, 1, 'a')), ('i', 1, ('i',)), ('6S4', 6, ('S', 4, 1, 'a')), ('8S6', 8, ('S', 6, 1, 'c3')),
            ('3σh', 3, ('s', 'a')), ('6σd', 6, ('s', 'd'))],
           {'A1g': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'A2g': [1, 1, -1, -1, 1, 1, -1, 1, 1, -1],
            'Eg': [2, -1, 0, 0, 2, 2, 0, -1, 2, 0], 'T1g': [3, 0, -1, 1, -1, 3, 1, 0, -1, -1],
            'T2g': [3, 0, 1, -1, -1, 3, -1, 0, -1, 1], 'A1u': [1, 1, 1, 1, 1, -1, -1, -1, -1, -1],
            'A2u': [1, 1, -1, -1, 1, -1, 1, -1, -1, 1], 'Eu': [2, -1, 0, 0, 2, -2, 0, 1, -2, 0],
            'T1u': [3, 0, -1, 1, -1, -3, -1, 0, 1, 1], 'T2u': [3, 0, 1, -1, -1, -3, 1, 0, 1, -1]}),
}


def number_labels(irreps):
    """'1a1', '2a1', '1b2' …: each irrep counted in the order given (energy order). A degenerate pair's
    components (E1ux, E1uy) share one label but are counted separately, so either may come first."""
    counts, labels = {}, []
    for irrep in irreps:
        name = irrep.lower()
        if name.startswith('e') and name[-1] in 'xy':
            key, component = name[:-1], name[-1]
        else:
            key, component = name, ''
        counts[(key, component)] = counts.get((key, component), 0) + 1
        labels.append(f'{counts[(key, component)]}{key}')
    return labels


def degenerate_sets(energies, indices, tol=SET_TOL):
    """`indices` (ascending, so in energy order for aufbau occupations) cut into runs whose neighbours lie
    within `tol` of each other."""
    sets = []
    for i in indices:
        if sets and abs(energies[i] - energies[sets[-1][-1]]) < tol:
            sets[-1].append(i)
        else:
            sets.append([i])
    return sets


def rotation(axis, angle):
    a = np.asarray(axis, dtype=float) / np.linalg.norm(axis)
    k = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(angle) * k + (1 - np.cos(angle)) * k @ k


def reflection(normal):
    n = np.asarray(normal, dtype=float) / np.linalg.norm(normal)
    return np.eye(3) - 2 * np.outer(n, n)


def improper(axis, angle):
    return reflection(axis) @ rotation(axis, angle)


def is_symmetry(op, x, z, tol=OP_TOL):
    """Whether `op` carries every nucleus (rows of x, about the charge centre) onto one of the same charge."""
    moved = x @ op.T
    distance = np.linalg.norm(moved[:, None, :] - x[None, :, :], axis=2)
    distance[z[:, None] != z[None, :]] = np.inf
    return bool((distance.min(axis=1) < tol).all())


def _unit(v):
    return np.asarray(v, dtype=float) / np.linalg.norm(v)


def _distinct(vectors):
    out = []
    for v in vectors:
        if np.linalg.norm(v) < 1e-3:
            continue
        u = _unit(v)
        if all(abs(abs(u @ w) - 1) > 1e-6 for w in out):
            out.append(u)
    return out


def _principal_axis(x, z, n, extra):
    """A C_n axis: one of the charge-weighted second moment's eigenvectors (a symmetric top's unique one is
    its Cn axis) or of PySCF's own symmetry axes."""
    _, vectors = np.linalg.eigh(np.einsum('i,ij,ik->jk', z, x, x))
    for axis in _distinct(list(vectors.T) + list(extra)):
        if is_symmetry(rotation(axis, 2 * np.pi / n), x, z):
            return axis
    raise SymmetryNotFound(f'no C{n} axis')


def _in_plane(x, axis):
    """Directions perpendicular to `axis`: through each nucleus's projection, and halfway between two. The
    projections are not merged with their opposites before halving: staggered ethane's C2 axes bisect a top
    hydrogen's projection and a bottom one's, which point 60° apart, not 120°."""
    p = [_unit(v) for v in x - np.outer(x @ axis, axis) if np.linalg.norm(v) > 1e-3]
    return _distinct(p + [a + b for i, a in enumerate(p) for b in p[i + 1:]])


def _cubic_roles(group, x, z):
    """Td: its three C2 (S4) axes; Oh: its three C4 axes. Then a C3 axis, and Td's σd normal or Oh's C2'."""
    vectors = [v for v in x if np.linalg.norm(v) > 1e-3]
    pairs = [a + b for i, a in enumerate(vectors) for b in vectors[i + 1:]]
    pairs += [a - b for i, a in enumerate(vectors) for b in vectors[i + 1:]]
    found = []
    for axis in _distinct(vectors + pairs):
        op = improper(axis, np.pi / 2) if group == 'Td' else rotation(axis, np.pi / 2)
        if is_symmetry(op, x, z) and all(abs(axis @ f) < 1e-6 for f in found):
            found.append(axis)
            if len(found) == 3:
                a1, a2, a3 = found
                return {'a': a1, 'c3': _unit(a1 + a2 + a3), 'd': _unit(a1 + a2) if group == 'Oh' else _unit(a1 - a2)}
    raise SymmetryNotFound('three perpendicular S4 axes' if group == 'Td' else 'three perpendicular C4 axes')


def _roles(group, x, z, extra):
    if group in ('Td', 'Oh'):
        return _cubic_roles(group, x, z)
    axis = _principal_axis(x, z, 6 if group == 'D6h' else 3, extra)
    candidates = _in_plane(x, axis)
    plane = next((c for c in candidates if is_symmetry(reflection(np.cross(axis, c)), x, z)), None)
    if group == 'C3v':
        if plane is None:
            raise SymmetryNotFound('no vertical mirror plane')
        return {'z': axis, 'v': np.cross(axis, plane)}
    twofold = [c for c in candidates if is_symmetry(rotation(c, np.pi), x, z)]
    if not twofold:
        raise SymmetryNotFound('no C2 axis perpendicular to the principal axis')
    if group == 'D6h':
        def through(c):
            return sum(1 for v in x if np.linalg.norm(v) > 1e-3 and np.linalg.norm(np.cross(v, c)) < OP_TOL)
        p = max(twofold, key=through)                 # Herzberg: C2' passes through the most atoms
        q = rotation(axis, np.pi / 6) @ p
        return {'z': axis, 'p': p, 'q': q, 'vp': np.cross(axis, p), 'dq': np.cross(axis, q)}
    if plane is None:
        raise SymmetryNotFound('no vertical mirror plane')
    return {'z': axis, 'p': twofold[0], 'v': np.cross(axis, plane)}


def _operation(spec, roles):
    kind = spec[0]
    if kind == 'E':
        return np.eye(3)
    if kind == 'i':
        return -np.eye(3)
    if kind == 'C':
        return rotation(roles[spec[3]], 2 * np.pi * spec[2] / spec[1])
    if kind == 'S':
        return improper(roles[spec[3]], 2 * np.pi * spec[2] / spec[1])
    return reflection(roles[spec[1]])


def class_operations(group, x, z, extra_axes=()):
    """One operation per class of `group`, in TABLES order, each checked against the nuclei."""
    roles = _roles(group, x, z, list(extra_axes))
    ops = []
    for name, _, spec in TABLES[group][0]:
        op = _operation(spec, roles)
        if not is_symmetry(op, x, z):
            raise SymmetryNotFound(f'{name} is not a symmetry of this geometry')
        ops.append(op)
    return ops


def characters(mol, grids, mo, ops, centre):
    """χ(R) = Σᵢ ∫ ψᵢ(r) ψᵢ(R⁻¹r) dr for the set's columns `mo`, by the grid's quadrature."""
    kind = 'GTOval_cart' if mol.cart else 'GTOval_sph'
    coords, weights = np.asarray(grids.coords), np.asarray(grids.weights)
    chi = np.zeros(len(ops))
    for start in range(0, len(weights), BLOCK):
        r, w = coords[start:start + BLOCK], weights[start:start + BLOCK]
        psi = mol.eval_gto(kind, r) @ mo
        for k, op in enumerate(ops):
            moved = centre + (r - centre) @ op              # R⁻¹ r for an orthogonal R, as rows
            chi[k] += np.einsum('g,gi,gi->', w, psi, mol.eval_gto(kind, moved) @ mo)
    return chi


def match_irrep(group, chi, size):
    """The irrep of `group` of dimension `size` whose every character is within CHI_TOL of `chi`, or None."""
    for name, row in TABLES[group][1].items():
        if row[0] == size and np.all(np.abs(np.asarray(row, dtype=float) - chi) < CHI_TOL):
            return name
    return None


def _frame(mol):
    """Nuclear positions about the charge centre (bohr), the charges, and the centre."""
    coords, charges = mol.atom_coords(), mol.atom_charges().astype(float)
    centre = (charges[:, None] * coords).sum(axis=0) / charges.sum()
    return coords - centre, charges, centre


def _pyscf_axes(mol):
    axes = np.asarray(getattr(mol, '_symm_axes', np.eye(3)), dtype=float)
    return list(axes) + list(axes.T)


def _grids(mf):
    grids = getattr(mf, 'grids', None)
    if grids is None:
        from pyscf.dft import gen_grid
        grids = gen_grid.Grids(mf.mol)
        grids.level = 4
    if grids.coords is None:
        grids.build()
    return grids


def _linear_labels(group, irreps, energies):
    from labels import irrep_to_lambda
    counts, last, out = {}, {}, []
    for irrep, energy in zip(irreps, energies):
        key = irrep_to_lambda(group, irrep)
        previous = last.get(key)
        if key[0] != 'σ' and previous is not None and abs(energy - previous[1]) < SET_TOL:
            number = previous[0]                      # the other half of a π (δ) pair shares its number
        else:
            number = counts.get(key, 0) + 1
            counts[key] = number
        last[key] = (number, energy)
        out.append(f'{number}{key[0]}{key[1]}')
    return out


def _pyscf_labels(mol, mf, indices, note):
    from pyscf import symm
    irreps = list(symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, mf.mo_coeff[:, indices]))
    if mol.groupname in LINEAR:
        names = _linear_labels(mol.groupname, irreps, [float(mf.mo_energy[i]) for i in indices])
    else:
        names = number_labels(irreps)
    symmetry = {'pointGroup': mol.topgroup, 'labelGroup': mol.groupname, 'labels': 'subgroup' if note else 'full-group'}
    if note:
        symmetry['labelNote'] = note
    return dict(zip(indices, names)), symmetry, {}


def _projected_labels(mol, mf, indices, group):
    x, z, centre = _frame(mol)
    ops = class_operations(group, x, z, _pyscf_axes(mol))
    grids, energies = _grids(mf), np.asarray(mf.mo_energy, dtype=float)
    counts, labels, notes = {}, {}, {}
    for members in degenerate_sets(energies, indices):
        chi = characters(mol, grids, mf.mo_coeff[:, members], ops, centre)
        irrep = match_irrep(group, chi, len(members))
        if irrep is None:
            note = (f'characters ({", ".join(f"{c:.2f}" for c in chi)}) match no single irrep of {group}: '
                    'an accidental degeneracy or numerical noise, so left unlabelled')
            for i in members:
                labels[i], notes[i] = UNLABELLED, note
            continue
        name = irrep.lower()
        counts[name] = counts.get(name, 0) + 1
        for i in members:
            labels[i] = f'{counts[name]}{name}'
    return labels, {'pointGroup': group, 'labelGroup': group, 'labels': 'full-group'}, notes


def label_orbitals(mol, mf, indices):
    """(labels by MO index, meta.json's `symmetry`, notes by MO index) for the MOs `indices` -- every
    occupied one and a run of virtuals from the LUMO, so numbering starts at the core."""
    indices = list(indices)
    if not mol.symmetry:
        return ({i: f'ψ{i + 1}' for i in indices},
                {'pointGroup': mol.topgroup, 'labelGroup': mol.groupname, 'labels': 'none'}, {})
    top, sub = mol.topgroup, mol.groupname
    if top in TABLES:
        try:
            return _projected_labels(mol, mf, indices, top)
        except SymmetryNotFound as e:
            return _pyscf_labels(mol, mf, indices, f'irreducible representations of {sub}, a subgroup of {top}: '
                                                   f'the {top} symmetry operations were not found at this geometry ({e})')
    if top == sub:
        return _pyscf_labels(mol, mf, indices, None)
    return _pyscf_labels(mol, mf, indices, f'irreducible representations of {sub}, a subgroup of {top}: '
                                           f'full-group labels are not available for {top}')


def irrep_of(mol, mf, coeff):
    """The irrep, lower case and unnumbered, of one set of orthonormal orbitals (the columns of `coeff`) in
    the group label_orbitals would use; UNLABELLED if they do not carry a single one."""
    if not mol.symmetry:
        return UNLABELLED
    if mol.topgroup in TABLES:
        try:
            x, z, centre = _frame(mol)
            ops = class_operations(mol.topgroup, x, z, _pyscf_axes(mol))
            irrep = match_irrep(mol.topgroup, characters(mol, _grids(mf), coeff, ops, centre), coeff.shape[1])
            return irrep.lower() if irrep else UNLABELLED
        except SymmetryNotFound:
            pass
    from pyscf import symm
    try:
        names = set(symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, coeff))
    except ValueError:                                # orbitals mixed across irreps
        return UNLABELLED
    if mol.groupname in LINEAR:
        from labels import irrep_to_lambda
        names = {''.join(irrep_to_lambda(mol.groupname, n)) for n in names}
    return names.pop().lower() if len(names) == 1 else UNLABELLED
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_point_group.py -q`
Expected: `24 passed` in about 90 s. If a TEXTBOOK list differs only in the order of two near-degenerate core sets (BF₃'s F 1s `1e'`/`1a1'`), print the computed list and stop: do not edit the expectation to whatever came out without telling the controller.

- [ ] **Step 5: Commit**

```bash
git add tools/molecules/point_group.py tools/molecules/tests/test_point_group.py
git commit -m "feat(molecules): label orbitals in the full point group by character projection (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Virtual classes, the LVMO and the new orbital table

**Estimate:** 75 min (the new tests run about 40 s: three small def2-TZVPD SCFs and benzene at def2-SVPD).

**Files:**
- Rewrite: `tools/molecules/orbitals.py`
- Modify: `tools/molecules/build_library.py` (`library_basis_json`, `write_molecule_files`)
- Modify: `tools/molecules/tests/test_esp_orbitals.py`, `tools/molecules/tests/test_build_library.py`
- Test: `tools/molecules/tests/test_virtuals.py`

**Interfaces:**
- Consumes: Task 3's `label_orbitals`, `irrep_of`, `number_labels`, `UNLABELLED`; `pyscf.lo.iao.iao`, `pyscf.lo.orth.vec_lowdin`.
- Produces (`tools/molecules/orbitals.py`):
  - `DEGENERACY_TOL = 1e-4`, `VALENCE_THRESHOLD = 0.75`; `orbital_labels = number_labels` (kept name)
  - `degeneracy_groups(energies, tol=DEGENERACY_TOL) -> list[int]` (unchanged)
  - `@dataclass OrbitalTable: rows: list[dict]; symmetry: dict; coefficients: np.ndarray` — `coefficients[:, k]` is `rows[k]`'s orbital
  - `valence_characters(mol, mf) -> np.ndarray` (per MO), `valence_virtuals(mol, mf) -> tuple[np.ndarray, np.ndarray]` (energies ascending, AO coefficients)
  - `orbital_table(mol, mf, extra_virtuals=5) -> OrbitalTable`. Row keys: `index`, `label`, `energyHartree`, `occupation`, optional `role` (`'HOMO'|'LUMO'|'SOMO'|'LVMO'`), on virtuals `valenceCharacter` (0–1, 4 d.p.) and `class` (`'valence'|'diffuse'`), on a valence virtual orbital `kind: 'valence-virtual'`, on an unlabelled set `labelNote`.
- Produces (`build_library.py`): `library_basis_json(mol, mf, table: OrbitalTable) -> dict`; `write_molecule_files` writes `meta['orbitals'] = table.rows`, `meta['symmetry'] = table.symmetry`.

- [ ] **Step 1: Write the failing tests**

Create `tools/molecules/tests/test_virtuals.py`:

```python
"""Honest virtual orbitals (Phase 6D spec §4), at the library's property basis (def2-TZVPD) where the
diffuse functions are the point; benzene at def2-SVPD to stay quick."""
import numpy as np
import pytest
from pyscf import dft, gto

from library import by_id
from orbitals import VALENCE_THRESHOLD, orbital_table, valence_characters, valence_virtuals


def scf(molecule_id, basis):
    entry = by_id(molecule_id)
    mol = gto.M(atom=list(entry.atoms), unit='Angstrom', basis=basis, spin=entry.spin, symmetry=True, verbose=0)
    mf = dft.RKS(mol)
    mf.xc, mf.grids.level, mf.conv_tol = 'B3LYP', 4, 1e-10
    mf.kernel()
    return mol, mf


def roles(table, role):
    return [r for r in table.rows if r.get('role') == role]


@pytest.mark.parametrize('molecule_id', ['h2o', 'nh3', 'ch4'])
def test_a_diffuse_lumo_and_a_valence_lvmo(molecule_id):
    mol, mf = scf(molecule_id, 'def2-TZVPD')
    table = orbital_table(mol, mf)
    lumo, lvmo = roles(table, 'LUMO'), roles(table, 'LVMO')
    assert lumo and all(r['class'] == 'diffuse' and r['valenceCharacter'] < VALENCE_THRESHOLD for r in lumo)
    # No canonical virtual of these three is valence at def2-TZVPD: the LVMO is the lowest valence virtual
    # orbital, appended after the canonical rows with its own coefficients.
    assert len(lvmo) == 1 and lvmo[0]['kind'] == 'valence-virtual' and lvmo[0]['class'] == 'valence'
    assert lvmo[0]['label'] == 'a1' and lvmo[0]['valenceCharacter'] == 1.0 and lvmo[0]['occupation'] == 0.0
    assert lvmo[0]['energyHartree'] > lumo[0]['energyHartree']
    assert lvmo[0] is table.rows[-1] and lvmo[0]['index'] == len(table.rows) - 1
    c = table.coefficients[:, -1]
    assert c @ mol.intor('int1e_ovlp') @ c == pytest.approx(1.0, abs=1e-8)


def test_benzenes_lumo_is_a_valence_pi_star_and_there_is_no_separate_lvmo():
    mol, mf = scf('benzene', 'def2-SVPD')
    table = orbital_table(mol, mf)
    lumo = roles(table, 'LUMO')
    assert [r['label'] for r in lumo] == ['1e2u', '1e2u'] and all(r['class'] == 'valence' for r in lumo)
    assert roles(table, 'LVMO') == [] and not any(r.get('kind') for r in table.rows)


def test_a_canonical_valence_virtual_is_the_lvmo_when_one_is_shipped():
    mol, mf = scf('co2', 'def2-TZVPD')
    table = orbital_table(mol, mf)
    assert [r['class'] for r in roles(table, 'LUMO')] == ['diffuse']
    lvmo = roles(table, 'LVMO')
    assert [r['label'] for r in lvmo] == ['2πu', '2πu'] and all('kind' not in r for r in lvmo)
    assert all(r['valenceCharacter'] > 0.9 for r in lvmo)


def test_occupied_orbitals_are_wholly_valence_and_carry_no_class():
    mol, mf = scf('h2o', 'def2-TZVPD')
    occupied = mf.mo_occ > 0
    assert np.all(valence_characters(mol, mf)[occupied] > 0.99)
    assert all('class' not in r and 'valenceCharacter' not in r for r in orbital_table(mol, mf).rows if r['occupation'] > 0)


def test_there_are_as_many_valence_virtuals_as_minimal_basis_functions_left_over():
    mol, mf = scf('ch4', 'def2-TZVPD')
    energies, coeff = valence_virtuals(mol, mf)
    assert len(energies) == 9 - 5 and np.all(np.diff(energies) >= 0)          # MINAO: C 5 + 4 H 1, 5 occupied
    s = mol.intor('int1e_ovlp')
    assert np.allclose(coeff.T @ s @ coeff, np.eye(4), atol=1e-8)
    assert np.allclose(coeff.T @ s @ mf.mo_coeff[:, mf.mo_occ > 0], 0, atol=1e-8)   # purely virtual
```

In `tools/molecules/tests/test_esp_orbitals.py`, the tests now take `.rows` from the table. Replace the import line and the five uses:

```python
from orbitals import degeneracy_groups, orbital_labels, orbital_table
```
stays as is; change `table = orbital_table(mol, mf)` to `table = orbital_table(mol, mf).rows` in `test_water_homo_is_the_out_of_plane_lone_pair_and_dipole_points_to_the_hydrogens`, `test_no2_has_one_somo_below_the_lumo`, `test_table_keeps_occupied_plus_five_virtuals_and_completes_a_degenerate_set` and `test_table_rows_address_basis_json_positions`, and in `test_all_three_ch4_homos_are_marked` change `orbital_table(mol, mf)` to `orbital_table(mol, mf).rows`. In `test_table_keeps_occupied_plus_five_virtuals_and_completes_a_degenerate_set`, the virtual rows now include any appended valence virtual orbital; change its `virtual = …` line to:

```python
    virtual = [r for r in table if r['occupation'] == 0 and 'kind' not in r]
```

In `tools/molecules/tests/test_build_library.py`, append:

```python
def test_meta_carries_the_symmetry_and_classes_basis_json_the_same_rows(water):
    out, _, meta = water
    assert meta['symmetry'] == {'pointGroup': 'C2v', 'labelGroup': 'C2v', 'labels': 'full-group'}
    virtuals = [o for o in meta['orbitals'] if o['occupation'] == 0]
    assert virtuals and all(o['class'] in ('valence', 'diffuse') and 0 <= o['valenceCharacter'] <= 1 for o in virtuals)
    basis = json.loads((out / 'h2o' / 'basis.json').read_text())
    assert len(basis['orbitals']) == len(meta['orbitals'])


def test_a_valence_virtual_orbital_ships_its_own_coefficients(tmp_path):
    # Water at def2-TZVPD: the LVMO is not a canonical MO, so basis.json carries its coefficients and no pyscfIndex.
    build_molecule(by_id('h2o'), out_root=tmp_path, basis='def2-TZVPD', grid_points=(40,), budget=10_000_000)
    meta = json.loads((tmp_path / 'h2o' / 'meta.json').read_text())
    basis = json.loads((tmp_path / 'h2o' / 'basis.json').read_text())
    lvmo = basis['orbitals'][-1]
    assert lvmo['role'] == 'LVMO' and lvmo['kind'] == 'valence-virtual' and 'pyscfIndex' not in lvmo
    assert lvmo['index'] == len(meta['orbitals']) - 1 and len(lvmo['coefficients']) == basis['nao']
    assert all(o['pyscfIndex'] == o['index'] for o in basis['orbitals'][:-1])
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_virtuals.py tools/molecules/tests/test_esp_orbitals.py tools/molecules/tests/test_build_library.py -q`
Expected: `test_virtuals.py` fails to import (`ImportError: cannot import name 'VALENCE_THRESHOLD'`); the `.rows` edits fail with `AttributeError: 'list' object has no attribute 'rows'`.

- [ ] **Step 3: Rewrite `tools/molecules/orbitals.py`**

```python
"""
The orbital list meta.json carries: every occupied orbital and the first few
virtuals, labelled in the molecule's full point group where one is supported
(point_group.py), degenerate sets kept together, HOMO / LUMO / SOMO on every
member of the relevant set.

Phase 6D (spec §4): every virtual also carries its valence character -- the
fraction of it inside the span of the intrinsic atomic orbitals (IAOs onto
MINAO, pyscf.lo.iao) -- and its class, 'valence' at VALENCE_THRESHOLD or above,
else 'diffuse'. With def2-TZVPD's diffuse functions the lowest virtuals of
water, ammonia and methane are near-zero or positive-energy states of the
basis (measured 55, 50 and 36 % valence), not the σ* orbitals textbooks draw;
clean valence virtuals measure 77-99 %, hence 0.75 (the spec's 0.5 would call
water's LUMO valence). Where the LUMO is diffuse, the role LVMO marks the
lowest valence virtual: a shipped canonical one if any is valence (CO2's 2πu,
97 %); otherwise the lowest valence virtual orbital (VVO) -- the Fock operator
diagonalised in the virtual part of the IAO span -- appended as one more row,
kind 'valence-virtual', its own coefficients in the table, its energy an
expectation value (water's σ* +5.0 eV).
"""
from dataclasses import dataclass

import numpy as np

from point_group import irrep_of, label_orbitals, number_labels

DEGENERACY_TOL = 1e-4
VALENCE_THRESHOLD = 0.75
orbital_labels = number_labels      # Phase 6's name for the per-irrep numbering, kept for its callers


@dataclass
class OrbitalTable:
    rows: list
    symmetry: dict
    coefficients: np.ndarray       # (nao, len(rows)): column k is rows[k]'s orbital


def degeneracy_groups(energies, tol=DEGENERACY_TOL):
    groups, current = [], 0
    for i, e in enumerate(energies):
        if i and abs(e - energies[i - 1]) >= tol:
            current += 1
        groups.append(current)
    return groups


def _iao(mol, mf):
    from pyscf import lo
    s = mol.intor_symmetric('int1e_ovlp')
    occupied = mf.mo_coeff[:, np.asarray(mf.mo_occ) > 0]
    return lo.orth.vec_lowdin(lo.iao.iao(mol, occupied), s), s


def valence_characters(mol, mf):
    """Each MO's norm inside the orthonormalised IAO span: 1 for occupied orbitals (the IAOs span them
    exactly), 0-1 for a virtual."""
    c_iao, s = _iao(mol, mf)
    return ((np.asarray(mf.mo_coeff).T @ s @ c_iao) ** 2).sum(axis=1)


def valence_virtuals(mol, mf):
    """The valence virtual orbitals: the virtual part of the IAO span (n_IAO - n_occupied orbitals, its
    singular values exactly 1, the rest 0), with the Fock operator diagonalised in it. Energies ascending
    (expectation values) and AO coefficients."""
    c_iao, s = _iao(mol, mf)
    virtual = np.asarray(mf.mo_occ) == 0
    c_virtual = mf.mo_coeff[:, virtual]
    u, singular, _ = np.linalg.svd(c_virtual.T @ s @ c_iao, full_matrices=False)
    w = u[:, singular > 0.5]
    energies, y = np.linalg.eigh(w.T @ np.diag(np.asarray(mf.mo_energy)[virtual]) @ w)
    return energies, c_virtual @ (w @ y)


def _sets(rows, tol=DEGENERACY_TOL):
    sets = []
    for row in rows:
        if sets and abs(row['energyHartree'] - sets[-1][-1]['energyHartree']) < tol:
            sets[-1].append(row)
        else:
            sets.append([row])
    return sets


def _mark_lvmo(mol, mf, rows, coefficients):
    virtual = [r for r in rows if r['occupation'] == 0]
    lumo = [r for r in virtual if r.get('role') == 'LUMO']
    if not lumo or all(r['class'] == 'valence' for r in lumo):
        return rows, coefficients
    for members in _sets(virtual):
        if all(r['class'] == 'valence' for r in members):
            for r in members:
                r['role'] = 'LVMO'
            return rows, coefficients
    energies, vvo = valence_virtuals(mol, mf)
    if not len(energies):
        return rows, coefficients
    lowest = [k for k in range(len(energies)) if energies[k] - energies[0] < DEGENERACY_TOL]
    label = irrep_of(mol, mf, vvo[:, lowest])
    for k in lowest:
        rows.append({'index': len(rows), 'label': label, 'energyHartree': float(energies[k]), 'occupation': 0.0,
                     'role': 'LVMO', 'kind': 'valence-virtual', 'valenceCharacter': 1.0, 'class': 'valence'})
    return rows, np.hstack([coefficients, vvo[:, lowest]])


def orbital_table(mol, mf, extra_virtuals=5):
    energies = np.asarray(mf.mo_energy, dtype=float)
    occ = np.asarray(mf.mo_occ, dtype=float)
    groups = degeneracy_groups(list(energies))
    occupied = [i for i in range(len(occ)) if occ[i] > 0]
    virtual = [i for i in range(len(occ)) if occ[i] == 0]
    keep_virtual = virtual[:extra_virtuals]
    while keep_virtual and len(keep_virtual) < len(virtual) and groups[virtual[len(keep_virtual)]] == groups[keep_virtual[-1]]:
        keep_virtual.append(virtual[len(keep_virtual)])
    kept = occupied + keep_virtual
    # D1 (preflight controller correction): basis.json is written from these rows, addressed by position
    # (a 'gaussianMO' recipe names an orbital by its index into basis.json's `orbitals`). For RKS/ROKS under
    # aufbau occupation, occupied and the leading virtuals are two contiguous runs from 0, so a canonical
    # row's position equals its PySCF index. Pinned here, before any further work, with a real exception:
    # the worker runs this at request time, where `python -O` would drop an assert.
    if kept != list(range(len(kept))):
        raise ValueError('orbital_table rows are not addressable by position: position != PySCF index')
    labels, symmetry, notes = label_orbitals(mol, mf, kept)
    character = valence_characters(mol, mf) if keep_virtual else None
    doubly = [i for i in occupied if occ[i] > 1.5]
    homo_group = groups[max(doubly, key=lambda i: energies[i])] if doubly else None
    lumo_group = groups[min(virtual, key=lambda i: energies[i])] if virtual else None
    rows = []
    for i in kept:
        row = {'index': int(i), 'label': labels[i], 'energyHartree': float(energies[i]), 'occupation': float(occ[i])}
        if 0.5 < occ[i] < 1.5:
            row['role'] = 'SOMO'
        elif occ[i] > 1.5 and groups[i] == homo_group:
            row['role'] = 'HOMO'
        elif occ[i] == 0 and groups[i] == lumo_group:
            row['role'] = 'LUMO'
        if occ[i] == 0:
            row['valenceCharacter'] = round(float(character[i]), 4)
            row['class'] = 'valence' if character[i] >= VALENCE_THRESHOLD else 'diffuse'
        if i in notes:
            row['labelNote'] = notes[i]
        rows.append(row)
    rows, coefficients = _mark_lvmo(mol, mf, rows, np.asarray(mf.mo_coeff)[:, kept])
    return OrbitalTable(rows, symmetry, coefficients)
```

- [ ] **Step 4: Wire it into `build_library.py`**

Replace `library_basis_json` with:

```python
def library_basis_json(mol, mf, table):
    """basis.json's payload from Phase 6's own orbital table (D1: preflight controller correction): the
    orbital at position k is the table's row k and coefficient column k -- a canonical MO (pyscfIndex is its
    PySCF index) or, since Phase 6D, an appended valence virtual orbital, which has no PySCF index."""
    shells = export_shells(mol)
    check_against_pyscf(mol, shells)
    orbitals = []
    for k, row in enumerate(table.rows):
        entry = {**row, 'spin': 'restricted', 'coefficients': [float(c) for c in table.coefficients[:, k]]}
        if row.get('kind') != 'valence-virtual':
            entry['pyscfIndex'] = row['index']
        orbitals.append(entry)
    return {'spherical': True, 'convention': CONVENTION, 'atoms': atoms_of(mol), 'nao': int(mol.nao), 'shells': shells,
            'orbitals': orbitals}
```

In `write_molecule_files`, replace

```python
    orbitals = orbital_table(mol, mf)
    (out / 'basis.json').write_text(json.dumps(library_basis_json(mol, mf, orbitals), separators=(',', ':')))
```

with

```python
    table = orbital_table(mol, mf)
    (out / 'basis.json').write_text(json.dumps(library_basis_json(mol, mf, table), separators=(',', ':')))
```

and in the `meta = {…}` literal replace `'orbitals': orbitals,` with `'orbitals': table.rows,` and `'symmetry': {'pointGroup': mol.topgroup, 'labelGroup': mol.groupname},` with `'symmetry': table.symmetry,`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_virtuals.py tools/molecules/tests/test_esp_orbitals.py tools/molecules/tests/test_build_library.py tools/molecules/tests/test_point_group.py -q`
Expected: all pass (about 2 min).

Then the rest: `tools/molecules/.venv/bin/python -m pytest tools/molecules tools/jobs -q` (a few minutes). Expected: all pass. (`tools/jobs/tests/test_write_molecule_files.py` and the worker tests go through `write_molecule_files`, so they exercise the new table too.)

- [ ] **Step 6: Commit**

```bash
git add tools/molecules/orbitals.py tools/molecules/build_library.py tools/molecules/tests/test_virtuals.py tools/molecules/tests/test_esp_orbitals.py tools/molecules/tests/test_build_library.py
git commit -m "feat(molecules): classify virtuals as valence or diffuse and mark the LVMO (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Library method B3LYP-D3(BJ), honest validation rows

**Estimate:** 60 min.

**Files:**
- Modify: `tools/molecules/library.py`, `tools/molecules/optimise.py`, `tools/molecules/build_library.py`, `tools/molecules/generate.py`
- Modify: `tools/molecules/tests/test_optimise.py`, `tools/molecules/tests/test_build_library.py`
- Regenerate: `src/validation/generated/phase6_library.json` (from the existing `out/v2` metas; read-only use of `out/`)

**Interfaces:**
- Consumes: Task 1's `dispersion.XC`, `LABEL`, `MODEL`, `method_label`, `ensure_d3`, `backend`; Task 2's `MOLECULES_GENERATOR_COMMIT`.
- Produces:
  - `library.OPTIMISED = 'B3LYP-D3(BJ)/def2-TZVP optimised (PySCF + geomeTRIC)'`
  - `optimise.XC = dispersion.XC`, `optimise.FINAL_METHOD = 'B3LYP-D3(BJ)/def2-TZVP'`; `make_dft(mol, xc=XC)`; `optimise_steps(entry, maxsteps=4, basis=FINAL_BASIS, xc=XC)` writes `method=<method_label(xc)>/<basis>`; `geometry_for` accepts only `method=B3LYP-D3(BJ)/def2-TZVP`
  - `build_library.XC = dispersion.XC`; `build_molecule(…, xc=XC)` records method `'B3LYP-D3(BJ)/def2-TZVPD'`; `dispersion_meta(mf) -> dict | None` → `meta['dispersion'] = {'model': 'D3(BJ)', 'energyHartree': float, 'backend': str}`
  - `build_library.NOT_A_TEST = 'geometry from experiment (not a test of the method)'`; every validation row gains `geometrySource` (the meta's); bond/angle rows of an experimental geometry gain `notATest: NOT_A_TEST`
  - `generate.git_commit()` returns `MOLECULES_GENERATOR_COMMIT` when set

- [ ] **Step 1: Write the failing tests**

In `tools/molecules/tests/test_optimise.py`, replace `test_refuses_missing_unconverged_or_wrong_basis` with:

```python
def test_refuses_missing_unconverged_or_wrong_method(tmp_path, monkeypatch):
    monkeypatch.setattr(optimise, 'GEOMETRY_DIR', tmp_path)
    entry = by_id('glycine')
    with pytest.raises(FileNotFoundError, match='optimise.py glycine'):
        optimise.geometry_for(entry)
    atoms = [('N', (0.0, 0.0, 0.0))]
    optimise.write_xyz(tmp_path / 'glycine.xyz', atoms, 'converged=false maxGradient=3.000e-03 method=B3LYP-D3(BJ)/def2-TZVP')
    with pytest.raises(RuntimeError, match='not converged'):
        optimise.geometry_for(entry)
    for stale in ('B3LYP-D3(BJ)/def2-SVP', 'B3LYP/def2-TZVP'):      # Phase 6D: v2's geometries are B3LYP without D3
        optimise.write_xyz(tmp_path / 'glycine.xyz', atoms, f'converged=true maxGradient=1.000e-05 method={stale}')
        with pytest.raises(RuntimeError, match=r'not B3LYP-D3\(BJ\)/def2-TZVP'):
            optimise.geometry_for(entry)
    optimise.write_xyz(tmp_path / 'glycine.xyz', atoms, 'converged=true maxGradient=1.000e-05 method=B3LYP-D3(BJ)/def2-TZVP')
    assert optimise.geometry_for(entry) == (atoms, {'converged': True, 'maxGradient': 1e-05})


def test_the_library_method_is_d3bj():
    assert optimise.FINAL_METHOD == 'B3LYP-D3(BJ)/def2-TZVP' and optimise.XC == 'B3LYP-D3BJ'
    assert OPTIMISED == 'B3LYP-D3(BJ)/def2-TZVP optimised (PySCF + geomeTRIC)'
```

and in `test_optimises_a_distorted_water` (MOLECULES_SLOW) add after the first assertion:

```python
    assert optimise.read_xyz(tmp_path / 'w.xyz')[1].endswith('method=B3LYP-D3(BJ)/def2-SVP')
```

In `tools/molecules/tests/test_build_library.py`, replace `test_meta_carries_grids_method_and_the_additions`'s method assertion line with

```python
    assert meta['method'] == {'density': 'B3LYP-D3(BJ)/def2-SVP', 'energies': 'B3LYP-D3(BJ)/def2-SVP'}
    assert meta['dispersion']['model'] == 'D3(BJ)' and -0.001 < meta['dispersion']['energyHartree'] < 0
    assert meta['dispersion']['backend'].startswith(('pyscf-dispersion ', 'dftd3 '))
```

replace `test_validation_rows_have_the_phase1_shape`'s `keys = …` and `assert all(…)` lines with

```python
    keys = {'phase', 'quantity', 'system', 'app', 'reference', 'unit', 'tolerancePercent', 'referenceSource', 'method',
            'geometrySource'}
    geometry_rows = {'bond length O–H', 'angle H–O–H'}
    assert all(r['phase'] == 6 and set(r) == (keys | {'notATest'} if r['quantity'] in geometry_rows else keys) for r in rows)
    assert all(r['geometrySource'] == 'experiment (CCCBDB)' for r in rows)
    assert {r['notATest'] for r in rows if 'notATest' in r} == {'geometry from experiment (not a test of the method)'}
```

and append:

```python
def test_an_optimised_molecules_geometry_rows_count_as_validation():
    entry = by_id('ethanol')
    meta = {'atoms': [{'position': [0.0, 0.0, 0.0]}] * 9, 'geometrySource': entry.geometry_source,
            'dipoleDebye': 1.5, 'method': {'density': 'B3LYP-D3(BJ)/def2-TZVPD'}, 'densityIntegral': 26.0,
            'electronCount': 26, 'grid': {'shape': [96, 96, 96]}}
    rows = validation_rows(entry, meta)
    assert all('notATest' not in r and r['geometrySource'] == entry.geometry_source for r in rows)


def test_the_generator_commit_can_be_supplied(monkeypatch):
    import generate
    monkeypatch.setenv('MOLECULES_GENERATOR_COMMIT', 'abc123-dirty')
    assert generate.git_commit() == 'abc123-dirty'
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_optimise.py tools/molecules/tests/test_build_library.py -q`
Expected: failures on the method strings, `KeyError: 'dispersion'`, the row keys, `FINAL_METHOD` missing, and `git_commit` ignoring the variable.

- [ ] **Step 3: Implement**

`tools/molecules/library.py`: replace the `OPTIMISED = …` line with

```python
# Phase 6D (spec §6): the seven are re-optimised with Grimme's D3(BJ) dispersion correction.
OPTIMISED = 'B3LYP-D3(BJ)/def2-TZVP optimised (PySCF + geomeTRIC)'
```

`tools/molecules/optimise.py`: replace the module docstring's first line `B3LYP/def2-TZVP geometries for the library's seven optimised molecules.` with `B3LYP-D3(BJ)/def2-TZVP geometries for the library's seven optimised molecules (Phase 6D).`; replace `from library import LibraryMolecule, by_id` with

```python
from dispersion import XC, ensure_d3, method_label
from library import LibraryMolecule, by_id
```

replace `FINAL_BASIS = 'def2-TZVP'` with

```python
FINAL_BASIS = 'def2-TZVP'
FINAL_METHOD = f'{method_label(XC)}/{FINAL_BASIS}'
```

replace `def make_dft(mol, xc='B3LYP'):` and its first line with

```python
def make_dft(mol, xc=XC):
    from pyscf import dft
    if 'D3' in xc.upper():
        ensure_d3()
```

replace `def optimise_steps(entry: LibraryMolecule, maxsteps=4, basis=FINAL_BASIS, xc='B3LYP'):` with `def optimise_steps(entry: LibraryMolecule, maxsteps=4, basis=FINAL_BASIS, xc=XC):`, and in it `method={xc}/{basis}` with `method={method_label(xc)}/{basis}`. In `geometry_for`, replace

```python
    if not fields.get('method', '').endswith(FINAL_BASIS):
        raise RuntimeError(f'{entry.id}: geometry is at {fields.get("method")}, not {FINAL_BASIS}; continue at {FINAL_BASIS}')
```

with

```python
    if fields.get('method') != FINAL_METHOD:
        raise RuntimeError(f'{entry.id}: geometry is at {fields.get("method")}, not {FINAL_METHOD}; '
                           f'run `tools/molecules/in_image.sh tools/molecules/optimise.py {entry.id}` until converged')
```

`tools/molecules/generate.py`: replace `git_commit` with

```python
def git_commit():
    # Phase 6D: the library is generated inside the worker image, which has no git; tools/molecules/in_image.sh
    # works out the same answer on the host (HEAD, '-dirty' when tools/molecules is dirty) and passes it in.
    supplied = os.environ.get('MOLECULES_GENERATOR_COMMIT')
    if supplied:
        return supplied
    sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO_ROOT, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(['git', 'status', '--porcelain', 'tools/molecules'], cwd=REPO_ROOT,
                           capture_output=True, text=True).stdout.strip()
    return sha + ('-dirty' if dirty else '')
```

and add `import os` beside `import argparse`.

`tools/molecules/build_library.py`: add `import dispersion` beside the other local imports, and after `PROPERTY_BASIS = 'def2-TZVPD'` add

```python
# Phase 6D (spec §6): B3LYP-D3(BJ). D3 moves energies and forces only; density, ESP and orbitals at a given
# geometry are B3LYP's own, so the method string names both and meta.dispersion says how much it added.
XC = dispersion.XC
# Spec §5: a bond or angle of a geometry taken from experiment, compared with that same experiment, is a
# transcription check, not a test of the method; such rows say so and no summary may count them.
NOT_A_TEST = 'geometry from experiment (not a test of the method)'
```

change `def build_molecule(entry, out_root=OUT_ROOT, basis=PROPERTY_BASIS, xc='B3LYP', …)` to `xc=XC`, and in it `'method': f'{xc}/{basis}'` to `'method': f'{dispersion.method_label(xc)}/{basis}'`. Add

```python
def dispersion_meta(mf):
    """meta.dispersion for an SCF whose xc carried D3(BJ) (PySCF puts the term in scf_summary), else None."""
    energy = getattr(mf, 'scf_summary', {}).get('dispersion')
    if energy is None:
        return None
    return {'model': dispersion.MODEL, 'energyHartree': float(energy), 'backend': dispersion.backend()}
```

and in `write_molecule_files`, after `extra = {…}` add `dispersed = dispersion_meta(mf)`, and in the `meta = {…}` literal after `'totalEnergyHartree': float(mf.e_tot),` add `**({'dispersion': dispersed} if dispersed else {}),`. In `validation_rows`, change the row construction to

```python
        row = {'phase': 6, 'quantity': quantity, 'system': entry.formula, 'app': round(float(app), 4),
               'reference': ref.value, 'unit': UNITS.get(ref.unit, ref.unit),
               'tolerancePercent': round(100 * ref.tolerance / abs(ref.value), 3),
               'referenceSource': ref.source, 'method': method, 'geometrySource': meta['geometrySource']}
        if ref.quantity in ('bond', 'angle') and not entry.optimised:
            row['notATest'] = NOT_A_TEST
```

and add `'geometrySource': meta['geometrySource']` to the density-integral row's dict.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_optimise.py tools/molecules/tests/test_build_library.py -q`
Expected: all pass (about a minute).

- [ ] **Step 5: Regenerate the committed validation rows from the data on disk**

`tools/molecules/tests/test_library_data.py::test_rows_file_is_current` compares the committed rows with `validation_rows` over `out/v2`'s metas, so the new fields must land in the committed file now (Task 14 regenerates it from v3).

Run: `tools/molecules/.venv/bin/python tools/molecules/build_library.py --rows-only`
Expected: `NNN validation rows` and a diff in `src/validation/generated/phase6_library.json` only (new `geometrySource` and `notATest` keys). It reads `out/v2`; it writes nothing under `tools/molecules/out/`.

Then: `tools/molecules/.venv/bin/python -m pytest tools/molecules tools/jobs -q` and `npx jest tests/validation` — all pass.

- [ ] **Step 6: Commit**

```bash
git add tools/molecules/library.py tools/molecules/optimise.py tools/molecules/build_library.py tools/molecules/generate.py tools/molecules/tests/test_optimise.py tools/molecules/tests/test_build_library.py src/validation/generated/phase6_library.json
git commit -m "feat(molecules): B3LYP-D3(BJ) for the library; validation rows name their geometry source (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: input.py — D3, symmetry-free geometry work, UKS for open shells, the time-limit stop

**Estimate:** 75 min (the template tests run about 30 s).

**Files:**
- Rewrite: `tools/jobs/input_template.py`
- Modify: `tools/jobs/tests/test_input_template.py`

**Interfaces:**
- Consumes: Task 1's `dispersion.ensure_d3` (imported by `input.py` only where `pyscf.dispersion` is missing, i.e. macOS; the worker puts `tools/molecules` on `sys.path`).
- Produces (the rendered `input.py`'s namespace, which the worker and Task 7 use):
  - constants `XC`, `BASIS`, `OPTIMISE_BASIS`, `FREQUENCY_CHECK` (True for recipe `optimise` when `job['computeVersion'] >= 2`)
  - `molecule(atoms, basis, symmetry=True)`, `make_dft(mol)` (RKS/ROKS), `geometry_dft(mol)` (UKS for an open shell when `FREQUENCY_CHECK`, else `make_dft`), `converge(mol, on_stage)`
  - `optimise(atoms, on_stage, on_step, may_start=_always, label='optimisation step', first=1) -> (atoms, info)`: `info` is `{'steps', 'converged': True}` or, when `may_start('step')` says no after a step, `{'steps', 'converged': False, 'stoppedBy': 'time-limit', 'maxGradient': float}` (Ha/bohr)
  - `build(on_stage=_quiet, on_step=…, start=None, may_start=_always) -> (mol, mf, info)`
  - `class TimeLimitReached(Exception)` (raised and caught inside `optimise`)
- Produces (`render_input(job, key, start=None, resumed_from=None) -> str`): unchanged signature; `TEMPLATE` is now a `string.Template`.

- [ ] **Step 1: Write the failing tests**

In `tools/jobs/tests/test_input_template.py`, replace `test_rendered_script_is_self_describing` with:

```python
def test_rendered_script_is_self_describing():
    text = render_input(canonical_job('single', H2, 0, 1), 'k' * 64)
    assert "BASIS = 'def2-TZVPD'" in text and 'OPTIMISE_BASIS = None' in text
    assert f"XC = {canonical_job('single', H2, 0, 1)['method']['xc']!r}" in text
    assert 'FREQUENCY_CHECK = False' in text
    assert "('H', (0.0, 0.0, 0.74))" in text and 'kkkk' in text
    compile(text, 'input.py', 'exec')


def test_recipe_b_checks_its_structure_only_from_compute_version_2():
    job = canonical_job('optimise', H2, 0, 1)
    assert 'FREQUENCY_CHECK = True' in render_input({**job, 'computeVersion': 2}, 'k' * 64)
    assert 'FREQUENCY_CHECK = False' in render_input({**job, 'computeVersion': 1}, 'k' * 64)
```

and append:

```python
OPT = {'xc': 'B3LYP', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'}
H2O2 = [[8, 0.0, 0.0, 0.0], [8, 1.45, 0.0, 0.0], [1, -0.32, 0.92, 0.0], [1, 1.77, -0.92, 0.0]]   # trans, C2h


def _namespace(tmp_path, monkeypatch, job):
    monkeypatch.chdir(tmp_path)
    (tmp_path / 'input.py').write_text(render_input(job, 'k' * 64))
    return runpy.run_path('input.py', run_name='jobs_input')


def test_the_optimisation_builds_its_molecule_without_symmetry(tmp_path, monkeypatch):
    # Phase 6D spec §8: PySCF's geomeTRIC engine holds every geometry to the starting point group.
    # (Compute version 1 here: no frequency check follows, so the build stops at the optimisation.)
    ns = _namespace(tmp_path, monkeypatch, {**canonical_job('optimise', H2, 0, 1, method=OPT), 'computeVersion': 1})
    import pyscf.geomopt.geometric_solver as gs
    seen = []

    def record(mf, **kwargs):
        seen.append(mf.mol.symmetry)
        return True, mf.mol
    monkeypatch.setattr(gs, 'kernel', record)
    mol, mf, info = ns['build']()
    assert seen == [False] and mol.symmetry and info == {'steps': 0, 'converged': True}


def dihedral(p0, p1, p2, p3):
    b0, b1, b2 = p0 - p1, p2 - p1, p3 - p2
    b1 = b1 / np.linalg.norm(b1)
    v, w = b0 - (b0 @ b1) * b1, b2 - (b2 @ b1) * b1
    return abs(np.degrees(np.arctan2(np.cross(b1, v) @ w, v @ w)))


def test_a_dihedral_constraint_moves_in_the_geometry_molecule(tmp_path, monkeypatch):
    # Spec §12's regression (scans research §4.2, pitfall 1): with symmetry on, trans-H2O2 driven to a
    # 120° H-O-O-H dihedral "converged" at 180°. The geometry molecule must let it move.
    ns = _namespace(tmp_path, monkeypatch, canonical_job('optimise', H2O2, 0, 1, method=OPT))
    from pyscf.geomopt.geometric_solver import kernel as geometric_kernel
    (tmp_path / 'constraints.txt').write_text('$set\ndihedral 3 1 2 4 120.0\n')
    atoms = [(s, xyz) for s, xyz in ns['ATOMS']]
    mol = ns['molecule'](atoms, 'sto-3g', symmetry=False)
    converged, final = geometric_kernel(ns['geometry_dft'](mol), constraints='constraints.txt', maxsteps=50)
    c = final.atom_coords(unit='Angstrom')
    assert converged and dihedral(c[2], c[0], c[1], c[3]) == pytest.approx(120.0, abs=0.5)


def test_b3lyp_d3bj_adds_its_dispersion_energy(tmp_path, monkeypatch):
    ns = _namespace(tmp_path, monkeypatch, canonical_job('single', H2O2, 0, 1,
                                                           method={'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g', 'optimiseBasis': None}))
    mol, mf, _ = ns['build']()
    assert mf.converged and -0.01 < mf.scf_summary['dispersion'] < 0


def test_an_open_shell_runs_its_geometry_work_uks_only_when_it_will_be_checked(tmp_path, monkeypatch):
    oh = [[8, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.98]]
    job = canonical_job('optimise', oh, 0, 2, method=OPT)
    ns = _namespace(tmp_path, monkeypatch, {**job, 'computeVersion': 2})
    mol = ns['molecule']([('O', (0.0, 0.0, 0.0)), ('H', (0.0, 0.0, 0.98))], 'sto-3g', symmetry=False)
    assert type(ns['geometry_dft'](mol)).__name__.endswith('UKS')
    assert type(ns['make_dft'](mol)).__name__.endswith('ROKS')
    ns = _namespace(tmp_path, monkeypatch, {**job, 'computeVersion': 1})
    assert type(ns['geometry_dft'](mol)).__name__.endswith('ROKS')


def test_a_refused_step_ends_the_optimisation_with_its_last_geometry(tmp_path, monkeypatch):
    # Spec §9: the budget is asked after every step; a no keeps that step's geometry, marked not converged.
    ns = _namespace(tmp_path, monkeypatch, canonical_job('optimise', [[1, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.9]], 0, 1, method=OPT))
    asked, steps = [], []
    mol, mf, info = ns['build'](on_step=lambda n, e, a: steps.append(a),
                                may_start=lambda stage: asked.append(stage) or False)
    assert asked == ['step'] and len(steps) == 1
    assert info['steps'] == 1 and info['converged'] is False and info['stoppedBy'] == 'time-limit'
    assert info['maxGradient'] > 1e-3
    assert mf.converged and abs(mol.atom_coord(1)[2] - mol.atom_coord(0)[2]) * 0.529177 == pytest.approx(
        abs(steps[0][1][1][2] - steps[0][0][1][2]), abs=1e-6)
```

Add `import numpy as np` to the file's imports.

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_input_template.py -q`
Expected: the new tests fail (`FREQUENCY_CHECK` absent, `molecule()` takes no `symmetry`, no `geometry_dft`, `build()` takes no `may_start`).

- [ ] **Step 3: Rewrite `tools/jobs/input_template.py`**

```python
"""Renders input.py: the exact PySCF script a job runs (spec §8.3).

The worker writes this file and then executes it, so what the owner reads
is what ran, not a description of it. It runs on its own with PySCF,
geomeTRIC and pyscf-dispersion installed and reproduces the SCF (and, for
recipe B from compute version 2, the structure check); grids, ESP and the
orbital table come from tools/molecules/build_library.py at the commit in
provenance.

Phase 6D: the template is a string.Template ($name), so the script's own
Python keeps its braces as written.
"""
from string import Template

from jobs.elements import SYMBOLS

TEMPLATE = '''"""Job $key

Recipe $recipe: $description
Reproduce with PySCF 2.8, geomeTRIC and pyscf-dispersion installed:  python input.py
Generated by electron-orbital-viewer tools/jobs (spec 2026-10-05 on-demand generation; Phase 6D).
"""
import numpy
from pyscf import dft, gto

${resumed}ATOMS = $atoms   # Å
CHARGE = $charge
SPIN = $spin   # 2S = multiplicity - 1
XC = $xc
BASIS = $basis
OPTIMISE_BASIS = $optimise_basis
FREQUENCY_CHECK = $frequency_check   # recipe B from compute version 2 (Phase 6D spec §7)
MAX_STEPS = 100
MAX_CYCLES = (100, 200, 50)   # DIIS, level shift, second order
LOG = 'output.log'
_log = None


class SCFNotConverged(RuntimeError):
    pass


class OptimisationNotConverged(RuntimeError):
    pass


class TimeLimitReached(Exception):
    """Raised from geomeTRIC's callback when the job's time budget will not cover another step (spec §9)."""

    def __init__(self, frame, max_gradient):
        super().__init__('the time limit is near')
        self.frame, self.max_gradient = frame, max_gradient


def _quiet(stage, energy=None, cycles=None):
    pass


def _always(stage):
    return True


def _dispersion():
    # PySCF adds D3(BJ) through pyscf-dispersion (Linux wheels, the worker image). It has no build that runs
    # on Apple-silicon macOS, where tools/molecules/dispersion.py stands in with the dftd3 package.
    if 'D3' not in XC.upper():
        return
    try:
        import pyscf.dispersion.dftd3  # noqa: F401
    except ImportError:
        from dispersion import ensure_d3
        ensure_d3()


def molecule(atoms, basis, symmetry=True):
    # Phase 6D spec §8: geometry work (the optimisation, the frequency check) runs with symmetry off --
    # PySCF's geomeTRIC engine holds every geometry to the starting point group, so a structure could not
    # leave it. The final SCF keeps symmetry on, for its orbital labels.
    global _log
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, charge=CHARGE, spin=SPIN, symmetry=symmetry, verbose=0)
    _log = _log or open(LOG, 'a')     # one log for every molecule built, appended in order
    mol.stdout, mol.verbose = _log, 4
    return mol


def close_log():
    global _log
    if _log:
        _log.close()
    _log = None


def make_dft(mol):
    # As tools/molecules/optimise.make_dft: RKS for closed shells, ROKS (one orbital set) for open ones.
    _dispersion()
    mf = dft.RKS(mol) if mol.spin == 0 else dft.ROKS(mol)
    mf.xc = XC
    mf.grids.level = 4
    mf.conv_tol = 1e-10
    return mf


def geometry_dft(mol):
    # The optimisation's and the frequency check's SCF. PySCF 2.8 has no ROKS Hessian, so an open shell
    # whose structure will be checked does its geometry work UKS; its final SCF stays ROKS (make_dft).
    if mol.spin == 0 or not FREQUENCY_CHECK:
        return make_dft(mol)
    _dispersion()
    mf = dft.UKS(mol)
    mf.xc = XC
    mf.grids.level = 4
    mf.conv_tol = 1e-10
    return mf


def converge(mol, on_stage):
    rungs = (('DIIS', {}), ('level shift 0.3 Ha', {'level_shift': 0.3}), ('second-order', None))
    dm = None
    for (label, options), cycles in zip(rungs, MAX_CYCLES):
        stage = f'SCF ({label})'
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


def _frame(m):
    coords = m.atom_coords(unit='Angstrom')
    return [(m.atom_pure_symbol(i), tuple(float(c) for c in coords[i])) for i in range(m.natm)]


def optimise(atoms, on_stage, on_step, may_start=_always, label='optimisation step', first=1):
    from pyscf.geomopt.geometric_solver import kernel as geometric_kernel
    from pyscf.geomopt.geometric_solver import NotConvergedError
    mol = molecule(atoms, OPTIMISE_BASIS, symmetry=False)
    steps = []
    # Each stage '<label> k' runs from the start of step k (SCF + gradient) to its end, when geomeTRIC calls
    # back; it is told that step's SCF cycle count. The last one is geomeTRIC's wrap-up. After each step the
    # time budget is asked (spec §9): a no ends the run here, with this step's geometry.
    on_stage(f'{label} {first}', None)

    def callback(envs):
        frame = _frame(envs['mol'])
        steps.append(frame)
        n = first + len(steps) - 1
        cycles = getattr(getattr(envs.get('g_scanner'), 'base', None), 'cycles', None)
        on_stage(f'{label} {n}', float(envs['energy']), cycles)
        on_step(n, float(envs['energy']), frame)
        if not may_start('step'):
            raise TimeLimitReached(frame, float(numpy.abs(envs['gradients']).max()))
        on_stage(f'{label} {n + 1}', None)

    try:
        converged, mol_eq = geometric_kernel(geometry_dft(mol), maxsteps=MAX_STEPS, callback=callback)
    except TimeLimitReached as stop:
        return stop.frame, {'steps': len(steps), 'converged': False, 'stoppedBy': 'time-limit',
                            'maxGradient': stop.max_gradient}
    except NotConvergedError as e:      # geomeTRIC raises this past MAX_STEPS; anything else propagates
        raise OptimisationNotConverged(f'optimisation did not converge in {MAX_STEPS} steps ({e})')
    if not converged:
        raise OptimisationNotConverged(f'optimisation did not converge in {MAX_STEPS} steps')
    return _frame(mol_eq), {'steps': len(steps), 'converged': True}


def build(on_stage=_quiet, on_step=lambda step, energy, atoms: None, start=None, may_start=_always):
    atoms, info = (start or ATOMS), {}
    if OPTIMISE_BASIS:
        atoms, info = optimise(atoms, on_stage, on_step, may_start)
    mol = molecule(atoms, BASIS)
    mf = converge(mol, on_stage)
    return mol, mf, info


if __name__ == '__main__':
    mol, mf, info = build(on_stage=lambda stage, energy=None, cycles=None: print(stage, '' if energy is None else energy))
    print('E =', mf.e_tot, 'Ha', {k: v for k, v in info.items() if k != 'frequencies'})
    close_log()
'''


def _description(job: dict, frequency_check: bool) -> str:
    xc = job['method']['xc']
    if job['recipe'] == 'single':
        return f'one {xc} SCF at the given geometry'
    check = ', a frequency check that confirms a minimum' if frequency_check else ''
    return f'{xc} geomeTRIC optimisation in OPTIMISE_BASIS (symmetry off){check}, then one SCF in BASIS'


def render_input(job: dict, key: str, start=None, resumed_from: int | None = None) -> str:
    """`start` replaces the submitted geometry (a resumed optimisation, M4);
    `resumed_from` names the attempt it came from, so the script that ran
    says where its ATOMS came from rather than passing them off as the
    submitted molecule."""
    mol, method = job['molecule'], job['method']
    atoms = start or [(SYMBOLS[a[0] - 1], (a[1], a[2], a[3])) for a in mol['atoms']]
    resumed = ''
    if start and resumed_from is not None:
        resumed = f"# Resumed from attempt {resumed_from}'s last trajectory frame, not the submitted geometry.\n"
    # Phase 6D spec §7: recipe B checks its structure from compute version 2. A version-1 job (the owner's
    # retry of one) keeps the recipe it was approved and priced under.
    frequency_check = job['recipe'] == 'optimise' and job.get('computeVersion', 1) >= 2
    return Template(TEMPLATE).substitute(
        key=key, recipe=job['recipe'], description=_description(job, frequency_check), resumed=resumed,
        atoms=repr([(s, tuple(float(c) for c in xyz)) for s, xyz in atoms]), charge=mol['charge'],
        spin=mol['multiplicity'] - 1, xc=repr(method['xc']), basis=repr(method['basis']),
        optimise_basis=repr(method['optimiseBasis']), frequency_check=repr(frequency_check))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_input_template.py -q`
Expected: all pass (about 30 s). Then `JOBS_SLOW=1 tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_input_template.py -q -k standalone` — passes (the standalone `python input.py` run).

Then `tools/molecules/.venv/bin/python -m pytest tools/jobs -q` (a few minutes) — all pass: `test_worker.py::test_meta_records_method_commit_and_a_flushed_log` patches `close_log`'s two lines, which this template keeps verbatim.

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/input_template.py tools/jobs/tests/test_input_template.py
git commit -m "feat(jobs): input.py runs geometry work without symmetry, D3(BJ), and stops in time (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: input.py — the frequency check

**Estimate:** 75 min (the new tests run about 45 s; the ethanol one, behind `JOBS_SLOW`, about 2 min).

**Files:**
- Modify: `tools/jobs/input_template.py` (inside `TEMPLATE`)
- Test: `tools/jobs/tests/test_frequency_check.py`

**Interfaces:**
- Consumes: Task 6's template (`molecule`, `geometry_dft`, `optimise`, `may_start`, `FREQUENCY_CHECK`); PySCF's `mf.Hessian()` (RKS/UKS, D3 included by finite differences) and `pyscf.hessian.thermo.harmonic_analysis(mol, hess, imaginary_freq=False)`.
- Produces (in `input.py`), for Task 8:
  - constants `NOISE_WAVENUMBER = -50.0`, `DISPLACEMENT_ANGSTROM = 0.1`, `WAVENUMBERS_PER_HARTREE = 219474.6313705`
  - `on_axis(atoms) -> (atoms, axes | None)` (a linear molecule laid exactly on z for PySCF's rotor test)
  - `frequency_check(atoms, on_stage, stage='frequency check') -> dict` with `atoms`, `energyHartree`, `wavenumbers` (cm⁻¹, imaginary as negative, ascending), `reducedMasses` (amu), `normalModes` (list per mode of per-atom [dx, dy, dz]), `imaginary` (< −50), `noise` (−50 ≤ v < 0), `zeroPointEnergyHartree`
  - `summarise(check, displaced_from=None) -> dict` with `result` (`'minimum'|'minimum-after-displacement'|'saddle-point'`), `summary`, `imaginaryCount`, `imaginaryWavenumbers`, `noiseWavenumbers`, `lowestWavenumber`, `zeroPointEnergyHartree`
  - `check_structure(atoms, info, on_stage, on_step, may_start) -> (atoms, info)` adding `info['frequencyCheck']` (a summary dict, or `{'result': 'not-run'|'not-rechecked', 'summary', …}`), `info['frequencies']` (the `frequency_check` dict behind it) and, after a displacement, `info['displacedFrom']`
  - `build()` calls `check_structure` after `optimise` when `FREQUENCY_CHECK`
  - stage names: `'frequency check'`, `'displacing from a saddle point'`, `'re-optimisation step k'`, `'frequency check (after displacement)'`

- [ ] **Step 1: Write the failing test**

Create `tools/jobs/tests/test_frequency_check.py`:

```python
"""Recipe B's frequency check (Phase 6D spec §7), run through the rendered input.py itself."""
import os
import runpy
from pathlib import Path

import numpy as np
import pytest

from jobs.canonical import canonical_job
from jobs.input_template import render_input

WATER = [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]
PLANAR_NH3 = [[7, 0.0, 0.0, 0.0], [1, 1.01, 0.0, 0.0], [1, -0.505, 0.8747, 0.0], [1, -0.505, -0.8747, 0.0]]
CHECKED = {'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g', 'optimiseBasis': 'def2-SVP'}   # final SCF kept small
# Water's harmonic frequencies, experiment (CCCBDB: ω2, ω1, ω3), cm-1.
WATER_OMEGA = (1648.5, 3832.2, 3942.5)


def namespace(tmp_path, monkeypatch, atoms, multiplicity=1, method=CHECKED):
    monkeypatch.chdir(tmp_path)
    job = {**canonical_job('optimise', atoms, 0, multiplicity, method=method), 'computeVersion': 2}
    (tmp_path / 'input.py').write_text(render_input(job, 'k' * 64))
    return runpy.run_path('input.py', run_name='jobs_input')


def test_water_is_a_true_minimum_with_frequencies_near_experiment(tmp_path, monkeypatch):
    stages = []
    mol, mf, info = namespace(tmp_path, monkeypatch, WATER)['build'](on_stage=lambda s, e=None, c=None: stages.append(s))
    check = info['frequencyCheck']
    assert check['result'] == 'minimum' and check['summary'] == 'true minimum (no imaginary frequencies)'
    assert check['imaginaryCount'] == 0 and 'frequency check' in stages
    wavenumbers = info['frequencies']['wavenumbers']
    assert len(wavenumbers) == 3
    for computed, experiment in zip(sorted(wavenumbers), WATER_OMEGA):
        assert abs(computed - experiment) / experiment < 0.05               # spec §12: within 5 %
    assert check['zeroPointEnergyHartree'] == pytest.approx(0.5 * sum(wavenumbers) / 219474.6313705)
    assert len(info['frequencies']['normalModes']) == 3 and len(info['frequencies']['normalModes'][0]) == 3
    assert info['frequencies']['reducedMasses'][0] > 1.0


def test_a_planar_ammonia_is_detected_displaced_and_reoptimised_to_the_pyramid(tmp_path, monkeypatch):
    # Spec §12: a planar start converges to the D3h saddle point; one imaginary mode (the umbrella) takes it
    # to the C3v minimum.
    steps = []
    mol, mf, info = namespace(tmp_path, monkeypatch, PLANAR_NH3)['build'](on_step=lambda n, e, a: steps.append(n))
    check = info['frequencyCheck']
    assert check['result'] == 'minimum-after-displacement' and info['displacedFrom'] == 1
    assert check['summary'] == ('true minimum (no imaginary frequencies), reached by displacing a saddle point '
                                '(1 imaginary) and re-optimising')
    c = mol.atom_coords(unit='Angstrom')
    normal = np.cross(c[2] - c[1], c[3] - c[1])
    assert abs((c[0] - c[1]) @ normal / np.linalg.norm(normal)) > 0.3          # N well out of the H3 plane
    umbrella = min(info['frequencies']['wavenumbers'])
    assert 950 < umbrella < 1150
    assert steps == list(range(1, len(steps) + 1)) and info['steps'] == len(steps)   # one numbering across both runs


def test_a_saddle_that_survives_reoptimisation_is_labelled_a_saddle(tmp_path, monkeypatch):
    ns = namespace(tmp_path, monkeypatch, WATER)
    live = ns['check_structure'].__globals__
    real = live['frequency_check']

    def always_saddle(atoms, on_stage, stage='frequency check'):
        out = real(atoms, on_stage, stage)
        return {**out, 'imaginary': [-400.0], 'wavenumbers': [-400.0] + out['wavenumbers'][1:]}
    live['frequency_check'] = always_saddle
    _, _, info = ns['build']()
    assert info['frequencyCheck']['result'] == 'saddle-point'
    assert info['frequencyCheck']['summary'] == 'saddle point (1 imaginary frequency), not a minimum'
    assert info['displacedFrom'] == 1


def test_small_imaginary_values_are_noise_not_a_saddle(tmp_path, monkeypatch):
    summarise = namespace(tmp_path, monkeypatch, WATER)['summarise']
    check = {'imaginary': [], 'noise': [-31.0], 'wavenumbers': [-31.0, 1600.0, 3800.0], 'zeroPointEnergyHartree': 0.012}
    out = summarise(check)
    assert out['result'] == 'minimum' and out['lowestWavenumber'] == -31.0
    assert out['summary'] == ('true minimum (no imaginary frequencies); 1 small imaginary value above -50 cm-1 '
                              'treated as numerical noise')


def test_no_time_for_the_check_says_so_and_skips_it(tmp_path, monkeypatch):
    stages = []
    _, mf, info = namespace(tmp_path, monkeypatch, WATER)['build'](
        on_stage=lambda s, e=None, c=None: stages.append(s), may_start=lambda stage: stage != 'frequency check')
    assert info['frequencyCheck'] == {'result': 'not-run', 'summary': 'not checked: no time was left for the frequency check'}
    assert 'frequencies' not in info and 'frequency check' not in stages and mf.converged


def test_a_stopped_optimisation_is_not_checked(tmp_path, monkeypatch):
    _, _, info = namespace(tmp_path, monkeypatch, PLANAR_NH3)['build'](may_start=lambda stage: False)
    assert info['stoppedBy'] == 'time-limit'
    assert info['frequencyCheck'] == {'result': 'not-run', 'summary': 'not checked: the optimisation stopped at its time limit'}


def test_an_open_shell_is_checked_with_uks(tmp_path, monkeypatch):
    # Review Focus 3: PySCF 2.8 has no ROKS Hessian; OH's geometry work runs UKS, its final SCF ROKS.
    oh = [[8, 0.0, 0.0, 0.0], [1, 0.0, 0.0, 0.98]]
    mol, mf, info = namespace(tmp_path, monkeypatch, oh, multiplicity=2,
                              method={'xc': 'B3LYP-D3BJ', 'basis': 'sto-3g', 'optimiseBasis': 'sto-3g'})['build']()
    assert info['frequencyCheck']['result'] == 'minimum' and len(info['frequencies']['wavenumbers']) == 1
    assert type(mf).__name__.endswith('ROKS')


def test_a_linear_molecule_is_laid_on_an_exact_axis_and_keeps_its_3n_minus_5_modes(tmp_path, monkeypatch):
    # An optimised CO2 is linear only to numerical noise; PySCF would then take it for a non-linear rotor.
    ns = namespace(tmp_path, monkeypatch, WATER)
    noisy = [('O', (0.0, 1e-7, -1.16)), ('C', (2e-8, 0.0, 0.0)), ('O', (0.0, -1e-7, 1.16))]
    placed, axes = ns['on_axis'](noisy)
    assert axes is not None and all(x == y == 0.0 for _, (x, y, _) in placed)
    assert [round(abs(z), 6) for _, (_, _, z) in placed] == [1.16, 0.0, 1.16]
    assert ns['on_axis']([('O', (0.0, 0.0, 0.0)), ('H', (0.0, 0.76, 0.59)), ('H', (0.0, -0.76, 0.59))])[1] is None
    check = ns['frequency_check'](noisy, lambda *a: None)
    assert len(check['wavenumbers']) == 4 and len(check['normalModes'][0]) == 3


@pytest.mark.skipif(os.environ.get('JOBS_SLOW') != '1', reason='ethanol: optimisation and Hessian, about 2 min')
def test_ethanol_is_a_true_minimum(tmp_path, monkeypatch):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'molecules'))
    from optimise import read_xyz
    from jobs.elements import atomic_number
    atoms = [[atomic_number(s), *xyz] for s, xyz in read_xyz(Path(__file__).resolve().parents[2] / 'molecules' / 'geometries' / 'ethanol.xyz')[0]]
    _, _, info = namespace(tmp_path, monkeypatch, atoms)['build']()
    assert info['frequencyCheck']['result'] == 'minimum' and len(info['frequencies']['wavenumbers']) == 21
```

- [ ] **Step 2: Run it to verify it fails**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_frequency_check.py -q`
Expected: failures — `KeyError: 'frequencyCheck'` and `KeyError: 'check_structure'`/`'summarise'`.

- [ ] **Step 3: Add the check to the template**

In `TEMPLATE`, replace

```python
MAX_CYCLES = (100, 200, 50)   # DIIS, level shift, second order
```

with

```python
MAX_CYCLES = (100, 200, 50)   # DIIS, level shift, second order
NOISE_WAVENUMBER = -50.0      # cm-1: imaginary values above this are numerical noise, not a saddle point (spec §7)
DISPLACEMENT_ANGSTROM = 0.1   # the largest atomic displacement along the imaginary mode (spec §7)
WAVENUMBERS_PER_HARTREE = 219474.6313705
```

Insert, immediately before `def build(`:

```python
def _scf_for_check(mol, stage):
    mf = geometry_dft(mol)
    mf.kernel()
    if not mf.converged:
        retry = geometry_dft(mol)
        retry.level_shift, retry.max_cycle = 0.3, 200
        retry.kernel(dm0=mf.make_rdm1())
        mf = retry
    if not mf.converged:
        raise SCFNotConverged(f'the {stage} SCF did not converge (DIIS, then level shift 0.3 Ha)')
    return mf


def on_axis(atoms):
    """A linear molecule laid exactly along z, and the axes it was laid along (rows: the molecule's own line,
    then two perpendiculars); anything else unchanged, with None. PySCF's harmonic analysis recognises a
    linear rotor only by an exactly zero moment of inertia, which an optimised geometry's numerical noise
    denies it: it would then project out six modes, not five, and lose a vibration."""
    xyz = numpy.array([c for _, c in atoms], dtype=float)
    centre = xyz.mean(axis=0)
    _, spread, axes = numpy.linalg.svd(xyz - centre)
    if len(atoms) < 2 or (len(spread) > 1 and spread[1] > 1e-4):       # Å
        return atoms, None
    along = (xyz - centre) @ axes[0]
    return [(s, (0.0, 0.0, float(t))) for (s, _), t in zip(atoms, along)], axes


def frequency_check(atoms, on_stage, stage='frequency check'):
    """Harmonic frequencies at the optimisation level (spec §7): PySCF's analytic Hessian (the D3 part by
    finite differences of its gradient), translations and rotations projected out. Normal modes come back
    in the frame of `atoms`."""
    from pyscf.hessian import thermo
    on_stage(stage, None)
    placed, axes = on_axis(atoms)
    mol = molecule(placed, OPTIMISE_BASIS, symmetry=False)
    mf = _scf_for_check(mol, stage)
    modes = thermo.harmonic_analysis(mol, mf.Hessian().kernel(), imaginary_freq=False)
    normal = numpy.asarray(modes['norm_mode'])                  # (mode, atom, xyz) in `placed`'s frame
    if axes is not None:
        normal = normal[..., [2, 0, 1]] @ axes                  # z, x, y -> along axes[0], axes[1], axes[2]
    wavenumbers = [float(v) for v in modes['freq_wavenumber']]
    return {'atoms': atoms, 'energyHartree': float(mf.e_tot), 'wavenumbers': wavenumbers,
            'reducedMasses': [float(v) for v in modes['reduced_mass']],
            'normalModes': normal.tolist(),
            'imaginary': [v for v in wavenumbers if v < NOISE_WAVENUMBER],
            'noise': [v for v in wavenumbers if NOISE_WAVENUMBER <= v < 0],
            'zeroPointEnergyHartree': 0.5 * sum(v for v in wavenumbers if v > 0) / WAVENUMBERS_PER_HARTREE}


def summarise(check, displaced_from=None):
    n = len(check['imaginary'])
    if n:
        result = 'saddle-point'
        summary = f'saddle point ({n} imaginary frequenc{"y" if n == 1 else "ies"}), not a minimum'
    else:
        result = 'minimum' if displaced_from is None else 'minimum-after-displacement'
        summary = 'true minimum (no imaginary frequencies)'
        if displaced_from is not None:
            summary += f', reached by displacing a saddle point ({displaced_from} imaginary) and re-optimising'
    noise = len(check['noise'])
    if noise:
        summary += (f'; {noise} small imaginary value{"" if noise == 1 else "s"} above {NOISE_WAVENUMBER:g} cm-1 '
                    'treated as numerical noise')
    return {'result': result, 'summary': summary, 'imaginaryCount': n, 'imaginaryWavenumbers': check['imaginary'],
            'noiseWavenumbers': check['noise'],
            'lowestWavenumber': min(check['wavenumbers']) if check['wavenumbers'] else None,
            'zeroPointEnergyHartree': check['zeroPointEnergyHartree']}


def _displaced(atoms, mode, sign):
    mode = numpy.asarray(mode, dtype=float)
    shift = sign * DISPLACEMENT_ANGSTROM * mode / numpy.abs(mode).max()
    return [(s, tuple(float(c + d) for c, d in zip(xyz, shift[i]))) for i, (s, xyz) in enumerate(atoms)]


def _lower(candidates, stage):
    best = None
    for atoms in candidates:
        mf = _scf_for_check(molecule(atoms, OPTIMISE_BASIS, symmetry=False), stage)
        if best is None or mf.e_tot < best[0]:
            best = (mf.e_tot, atoms)
    return best[1]


def check_structure(atoms, info, on_stage, on_step, may_start):
    """Spec §7: confirm the optimised structure is a minimum. From a saddle point, displace along the most
    negative mode (both signs, the lower kept), re-optimise once and check again."""
    if not info['converged']:
        return atoms, {**info, 'frequencyCheck': {'result': 'not-run',
                                                  'summary': 'not checked: the optimisation stopped at its time limit'}}
    if not may_start('frequency check'):
        return atoms, {**info, 'frequencyCheck': {'result': 'not-run',
                                                  'summary': 'not checked: no time was left for the frequency check'}}
    check = frequency_check(atoms, on_stage)
    if not check['imaginary']:
        return atoms, {**info, 'frequencyCheck': summarise(check), 'frequencies': check}
    n = len(check['imaginary'])
    on_stage('displacing from a saddle point', None)
    mode = check['normalModes'][0]       # harmonic_analysis sorts ascending: the first mode is the most negative
    start = _lower([_displaced(atoms, mode, 1), _displaced(atoms, mode, -1)], 'displacement')
    final, again = optimise(start, on_stage, on_step, may_start, label='re-optimisation step', first=info['steps'] + 1)
    info = {**info, **again, 'steps': info['steps'] + again['steps'], 'displacedFrom': n}
    if not again['converged'] or not may_start('frequency check'):
        return final, {**info, 'frequencies': check, 'frequencyCheck': {
            'result': 'not-rechecked', 'imaginaryCount': n,
            'summary': f'displaced from a saddle point ({n} imaginary) and re-optimised; not checked again (time limit)'}}
    recheck = frequency_check(final, on_stage, stage='frequency check (after displacement)')
    return final, {**info, 'frequencyCheck': summarise(recheck, displaced_from=n), 'frequencies': recheck}
```

and replace `build` with:

```python
def build(on_stage=_quiet, on_step=lambda step, energy, atoms: None, start=None, may_start=_always):
    atoms, info = (start or ATOMS), {}
    if OPTIMISE_BASIS:
        atoms, info = optimise(atoms, on_stage, on_step, may_start)
        if FREQUENCY_CHECK:
            atoms, info = check_structure(atoms, info, on_stage, on_step, may_start)
    mol = molecule(atoms, BASIS)
    mf = converge(mol, on_stage)
    return mol, mf, info
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_frequency_check.py tools/jobs/tests/test_input_template.py -q`
Expected: all pass (about 75 s). Then `JOBS_SLOW=1 tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_frequency_check.py -q -k ethanol` — passes (about 2 min).

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/input_template.py tools/jobs/tests/test_frequency_check.py
git commit -m "feat(jobs): recipe B checks for imaginary frequencies and displaces off a saddle point (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Compute version 2 and the worker

**Estimate:** 90 min (the worker tests run a few minutes: each end-to-end job is a real, small PySCF run).

**Files:**
- Modify: `tools/jobs/canonical.py`, `tools/jobs/worker.py`, `tools/jobs/sink.py`
- Modify: `tools/jobs/tests/test_canonical.py`, `tools/jobs/tests/test_worker.py`, `tools/jobs/tests/test_sink.py`, `tools/jobs/tests/test_worker_aws.py`, `tools/jobs/tests/test_handlers.py`

**Interfaces:**
- Consumes: Task 1's `dispersion.method_label`; Task 7's `input.py` (`build(…, may_start=…)` and `info` with `frequencyCheck`, `frequencies`, `stoppedBy`, `maxGradient`, `displacedFrom`); Task 5's `meta['dispersion']` (written by `write_molecule_files`); Task 9's `sizing['parts']` (`stepSeconds`, `frequencySeconds`, `finalScfSeconds`, `filesSeconds`) — absent on records sized before version 6.
- Produces:
  - `canonical.COMPUTE_VERSION = 2`; `RECIPES[…]['xc'] = 'B3LYP-D3BJ'`
  - `worker.TimeBudget(limit_seconds, parts, clock=time.monotonic)`, callable `(stage) -> bool`; `.limit`
  - `worker.time_limit(backend, sizing, given=None) -> float | None`
  - `worker.run_job(…, time_limit_seconds=None)`; CLI reads `JOBS_TIME_LIMIT_SECONDS`
  - `worker.CAVEATS`, `worker.LEGACY_OPTIMISE_CAVEATS`, `worker.caveats_for(recipe, compute_version)`
  - `worker.frequencies_payload(check, summary, method) -> dict`
  - result file `frequencies.json` (optional; listed in `done.json` when written); `sink.ROOT_RESULT_NAMES` includes it
  - `meta.json` (computed jobs): `method` `'B3LYP-D3(BJ)/def2-TZVPD'`; `frequencyCheck` (summary dict + `method`); `geometryOptimisation` without the check; `geometrySource` ending with the check's summary and, when stopped, `; optimisation stopped by its time limit, not converged (max force X Ha/bohr)`; `provenance.geometryMethod`, `provenance.frequencyCheck` (summary text), `provenance.timeLimitSeconds`

- [ ] **Step 1: Write the failing tests**

In `tools/jobs/tests/test_canonical.py`, replace `test_canonical_document_shape`'s expected dict with

```python
    assert job == {'computeVersion': 2, 'recipe': 'optimise',
                   'method': {'xc': 'B3LYP-D3BJ', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'},
                   'molecule': {'atoms': canonical_atoms(WATER), 'charge': 0, 'multiplicity': 1}}
```

and replace `test_pinned_keys` with

```python
def test_pinned_keys():
    # Pinned 2026-10-08 (compute version 2, B3LYP-D3BJ) with rfc8785 0.1.4; a change here silently orphans
    # every stored result.
    assert job_key(canonical_job('single', WATER, 0, 1)) == '4454ba8835c2df51e0045d42936b154a9db67206294f9f43deab70f15e0fd216'
    assert job_key(canonical_job('optimise', WATER, 0, 1)) == '6cb4e4a0f6ee78aeb1bc87d759e4a676b56353e045c4e9b50188ba2b7be3bb66'
    assert job_key(canonical_job('single', WATER, 1, 2)) == 'd5c67842c574236f5b2a28aec0f33325642488fb785a06ff3c5b520e705d0789'


def test_version_1_documents_keep_their_keys():
    # Phase 6D: the records and results of version-1 jobs stay addressable by the keys they were stored under.
    v1 = {'single': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': None},
          'optimise': {'xc': 'B3LYP', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'}}
    old = lambda recipe, charge, mult: job_key({**canonical_job(recipe, WATER, charge, mult, method=v1[recipe]),
                                                'computeVersion': 1})
    assert old('single', 0, 1) == 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa'
    assert old('optimise', 0, 1) == '03e7648c54cbaf4888bb69434e8fb27b5a6091792ac0179f64981300902ab129'
    assert old('single', 1, 2) == '7ccc1f468a6ecd3449b16bcb0dd483d36509971f523d770cdf3717f570753a5a'
```

In `tools/jobs/tests/test_sink.py`, append:

```python
def test_frequencies_json_is_a_root_result_name():
    # Phase 6D: a partial root may hold it, so clear_partial must know it.
    assert 'frequencies.json' in ROOT_RESULT_NAMES
```

In `tools/jobs/tests/test_worker_aws.py`, `test_aws_mode_builds_dynamo_and_s3_from_the_environment`'s stand-in must take the new argument: change its `def fake_run_job(key, store, sink, attempt, backend, grid_points, image_digest, runner_job_id, first_attempt):` to `def fake_run_job(key, store, sink, attempt, backend, grid_points, image_digest, runner_job_id, first_attempt, time_limit_seconds):`, and add `assert seen['time_limit'] is None` after its `worker.main(…)` assertion, with `time_limit=time_limit_seconds` added to its `seen.update(…)`.

In `tools/jobs/tests/test_handlers.py`, compute version 2 moves water's key: replace `WATER_KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa'` with `WATER_KEY = '4454ba8835c2df51e0045d42936b154a9db67206294f9f43deab70f15e0fd216'`.

In `tools/jobs/tests/test_worker.py`, replace `queue` with

```python
def queue(store, atoms, charge=0, mult=1, method=SVP, recipe='single', decision=DECISION, compute_version=None):
    job = canonical_job(recipe, atoms, charge, mult, method=method)
    if compute_version is not None:
        job = {**job, 'computeVersion': compute_version}
    key = job_key(job)
    store.create_job(new_record(key=key, job=job, decision=decision, name='hydrogen', formula='H2', electron_count=2,
                                geometry_source={'kind': 'xyz'}, backend='local', now=NOW))
    return key
```

and append:

```python
DECISION_V6 = {**DECISION, 'version': 6,
               'parts': {'stepSeconds': 1.0, 'frequencySeconds': 1.0, 'finalScfSeconds': 1.0, 'filesSeconds': 1.0}}
STRETCHED_H2 = [[1, 0, 0, 0], [1, 0, 0, 0.80]]


def test_an_optimise_job_checks_its_structure_and_writes_frequencies(env):
    store, sink, jobs = env
    key = queue(store, STRETCHED_H2, method=None, recipe='optimise')
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    root = jobs / key
    assert 'frequencies.json' in json.loads((root / 'done.json').read_text())['files']
    meta = json.loads((root / 'meta.json').read_text())
    assert meta['method'] == {'density': 'B3LYP-D3(BJ)/def2-TZVPD', 'energies': 'B3LYP-D3(BJ)/def2-TZVPD'}
    assert meta['dispersion']['model'] == 'D3(BJ)'
    assert meta['frequencyCheck']['result'] == 'minimum' and meta['frequencyCheck']['method'] == 'B3LYP-D3(BJ)/def2-SVP'
    assert meta['geometrySource'] == ('B3LYP-D3(BJ)/def2-SVP optimised from pasted XYZ; '
                                      'true minimum (no imaginary frequencies)')
    assert set(meta['geometryOptimisation']) == {'steps', 'converged'} and meta['geometryOptimisation']['converged']
    provenance = meta['provenance']
    assert provenance['computeVersion'] == 2 and provenance['geometryMethod'] == 'B3LYP-D3(BJ)/def2-SVP'
    assert provenance['frequencyCheck'] == 'true minimum (no imaginary frequencies)'
    assert provenance['timeLimitSeconds'] is None and provenance['caveats'] == worker.CAVEATS['optimise']
    frequencies = json.loads((root / 'frequencies.json').read_text())
    assert frequencies['method'] == 'B3LYP-D3(BJ)/def2-SVP' and len(frequencies['wavenumbers']) == 1
    assert frequencies['geometryAngstrom'][0][0] == 'H' and frequencies['zeroPointEnergyHartree'] > 0
    assert len(frequencies['normalModes'][0]) == 2 and frequencies['result'] == 'minimum'


def test_a_forced_short_time_limit_ends_done_not_converged_with_files(env):
    # Spec §12 / Review Focus 4: the budget refuses the next step; the job still ends DONE, with every file.
    store, sink, jobs = env
    key = queue(store, STRETCHED_H2, method=None, recipe='optimise', decision=DECISION_V6)
    assert run_job(key, store, sink, grid_points=(32,), time_limit_seconds=1.0) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    optimisation = meta['geometryOptimisation']
    assert optimisation['converged'] is False and optimisation['stoppedBy'] == 'time-limit' and optimisation['steps'] == 1
    assert meta['frequencyCheck']['result'] == 'not-run'
    assert 'optimisation stopped by its time limit, not converged (max force ' in meta['geometrySource']
    assert meta['provenance']['timeLimitSeconds'] == 1.0
    names = set(json.loads((jobs / key / 'done.json').read_text())['files'])
    assert {'meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz', 'trajectory.xyz'} <= names
    assert 'frequencies.json' not in names and store.get_job(key)['status'] == 'DONE'


def test_a_record_sized_before_version_6_has_no_time_budget():
    assert worker.TimeBudget(1.0, None)('step') and worker.TimeBudget(1.0, None)('frequency check')
    assert worker.TimeBudget(None, DECISION_V6['parts'])('step')


def test_the_budget_counts_the_step_the_check_the_final_scf_and_the_files():
    now = [0.0]
    parts = {'stepSeconds': 10.0, 'frequencySeconds': 20.0, 'finalScfSeconds': 30.0, 'filesSeconds': 40.0}
    budget = worker.TimeBudget(1000.0, parts, clock=lambda: now[0])
    # Left = 1000 - 30 (start-up) - elapsed; a step needs 1.2 x (10 + 20 + 30 + 40) = 120, the check 1.2 x 90 = 108.
    now[0] = 1000 - 30 - 120
    assert budget('step')
    now[0] += 0.01
    assert not budget('step') and budget('frequency check')
    now[0] = 1000 - 30 - 108 + 0.01
    assert not budget('frequency check')


def test_the_time_limit_is_the_batch_timeout_on_aws_and_none_on_this_mac():
    assert worker.time_limit('aws', {'timeoutSeconds': 600}) == 600.0
    assert worker.time_limit('local', {'timeoutSeconds': 600}) is None
    assert worker.time_limit('local', {'timeoutSeconds': 600}, 5) == 5.0


def test_a_compute_version_1_job_keeps_its_recipe(env):
    # An owner's retry of a job approved before Phase 6D: its own method, no check, its old caveats.
    store, sink, jobs = env
    key = queue(store, STRETCHED_H2, method={'xc': 'B3LYP', 'basis': 'def2-SVP', 'optimiseBasis': 'def2-SVP'},
                recipe='optimise', compute_version=1)
    assert run_job(key, store, sink, grid_points=(32,)) == 'DONE', store.get_job(key)['error']
    meta = json.loads((jobs / key / 'meta.json').read_text())
    assert 'frequencyCheck' not in meta and 'FREQUENCY_CHECK = False' in (jobs / key / 'input.py').read_text()
    assert meta['provenance']['caveats'] == worker.LEGACY_OPTIMISE_CAVEATS
    assert meta['geometrySource'] == 'B3LYP/def2-SVP optimised from pasted XYZ'
    assert not (jobs / key / 'frequencies.json').exists()


def test_the_geometry_source_says_how_the_structure_was_checked():
    method = {'xc': 'B3LYP-D3BJ', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'}
    saddle = {'frequencyCheck': {'summary': 'saddle point (2 imaginary frequencies), not a minimum'}}
    assert worker._geometry_source_text({'kind': 'xyz'}, 'optimise', method, saddle) == (
        'B3LYP-D3(BJ)/def2-SVP optimised from pasted XYZ; saddle point (2 imaginary frequencies), not a minimum')
    assert worker._geometry_source_text({'kind': 'xyz'}, 'single', method, {}) == 'pasted XYZ'
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_canonical.py tools/jobs/tests/test_sink.py tools/jobs/tests/test_worker.py -q`
Expected: the new tests and `test_canonical_document_shape` fail (`computeVersion` 1, no `TimeBudget`, `run_job` has no `time_limit_seconds`, no `frequencies.json`).

- [ ] **Step 3: Implement**

`tools/jobs/canonical.py`: replace `COMPUTE_VERSION = 1` and `RECIPES = {…}` with

```python
COMPUTE_VERSION = 2
# Phase 6D (spec §6, §7): both recipes run B3LYP-D3(BJ) (PySCF's xc 'B3LYP-D3BJ'), and recipe B checks its
# structure for imaginary frequencies. A new method is a new calculation: version 2 gives new keys, so a
# version-1 result (B3LYP without dispersion) is never served as one of these.
RECIPES = {
    'single': {'xc': 'B3LYP-D3BJ', 'basis': 'def2-TZVPD', 'optimiseBasis': None},
    'optimise': {'xc': 'B3LYP-D3BJ', 'basis': 'def2-TZVPD', 'optimiseBasis': 'def2-SVP'},
}
```

`tools/jobs/sink.py`: replace the `ROOT_RESULT_NAMES` assignment with

```python
ROOT_RESULT_NAMES = ('meta.json', 'basis.json', 'density.bin.gz', 'esp.bin.gz',
                     'job.json', 'input.py', 'output.log', 'geometry.xyz', 'timings.json', 'trajectory.xyz',
                     'frequencies.json')      # Phase 6D: recipe B's frequency check (worker.OPTIONAL_RESULT_FILES)
```

`tools/jobs/worker.py`:

1. After `from jobs.store import FileStore  # noqa: E402` add `from dispersion import method_label  # noqa: E402  (tools/molecules, on sys.path above)`.

2. Replace the `CAVEATS = {…}` assignment with

```python
CAVEATS = {
    'single': ['The geometry is not optimised: it is PubChem\'s computed 3D conformer or as pasted.'],
    # Phase 6D: dispersion and the frequency check are part of recipe B now; what stays true is that it finds
    # the minimum nearest its start (a conformer search is a later phase, spec §2).
    'optimise': ['The optimisation finds the minimum nearest its starting geometry: one conformer, '
                 'not a conformer search.'],
}
# What recipe B said before compute version 2, still true of an owner's retry of such a job.
LEGACY_OPTIMISE_CAVEATS = ['B3LYP/def2-SVP optimisation without a dispersion correction.',
                           'No frequency check: the structure is not confirmed to be a minimum.']
# Written when recipe B's frequency check ran (Phase 6D spec §7); done.json lists it then.
OPTIONAL_RESULT_FILES = ('frequencies.json',)
# Phase 6D spec §9: stop stepping while the time left still covers the rest of the job, with this to spare.
TIME_BUDGET_MARGIN = 1.2
# Between the Batch attempt's start (its timeout's clock) and the worker's own: container start-up and imports.
STARTUP_ALLOWANCE_SECONDS = 30
```

and add, after `_xyz`:

```python
def caveats_for(recipe, compute_version):
    return LEGACY_OPTIMISE_CAVEATS if recipe == 'optimise' and compute_version < 2 else CAVEATS[recipe]
```

3. Replace `_geometry_source_text` with

```python
def _geometry_source_text(source, recipe, method=None, info=None):
    """Where the geometry came from and, for recipe B, how it was optimised and checked -- the text the
    viewer's readout, the provenance panel and every export caption show (spec §7, §9)."""
    origin = f'PubChem CID {source["cid"]} 3D conformer (retrieved {source["retrievedAt"]})' \
        if source['kind'] == 'pubchem' else 'pasted XYZ'
    if recipe != 'optimise':
        return origin
    level = f"{method_label(method['xc'])}/{method['optimiseBasis']}" if method else 'B3LYP/def2-SVP'
    text, info = f'{level} optimised from {origin}', info or {}
    if info.get('stoppedBy') == 'time-limit':
        text += f"; optimisation stopped by its time limit, not converged (max force {info['maxGradient']:.1e} Ha/bohr)"
    if info.get('frequencyCheck'):
        text += f"; {info['frequencyCheck']['summary']}"
    return text
```

4. Add, after `_patch_wall_seconds`:

```python
class TimeBudget:
    """input.py's may_start (Phase 6D spec §9): whether the time left before the job's limit covers, with
    TIME_BUDGET_MARGIN to spare, what the stage asked about and everything after it are predicted to take,
    from the job's own sizing figures (sizing.budget_parts, version 6). 'step' counts the step itself as well
    as the frequency check, the final SCF and the files; 'frequency check' the last three. Always yes with no
    limit (This Mac) or no figures (a record sized before version 6)."""

    def __init__(self, limit_seconds, parts, clock=time.monotonic):
        self.limit, self.parts, self.clock = limit_seconds, parts, clock
        self.began = clock()

    def remaining(self, stage):
        p = self.parts
        tail = p['frequencySeconds'] + p['finalScfSeconds'] + p['filesSeconds']
        return tail + p['stepSeconds'] if stage == 'step' else tail

    def __call__(self, stage):
        if self.limit is None or not self.parts:
            return True
        left = self.limit - STARTUP_ALLOWANCE_SECONDS - (self.clock() - self.began)
        return left >= TIME_BUDGET_MARGIN * self.remaining(stage)


def time_limit(backend, sizing, given=None):
    """The limit the budget works to: `given` (tests; JOBS_TIME_LIMIT_SECONDS on This Mac), else the Batch
    attempt's own timeout on AWS. This Mac's runs are free and have none."""
    if given is not None:
        return float(given)
    return float(sizing['timeoutSeconds']) if backend == 'aws' else None


def frequencies_payload(check, summary, method):
    """frequencies.json (Phase 6D spec §7; Phase 6E's input): the harmonic analysis behind the check."""
    return {'method': method, 'result': summary['result'], 'summary': summary['summary'],
            'geometryAngstrom': [[s, *xyz] for s, xyz in check['atoms']],
            'wavenumbers': check['wavenumbers'], 'reducedMassesAmu': check['reducedMasses'],
            'normalModes': check['normalModes'], 'zeroPointEnergyHartree': check['zeroPointEnergyHartree'],
            'imaginaryThresholdWavenumber': -50.0,
            'notes': ['wavenumbers in cm-1, ascending; an imaginary frequency is written as a negative number',
                      'translations and rotations projected out (PySCF hessian.thermo.harmonic_analysis)',
                      "normalModes: for each mode, one Cartesian displacement per atom, in geometryAngstrom's "
                      'frame and order, not renormalised (PySCF norm_mode)']}
```

5. `run_job`: add `time_limit_seconds=None` as the last parameter, and pass it on: the call becomes
`return _run(key, store, sink, attempt, backend, grid_points, heartbeat_seconds, image_digest, work, attempt if first_attempt is None else first_attempt, time_limit_seconds)`.
`_run`'s signature gains `time_limit_seconds=None` as its last parameter.

6. In `_run`, replace

```python
        ns = runpy.run_path(str(work / 'input.py'), run_name='jobs_input')
        try:
            mol, mf, info = ns['build'](on_stage=progress.on_stage, on_step=on_step)
```

with

```python
        ns = runpy.run_path(str(work / 'input.py'), run_name='jobs_input')
        budget = TimeBudget(time_limit(backend, sizing, time_limit_seconds), sizing.get('parts'))
        try:
            mol, mf, info = ns['build'](on_stage=progress.on_stage, on_step=on_step, may_start=budget)
```

and replace everything from `fields = {` through `write_molecule_files(work / 'result', mol, mf, fields, grid_points or GRID_POINTS_TRIES, commit=commit)` with

```python
        method = job['method']
        label = method_label(method['xc'])
        geometry_method = f"{label}/{method['optimiseBasis']}" if method['optimiseBasis'] else None
        check = {**info['frequencyCheck'], 'method': geometry_method} if info.get('frequencyCheck') else None
        optimisation = {k: v for k, v in info.items() if k not in ('frequencyCheck', 'frequencies')}
        fields = {
            'id': key, 'name': record['name'], 'formula': record['formula'],
            'geometrySource': _geometry_source_text(source, recipe, method, info), 'references': [],
            'method': f"{label}/{method['basis']}",
            'multiplicity': job['molecule']['multiplicity'], 'tier': 'computed',
            'provenance': {'jobKey': key, 'computeVersion': job['computeVersion'], 'recipe': recipe,
                           'geometrySource': source, 'caveats': caveats_for(recipe, job['computeVersion']),
                           'generatorCommit': commit, 'imageDigest': image_digest, 'pyscfVersion': pyscf.__version__,
                           'sizingVersion': sizing['version'], 'size': sizing['size'],
                           'capacity': sizing['capacity'], 'geometryMethod': geometry_method,
                           'frequencyCheck': check['summary'] if check else None,
                           'timeLimitSeconds': budget.limit,
                           # provisional, so the budget check sees a number of
                           # about the final width; replaced below (D14)
                           'wallSeconds': round(time.monotonic() - began, 2),
                           'costUsd': None},
        }
        if optimisation:
            # Ruling D13: {steps, converged}, plus Phase 6D's stoppedBy/maxGradient/displacedFrom. A resumed
            # run (M4) also names the attempt whose last frame it started from: its `steps` count only this
            # attempt's.
            fields['geometryOptimisation'] = {**optimisation, 'resumedFrom': attempt - 1} if start else optimisation
        if check:
            fields['frequencyCheck'] = check
        write_molecule_files(work / 'result', mol, mf, fields, grid_points or GRID_POINTS_TRIES, commit=commit)
        if info.get('frequencies'):
            (work / 'result' / 'frequencies.json').write_text(
                json.dumps(frequencies_payload(info['frequencies'], check, geometry_method), indent=1))
```

7. Replace

```python
                files = {name: (work / 'result' / name).read_bytes() for name in RESULT_FILES}
```

with

```python
                files = {name: (work / 'result' / name).read_bytes() for name in RESULT_FILES}
                files.update({name: (work / 'result' / name).read_bytes() for name in OPTIONAL_RESULT_FILES
                              if (work / 'result' / name).exists()})
```

8. In `main`, replace the `status = run_job(…)` call with

```python
    given = environ.get('JOBS_TIME_LIMIT_SECONDS')
    status = run_job(args.key, store, sink, attempt=attempt, backend=backend, grid_points=grid,
                     image_digest=digest, runner_job_id=environ.get('AWS_BATCH_JOB_ID') if args.aws else None,
                     first_attempt=min(first, attempt), time_limit_seconds=float(given) if given else None)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_canonical.py tools/jobs/tests/test_sink.py tools/jobs/tests/test_worker.py -q`
Expected: all pass (a few minutes). Then the whole suite: `tools/molecules/.venv/bin/python -m pytest tools/jobs tools/molecules -q` — all pass. `test_sizing.py` decisions for new jobs do not move here (sizing reads only the bases), and `test_handlers.py` derives every key from `canonical_job`, so version 2's new keys flow through.

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/canonical.py tools/jobs/worker.py tools/jobs/sink.py tools/jobs/tests/test_canonical.py tools/jobs/tests/test_worker.py tools/jobs/tests/test_sink.py tools/jobs/tests/test_worker_aws.py tools/jobs/tests/test_handlers.py
git commit -m "feat(jobs): compute version 2 -- D3(BJ), frequencies.json, a time budget, honest provenance (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Sizing version 6 and the quote's frequency-check line

**Estimate:** 75 min (the sizing and quote tests about a minute; re-recording the API fixtures a few seconds; the jobs Jest files about a minute).

**Files:**
- Modify: `tools/jobs/sizing.py`, `tools/jobs/quotes.py`, `tools/jobs/calibrate.py`
- Modify: `tools/jobs/tests/test_sizing.py`, `tools/jobs/tests/test_quotes.py`, `tools/jobs/tests/test_calibrate_aws.py`
- Modify: `src/jobs/api_types.ts`, `src/jobs/format.ts`, `src/admin/jobs_table.ts`
- Modify: `tests/jobs/api_fixtures.test.ts`, `tests/jobs/format.test.ts`, `tests/jobs/job_status.test.tsx`, `tests/admin/jobs_table.test.tsx`
- Re-record: `tests/jobs/fixtures/api/*.json` (by `tests/jobs/make_api_fixtures.py`)

**Interfaces:**
- Consumes: `sizing.step_seconds`, `single_point_seconds`, `predict_parts`, `OPEN_SHELL_FACTOR`; Task 8's compute version 2 (`job['computeVersion']`).
- Produces:
  - `sizing.SIZING_VERSION = 6`; `CONSTANTS['h'] = 1.5`
  - `sizing.frequency_seconds(job, size) -> float` (0 for recipe A and for compute version 1)
  - `sizing.predict_parts(job, size)` gains `'frequencySeconds'`; `predict_seconds` sums all three parts
  - `sizing.budget_parts(job, size) -> {'stepSeconds', 'frequencySeconds', 'finalScfSeconds', 'filesSeconds'}` (rounded to 0.1 s); `decide()` returns it as `'parts'` — Task 8's `TimeBudget` reads it from the job record's `sizing`
  - the compute line's `note` for recipe B ends `The prediction includes the frequency check (confirms a minimum): N s.`
  - `calibrate.guarded` handles `'h'` (missing → the deployed value, with a guard note); `fit_aws(…)` returns `'h': None` until Task 10
  - TS: `Sizing.parts?: SizingParts`; `format.xcLabel(xc)`; `methodOf` labels D3(BJ) and prices the frequency-check stages at the optimisation basis

- [ ] **Step 1: Write the failing Python tests**

In `tools/jobs/tests/test_sizing.py`: add `'h'` to `KEYS`; replace `test_version_5_is_calibrated_on_aws` with

```python
def test_version_6_prices_the_frequency_check_and_states_its_h():
    # Versions 2-5 were fitted from Fargate ARM64 runs (Phase 6B-3); version 6 (Phase 6D spec §10) adds h, the
    # analytic Hessian's cost in optimisation steps per atom. Until the Hessian probe measures it (Task 17),
    # h is 1.5: 0.84-1.06 measured on this Mac (one thread, def2-SVP), with room for poorer threading.
    assert sizing.SIZING_VERSION == 6
    assert set(sizing.CONSTANTS) == KEYS
    assert all(isinstance(v, float) and v > 0 for v in sizing.CONSTANTS.values())
    assert sizing.CONSTANTS['m0'] >= 0.2 and sizing.CONSTANTS['t0'] >= 1.0 and sizing.CONSTANTS['h'] == 1.5
```

in `test_caffeine_single_runs_on_l_spot_under_the_live_constants` change `assert d['version'] == 5` to `assert d['version'] == 6`; replace `test_caffeine_optimise_runs_on_l_spot_under_the_live_v5_constants` with

```python
def test_caffeine_optimise_pays_for_its_frequency_check_on_l():
    # Version 6: version 5's 22 steps of about 52.8 s and the final single point on L, plus the check,
    # h x one step x 24 atoms = 1.5 x 52.8 x 24 ≈ 1901 s: 4106 s, past the 3600 s Spot limit, so L on demand,
    # one attempt. The measured h (Task 17) may bring it back under.
    job = _caffeine_job('optimise')
    d = sizing.decide(job)
    step = sizing.step_seconds(basis_functions(CAFFEINE, 'def2-SVP'), LARGE)
    check = sizing.CONSTANTS['h'] * step * 24
    assert (d['size'], d['capacity'], d['attempts']) == ('L', 'on-demand', 1)
    assert sizing.frequency_seconds(job, LARGE) == pytest.approx(check)
    single = sizing.predict_seconds(_caffeine_job('single'), LARGE)
    assert d['predictedSeconds'] == pytest.approx(single + sizing.optimisation_steps(24) * step + check, abs=0.1)
    assert d['parts'] == {'stepSeconds': round(step, 1), 'frequencySeconds': round(check, 1),
                          'finalScfSeconds': round(sizing.single_point_seconds(614, 16), 1),
                          'filesSeconds': round(sizing.predict_parts(job, LARGE)['filesSeconds'], 1)}
    assert d['version'] == 6
```

in `test_the_constants_are_what_calibrate_fits_from_the_fixtures` change the guards assertion to

```python
    # h has no measurement yet (Task 17's Hessian probe): its guard keeps the stated 1.5.
    assert [g.split(':')[0] for g in guards] == ['g', 'h']
```

and append:

```python
def test_the_frequency_check_is_priced_for_recipe_b_from_compute_version_2_only():
    job = canonical_job('optimise', WATER, 0, 1)
    small = sizing.SIZES[0]
    step = sizing.step_seconds(basis_functions(WATER, 'def2-SVP'), small)
    assert sizing.frequency_seconds(job, small) == pytest.approx(sizing.CONSTANTS['h'] * step * 3)
    assert sizing.frequency_seconds(canonical_job('single', WATER, 0, 1), small) == 0.0
    assert sizing.frequency_seconds({**job, 'computeVersion': 1}, small) == 0.0
    assert sizing.predict_seconds(job, small) == pytest.approx(sum(sizing.predict_parts(job, small).values()))


def test_an_open_shells_frequency_check_is_scaled_like_its_scf():
    closed = sizing.frequency_seconds(canonical_job('optimise', WATER, 0, 1), sizing.SIZES[0])
    opened = sizing.frequency_seconds(canonical_job('optimise', WATER, 1, 2), sizing.SIZES[0])
    assert opened == pytest.approx(sizing.OPEN_SHELL_FACTOR * closed)


def test_decide_hands_the_worker_its_budget_figures():
    d = sizing.decide(canonical_job('optimise', WATER, 0, 1))
    size = next(s for s in sizing.SIZES if s.name == d['size'])
    assert set(d['parts']) == {'stepSeconds', 'frequencySeconds', 'finalScfSeconds', 'filesSeconds'}
    assert d['parts']['finalScfSeconds'] == round(sizing.single_point_seconds(58, size.vcpu), 1)
    assert d['parts']['frequencySeconds'] > 0
    assert sizing.decide(canonical_job('single', WATER, 0, 1))['parts']['stepSeconds'] == 0.0


def test_the_hessians_own_arrays_fit_inside_the_property_basis_memory():
    # PySCF's RKS Hessian holds 3 x atoms first-order AO matrices at def2-SVP (h1ao). Version 6 adds no memory
    # term: they stay far inside what the def2-TZVPD SCF already reserves, with HEADROOM.
    for atoms in (WATER, CAFFEINE, carbons(60)):
        n_svp, n_property = basis_functions(atoms, 'def2-SVP'), basis_functions(atoms, 'def2-TZVPD')
        assert 3 * len(atoms) * n_svp ** 2 * 8 / 1024 ** 3 < sizing.HEADROOM * sizing.predicted_memory_gb(n_property)
```

In `tools/jobs/tests/test_calibrate_aws.py`, `guarded` now reads `'h'` too: in `test_guarded_applies_task_14s_guards_and_names_them` add `'h': None` to `raw`, `'h'` to the expected guard set, and `assert constants['h'] == deployed['h']`; in `test_guarded_rounds_to_three_significant_figures_and_passes_good_values` add `'h': 1.4637` to `raw` and `'h': 1.46` to the expected `constants`; in `test_a_negative_g_keeps_1_5` add `'h': 1.2` to `raw`.

In `tools/jobs/tests/test_quotes.py`, append:

```python
def test_recipe_bs_compute_line_names_the_frequency_check():
    water = [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]
    optimise = quotes.public_quote(quotes.quote(canonical_job('optimise', water, 0, 1), 'k' * 64, 'aws'))
    compute = next(l for l in optimise['options'][0]['lines'] if l['item'] == 'compute')
    assert 'The prediction includes the frequency check (confirms a minimum): ' in compute['note']
    single = quotes.public_quote(quotes.quote(canonical_job('single', water, 0, 1), 'k' * 64, 'aws'))
    assert all('frequency check' not in l['note'] for l in single['options'][0]['lines'])
```

(`test_quotes.py` already imports `quotes` and `canonical_job`; if either import is missing on disk, add `from jobs import quotes` / `from jobs.canonical import canonical_job`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_sizing.py tools/jobs/tests/test_quotes.py -q`
Expected: failures — `SIZING_VERSION == 5`, no `'h'`, no `frequency_seconds`, no `'parts'`, no frequency-check note.

- [ ] **Step 3: Implement sizing version 6**

In `tools/jobs/sizing.py`:

1. At the end of the module docstring's last sentence (`…so the fit can be checked.`), add: ` Version 6 (Phase 6D) prices recipe B's frequency check -- an analytic Hessian, h x one optimisation step x atoms -- and hands the worker the figures its time budget reads (budget_parts).`

2. Replace `SIZING_VERSION = 5` with `SIZING_VERSION = 6`, and insert above the `# Version 5, fitted 2026-10-08 …` comment:

```python
# Version 6, 2026-10-08 (Phase 6D spec §10): version 5's constants and forms, plus h, the frequency check's
# price. Recipe B (compute version 2 on) checks its optimised structure with an analytic Hessian at def2-SVP:
# frequency_seconds = h x step_seconds(N_SVP) x atoms, x OPEN_SHELL_FACTOR for an open shell. Until the
# owner-approved Hessian probe on L measures it (Task 17), h = 1.5: PySCF 2.8's RKS Hessian cost 0.84
# (ethanol) to 1.06 (water) SCF+gradient steps per atom on this Mac (def2-SVP, one thread, 2026-10-08) --
# the textbook cost of an analytic Hessian, 3N CPHF perturbations, about a gradient's work per atom -- and
# 1.5 of it allows for threading poorer than the SCF's, which nothing has measured on Fargate yet. The D3
# terms are not priced (spec §10: negligible). Caffeine optimise moves from 2205 s (L, Spot) to 4106 s: past
# the Spot limit, so L on demand until h is measured. Single points do not move at all.
```

3. In `CONSTANTS`, add `'h': 1.5` (after `'stepScale': 0.375,`).

4. After `step_seconds`, add:

```python
def frequency_seconds(job: dict, size: Size) -> float:
    """Recipe B's frequency check (version 6, Phase 6D spec §10): the analytic Hessian at the optimisation
    basis, h x one step there x atoms, an open shell scaled as its SCF is. Zero for a single point, and for a
    compute-version-1 job (an owner's retry of one), which runs no check."""
    method = job['method']
    if not method['optimiseBasis'] or job.get('computeVersion', 1) < 2:
        return 0.0
    atoms = job['molecule']['atoms']
    seconds = CONSTANTS['h'] * step_seconds(basis_functions(atoms, method['optimiseBasis']), size) * len(atoms)
    return seconds * (OPEN_SHELL_FACTOR if job['molecule']['multiplicity'] > 1 else 1)
```

5. In `predict_parts`, change the return to `return {'scfSeconds': scf, 'filesSeconds': files, 'frequencySeconds': frequency_seconds(job, size)}` and add to its docstring: `` `frequencySeconds` (version 6) is the frequency check, its own term. ``; change `predict_seconds` to

```python
def predict_seconds(job: dict, size: Size) -> float:
    parts = predict_parts(job, size)
    return parts['scfSeconds'] + parts['filesSeconds'] + parts['frequencySeconds']


def budget_parts(job: dict, size: Size) -> dict:
    """What the worker's time budget reads (version 6, Phase 6D spec §9), on `size`: one optimisation step,
    the frequency check, the final SCF and the file write, each as predict_parts prices it."""
    atoms, method = job['molecule']['atoms'], job['method']
    shell = OPEN_SHELL_FACTOR if job['molecule']['multiplicity'] > 1 else 1
    step = step_seconds(basis_functions(atoms, method['optimiseBasis']), size) * shell if method['optimiseBasis'] else 0.0
    parts = predict_parts(job, size)
    return {'stepSeconds': round(step, 1), 'frequencySeconds': round(parts['frequencySeconds'], 1),
            'finalScfSeconds': round(single_point_seconds(basis_functions(atoms, method['basis']), size.vcpu) * shell, 1),
            'filesSeconds': round(parts['filesSeconds'], 1)}
```

6. In `decide`'s returned dict, after `'predictedCostMicros': cost_micros(capacity, size.vcpu, size.memory_gb, seconds)` add `, 'parts': budget_parts(job, size)`.

In `tools/jobs/quotes.py`, in `_note`'s `if item == 'compute':` branch, replace the `return (f'Estimate: …')` statement with

```python
        text = (f'Estimate: one run of the predicted {o["predictedSeconds"]:g} s plus a minute to start. '
                f'Maximum: {bound}, at {capacity} prices for {o["size"]} ({o["vcpu"]} vCPU, {o["memoryGB"]} GB).')
        check = (o['sizing'].get('parts') or {}).get('frequencySeconds')
        if check:
            # Phase 6D spec §10: recipe B's price includes the check, and the details say so.
            text += f' The prediction includes the frequency check (confirms a minimum): {check:g} s.'
        return text
```

In `tools/jobs/calibrate.py`'s `guarded`, add `'h'` to the key tuple in `c = {k: fitted[k] for k in (…)}` (after `'stepScale'`), and add this rule to `rules`:

```python
             ('h', lambda v: v is None or v <= 0, lambda v: deployed['h'],
              'missing or not positive: kept the deployed value (Phase 6D: no Hessian probe yet)'),
```

and in `fit_aws`'s `out = {…}` add `'h': None,` after `'stepScale': step_scale,` with the comment `# The Hessian probe's (Task 10) fits it; without one the guard keeps sizing's stated value.`

- [ ] **Step 4: Run the Python tests to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_sizing.py tools/jobs/tests/test_quotes.py tools/jobs/tests/test_calibrate_aws.py tools/jobs/tests/test_handlers.py -q`
Expected: all pass. `test_no_single_point_decision_is_less_conservative_than_version_4s` and `test_every_aws_run_finishes_inside_the_time_headroom` pass unchanged: single points and the compute-version-1 fixture jobs carry no frequency term.

- [ ] **Step 5: Re-record the API fixtures and update the client**

Run: `tools/molecules/.venv/bin/python tests/jobs/make_api_fixtures.py`
Expected: the 21 JSON files under `tests/jobs/fixtures/api/` are rewritten: `computeVersion` 2, `xc` `B3LYP-D3BJ`, new keys, `sizing.version` 6, and `sizing.parts` in every quote option and every record sized from a quote. (`get_legacy_aws.json` keeps its hand-built pre-6C decision.)

In `src/jobs/api_types.ts`, add above `export interface Sizing`:

```ts
/** Sizing version 6 (Phase 6D): what the worker's time budget reads, on the chosen size. Absent before it. */
export interface SizingParts {
    stepSeconds: number;
    frequencySeconds: number;
    finalScfSeconds: number;
    filesSeconds: number;
}
```

and add to `Sizing`, after `predictedCostMicros: number;`:

```ts
    parts?: SizingParts;
```

In `src/jobs/format.ts`, replace `methodOf` with

```ts
/** PySCF's 'B3LYP-D3BJ' as the literature writes it, 'B3LYP-D3(BJ)' (Phase 6D); any other xc unchanged. */
export const xcLabel = (xc: string): string => (/-D3BJ$/i.test(xc) ? `${xc.slice(0, -5)}-D3(BJ)` : xc);

/** Recipe B's geometry work -- its optimisation steps, its frequency check and any re-optimisation -- runs in
 * the smaller basis; everything else is the job's own. */
const GEOMETRY_STAGE = /^(optimisation|re-optimisation|frequency check|displacing)/i;
export function methodOf(job: CanonicalJob, stage: string | null = null): string {
    const { xc, basis, optimiseBasis } = job.method;
    if (optimiseBasis && stage !== null && GEOMETRY_STAGE.test(stage)) return `${xcLabel(xc)}/${optimiseBasis}`;
    return `${xcLabel(xc)}/${basis}`;
}
```

In `src/admin/jobs_table.ts`, `methodSummary` labels the xc too: replace its body with

```ts
    const { xc, basis, optimiseBasis } = job.job.method;
    const label = xcLabel(xc);
    return optimiseBasis ? `${label}/${optimiseBasis} → ${label}/${basis}` : `${label}/${basis}`;
```

and add `import { xcLabel } from '../jobs/format';` to its imports. In `tests/admin/jobs_table.test.tsx`, change `'B3LYP/def2-SVP → B3LYP/def2-TZVPD'` (twice) to `'B3LYP-D3(BJ)/def2-SVP → B3LYP-D3(BJ)/def2-TZVPD'`, `'B3LYP/def2-TZVPD'` in the `methodSummary(done)` line to `'B3LYP-D3(BJ)/def2-TZVPD'`, and the nowrap spans to `['B3LYP-D3(BJ)/def2-SVP →', 'B3LYP-D3(BJ)/def2-TZVPD']`.

In `tests/jobs/api_fixtures.test.ts`, add `'parts'` to `SIZING_FIELDS`. In `tests/jobs/job_status.test.tsx`, change `'Latest energy−76.461200 Ha (B3LYP/def2-TZVPD)'` to `'Latest energy−76.461200 Ha (B3LYP-D3(BJ)/def2-TZVPD)'`. In `tests/jobs/format.test.ts`, replace the body of `it('labels an energy with the method that produced it', …)` with

```ts
        const single = jobFixture('get_running').job;
        expect(formatEnergy(-76.4612, methodOf(single, 'SCF (DIIS)'))).toBe('−76.461200 Ha (B3LYP-D3(BJ)/def2-TZVPD)');
        const optimise = jobFixture('get_failed').job;
        expect(methodOf(optimise, 'optimisation step 4')).toBe('B3LYP-D3(BJ)/def2-SVP');
        expect(methodOf(optimise, 'frequency check')).toBe('B3LYP-D3(BJ)/def2-SVP');
        expect(methodOf(optimise, 're-optimisation step 9')).toBe('B3LYP-D3(BJ)/def2-SVP');
        expect(methodOf(optimise, 'SCF (DIIS)')).toBe('B3LYP-D3(BJ)/def2-TZVPD');
        expect(methodOf(optimise)).toBe('B3LYP-D3(BJ)/def2-TZVPD');
        // A job approved before Phase 6D keeps its own method string.
        expect(methodOf({ ...optimise, method: { ...optimise.method, xc: 'B3LYP' } }, 'optimisation step 1')).toBe('B3LYP/def2-SVP');
        expect(predictionNote(1)).toBe('sizing v1 prediction');
```

- [ ] **Step 6: Run the client tests**

Run: `npx jest tests/jobs tests/admin src/App.jobs.test.tsx` (about a minute), then `npx tsc --noEmit -p tsconfig.json`.
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add tools/jobs/sizing.py tools/jobs/quotes.py tools/jobs/calibrate.py tools/jobs/tests/test_sizing.py tools/jobs/tests/test_quotes.py tools/jobs/tests/test_calibrate_aws.py src/jobs/api_types.ts src/jobs/format.ts src/admin/jobs_table.ts tests/jobs/api_fixtures.test.ts tests/jobs/format.test.ts tests/jobs/job_status.test.tsx tests/admin/jobs_table.test.tsx tests/jobs/fixtures/api
git commit -m "feat(jobs): sizing v6 prices the frequency check and hands the worker its budget (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The Hessian probe

**Estimate:** 40 min (the new tests run about 20 s: one water Hessian at def2-SVP).

**Files:**
- Modify: `tools/jobs/probe.py`, `tools/jobs/calibrate.py`
- Modify: `tools/jobs/tests/test_probe.py`, `tools/jobs/tests/test_calibrate_aws.py`

**Interfaces:**
- Consumes: Task 1's `dispersion.XC`, `LABEL`, `ensure_d3`; Task 9's `sizing.step_seconds`, `SIZES`, `calibrate.guarded` (with `'h'`).
- Produces:
  - `probe.measure_hessian(atoms, basis='def2-SVP', spin=0, label=None) -> dict` (`molecule`, `basis`, `basisFunctions`, `atoms`, `scfSeconds`, `gradientSeconds`, `stepSeconds`, `hessianSeconds`, `scfCycles`, `peakMemoryGB`)
  - `probe.probe_hessians(runs, basis='def2-SVP', emit=print, measure=measure_hessian) -> dict` — a `{"hessianRun": label, …}` line per run, then `{"probe": "hessian", "vcpu", "pyscfMaxMemoryMB", "basis", "runs": […]}`
  - CLI: `python -m jobs.worker probe --hessian-json '[{"label": "water", "atoms": [[8, x, y, z], …]}, …]'`
  - `calibrate.read_hessian_probe(path) -> dict`, `calibrate.fit_hessian(probe) -> (h, notes)`, `fit_aws(samples, probe=None, optimise_probe=None, hessian_probe=None)`, CLI `--hessian-probe <path>` — Task 17 uses all of these

- [ ] **Step 1: Write the failing tests**

Append to `tools/jobs/tests/test_probe.py`:

```python
WATER_ATOMS = [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]


def test_measure_hessian_times_a_step_and_the_hessian():
    # Phase 6D: sizing version 6's h is the Hessian's cost in optimisation steps per atom. Water, tiny on
    # purpose; caffeine on L is Task 17's real measurement.
    run = probe.measure_hessian(WATER_ATOMS, label='water')
    assert run['molecule'] == 'water' and run['basis'] == 'def2-SVP' and run['basisFunctions'] == 24 and run['atoms'] == 3
    assert run['stepSeconds'] == pytest.approx(run['scfSeconds'] + run['gradientSeconds'], abs=0.002)
    assert run['hessianSeconds'] > 0 and run['scfCycles'] >= 1


def test_probe_hessians_prints_a_line_per_run_and_the_contract_line_last():
    lines = []
    fake = lambda atoms, basis, spin, label: {'molecule': label, 'atoms': len(atoms), 'basisFunctions': 24,
                                              'hessianSeconds': 1.0}
    out = probe.probe_hessians([{'label': 'a', 'atoms': WATER_ATOMS}, {'label': 'b', 'atoms': WATER_ATOMS}],
                               emit=lambda text, **kwargs: lines.append(json.loads(text)), measure=fake)
    assert [line.get('hessianRun') for line in lines[:2]] == ['a', 'b']
    assert lines[-1] == out and out['probe'] == 'hessian' and [r['molecule'] for r in out['runs']] == ['a', 'b']
    assert out['basis'] == 'def2-SVP' and 'vcpu' in out and 'pyscfMaxMemoryMB' in out


def test_the_hessian_probe_takes_its_molecules_as_json(monkeypatch, capsys):
    monkeypatch.setattr(probe, 'measure_hessian', lambda atoms, basis, spin, label: {
        'molecule': label, 'atoms': len(atoms), 'basisFunctions': 24, 'hessianSeconds': 1.0})
    assert probe.main(['--hessian-json', json.dumps([{'label': 'water', 'atoms': WATER_ATOMS}])]) == 0
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line['probe'] == 'hessian' and line['runs'][0]['molecule'] == 'water'
```

Append to `tools/jobs/tests/test_calibrate_aws.py` (and add `fit_hessian, read_hessian_probe` to its `from jobs.calibrate import (…)`):

```python
HESSIAN_PROBE = {'probe': 'hessian', 'vcpu': 16, 'basis': 'def2-SVP', 'runs': [
    {'molecule': 'water', 'basisFunctions': 24, 'atoms': 3, 'hessianSeconds': 2.0},
    {'molecule': 'caffeine', 'basisFunctions': 246, 'atoms': 24, 'hessianSeconds': 900.0}]}


def test_fit_hessian_keeps_the_slowest_run_against_sizings_own_step():
    large = sizing.SIZES[2]
    water = 2.0 / (sizing.step_seconds(24, large) * 3)
    caffeine = 900.0 / (sizing.step_seconds(246, large) * 24)
    h, notes = fit_hessian(HESSIAN_PROBE)
    assert h == pytest.approx(max(water, caffeine)) and 'caffeine' in notes[0]


def test_the_hessian_probe_sets_h_and_its_guard_goes_quiet(tmp_path):
    from pathlib import Path
    log = tmp_path / 'hessian.log'
    log.write_text('geomeTRIC chatter\n{"hessianRun": "water"}\n' + json.dumps(HESSIAN_PROBE) + '\n')
    assert read_hessian_probe(log) == HESSIAN_PROBE
    aws = Path(__file__).parent / 'fixtures' / 'aws'
    fitted = fit_aws(aws_samples(sorted(d for d in aws.iterdir() if d.is_dir())), read_probe(aws / 'speedup-probe.json'),
                     read_optimise_probe(aws / 'caffeine-optimise-probe.json'), HESSIAN_PROBE)
    assert fitted['h'] == pytest.approx(fit_hessian(HESSIAN_PROBE)[0])
    constants, guards = guarded(fitted)
    assert [g.split(':')[0] for g in guards] == ['g'] and constants['h'] == float(f"{fitted['h']:.3g}")
    empty = tmp_path / 'empty.log'
    empty.write_text('')
    with pytest.raises(ValueError, match='no Hessian probe line'):
        read_hessian_probe(empty)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_probe.py tools/jobs/tests/test_calibrate_aws.py -q`
Expected: `AttributeError: module 'jobs.probe' has no attribute 'measure_hessian'` and `ImportError: cannot import name 'fit_hessian'`.

- [ ] **Step 3: Implement**

`tools/jobs/probe.py`: add to the module docstring's usage block

```
    python -m jobs.worker probe --hessian-json '[{"label": "water", "atoms": [[8, 0, 0, 0.118], ...]}, ...]'
        (Phase 6D: times one optimisation step and the analytic Hessian at B3LYP-D3(BJ)/def2-SVP per
        molecule -- sizing version 6's h -- run with PYSCF_MAX_MEMORY set as BatchRunner sets it)
```

in `measure`, change `'method': f'B3LYP/{basis}'}` to `'method': f'{LABEL}/{basis}'}` and its local imports to include `from dispersion import LABEL` (optimise.make_dft is B3LYP-D3(BJ) since Task 5); then add after `measure_optimise`:

```python
def measure_hessian(atoms, basis='def2-SVP', spin=0, label=None):
    """One optimisation step (SCF + gradient) and the analytic Hessian, timed, as recipe B's frequency check
    runs them (Phase 6D): B3LYP-D3(BJ), symmetry off, UKS for an open shell. `atoms` is [[Z, x, y, z], …] in
    Angstrom (the image carries no library geometries)."""
    from pyscf import dft, gto
    from dispersion import XC, ensure_d3
    ensure_d3()
    mol = gto.M(atom=atoms, unit='Angstrom', basis=basis, spin=spin, symmetry=False, verbose=0)
    mf = dft.RKS(mol) if spin == 0 else dft.UKS(mol)
    mf.xc, mf.grids.level, mf.conv_tol = XC, 4, 1e-10
    began = time.monotonic()
    mf.kernel()
    scf = time.monotonic() - began
    began = time.monotonic()
    mf.nuc_grad_method().kernel()
    gradient = time.monotonic() - began
    began = time.monotonic()
    mf.Hessian().kernel()
    hessian = time.monotonic() - began
    return {'molecule': label, 'basis': basis, 'basisFunctions': int(mol.nao), 'atoms': mol.natm,
            'scfSeconds': round(scf, 3), 'gradientSeconds': round(gradient, 3), 'stepSeconds': round(scf + gradient, 3),
            'hessianSeconds': round(hessian, 3), 'scfCycles': int(getattr(mf, 'cycles', -1)),
            'peakMemoryGB': _peak_memory_gb()}


def probe_hessians(runs, basis='def2-SVP', emit=print, measure=None):
    """measure_hessian for each {'label', 'atoms', 'spin'?}: a progress line per run (keyed 'hessianRun'),
    then the one line calibrate.read_hessian_probe reads."""
    measure = measure or measure_hessian
    out = []
    for run in runs:
        result = measure(run['atoms'], basis, run.get('spin', 0), run['label'])
        emit(json.dumps({'hessianRun': run['label'], **result}), flush=True)
        out.append(result)
    line = {'probe': 'hessian', 'vcpu': _vcpu(), 'pyscfMaxMemoryMB': os.environ.get('PYSCF_MAX_MEMORY'),
            'basis': basis, 'runs': out}
    emit(json.dumps(line), flush=True)
    return line
```

In `main`, add the argument

```python
    parser.add_argument('--hessian-json', default=None,
                        help='[{"label", "atoms": [[Z,x,y,z],...], "spin"?}, ...]: time a step and the Hessian of '
                             'each at def2-SVP (Phase 6D, sizing version 6\'s h) instead of the thread sweep')
```

and, right after `args = parser.parse_args(argv)` and `grid = …`, add

```python
    if args.hessian_json:
        probe_hessians(json.loads(args.hessian_json))
        return 0
```

`tools/jobs/calibrate.py`: after `read_optimise_probe`, add

```python
def read_hessian_probe(path):
    """The Hessian probe's line (probe.probe_hessians) from a saved log: the last object with probe 'hessian'."""
    for line in reversed(Path(path).read_text().splitlines()):
        line = line.strip()
        if line.startswith('{'):
            try:
                found = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(found, dict) and found.get('probe') == 'hessian' and found.get('runs'):
                return found
    raise ValueError(f'{path}: no Hessian probe line (an object with "probe": "hessian" and "runs")')


def fit_hessian(probe):
    """h (sizing version 6): each run's Hessian seconds over sizing's own price for one def2-SVP step on the
    size the probe ran on, per atom; the slowest kept (Ruling T14-speedup). The step is priced with the live
    CONSTANTS, which a refit of h alone leaves as they are. Returns (h, notes)."""
    size = next(s for s in sizing.SIZES if s.vcpu == probe['vcpu'])
    per_run = {r['molecule']: r['hessianSeconds'] / (sizing.step_seconds(r['basisFunctions'], size) * r['atoms'])
               for r in probe['runs']}
    worst = max(per_run, key=per_run.get)
    return per_run[worst], [f'h: the Hessian probe on {size.name} gives '
                            + ', '.join(f'{k} {v:.3g}' for k, v in per_run.items()) + f"; kept {worst}'s, the slowest"]
```

change `def fit_aws(samples, probe=None, optimise_probe=None):` to `def fit_aws(samples, probe=None, optimise_probe=None, hessian_probe=None):`; before `out = {…}` add

```python
    h = None
    if hessian_probe is not None:
        h, h_notes = fit_hessian(hessian_probe)
        notes += h_notes
```

and change Task 9's `'h': None,` in `out` to `'h': h,`. In the `__main__` block, change

```python
        args, probe, optimise_probe = sys.argv[2:], None, None
        while args[:1] in (['--probe'], ['--optimise-probe']):
            if args[0] == '--probe':
                probe = read_probe(args[1])
            else:
                optimise_probe = read_optimise_probe(args[1])
            args = args[2:]
        samples = aws_samples(args)
        fitted = fit_aws(samples, probe, optimise_probe)
```

to

```python
        args, probe, optimise_probe, hessian_probe = sys.argv[2:], None, None, None
        while args[:1] in (['--probe'], ['--optimise-probe'], ['--hessian-probe']):
            if args[0] == '--probe':
                probe = read_probe(args[1])
            elif args[0] == '--optimise-probe':
                optimise_probe = read_optimise_probe(args[1])
            else:
                hessian_probe = read_hessian_probe(args[1])
            args = args[2:]
        samples = aws_samples(args)
        fitted = fit_aws(samples, probe, optimise_probe, hessian_probe)
```

and add `[--hessian-probe hessian.log]` to the module docstring's `--aws` usage line.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs/tests/test_probe.py tools/jobs/tests/test_calibrate_aws.py tools/jobs/tests/test_sizing.py -q`
Expected: all pass (about 30 s).

- [ ] **Step 5: Commit**

```bash
git add tools/jobs/probe.py tools/jobs/calibrate.py tools/jobs/tests/test_probe.py tools/jobs/tests/test_calibrate_aws.py
git commit -m "feat(jobs): a Hessian probe and its fit for sizing v6's h (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Web — labels, virtual classes, the LVMO and both gaps in the orbital list

**Estimate:** 75 min (the Molecules Jest files run about 20 s).

**Files:**
- Modify: `src/molecules/types.ts`, `src/molecules/library_types.ts`, `src/molecules/orbital_display.ts`, `src/components/MoleculeNav.tsx`, `src/style.css`
- Rewrite: `src/components/MoleculeOrbitalList.tsx`
- Modify: `tests/molecules/molecule_nav.test.tsx`
- Test: `tests/molecules/valence_threshold.test.ts`

**Interfaces:**
- Consumes: meta.json's orbital rows and `symmetry` as Tasks 3–4 write them (v3 and compute version 2); the older shapes (v2, compute version 1) without `class`, `valenceCharacter`, `kind`, `labels`.
- Produces (`src/molecules/types.ts`): `OrbitalRole = 'HOMO' | 'LUMO' | 'SOMO' | 'LVMO'`; `VirtualClass = 'valence' | 'diffuse'`; `MoleculeOrbitalInfo` gains optional `valenceCharacter`, `class`, `kind: 'valence-virtual'`, `labelNote`. (`src/molecules/library_types.ts`): `LibraryExtras.symmetry` gains optional `labels: 'full-group' | 'subgroup' | 'none'` and `labelNote`.
- Produces (`src/molecules/orbital_display.ts`), for Tasks 12–13: `VALENCE_THRESHOLD`, `GAP_CAVEAT`, `DIFFUSE_NOTE`, `LVMO_NOTE`, `VALENCE_VIRTUAL_NOTE`, `UNCLASSIFIED_NOTE`, `DIFFUSE_MARK`, `percentValence(o)`, `orbitalTag(o): string | null`, `orbitalGaps(orbitals): OrbitalGap[]`, `textbookLumo(orbitals)`, `labelsSentence(symmetry)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/molecules/valence_threshold.test.ts`:

```ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { VALENCE_THRESHOLD } from '../../src/molecules/orbital_display';

it('the list calls a virtual diffuse below the threshold the generator used', () => {
    const py = readFileSync(resolve(__dirname, '../../tools/molecules/orbitals.py'), 'utf8');
    expect(Number(/^VALENCE_THRESHOLD\s*=\s*([0-9.]+)/m.exec(py)?.[1])).toBe(VALENCE_THRESHOLD);
});
```

In `tests/molecules/molecule_nav.test.tsx`: extend the `orbital_display` import to

```ts
import {
    formatOrbitalEnergy, degeneracyCounts, formatPointGroup, orbitalGaps, orbitalTag, textbookLumo, labelsSentence,
    GAP_CAVEAT, DIFFUSE_NOTE, UNCLASSIFIED_NOTE,
} from '../../src/molecules/orbital_display';
```

in `marks the HOMO–LUMO gap with a labelled divider …` change the separator's accessible name to `` `HOMO–LUMO gap 0.320 Ha (8.71 eV). ${GAP_CAVEAT}` ``, and in `names the gap SOMO–LUMO …` to `` `SOMO–LUMO gap 0.200 Ha (5.44 eV). ${GAP_CAVEAT}` ``; then append:

```tsx
// Phase 6D: what library v3 and compute-version-2 jobs write -- water at def2-TZVPD, its LUMO diffuse, its
// LVMO a valence virtual orbital.
const V3_ORBITALS = [
    { index: 0, label: '1a1', energyHartree: -19.13, occupation: 2 },
    { index: 1, label: '2a1', energyHartree: -1.00, occupation: 2 },
    { index: 2, label: '1b2', energyHartree: -0.53, occupation: 2 },
    { index: 3, label: '3a1', energyHartree: -0.38, occupation: 2 },
    { index: 4, label: '1b1', energyHartree: -0.31, occupation: 2, role: 'HOMO' },
    { index: 5, label: '4a1', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.55, class: 'diffuse' },
    { index: 6, label: '2b2', energyHartree: 0.05, occupation: 0, valenceCharacter: 0.27, class: 'diffuse' },
    { index: 7, label: 'a1', energyHartree: 0.19, occupation: 0, role: 'LVMO', valenceCharacter: 1, class: 'valence', kind: 'valence-virtual' },
] as ReturnType<typeof waterMeta>['orbitals'];
const V3_SYMMETRY = { pointGroup: 'C2v', labelGroup: 'C2v', labels: 'full-group' as const };
const list = (orbitals = V3_ORBITALS, symmetry: Parameters<typeof labelsSentence>[0] = V3_SYMMETRY) => render(
    <MoleculeOrbitalList orbitals={orbitals} selectedIndex={null} onSelect={() => {}} method="B3LYP-D3(BJ)/def2-TZVPD" symmetry={symmetry} />);

describe('Phase 6D: honest virtuals, both gaps, full-group labels', () => {
    it('marks the diffuse virtuals and the LVMO, and says what each is', () => {
        const { container } = list();
        const lumo = screen.getByRole('button', { name: /4a1/ });
        expect(within(lumo).getByRole('img', { name: 'diffuse, basis-dependent, 55 % valence' })).toHaveTextContent('◌');
        const lvmo = screen.getByRole('button', { name: /LVMO/ });
        expect(lvmo).toHaveTextContent('≈ 0.190 Ha (5.17 eV)');
        expect(within(lvmo).queryByRole('img')).toBeNull();
        expect(container.textContent).toContain(`◌ diffuse, basis-dependent virtual (under 75 % valence): ${DIFFUSE_NOTE}.`);
        expect(container.textContent).toContain('LVMO: the lowest valence virtual orbital, the antibonding orbital textbooks draw;');
        expect(container.textContent).toContain('its energy is an expectation value, not an eigenvalue');
        expect(container.textContent).toContain('Labels: irreducible representations of C2v, numbered in energy order within each, core included.');
    });
    it('shows both gaps, labelled, each with the Kohn–Sham caveat', () => {
        list();
        const divider = screen.getByRole('separator', {
            name: `HOMO–LUMO gap 0.300 Ha (8.16 eV) · HOMO–LVMO gap 0.500 Ha (13.61 eV). ${GAP_CAVEAT}` });
        expect(divider).toHaveTextContent(GAP_CAVEAT);
    });
    it('renders v2-shaped orbitals without virtual classes, and says they are unclassified (Review Focus 5)', () => {
        const { container } = list(waterMeta().orbitals, { pointGroup: 'C2v', labelGroup: 'C2v' });
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.queryByText('LVMO')).toBeNull();
        expect(container.textContent).toContain(UNCLASSIFIED_NOTE);
        expect(container.textContent).toContain('Labels: irreducible representations of C2v.');
    });
    it('names a subgroup fallback, and an unlabelled set, in the caption', () => {
        const orbitals = [{ index: 0, label: '?', energyHartree: -0.5, occupation: 2, role: 'HOMO',
            labelNote: 'characters (2.00, -1.00) match no single irrep of Td: an accidental degeneracy or numerical noise, so left unlabelled' }] as ReturnType<typeof waterMeta>['orbitals'];
        const { container } = list(orbitals, { pointGroup: 'D2d', labelGroup: 'D2', labels: 'subgroup',
            labelNote: 'irreducible representations of D2, a subgroup of D2d: full-group labels are not available for D2d' });
        expect(container.textContent).toContain('Labels: irreducible representations of D2, a subgroup of D2d: full-group labels are not available for D2d.');
        expect(container.textContent).toContain('?: characters (2.00, -1.00) match no single irrep of Td');
    });
    it('tags orbitals, finds the gaps and the textbook LUMO', () => {
        expect(orbitalTag(V3_ORBITALS[5])).toBe('diffuse, basis-dependent, 55 % valence');
        expect(orbitalTag(V3_ORBITALS[7])).toBe('valence virtual orbital, the antibonding orbital textbooks draw; energy an expectation value');
        expect(orbitalTag(V3_ORBITALS[4])).toBeNull();
        expect(orbitalTag(waterMeta().orbitals[5])).toBeNull();          // v2: no class, no claim
        expect(orbitalGaps(V3_ORBITALS).map(g => g.name)).toEqual(['HOMO–LUMO', 'HOMO–LVMO']);
        expect(orbitalGaps(waterMeta().orbitals).map(g => g.name)).toEqual(['HOMO–LUMO']);
        expect(textbookLumo(V3_ORBITALS)?.orbital.index).toBe(7);
        expect(textbookLumo(V3_ORBITALS)?.note).toMatch(/^the LVMO, the antibonding orbital textbooks draw: the LUMO itself is diffuse/);
        expect(textbookLumo(waterMeta().orbitals)).toEqual({ orbital: waterMeta().orbitals[5], note: null });
    });
    it('says a diffuse LUMO is diffuse where it names the orbital drawn', () => {
        const { container } = render(<MoleculeNav {...navProps} meta={waterMeta({ orbitals: V3_ORBITALS, symmetry: V3_SYMMETRY })}
            surface={{ kind: 'mo', index: 5 }} />);
        expect(container.querySelector('.molecule-nav-orbital')).toHaveTextContent(
            'Showing 4a1 (LUMO; diffuse, basis-dependent, 55 % valence), −0.010 Ha (−0.27 eV)');
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/molecules/molecule_nav.test.tsx tests/molecules/valence_threshold.test.ts`
Expected: failures — the new exports do not exist, the separators' names lack the caveat.

- [ ] **Step 3: Implement the types and helpers**

`src/molecules/types.ts`: above `export interface MoleculeOrbitalInfo` add

```ts
/** Phase 6D adds LVMO: the lowest valence virtual, where the LUMO is a diffuse state of the basis. */
export type OrbitalRole = 'HOMO' | 'LUMO' | 'SOMO' | 'LVMO';
/** A virtual's class (Phase 6D): 'diffuse' under 75 % valence character (orbitals.py's VALENCE_THRESHOLD). */
export type VirtualClass = 'valence' | 'diffuse';
```

and in `MoleculeOrbitalInfo` replace `role?: 'HOMO' | 'LUMO' | 'SOMO';` with

```ts
    role?: OrbitalRole;
    /** Phase 6D (library v3, jobs from compute version 2): a virtual's share inside the intrinsic minimal basis, 0-1. */
    valenceCharacter?: number;
    class?: VirtualClass;
    /** Not a canonical MO: the lowest valence virtual orbital, built from the IAO span; its energy is an expectation value. */
    kind?: 'valence-virtual';
    /** Why a degenerate set was left unlabelled ('?'). */
    labelNote?: string;
```

`src/molecules/library_types.ts`: replace `symmetry: { pointGroup: string; labelGroup: string };` with

```ts
    /** Phase 6D: `labels` says whether the labels are the full group's, a named subgroup's (labelNote says why), or none
     * (no symmetry); older data has neither, and was labelled in PySCF's subgroup. */
    symmetry: { pointGroup: string; labelGroup: string; labels?: 'full-group' | 'subgroup' | 'none'; labelNote?: string };
```

`src/molecules/orbital_display.ts`: add at the top `import type { MoleculeOrbitalInfo } from './types';` and append:

```ts
/** tools/molecules/orbitals.py's VALENCE_THRESHOLD (tests/molecules/valence_threshold.test.ts reads it). */
export const VALENCE_THRESHOLD = 0.75;
export const GAP_CAVEAT = 'Kohn–Sham orbital gap — neither the optical gap (absorption) nor the fundamental gap (IP − EA)';
export const DIFFUSE_NOTE = 'positive/near-zero energy: an unbound, basis-set dependent state, not a bound orbital';
export const LVMO_NOTE = 'the antibonding orbital textbooks draw';
export const VALENCE_VIRTUAL_NOTE = 'built from the minimal-basis part of the virtual space, its energy is an expectation value, not an eigenvalue';
export const UNCLASSIFIED_NOTE = 'Virtual orbitals are not classified in this data (computed before Phase 6D): the LUMO may be a diffuse, basis-dependent state rather than an antibonding orbital.';
export const DIFFUSE_MARK = '◌';

export const percentValence = (o: { valenceCharacter?: number }): string => `${Math.round((o.valenceCharacter ?? 0) * 100)} % valence`;

function lowestWithRole(orbitals: MoleculeOrbitalInfo[], role: string): MoleculeOrbitalInfo | null {
    return orbitals.filter(o => o.role === role)
        .reduce<MoleculeOrbitalInfo | null>((a, b) => (a === null || b.energyHartree < a.energyHartree ? b : a), null);
}

/** What follows an orbital's role wherever it is named (the "Showing" line, captions): null for an occupied orbital,
 * a valence canonical virtual that is not the LVMO, or older data, which makes no claim either way (spec §4). */
export function orbitalTag(o: MoleculeOrbitalInfo): string | null {
    if (o.occupation > 0 || !o.class) return null;
    if (o.class === 'diffuse') return `diffuse, basis-dependent, ${percentValence(o)}`;
    if (o.role !== 'LVMO') return null;
    return o.kind === 'valence-virtual' ? `valence virtual orbital, ${LVMO_NOTE}; energy an expectation value` : LVMO_NOTE;
}

export interface OrbitalGap { name: string; hartree: number }

/** The HOMO–LUMO gap (SOMO–LUMO for an open shell) and, where an LVMO differs from the LUMO, the HOMO–LVMO gap too (spec §5). */
export function orbitalGaps(orbitals: MoleculeOrbitalInfo[]): OrbitalGap[] {
    const occupied = orbitals.filter(o => o.occupation > 0);
    if (!occupied.length) return [];
    const top = occupied.reduce((a, b) => (b.energyHartree > a.energyHartree ? b : a));
    const lower = top.role === 'SOMO' ? 'SOMO' : 'HOMO';
    return (['LUMO', 'LVMO'] as const).flatMap(role => {
        const target = lowestWithRole(orbitals, role);
        return target ? [{ name: `${lower}–${role}`, hartree: target.energyHartree - top.energyHartree }] : [];
    });
}

/** "The LUMO" a lesson or caption means (spec §4): the LVMO where the LUMO is a diffuse state of the basis, saying so. */
export function textbookLumo(orbitals: MoleculeOrbitalInfo[]): { orbital: MoleculeOrbitalInfo; note: string | null } | null {
    const lvmo = lowestWithRole(orbitals, 'LVMO');
    if (lvmo) return { orbital: lvmo, note: `the LVMO, ${LVMO_NOTE}: the LUMO itself is diffuse (${DIFFUSE_NOTE})` };
    const lumo = lowestWithRole(orbitals, 'LUMO');
    return lumo ? { orbital: lumo, note: null } : null;
}

/** The caption's sentence on what the labels are. */
export function labelsSentence(symmetry: { pointGroup: string; labelGroup: string; labels?: string; labelNote?: string }): string {
    const pointGroup = formatPointGroup(symmetry.pointGroup);
    if (symmetry.labels === 'full-group') return `Labels: irreducible representations of ${pointGroup}, numbered in energy order within each, core included.`;
    if (symmetry.labels === 'subgroup' && symmetry.labelNote) return `Labels: ${symmetry.labelNote}.`;
    if (symmetry.labels === 'none') return 'Labels: ψ, numbered in energy order (no symmetry).';
    const labelGroup = formatPointGroup(symmetry.labelGroup);
    return `Labels: irreducible representations of ${labelGroup}${symmetry.labelGroup !== symmetry.pointGroup ? `, the subgroup of ${pointGroup} the calculation uses` : ''}.`;
}
```

- [ ] **Step 4: Rewrite `src/components/MoleculeOrbitalList.tsx`**

```tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { Chip, Typography } from '@mui/material';
import {
    DIFFUSE_MARK, DIFFUSE_NOTE, GAP_CAVEAT, LVMO_NOTE, UNCLASSIFIED_NOTE, VALENCE_THRESHOLD, VALENCE_VIRTUAL_NOTE,
    degeneracyCounts, formatOrbitalEnergy, labelsSentence, orbitalGaps, percentValence,
} from '../molecules/orbital_display';
import type { LibraryMoleculeMeta } from '../molecules/library_types';

interface MoleculeOrbitalListProps {
    orbitals: LibraryMoleculeMeta['orbitals'];
    selectedIndex: number | null;
    onSelect: (index: number) => void;
    method: string;
    symmetry: LibraryMoleculeMeta['symmetry'];
}

const OCCUPANCY: Record<number, string> = { 2: '↑↓', 1: '↑', 0: '' };

/**
 * The list's own scrollTop that centres `row` in it. The list is scrolled
 * directly rather than through scrollIntoView, which also scrolls every
 * scrolling ancestor -- on a desktop the right-hand column, whose controls
 * would jump out of view to reach a row of the card under them.
 */
export function centredScrollTop(list: HTMLElement, row: HTMLElement): number {
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    return Math.max(0, list.scrollTop + (rowRect.top - listRect.top) - (listRect.height - rowRect.height) / 2);
}

/**
 * Every shipped orbital, highest first so HOMO and LUMO sit together near
 * the top. This is Molecules' Plot-slot content (ruling D23): MoDiagram
 * groups degeneracy by irrep label and is kept Bonds-only, not generalised
 * to the library's lower-symmetry molecules.
 *
 * Phase 6D (spec §4, §5): a diffuse virtual carries a mark and its valence
 * share; the LVMO -- the lowest valence virtual, where the LUMO is a diffuse
 * state of the basis -- is chipped and described; a valence virtual orbital
 * (not a canonical MO) shows its energy as the expectation value it is (≈);
 * the gap divider gives both gaps with the Kohn–Sham caveat. Older data, with
 * no classes, says its virtuals are unclassified rather than implying either.
 */
const MoleculeOrbitalList: React.FC<MoleculeOrbitalListProps> = ({ orbitals, selectedIndex, onSelect, method, symmetry }) => {
    const rows = useMemo(() => [...orbitals].sort((a, b) => b.energyHartree - a.energyHartree), [orbitals]);
    const counts = useMemo(() => degeneracyCounts(orbitals), [orbitals]);
    // Ruling T16-b: highest first reads like an MO diagram, but puts the
    // virtuals on top -- so the gap is marked where the occupied orbitals
    // begin, and the list opens with the HOMO in view.
    const firstOccupied = rows.findIndex(o => o.occupation > 0);
    const gaps = orbitalGaps(orbitals);
    const gapText = gaps.length ? gaps.map(g => `${g.name} gap ${formatOrbitalEnergy(g.hartree)}`).join(' · ') : null;
    const homoIndex = (rows.find(o => o.role === 'HOMO') ?? rows[firstOccupied])?.index;
    const diffuse = orbitals.some(o => o.class === 'diffuse');
    const lvmo = orbitals.filter(o => o.role === 'LVMO');
    const unclassified = orbitals.some(o => o.occupation === 0) && !orbitals.some(o => o.class !== undefined);
    const unlabelled = orbitals.find(o => o.labelNote);
    const listRef = useRef<HTMLDivElement>(null);
    const homoRef = useRef<HTMLButtonElement>(null);
    // On opening, and for each new molecule -- not on every pick, which
    // would snap the list back while it is being browsed.
    useEffect(() => {
        if (listRef.current && homoRef.current) listRef.current.scrollTop = centredScrollTop(listRef.current, homoRef.current);
    }, [orbitals]);
    return (
        <div className="molecule-orbital-list" ref={listRef}>
            {rows.map((orbital, position) => {
                const role = orbital.role ? String(orbital.role) : null;
                const degenerate = counts.get(orbital.index) ?? 1;
                const expectation = orbital.kind === 'valence-virtual' ? '≈ ' : '';
                return (
                    <React.Fragment key={orbital.index}>
                        {position === firstOccupied && gapText && (
                            <div role="separator" aria-label={`${gapText}. ${GAP_CAVEAT}`} className="molecule-orbital-gap">
                                {gapText}
                                <span className="molecule-orbital-gap-caveat">{GAP_CAVEAT}</span>
                            </div>
                        )}
                        <button type="button" aria-pressed={orbital.index === selectedIndex}
                            ref={orbital.index === homoIndex ? homoRef : undefined}
                            className={`molecule-orbital-row${orbital.index === selectedIndex ? ' selected' : ''}`}
                            onClick={() => onSelect(orbital.index)}>
                            <span className="molecule-orbital-label">
                                {orbital.label}
                                {orbital.class === 'diffuse' && (
                                    <span className="molecule-orbital-diffuse" role="img"
                                        aria-label={`diffuse, basis-dependent, ${percentValence(orbital)}`}
                                        title={`${percentValence(orbital)}: ${DIFFUSE_NOTE}`}>{DIFFUSE_MARK}</span>
                                )}
                            </span>
                            <span className="molecule-orbital-occupancy">{OCCUPANCY[Math.round(orbital.occupation)] ?? ''}</span>
                            <span className="molecule-orbital-energy">{expectation}{formatOrbitalEnergy(orbital.energyHartree)}</span>
                            {degenerate > 1 && <span className="molecule-orbital-degeneracy">×{degenerate}</span>}
                            {role && <Chip size="small" label={role} className="molecule-orbital-role" />}
                        </button>
                    </React.Fragment>
                );
            })}
            <Typography variant="caption" className="molecule-caption">
                Kohn–Sham orbital energies, {method}. Not ionisation energies.
                {' '}{labelsSentence(symmetry)}
                {diffuse && <>{' '}{DIFFUSE_MARK} diffuse, basis-dependent virtual (under {Math.round(VALENCE_THRESHOLD * 100)} % valence): {DIFFUSE_NOTE}.</>}
                {lvmo.length > 0 && <>{' '}LVMO: the lowest valence virtual orbital, {LVMO_NOTE}{lvmo.some(o => o.kind === 'valence-virtual') ? `; ${VALENCE_VIRTUAL_NOTE} (≈)` : ''}.</>}
                {unclassified && <>{' '}{UNCLASSIFIED_NOTE}</>}
                {unlabelled && <>{' '}?: {unlabelled.labelNote}.</>}
            </Typography>
        </div>
    );
};

export default MoleculeOrbitalList;
```

`src/components/MoleculeNav.tsx`: change the import of `formatOrbitalEnergy` to `import { formatOrbitalEnergy, orbitalTag } from '../molecules/orbital_display';` and replace the "Showing" paragraph's text line

```tsx
                            Showing {drawnOrbital.label}{drawnOrbital.role ? ` (${drawnOrbital.role})` : ''}, {formatOrbitalEnergy(drawnOrbital.energyHartree)}
```

with

```tsx
                            Showing {drawnOrbital.label}{showingTags(drawnOrbital)}, {formatOrbitalEnergy(drawnOrbital.energyHartree)}
```

and add above the component:

```tsx
/** " (LUMO; diffuse, basis-dependent, 55 % valence)": the role and what Phase 6D knows about the orbital. */
const showingTags = (orbital: LibraryMoleculeMeta['orbitals'][number]): string => {
    const tags = [orbital.role, orbitalTag(orbital)].filter(Boolean).join('; ');
    return tags ? ` (${tags})` : '';
};
```

`src/style.css`: after the `.molecule-orbital-gap { … }` rule add

```css
/* Phase 6D: the gap divider's Kohn–Sham caveat, on its own line in the divider's own colour. */
.molecule-orbital-gap-caveat {
  display: block;
  font-size: 10px;
}
/* Phase 6D: the mark beside a diffuse, basis-dependent virtual's label. */
.molecule-orbital-diffuse {
  margin-left: 3px;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/molecules tests/App.molecules.test.tsx tests/a11y` then `npx tsc --noEmit -p tsconfig.json`.
Expected: all pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/molecules/types.ts src/molecules/library_types.ts src/molecules/orbital_display.ts src/components/MoleculeOrbitalList.tsx src/components/MoleculeNav.tsx src/style.css tests/molecules/molecule_nav.test.tsx tests/molecules/valence_threshold.test.ts
git commit -m "feat(molecules): mark diffuse virtuals and the LVMO; both gaps with the Kohn-Sham caveat (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Web — captions and exports

**Estimate:** 45 min.

**Files:**
- Modify: `src/export/caption.ts`, `src/export/run_export.ts`
- Modify: `tests/export/molecule_exports.test.ts`

**Interfaces:**
- Consumes: Task 11's `orbitalTag`, `VALENCE_THRESHOLD`, `DIFFUSE_NOTE`, `LVMO_NOTE`, `VALENCE_VIRTUAL_NOTE`.
- Produces: `MoleculeDrawnSurface`'s orbital form gains `tag?: string`; an MO's view description reads `MO <label> (<role>; <tag>)`; the orbital CSV gains `class,valence_character,kind` columns and, where present, a class legend line and an LVMO line. (The method and geometry lines need no change: they quote `meta.method` and `meta.geometrySource`, which now name D3(BJ), the frequency check and any time-limit stop.)

- [ ] **Step 1: Write the failing tests**

In `tests/export/molecule_exports.test.ts`, add `import { DIFFUSE_NOTE } from '../../src/molecules/orbital_display';`, then in `describe('captions and file stems', …)` append:

```ts
    // Phase 6D: water at def2-TZVPD as library v3 ships it -- a diffuse LUMO and a valence virtual LVMO.
    const V3 = () => water({ symmetry: { pointGroup: 'C2v', labelGroup: 'C2v', labels: 'full-group' }, orbitals: [
        { index: 4, label: '1b1', energyHartree: -0.31, occupation: 2, role: 'HOMO' },
        { index: 5, label: '4a1', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.55, class: 'diffuse' },
        { index: 6, label: 'a1', energyHartree: 0.19, occupation: 0, role: 'LVMO', valenceCharacter: 1, class: 'valence', kind: 'valence-virtual' },
    ] });

    it('a diffuse LUMO and a valence virtual LVMO say what they are', () => {
        expect(viewDescription(drawnStore({ kind: 'mo', index: 5 }, V3()).getState()))
            .toBe('Water (H₂O), MO 4a1 (LUMO; diffuse, basis-dependent, 55 % valence), −0.010 Ha (−0.27 eV), 90 % enclosed');
        expect(viewDescription(drawnStore({ kind: 'mo', index: 6 }, V3()).getState())).toBe('Water (H₂O), MO a1 (LVMO; valence virtual '
            + 'orbital, the antibonding orbital textbooks draw; energy an expectation value), 0.190 Ha (5.17 eV), 90 % enclosed');
        expect(exportFileStem(drawnStore({ kind: 'mo', index: 6 }, V3()).getState())).toBe('orbital-viewer_H2O_mo6-a1');
    });
```

In `describe('CSV: the orbital table', …)`, change the expected header to `'index,label,role,occupation,energy_Ha,energy_eV,class,valence_character,kind'`, the three expected rows to `'0,1a1,,2,-19.13,-520.55381,,,'`, `'4,1b1,HOMO,2,-0.31,-8.4355297,,,'` and `'5,4a1,LUMO,0,0.01,0.27211386,,,'`, and the quoted-label test's expectation to `'\n0,"2a""",HOMO,2,-0.3,'` (unchanged: it is a prefix); then append:

```ts
    it('carries each virtual\'s class, valence share and kind, and says what they mean (Phase 6D)', async () => {
        const meta = water({ orbitals: [
            { index: 4, label: '1b1', energyHartree: -0.31, occupation: 2, role: 'HOMO' },
            { index: 5, label: '4a1', energyHartree: -0.01, occupation: 0, role: 'LUMO', valenceCharacter: 0.55, class: 'diffuse' },
            { index: 6, label: 'a1', energyHartree: 0.19, occupation: 0, role: 'LVMO', valenceCharacter: 1, class: 'valence', kind: 'valence-virtual' },
        ] });
        const text = await readText((await runExport('csv', baseContext(drawnStore({ kind: 'density' }, meta).getState()))).blob);
        const lines = text.replace(/^﻿/, '').split('\n');
        expect(lines).toContain(`# class: a virtual's share inside the intrinsic minimal basis (valence_character); diffuse under 75 %: ${DIFFUSE_NOTE}`);
        expect(lines.some(l => l.startsWith('# LVMO: the lowest valence virtual orbital, the antibonding orbital textbooks draw; kind valence-virtual: '))).toBe(true);
        expect(lines).toContain('5,4a1,LUMO,0,-0.01,-0.27211386,diffuse,0.55,');
        expect(lines).toContain('6,a1,LVMO,0,0.19,5.1701633,valence,1,valence-virtual');
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/export/molecule_exports.test.ts`
Expected: the new captions lack the tags; the CSV header and rows lack the new columns.

- [ ] **Step 3: Implement**

`src/export/caption.ts`: change `import { formatOrbitalEnergy } from '../molecules/orbital_display';` to `import { formatOrbitalEnergy, orbitalTag } from '../molecules/orbital_display';`; change `MoleculeDrawnSurface` to

```ts
export type MoleculeDrawnSurface = 'density' | 'esp' | { mo: number; label: string; role?: string; tag?: string; energyHartree: number };
```

in `moleculeDrawnPicture`, replace

```ts
        surface = { mo: index, label: orbital.label, ...(orbital.role ? { role: orbital.role } : {}), energyHartree: orbital.energyHartree };
```

with

```ts
        // Phase 6D: a diffuse virtual or the LVMO says so wherever the picture travels (spec §4).
        const tag = orbitalTag(orbital);
        surface = { mo: index, label: orbital.label, ...(orbital.role ? { role: orbital.role } : {}), ...(tag ? { tag } : {}),
                    energyHartree: orbital.energyHartree };
```

and in `moleculeViewDescription` replace `const role = surface.role ? ` (${surface.role})` : '';` with

```ts
    const notes = [surface.role, surface.tag].filter(Boolean).join('; ');
    const role = notes ? ` (${notes})` : '';
```

`src/export/run_export.ts`: change `import { HARTREE_TO_EV as ORBITAL_HARTREE_TO_EV } from '../molecules/orbital_display';` to

```ts
import {
    DIFFUSE_NOTE, HARTREE_TO_EV as ORBITAL_HARTREE_TO_EV, LVMO_NOTE, VALENCE_THRESHOLD, VALENCE_VIRTUAL_NOTE,
} from '../molecules/orbital_display';
```

and in `moleculeCsv` replace from `const comments = [` through the end of the row loop with

```ts
    const classified = meta.orbitals.some(o => o.class !== undefined);
    const lvmo = meta.orbitals.some(o => o.role === 'LVMO');
    const valenceVirtual = meta.orbitals.some(o => o.kind === 'valence-virtual');
    const comments = [
        `${moleculeTitle(meta)}: molecular orbitals`,
        `method: ${methodStatement(state)}`,
        ...(moleculeCaveatCaption(state) ? [moleculeCaveatCaption(state)!] : []),
        `energies in hartree (Ha) and electronvolts (eV), 1 Ha = ${ORBITAL_HARTREE_TO_EV} eV`,
        // Phase 6D (spec §4): what a class means travels with the numbers.
        ...(classified ? [`class: a virtual's share inside the intrinsic minimal basis (valence_character); `
            + `diffuse under ${Math.round(VALENCE_THRESHOLD * 100)} %: ${DIFFUSE_NOTE}`] : []),
        ...(lvmo ? [`LVMO: the lowest valence virtual orbital, ${LVMO_NOTE}`
            + (valenceVirtual ? `; kind valence-virtual: ${VALENCE_VIRTUAL_NOTE}` : '')] : []),
        `view: ${shareUrl}`,
    ];
    const lines = comments.map(line => `# ${line}`);
    lines.push('index,label,role,occupation,energy_Ha,energy_eV,class,valence_character,kind');
    for (const orbital of [...meta.orbitals].sort((a, b) => a.index - b.index)) {
        const at = orbital.index;
        lines.push([
            String(orbital.index), quote(orbital.label), orbital.role ?? '',
            formatNumber(orbital.occupation, 'occupation', at),
            formatNumber(orbital.energyHartree, 'energy_Ha', at),
            formatNumber(orbital.energyHartree * ORBITAL_HARTREE_TO_EV, 'energy_eV', at),
            orbital.class ?? '',
            orbital.valenceCharacter === undefined ? '' : formatNumber(orbital.valenceCharacter, 'valence_character', at),
            orbital.kind ?? '',
        ].join(','));
    }
```

(The `return \`${lines.join('\n')}\n\`;` after the loop stays.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/export` then `npx tsc --noEmit -p tsconfig.json`.
Expected: all pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/export/caption.ts src/export/run_export.ts tests/export/molecule_exports.test.ts
git commit -m "feat(export): captions and the orbital CSV say which virtuals are diffuse and which is the LVMO (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Web — provenance, legacy jobs, recipe text, validation honesty

**Estimate:** 75 min.

**Files:**
- Modify: `src/molecules/types.ts`, `src/molecules/library_types.ts`, `src/molecules/job_paths.ts`, `src/components/TierBadge.tsx`, `src/components/RequestPanel.tsx`, `src/validation/references.ts`
- Rewrite: `src/components/ProvenancePanel.tsx`
- Create: `src/validation/geometry_honesty.ts`
- Modify: `tests/jobs/provenance_panel.test.tsx`, `tests/jobs/computed_loader.test.ts`
- Test: `tests/validation/geometry_honesty.test.ts`

**Interfaces:**
- Consumes: Task 8's meta (`frequencyCheck`, `geometryOptimisation.stoppedBy/maxGradient/displacedFrom`, `provenance.geometryMethod/frequencyCheck/timeLimitSeconds`), Task 5's `meta.dispersion` and the validation rows' `geometrySource`/`notATest`.
- Produces:
  - `types.ts`: `FrequencyCheck` (`result`, `summary`, optional `imaginaryCount`, `imaginaryWavenumbers`, `noiseWavenumbers`, `lowestWavenumber`, `zeroPointEnergyHartree`, `method`); `MoleculeProvenance` gains optional `geometryMethod`, `frequencyCheck: string | null`, `timeLimitSeconds: number | null`
  - `library_types.ts`: `LibraryExtras` gains optional `frequencyCheck`, `dispersion: { model; energyHartree; backend }`, and `geometryOptimisation.stoppedBy`, `.displacedFrom`
  - `job_paths.computedResultFiles(recipe, extras: { frequencies?: boolean } = {})`
  - `geometry_honesty.ts`: `NOT_A_TEST` (the spec's words), `countsAsValidation(row) -> boolean`, `isExperimentalGeometry(source) -> boolean`
  - `references.ts`: `ValidationRow` gains optional `geometrySource`, `notATest`; `METHOD_VALIDATION` (the rows that count as validation of the method)

- [ ] **Step 1: Write the failing tests**

Create `tests/validation/geometry_honesty.test.ts`:

```ts
import { METHOD_VALIDATION, VALIDATION } from '../../src/validation/references';
import { NOT_A_TEST, countsAsValidation } from '../../src/validation/geometry_honesty';

// Phase 6D spec §5: a bond or angle of a geometry taken from experiment, compared with that experiment, is a
// transcription check; it says so and no "agrees with experiment" summary counts it.
describe('validation honesty', () => {
    const phase6 = VALIDATION.filter(row => row.phase === 6);
    it('every library row says where its geometry came from', () => {
        expect(phase6.length).toBeGreaterThan(0);
        for (const row of phase6) expect(row.geometrySource && row.geometrySource.length).toBeTruthy();
    });
    it('marks exactly the bond and angle rows of experimental geometries, in the spec\'s words', () => {
        expect(NOT_A_TEST).toBe('geometry from experiment (not a test of the method)');
        for (const row of phase6) {
            const geometryRow = /^(bond length|angle) /.test(row.quantity);
            const fromExperiment = row.geometrySource!.startsWith('experiment');
            expect([row.system, row.quantity, row.notATest ?? null]).toEqual([row.system, row.quantity, geometryRow && fromExperiment ? NOT_A_TEST : null]);
        }
    });
    it('leaves them out of the method\'s validation, and keeps the dipoles', () => {
        expect(METHOD_VALIDATION).toEqual(VALIDATION.filter(countsAsValidation));
        expect(METHOD_VALIDATION.some(row => row.notATest)).toBe(false);
        expect(METHOD_VALIDATION.filter(row => row.phase === 6 && row.quantity === 'dipole moment').length)
            .toBe(phase6.filter(row => row.quantity === 'dipole moment').length);
        expect(METHOD_VALIDATION.some(row => row.phase === 6 && /^bond length/.test(row.quantity))).toBe(true);   // the optimised seven's
    });
});
```

In `tests/jobs/computed_loader.test.ts`, after the existing `computedResultFiles` expectations add:

```ts
        expect(computedResultFiles('optimise', { frequencies: true })).toEqual(
            ['input.py', 'output.log', 'geometry.xyz', 'job.json', 'trajectory.xyz', 'frequencies.json']);
```

In `tests/jobs/provenance_panel.test.tsx`: change the validated TierBadge expectation to `'ValidatedCurated; its dipole, and an optimised geometry, checked against published values.'`, and append inside `describe('ProvenancePanel', …)`:

```tsx
    // Phase 6D: what compute version 2 writes.
    const D3 = { density: 'B3LYP-D3(BJ)/def2-TZVPD', energies: 'B3LYP-D3(BJ)/def2-TZVPD' };
    const checked = (extra: Record<string, unknown> = {}, over: Partial<MoleculeProvenance> = {}) => computed(
        { computeVersion: 2, recipe: 'optimise', geometrySource: { kind: 'xyz' }, geometryMethod: 'B3LYP-D3(BJ)/def2-SVP',
          frequencyCheck: 'true minimum (no imaginary frequencies)', timeLimitSeconds: 600, ...over },
        { method: D3, totalEnergyHartree: -76.358723, dispersion: { model: 'D3(BJ)', energyHartree: -0.000574, backend: 'pyscf-dispersion 1.5.0' },
          geometryOptimisation: { steps: 4, converged: true },
          frequencyCheck: { result: 'minimum', summary: 'true minimum (no imaginary frequencies)', imaginaryCount: 0,
                            zeroPointEnergyHartree: 0.021134, method: 'B3LYP-D3(BJ)/def2-SVP' }, ...extra });

    it('states the dispersion correction and that the total energy includes it', () => {
        render(<ProvenancePanel meta={checked()} ownerJob={null} />);
        open();
        expect(screen.getByText('Dispersion: Grimme D3(BJ) (Becke–Johnson damping), computed with pyscf-dispersion 1.5.0. '
            + 'It changes energies and forces only, not the orbitals, density or potential. '
            + 'Total energy −76.358723 Ha, including −0.000574 Ha of D3(BJ).')).toBeInTheDocument();
        expect(screen.getByText(/optimised at B3LYP-D3\(BJ\)\/def2-SVP with geomeTRIC in 4 steps/)).toBeInTheDocument();
        expect(screen.queryByText(/before dispersion was added/)).toBeNull();
    });
    it('states the frequency check and links frequencies.json', () => {
        render(<ProvenancePanel meta={checked()} ownerJob={null} />);
        open();
        expect(screen.getByText('Frequency check (B3LYP-D3(BJ)/def2-SVP): true minimum (no imaginary frequencies); '
            + 'zero-point energy 0.021134 Ha.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'frequencies.json' })).toHaveAttribute('href', `/molecules/jobs/${KEY}/frequencies.json`);
    });
    it('says a saddle point is a saddle point, and a time-limited optimisation is not converged', () => {
        render(<ProvenancePanel meta={checked({
            geometryOptimisation: { steps: 30, converged: false, stoppedBy: 'time-limit', maxGradient: 0.0021 },
            frequencyCheck: { result: 'not-run', summary: 'not checked: the optimisation stopped at its time limit',
                              method: 'B3LYP-D3(BJ)/def2-SVP' } })} ownerJob={null} />);
        open();
        expect(screen.getByText('The optimisation stopped at its time limit, not converged (max force 2.1e-3 Ha/bohr).')).toBeInTheDocument();
        expect(screen.getByText(/Frequency check \(B3LYP-D3\(BJ\)\/def2-SVP\): not checked: the optimisation stopped at its time limit\./)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'frequencies.json' })).toBeNull();
    });
    it('a legacy job says it was computed before dispersion (Review Focus 5)', () => {
        render(<ProvenancePanel meta={computed({ recipe: 'optimise', geometrySource: { kind: 'xyz' } }, { geometryOptimisation: { steps: 7, converged: true } })} ownerJob={null} />);
        open();
        expect(screen.getByText('Computed before dispersion was added (compute version 1): B3LYP/def2-TZVPD without D3(BJ), '
            + 'and its optimised structure was not checked for imaginary frequencies.')).toBeInTheDocument();
        expect(screen.queryByText(/^Frequency check/)).toBeNull();
        expect(screen.queryByText(/^Dispersion:/)).toBeNull();
    });
    it('says an experimental geometry\'s bond and angle are not a test of the method', () => {
        render(<ProvenancePanel meta={waterMeta({ method: TZVPD, references: [
            { quantity: 'bond', value: 0.958, unit: 'Å', source: 'experiment (CCCBDB)', tolerance: 0.01 },
            { quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook, via CCCBDB', tolerance: 0.1855 }] })} ownerJob={null} />);
        open();
        expect(screen.getByText('bond: 0.958 Å — experiment (CCCBDB); geometry from experiment (not a test of the method)')).toBeInTheDocument();
        expect(screen.getByText('dipole: 1.855 D — CRC Handbook, via CCCBDB')).toBeInTheDocument();
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/validation/geometry_honesty.test.ts tests/jobs/provenance_panel.test.tsx tests/jobs/computed_loader.test.ts`
Expected: failures — no `geometry_honesty` module, no `METHOD_VALIDATION`, the new panel lines absent.

- [ ] **Step 3: Implement the types, paths and validation helpers**

`src/molecules/types.ts`: add above `export interface MoleculeProvenance`:

```ts
/** Recipe B's frequency check (Phase 6D spec §7), as meta.json's `frequencyCheck` carries it. */
export interface FrequencyCheck {
    result: 'minimum' | 'minimum-after-displacement' | 'saddle-point' | 'not-run' | 'not-rechecked';
    summary: string;
    imaginaryCount?: number;
    imaginaryWavenumbers?: number[];
    noiseWavenumbers?: number[];
    lowestWavenumber?: number | null;
    zeroPointEnergyHartree?: number;
    method?: string | null;
}
```

and add to `MoleculeProvenance`, before `costUsd`:

```ts
    /** Phase 6D (compute version 2): the optimisation's level, the frequency check's summary, the time limit the budget worked to. */
    geometryMethod?: string | null;
    frequencyCheck?: string | null;
    timeLimitSeconds?: number | null;
```

`src/molecules/library_types.ts`: in `LibraryExtras.geometryOptimisation` add after `resumedFrom?: number;`

```ts
        /** Phase 6D: 'time-limit' when the worker's time budget stopped the optimisation (spec §9); then `converged` is false. */
        stoppedBy?: 'time-limit';
        /** Phase 6D: the imaginary-frequency count of the saddle point it was displaced from and re-optimised (spec §7). */
        displacedFrom?: number;
```

and after the `caveat?: string;` member:

```ts
    /** Phase 6D: recipe B's frequency check. */
    frequencyCheck?: FrequencyCheck;
    /** Phase 6D: the D3(BJ) term inside totalEnergyHartree, and what computed it. */
    dispersion?: { model: string; energyHartree: number; backend: string };
```

importing `FrequencyCheck` from `./types` (extend the file's `import type { MoleculeMeta, MoleculeAtom, GridSpec } from './types';`).

`src/molecules/job_paths.ts`: replace `computedResultFiles` with

```ts
/** The files a finished job leaves beside Phase 6's (spec §5.3), in the order the provenance panel lists them;
 * `frequencies` adds recipe B's frequencies.json (Phase 6D), written when its frequency check ran. */
export function computedResultFiles(recipe: 'single' | 'optimise', extras: { frequencies?: boolean } = {}): string[] {
    return ['input.py', 'output.log', 'geometry.xyz', 'job.json', ...(recipe === 'optimise' ? ['trajectory.xyz'] : []),
        ...(extras.frequencies ? ['frequencies.json'] : [])];
}
```

Create `src/validation/geometry_honesty.ts`:

```ts
/**
 * Phase 6D spec §5: for a library molecule whose geometry is taken from experiment, its bond lengths and
 * angles compared with that same experiment are a transcription check, not a test of the method. Such rows
 * carry NOT_A_TEST (tools/molecules/build_library.py writes it) and no "agrees with experiment" summary may
 * count them; dipoles and other properties computed at those geometries still count. Light on purpose: the
 * provenance panel imports it, which references.ts (it computes rows at import) must not be.
 */
export const NOT_A_TEST = 'geometry from experiment (not a test of the method)';

export function countsAsValidation(row: { notATest?: string }): boolean {
    return !row.notATest;
}

export function isExperimentalGeometry(geometrySource: string): boolean {
    return geometrySource.startsWith('experiment');
}
```

`src/validation/references.ts`: add `import { countsAsValidation } from './geometry_honesty';` to the imports; in `ValidationRow`, after `knownMiss?: string;` add

```ts
    /** Phase 6D: where the geometry behind this row came from (the library's rows; meta.json's geometrySource). */
    geometrySource?: string;
    /** Phase 6D: set (geometry_honesty.NOT_A_TEST) on a bond or angle of a geometry taken from experiment. */
    notATest?: string;
```

and after `export const VALIDATION …;` add

```ts
/** The rows that test the method (Phase 6D spec §5): every row but an experimental geometry's own bonds and angles. */
export const METHOD_VALIDATION: ValidationRow[] = VALIDATION.filter(countsAsValidation);
```

`src/components/TierBadge.tsx`: change the validated line to `'Curated; its dipole, and an optimised geometry, checked against published values.'`.

`src/components/RequestPanel.tsx`: replace the two `RECIPES` entries' `detail` strings with
`'B3LYP-D3(BJ)/def2-TZVPD at the geometry given. Geometry is PubChem’s force-field conformer (or as pasted), not optimised.'` and
`'B3LYP-D3(BJ)/def2-SVP optimisation (geomeTRIC), a frequency check that confirms a minimum (a saddle point is displaced and re-optimised once), then B3LYP-D3(BJ)/def2-TZVPD. One conformer: the minimum nearest the start.'`.

- [ ] **Step 4: Rewrite `src/components/ProvenancePanel.tsx`**

```tsx
import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Link, Typography } from '@mui/material';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import { tierOf, MoleculeProvenance } from '../molecules/types';
import { computedResultFiles, jobFileUrl } from '../molecules/job_paths';
import { capacityLabel, formatDuration, formatGB, money, predictionNote, quotedCost } from '../jobs/format';
import type { JobView } from '../jobs/api_types';
import { NOT_A_TEST, isExperimentalGeometry } from '../validation/geometry_honesty';

export const PUBCHEM_COMPOUND_URL = 'https://pubchem.ncbi.nlm.nih.gov/compound/';
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

interface ProvenancePanelProps {
    meta: LibraryMoleculeMeta;
    /** The owner's view of this molecule's job (GET /api/v1/jobs/{key}); null for anyone else, or until it arrives. */
    ownerJob: JobView | null;
    ownerJobError?: string | null;
}

const hartree = (value: number) => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(6)}`;

/** Recipe B's level: recorded from compute version 2; before it, recipe B always optimised at B3LYP/def2-SVP. */
const geometryMethod = (provenance: MoleculeProvenance) => provenance.geometryMethod ?? 'B3LYP/def2-SVP';

function Geometry({ provenance, steps, resumedFrom }: { provenance: MoleculeProvenance; steps: number | null; resumedFrom: number | null }) {
    const source = provenance.geometrySource;
    const origin = source.kind === 'pubchem'
        ? <>PubChem CID <Link href={`${PUBCHEM_COMPOUND_URL}${source.cid}`} {...EXTERNAL}>{source.cid}</Link> ({source.title}), its computed 3D conformer, retrieved {source.retrievedAt}</>
        : <>pasted XYZ coordinates</>;
    if (provenance.recipe === 'single') return <Typography variant="body2">Geometry: {origin}, not optimised.</Typography>;
    // M5: a resumed attempt's step count is this attempt's, said once, beside the resumption.
    if (resumedFrom !== null) {
        return (
            <Typography variant="body2">
                Geometry: optimised at {geometryMethod(provenance)} with geomeTRIC, starting from {origin}, resumed from attempt {resumedFrom}’s last frame
                {steps !== null ? ` (${steps} steps in this attempt)` : ''}.
            </Typography>
        );
    }
    return (
        <Typography variant="body2">
            Geometry: optimised at {geometryMethod(provenance)} with geomeTRIC{steps !== null ? ` in ${steps} steps` : ''}, starting from {origin}.
        </Typography>
    );
}

/** Spec §6: D3(BJ) moves energies and forces, and the total energy shown includes it -- said where it is shown. */
function Dispersion({ meta }: { meta: LibraryMoleculeMeta }) {
    const d = meta.dispersion;
    if (!d) return null;
    return (
        <Typography variant="body2">
            Dispersion: Grimme {d.model} (Becke–Johnson damping), computed with {d.backend}. It changes energies and forces only, not the orbitals, density or potential.
            {' '}Total energy {hartree(meta.totalEnergyHartree)} Ha, including {hartree(d.energyHartree)} Ha of {d.model}.
        </Typography>
    );
}

/** Spec §7, §9: a time-limited optimisation and the frequency check say what they found, in the panel as in the viewer. */
function StructureChecks({ meta }: { meta: LibraryMoleculeMeta }) {
    const optimisation = meta.geometryOptimisation;
    const check = meta.frequencyCheck;
    const zpe = check?.zeroPointEnergyHartree;
    return (
        <>
            {optimisation?.stoppedBy === 'time-limit' && (
                <Typography variant="body2">
                    The optimisation stopped at its time limit, not converged (max force {optimisation.maxGradient?.toExponential(1)} Ha/bohr).
                </Typography>
            )}
            {check && (
                <Typography variant="body2">
                    Frequency check{check.method ? ` (${check.method})` : ''}: {check.summary}{zpe !== undefined ? `; zero-point energy ${zpe.toFixed(6)} Ha` : ''}.
                </Typography>
            )}
        </>
    );
}

/** Spec §11: a job computed before Phase 6D keeps its method, and says so. */
function Legacy({ meta, provenance }: { meta: LibraryMoleculeMeta; provenance: MoleculeProvenance }) {
    if (provenance.computeVersion >= 2) return null;
    return (
        <Typography variant="body2" className="provenance-legacy">
            Computed before dispersion was added (compute version {provenance.computeVersion}): {meta.method.density} without D3(BJ)
            {provenance.recipe === 'optimise' ? ', and its optimised structure was not checked for imaginary frequencies' : ''}.
        </Typography>
    );
}

/** Time against its prediction, and the money -- the owner's numbers, read from the job record (meta's costUsd is always null). */
function OwnerFacts({ job }: { job: JobView }) {
    const { sizing, actual } = job;
    // Phase 6C: an AWS job approved from a quote says its maximum and what it was charged; This Mac's
    // runs are free, and a record from before quotes keeps its reservation and actual cost.
    const quoted = job.backend === 'local' ? null : quotedCost(job);
    const cost = quoted ?? (job.actualUsd === null ? `${money('reserved', job.reservedUsd)}, not settled yet` : money('spent', job.actualUsd));
    return (
        <Typography variant="body2" className="provenance-owner">
            Owner only: {actual ? `${formatDuration(actual.wallSeconds)} of wall time, peak memory ${formatGB(actual.peakMemoryGB)}` : 'no timings recorded'}
            {' '}(predicted {formatDuration(sizing.predictedSeconds)} and {formatGB(sizing.predictedMemoryGB)}, {predictionNote(sizing.version)}).
            {' '}Cost: {cost}{job.backend === 'local' ? ' (This Mac)' : ''}.
        </Typography>
    );
}

/**
 * Spec §9.3: on every molecule, whichever tier, how it was computed -- the
 * method, where the geometry came from, what to be wary of, and for a
 * computed molecule the very files that produced it, input.py first, so
 * anyone can run it again. Phase 6D adds the dispersion term, the frequency
 * check and the time-limit stop, says when a job predates them, and marks an
 * experimental geometry's own bond and angle as no test of the method.
 */
const ProvenancePanel: React.FC<ProvenancePanelProps> = ({ meta, ownerJob, ownerJobError = null }) => {
    const provenance = tierOf(meta) === 'computed' ? meta.provenance ?? null : null;
    // 6B-1's worker records {steps, converged, resumedFrom?} for recipe B (D10: LibraryExtras.geometryOptimisation widened to match it).
    const steps = meta.geometryOptimisation?.steps ?? null;
    const resumedFrom = meta.geometryOptimisation?.resumedFrom ?? null;
    const frequencies = Boolean(meta.frequencyCheck && meta.frequencyCheck.result !== 'not-run');
    const experimental = isExperimentalGeometry(meta.geometrySource);
    return (
        <Accordion disableGutters className="provenance-panel" slotProps={{ transition: { unmountOnExit: true } }}>
            <AccordionSummary aria-controls="provenance-body" id="provenance-head">How this was computed</AccordionSummary>
            {/* m5: MUI gives the details' region the summary's aria-controls id itself. */}
            <AccordionDetails className="provenance-body">
                <Typography variant="body2">Method: {meta.method.density}, PySCF {provenance?.pyscfVersion ?? meta.generator.pyscf}.</Typography>
                <Dispersion meta={meta} />
                {provenance ? (
                    <>
                        <Legacy meta={meta} provenance={provenance} />
                        <Geometry provenance={provenance} steps={steps} resumedFrom={resumedFrom} />
                        <StructureChecks meta={meta} />
                        <Typography variant="subtitle2">Caveats</Typography>
                        <ul className="provenance-list">{provenance.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul>
                        <Typography variant="subtitle2">Files</Typography>
                        <ul className="provenance-list">
                            {computedResultFiles(provenance.recipe, { frequencies }).map(name => (
                                <li key={name}><Link href={jobFileUrl(provenance.jobKey, name)} {...EXTERNAL}>{name}</Link></li>
                            ))}
                        </ul>
                        <Typography variant="body2">
                            Ran on {capacityLabel(provenance.capacity)}{provenance.capacity === 'local' ? '' : `, worker size ${provenance.size}`}:
                            {' '}{formatDuration(provenance.wallSeconds)} of wall time. Generator commit {provenance.generatorCommit.slice(0, 7)}; sized by sizing rule v{provenance.sizingVersion}.
                        </Typography>
                        {ownerJob && <OwnerFacts job={ownerJob} />}
                        {ownerJobError && <Typography variant="caption" role="alert">The job record could not be read: {ownerJobError}</Typography>}
                    </>
                ) : (
                    <>
                        <Typography variant="body2">Geometry: {meta.geometrySource}.</Typography>
                        <Typography variant="subtitle2">Checked against</Typography>
                        <ul className="provenance-list">
                            {meta.references.map((reference, index) => (
                                <li key={index}>
                                    {reference.quantity}: {reference.value} {reference.unit} — {reference.source}
                                    {experimental && (reference.quantity === 'bond' || reference.quantity === 'angle') ? `; ${NOT_A_TEST}` : ''}
                                </li>
                            ))}
                        </ul>
                        <Typography variant="body2">Generated by {meta.generator.script} at commit {meta.generator.commit.slice(0, 7)}.</Typography>
                    </>
                )}
            </AccordionDetails>
        </Accordion>
    );
};

export default ProvenancePanel;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/validation tests/jobs tests/molecules tests/admin src/App.jobs.test.tsx tests/App.molecules.test.tsx` then `npx tsc --noEmit -p tsconfig.json`, then the whole suite `npx jest` (about a minute).
Expected: all pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/molecules/types.ts src/molecules/library_types.ts src/molecules/job_paths.ts src/components/ProvenancePanel.tsx src/components/TierBadge.tsx src/components/RequestPanel.tsx src/validation/geometry_honesty.ts src/validation/references.ts tests/validation/geometry_honesty.test.ts tests/jobs/provenance_panel.test.tsx tests/jobs/computed_loader.test.ts
git commit -m "feat(ui): provenance states D3(BJ), the frequency check and legacy methods; honest validation (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Library v3 generation inside the worker image

**Estimate:** 2 h 30 min wall, most of it compute in OrbStack (re-optimising the seven 30–45 min; the ten diatomics about 15 min, their CCSD(T) points already cached in `tools/molecules/.cache`; the 25 library molecules 45–60 min at 1–5 min each; tests, manifest and commit 15 min). Every command below is one foreground call under 9 minutes; a call that is cut off is simply run again.

**Files:**
- Modify: `tools/molecules/geometries/{ch3oh,hcooh,ethanol,acetone,pyridine,formamide,glycine}.xyz` (re-optimised)
- Modify: `tools/molecules/version.py` (`DATA_VERSION = "v3"`), `src/molecules/data_version.ts` (`'v3'`)
- Modify: `tools/molecules/tests/test_library_data.py` (v3 assertions)
- Create: `tools/molecules/manifest/v3.json`; the new directory `tools/molecules/out/v3/` (git-ignored, never committed)
- Regenerate: `src/validation/generated/phase6_library.json`, `src/validation/generated/phase5_diatomics.json`

**Interfaces:**
- Consumes: everything in Tasks 1–5 (`in_image.sh`, D3, labels, virtual classes, honest rows, `MOLECULES_GENERATOR_COMMIT`); `publish.py --manifest-only`/`--dry-run` (no AWS).
- Produces: a complete, single-commit `out/v3/` tree and its committed manifest, for Task 15 to publish.

- [ ] **Step 1: Preconditions**

Run: `git status --porcelain` — must print nothing. Run: `docker image inspect orbital-viewer-worker:local --format '{{.Id}}'` — must print an id. Run: `git diff --quiet "$(docker run --rm --entrypoint printenv orbital-viewer-worker:local JOBS_GENERATOR_COMMIT)" HEAD -- tools/molecules/requirements.lock && echo lock-unchanged` — must print `lock-unchanged`; otherwise rebuild the image first with Task 2 Step 6's command. (The image supplies only the Python environment; the code that runs is the checkout's.)

- [ ] **Step 2: Re-optimise the seven at B3LYP-D3(BJ)/def2-TZVP**

For each id in `ch3oh hcooh ethanol acetone pyridine formamide glycine`, run until the printed dict says `'converged': True` (each run takes up to 6 geomeTRIC steps from the last geometry; v2's B3LYP minimum is the start, so 1–3 runs each):

`tools/molecules/in_image.sh tools/molecules/optimise.py ch3oh --steps 6`

Expected: `ch3oh {'converged': True, 'maxGradient': …e-05, 'basis': 'def2-TZVP'}` and `head -2 tools/molecules/geometries/ch3oh.xyz` ending `method=B3LYP-D3(BJ)/def2-TZVP`. Then `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_library.py tools/molecules/tests/test_optimise.py -q` — passes.

- [ ] **Step 3: Write the v3 data assertions (they skip until v3 exists)**

Append to `tools/molecules/tests/test_library_data.py` (add `from library import OPTIMISED` to its imports, and `from version import DATA_VERSION` beside `OUT_ROOT`):

```python
# Phase 6D, from data version v3: full-group labels, honest virtuals, D3(BJ), honest validation rows.
V3 = pytest.mark.skipif(int(DATA_VERSION[1:]) < 3, reason='Phase 6D assertions apply from data version v3')
TEXTBOOK_HOMO = {'ch4': '1t2', 'sih4': '2t2', 'nh3': '3a1', 'ph3': '5a1', 'c2h6': '1eg', 'bf3': "1a2'", 'sf6': '1t1g',
                 'benzene': '1e1g', 'h2o': '1b1', 'co2': '1πg', 'c2h2': '1πu', 'hcn': '1π'}


@V3
@pytest.mark.parametrize('molecule_id', sorted(TEXTBOOK_HOMO))
def test_v3_homos_carry_their_full_group_labels(molecule_id):
    m = meta(by_id(molecule_id))
    assert {o['label'] for o in m['orbitals'] if o.get('role') == 'HOMO'} == {TEXTBOOK_HOMO[molecule_id]}
    assert m['symmetry']['labels'] == 'full-group' and m['symmetry']['labelGroup'] == m['symmetry']['pointGroup']


@V3
@pytest.mark.parametrize('molecule_id', ['h2o', 'nh3', 'ch4'])
def test_v3_diffuse_lumo_and_a_valence_lvmo(molecule_id):
    orbitals = meta(by_id(molecule_id))['orbitals']
    assert all(o['class'] == 'diffuse' for o in orbitals if o.get('role') == 'LUMO')
    lvmo = [o for o in orbitals if o.get('role') == 'LVMO']
    assert lvmo and all(o['class'] == 'valence' for o in lvmo)


@V3
def test_v3_benzenes_lumo_is_its_valence_pi_star_with_no_separate_lvmo():
    orbitals = meta(by_id('benzene'))['orbitals']
    assert [(o['label'], o['class']) for o in orbitals if o.get('role') == 'LUMO'] == [('1e2u', 'valence')] * 2
    assert not [o for o in orbitals if o.get('role') == 'LVMO']


@V3
@EACH
def test_v3_method_dispersion_and_classes(entry):
    m = meta(entry)
    assert m['method'] == {'density': 'B3LYP-D3(BJ)/def2-TZVPD', 'energies': 'B3LYP-D3(BJ)/def2-TZVPD'}
    assert m['dispersion']['model'] == 'D3(BJ)' and m['dispersion']['energyHartree'] < 0
    assert m['dispersion']['backend'] == 'pyscf-dispersion 1.5.0'          # generated inside the worker image
    assert all(o['class'] in ('valence', 'diffuse') for o in m['orbitals'] if o['occupation'] == 0)
    assert all(o['label'] != '?' for o in m['orbitals']), [o.get('labelNote') for o in m['orbitals'] if o['label'] == '?']
    assert m['generator']['dataVersion'] == 'v3'
    if entry.optimised:
        assert m['geometrySource'] == OPTIMISED


@V3
def test_v3_rows_say_which_geometry_checks_test_the_method():
    rows = json.loads((REPO / 'src' / 'validation' / 'generated' / 'phase6_library.json').read_text())
    for row in rows:
        geometry = row['quantity'].startswith(('bond length', 'angle'))
        assert ('notATest' in row) == (geometry and row['geometrySource'].startswith('experiment')), row
```

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_library_data.py -q`
Expected: passes or skips as before against `out/v2` (`DATA_VERSION` is still `v2`, so every `V3` test skips).

- [ ] **Step 4: Bump the data version and commit the generator's inputs**

Set `DATA_VERSION = "v3"` in `tools/molecules/version.py`. Run `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_library_data.py -q` — every test skips (`out/v3/index.json` does not exist yet).

```bash
git add tools/molecules/version.py tools/molecules/geometries tools/molecules/tests/test_library_data.py
git commit -m "data(molecules): the seven re-optimised at B3LYP-D3(BJ)/def2-TZVP; data version v3 (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

This commit is the generator commit every v3 `meta.json` records; `tools/molecules` must stay clean from here to Step 7. (`tests/molecules/data_version.test.ts` is red from this commit until Step 9 commits `data_version.ts` and the v3 manifest; nothing deploys in between, and `infra/deploy.sh` refuses a version mismatch anyway.)

- [ ] **Step 5: Generate the ten diatomics (Bonds mode) at the v3 commit**

Run, one line per call:

```
tools/molecules/in_image.sh tools/molecules/generate.py --only h2 he2 li2
tools/molecules/in_image.sh tools/molecules/generate.py --only b2 c2
tools/molecules/in_image.sh tools/molecules/generate.py --only n2 o2
tools/molecules/in_image.sh tools/molecules/generate.py --only f2 co hf
```

Expected: `<id>: scanning 20 geometries`, a line per point, and `tools/molecules/out/v3/<id>/` with `meta.json`, `scan.json`, `basis.json`, `density.bin.gz` and `scan/`. Their method is unchanged (CCSD(T) curves, B3LYP/def2-TZVP densities: spec §6's D3 is the library's and the jobs', not Bonds mode's); only provenance differs from v2.

- [ ] **Step 6: Generate the 25 library molecules**

Run, one line per call (each 2–9 minutes; split a batch if one runs long):

```
tools/molecules/in_image.sh tools/molecules/build_library.py --only h2o,nh3,ch4,co2
tools/molecules/in_image.sh tools/molecules/build_library.py --only c2h2,c2h4,c2h6
tools/molecules/in_image.sh tools/molecules/build_library.py --only hcn,h2co,bf3
tools/molecules/in_image.sh tools/molecules/build_library.py --only sih4,sf6
tools/molecules/in_image.sh tools/molecules/build_library.py --only o3,no2,so2
tools/molecules/in_image.sh tools/molecules/build_library.py --only ph3,h2s
tools/molecules/in_image.sh tools/molecules/build_library.py --only benzene
tools/molecules/in_image.sh tools/molecules/build_library.py --only ch3oh,hcooh
tools/molecules/in_image.sh tools/molecules/build_library.py --only ethanol,acetone
tools/molecules/in_image.sh tools/molecules/build_library.py --only pyridine
tools/molecules/in_image.sh tools/molecules/build_library.py --only formamide,glycine
```

Expected per molecule: `<id>: NNNNNN bytes in NN s`. Record each call's wall time for the HANDOFF. Then the rows, on the Mac (no D3 needed): `tools/molecules/.venv/bin/python tools/molecules/build_library.py --rows-only` → `NN validation rows`.

- [ ] **Step 7: Check the data**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/tests/test_library_data.py tools/molecules/test_generated_data.py -q`
Expected: all pass, the `V3` tests included. A failure is a finding, not a test to loosen: stop and report it to the controller with the printed values (for example an unlabelled `?` set and its note, or a conformer that moved).

Run: `tools/molecules/.venv/bin/python tools/molecules/publish.py v3 --manifest-only`
Expected: `wrote …/manifest/v3.json (NNN files, generated by pyscf 2.8.0 at <the Step 4 commit>)`. It refuses a dirty or mixed-commit tree; if it does, list the commits the metas carry (`grep -H '"commit"' tools/molecules/out/v3/*/meta.json`), regenerate any molecule not at the Step 4 commit, and rerun.

Run: `tools/molecules/.venv/bin/python tools/molecules/publish.py v3 --dry-run | tail -3`
Expected: the planned keys, `molecules/v3/manifest.json` then `molecules/v3/index.json` last. No AWS call is made.

- [ ] **Step 8: Point the app at v3**

In `src/molecules/data_version.ts` set `export const MOLECULE_DATA_VERSION = 'v3';`.

- [ ] **Step 9: Run the client suite and commit**

Run: `npx jest` (about a minute) and `npx tsc --noEmit -p tsconfig.json`. Expected: all pass (`tests/molecules/data_version.test.ts` now finds `manifest/v3.json`; `tests/validation` reads the v3 rows).

```bash
git add tools/molecules/manifest/v3.json src/molecules/data_version.ts src/validation/generated/phase6_library.json src/validation/generated/phase5_diatomics.json
git commit -m "data(molecules): library v3 generated in the worker image; manifest and validation rows (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Publish v3 (controller-confirmed)

**Estimate:** 45 min (about 480 objects, each uploaded and checked through S3 with its own AWS CLI calls; `publish.py` resumes where a cut-off run stopped).

**Files:** none changed (S3 only).

**Interfaces:**
- Consumes: Task 14's `out/v3/` and `manifest/v3.json`; the site stack's data bucket and CloudFront distribution.
- Produces: `molecules/v3/` on S3, immutable, `index.json` last; v1 and v2 untouched.

- [ ] **Step 1: Ask the controller for confirmation**

Publishing is outward-facing and permanent: a published version is immutable (a mistake needs v4). Show the controller the manifest's file count, the generator commit and Task 14's test results, and wait for a go-ahead. The AWS CLI must resolve region us-east-1; never read `infra/owner.env`.

- [ ] **Step 2: Publish**

Run (timeout 600000 ms; if the call is cut off, run it again — it skips every object already uploaded and verified):
`AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 tools/molecules/.venv/bin/python tools/molecules/publish.py v3`
Expected, eventually: `published NNN files as v3`. `molecules/v3/ is already published` on a rerun after success is also fine.

- [ ] **Step 3: Verify through CloudFront**

Run: `AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 tools/molecules/.venv/bin/python tools/molecules/publish.py v3 --verify-only`
Expected: `v3: every file verified through CloudFront`.

Run: `URL=$(AWS_REGION=us-east-1 aws cloudformation describe-stacks --stack-name ElectronOrbitalViewerStack --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" --output text); curl -s -o /dev/null -w '%{http_code}\n' "$URL/molecules/v3/index.json"; curl -s -o /dev/null -w '%{http_code}\n' "$URL/molecules/v2/index.json"`
Expected: `200` and `200` (v2 stays on S3). Nothing to commit; record the counts for the HANDOFF.

---

### Task 16: Deploy the image, the compute stack and the site (controller-confirmed)

**Estimate:** 45 min (`image` 10–12 min, `compute` about 1 min, `site` 3–5 min, checks 15 min).

**Files:** none changed.

**Interfaces:**
- Consumes: Tasks 1–14 committed (the image tag is a hash of the committed worker inputs; `deploy.sh` refuses uncommitted ones); Task 15's published v3.
- Produces: the live worker (D3, frequency check, time budget, compute version 2), the api Lambda with sizing v6 (h = 1.5), and the site reading v3.

- [ ] **Step 1: Ask the controller for confirmation**

Each of the three phases below deploys to the owner's AWS account; ask before each one (the controller may approve all three at once). Run `git status --porcelain` first — it must print nothing. `ANOMALY_MONITOR` stays unset. Never `source` `infra/deploy.sh` or `infra/jobs.sh`; never read `infra/owner.env` (deploy.sh reads it itself). Tell the owner not to submit jobs between this task and Task 17's refit, so no job is sized with the provisional h.

- [ ] **Step 2: Image**

Run (timeout 600000 ms; rerun if cut off — the build cache resumes): `infra/deploy.sh image`
Expected: `Pushed <repo>:<tag>` and `Deployment complete!`. Record the tag.

- [ ] **Step 3: Compute**

Run: `infra/deploy.sh compute`
Expected: `Deploying ElectronOrbitalViewerComputeStack (worker image tag <tag>, anomaly monitor on)` then `UPDATE_COMPLETE` and `Deployment complete!`. Record the new job definition revision:
`AWS_REGION=us-east-1 aws batch describe-job-definitions --status ACTIVE --query "sort_by(jobDefinitions[?tags.app=='electron-orbital-viewer'], &revision)[-1].[revision,containerProperties.image]" --output text`

- [ ] **Step 4: Site**

Run: `infra/deploy.sh site`
Expected: `Molecule data v3 is published; proceeding.`, then `UPDATE_COMPLETE` and `Deployment complete!`.

- [ ] **Step 5: Check what is live**

- `infra/jobs.sh status` — generation enabled; the meter as before; the budget stop not attached.
- `infra/jobs.sh api POST /api/v1/jobs/preview '{"recipe": "optimise", "molecule": {"name": "water"}}'` — `200`; the job's `computeVersion` 2 and `xc` `B3LYP-D3BJ`; `sizing.version` 6 with `parts`; the compute line's `note` ends `The prediction includes the frequency check (confirms a minimum): … s.`
- `infra/jobs.sh api POST /api/v1/jobs/preview '{"recipe": "optimise", "molecule": {"name": "caffeine"}}'` — L, on-demand ×1, about 4106 s (Task 9's decision).
- `URL=$(AWS_REGION=us-east-1 aws cloudformation describe-stacks --stack-name ElectronOrbitalViewerStack --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" --output text); curl -s "$URL/" | grep -o 'assets/index-[^"]*\.js' | head -1` names the same bundle as `ls dist/assets/index-*.js`.

Record all of it for the HANDOFF. Nothing to commit.

---

### Task 17: The Hessian probe on AWS, and the refit of h (owner-approved)

**Estimate:** 75 min (the probe runs 20–40 min on L: caffeine's Hessian dominates; the refit, re-recorded fixtures and the image + compute redeploy 30 min).

**Files:**
- Create: `tools/jobs/tests/fixtures/aws/hessian-probe.json`
- Modify: `tools/jobs/sizing.py` (`CONSTANTS['h']`, the version-6 comment), `tools/jobs/tests/test_sizing.py`
- Re-record: `tests/jobs/fixtures/api/*.json`

**Interfaces:**
- Consumes: Task 10's `--hessian-json` probe (in the image Task 16 deployed) and `calibrate --hessian-probe`; Task 16's job definition.
- Produces: the measured `h`, and sizing v6 with it.

- [ ] **Step 1: Ask the owner, through the controller, for approval**

The probe is a real, billable Fargate job outside the meter: L Spot (16 vCPU / 64 GB) for 20–40 minutes, roughly $0.10–0.30. It times water, ethanol and caffeine at B3LYP-D3(BJ)/def2-SVP, with `PYSCF_MAX_MEMORY` set as BatchRunner sets it for L (52 428 MB), so the Hessian runs in the regime a real job gets. Do not submit it without the go-ahead.

- [ ] **Step 2: Write the overrides and submit**

```bash
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
JD=$(aws batch describe-job-definitions --status ACTIVE --query "sort_by(jobDefinitions[?tags.app=='electron-orbital-viewer'], &revision)[-1].jobDefinitionArn" --output text)
Q=$(aws batch describe-job-queues --query "jobQueues[?tags.app=='electron-orbital-viewer' && contains(computeEnvironmentOrder[0].computeEnvironment, 'Spot')].jobQueueArn | [0]" --output text)
PYTHONPATH=tools:tools/molecules tools/molecules/.venv/bin/python - <<'PY' > /tmp/hessian-probe-overrides.json
import json
from jobs.elements import atomic_number
from jobs.tests.test_sizing import CAFFEINE, WATER
from optimise import read_xyz
ethanol = [[atomic_number(s), *xyz] for s, xyz in read_xyz('tools/molecules/geometries/ethanol.xyz')[0]]
runs = [{'label': 'water', 'atoms': WATER}, {'label': 'ethanol', 'atoms': ethanol}, {'label': 'caffeine', 'atoms': CAFFEINE}]
print(json.dumps({'command': ['probe', '--hessian-json', json.dumps(runs)],
                  'resourceRequirements': [{'type': 'VCPU', 'value': '16'}, {'type': 'MEMORY', 'value': '65536'}],
                  'environment': [{'name': 'OMP_NUM_THREADS', 'value': '16'}, {'name': 'PYSCF_MAX_MEMORY', 'value': '52428'}]}))
PY
aws batch submit-job --job-name orbital-hessian-probe --job-queue "$Q" --job-definition "$JD" \
  --container-overrides file:///tmp/hessian-probe-overrides.json \
  --retry-strategy attempts=1 --timeout attemptDurationSeconds=3600 --propagate-tags \
  --tags app=electron-orbital-viewer,component=compute --query jobId --output text | tee /tmp/hessian-probe-job
```

Expected: a job id, also saved in `/tmp/hessian-probe-job`. Record it.

- [ ] **Step 3: Wait for it, then fetch its line**

Poll in foreground calls of at most 9 minutes each (rerun until it prints a final status):

```bash
JOB=$(cat /tmp/hessian-probe-job) AWS_REGION=us-east-1 tools/molecules/.venv/bin/python - <<'PY'
import os, time, boto3
batch = boto3.client('batch')
for _ in range(26):
    status = batch.describe_jobs(jobs=[os.environ['JOB']])['jobs'][0]['status']
    print(status, flush=True)
    if status in ('SUCCEEDED', 'FAILED'):
        break
    time.sleep(20)
PY
```

When `SUCCEEDED`:

```bash
JOB=$(cat /tmp/hessian-probe-job) AWS_REGION=us-east-1 tools/molecules/.venv/bin/python - <<'PY' > tools/jobs/tests/fixtures/aws/hessian-probe.json
import json, os, boto3
cfn, batch, logs = boto3.client('cloudformation'), boto3.client('batch'), boto3.client('logs')
outputs = cfn.describe_stacks(StackName='ElectronOrbitalViewerComputeStack')['Stacks'][0]['Outputs']
group = next(o['OutputValue'] for o in outputs if o['OutputKey'] == 'WorkerLogGroup')
stream = batch.describe_jobs(jobs=[os.environ['JOB']])['jobs'][0]['container']['logStreamName']
lines = [e['message'] for e in logs.get_log_events(logGroupName=group, logStreamName=stream, startFromHead=True)['events']]
print(next(l for l in reversed(lines) if l.startswith('{') and json.loads(l).get('probe') == 'hessian'))
PY
```

Expected: one JSON line with `"probe": "hessian"`, `"vcpu": 16`, `"pyscfMaxMemoryMB": "52428"` and three runs. If the job FAILED, fetch the same log stream's last 40 messages, report them to the controller, and stop.

- [ ] **Step 4: Refit h**

Run: `PYTHONPATH=tools:tools/molecules tools/molecules/.venv/bin/python -m jobs.calibrate --aws --probe tools/jobs/tests/fixtures/aws/speedup-probe.json --optimise-probe tools/jobs/tests/fixtures/aws/caffeine-optimise-probe.json --hessian-probe tools/jobs/tests/fixtures/aws/hessian-probe.json tools/jobs/tests/fixtures/aws/*/ | tail -40`
Expected: `constants` identical to `sizing.CONSTANTS` except `h`, and `guards` `["g: …"]` only. Note the fitted `h` (3 s.f.) and the notes' per-molecule values.

Check that no job has been sized with the provisional h: `infra/jobs.sh api GET /api/v1/jobs` (no confirmation needed: read-only) — no job may have `"sizing": {"version": 6, …}`. If one does, this refit becomes sizing version 7 (set `SIZING_VERSION = 7` and say so in the comment and the tests) so that job stays checkable; otherwise it stays version 6.

- [ ] **Step 5: Update sizing and its tests**

In `tools/jobs/sizing.py`: set `CONSTANTS['h']` to the fitted value; in the version-6 comment, replace the provisional paragraph's last sentences with the measurement — the Batch job id, the image tag, each molecule's step and Hessian seconds and its h, which one was kept — and restate caffeine optimise's new decision.

In `tools/jobs/tests/test_sizing.py`: in `test_version_6_prices_the_frequency_check_and_states_its_h` replace `sizing.CONSTANTS['h'] == 1.5` with `sizing.CONSTANTS['h'] == <the fitted value>`; in `test_the_constants_are_what_calibrate_fits_from_the_fixtures` read the probe too and expect only g's guard:

```python
    from jobs.calibrate import aws_samples, fit_aws, guarded, read_hessian_probe
    hessian = read_hessian_probe(AWS_FIXTURES / 'hessian-probe.json')
    constants, guards = guarded(fit_aws(aws_samples(AWS_JOBS), PROBE, OPTIMISE_PROBE, hessian))
    assert constants == sizing.CONSTANTS
    assert [g.split(':')[0] for g in guards] == ['g']
```

and in `test_caffeine_optimise_pays_for_its_frequency_check_on_l` set the expected `(size, capacity, attempts)` to what `sizing.decide(_caffeine_job('optimise'))` now returns (`('L', 'spot', 3)` if the prediction fell under the 3600 s Spot limit, else unchanged), with its comment restating the numbers.

Run: `tools/molecules/.venv/bin/python -m pytest tools/jobs -q` — all pass. Then re-record: `tools/molecules/.venv/bin/python tests/jobs/make_api_fixtures.py`, and `npx jest tests/jobs tests/admin src/App.jobs.test.tsx` — all pass.

- [ ] **Step 6: Commit**

```bash
git add tools/jobs/sizing.py tools/jobs/tests/test_sizing.py tools/jobs/tests/fixtures/aws/hessian-probe.json tests/jobs/fixtures/api
git commit -m "fix(jobs): sizing v6's h measured by the Hessian probe on L (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Redeploy the image and the compute stack (controller-confirmed)**

Ask the controller, then run `infra/deploy.sh image` and `infra/deploy.sh compute` as in Task 16 Steps 2–3 (the api Lambda and the worker both carry `sizing.py`; the site does not, so it is not redeployed). Check: the water and caffeine previews of Task 16 Step 5 again, now with the measured h. Record the image tag and job definition revision.

---

### Task 18: Owner check and documentation

**Estimate:** 60 min (plus the owner's recipe-B job, minutes to run).

**Files:**
- Modify: `docs/HANDOFF.md`, `README.md`

**Interfaces:**
- Consumes: the live site (v3) and compute stack; every number recorded in Tasks 14–17.
- Produces: the phase's record.

- [ ] **Step 1: The library in the live app, at desktop and phone sizes**

With the browser tool available (Playwright or Chrome), open the live site's Molecules mode at 1440×900 and again at 390×844 (touch), and check, taking a screenshot of each:
- methane: the orbital list's HOMO rows read `1t2` ×3; the caption says `Labels: irreducible representations of Td, numbered in energy order within each, core included.`;
- water: the LUMO row carries `◌` and the `LVMO` chip sits on a `≈`-energy row; the divider shows `HOMO–LUMO gap … · HOMO–LVMO gap …` and the Kohn–Sham caveat; the caption explains both;
- benzene: HOMO `1e1g`, LUMO `1e2u`, no LVMO;
- SF₆: HOMO `1t1g`; ammonia: HOMO `3a1`;
- "How this was computed" on water: method `B3LYP-D3(BJ)/def2-TZVPD`, the dispersion line with `pyscf-dispersion 1.5.0`, and `bond: 0.958 Å — experiment (CCCBDB); geometry from experiment (not a test of the method)`;
- Bonds mode's N₂ opens and draws as before (v3's diatomics).
On the phone, also check the orbital list's caption and divider are readable in the Explore tab, not cut off. Report anything wrong to the controller; do not fix live.

- [ ] **Step 2: One recipe-B job on AWS (the owner's)**

The owner submits one recipe-B job from the live UI (ethanol by name is the suggestion: predicted a few minutes on S, cents), approving its quote — or authorises the controller to submit it with `infra/jobs.sh api POST /api/v1/jobs '{"recipe": "optimise", "molecule": {"name": "ethanol"}, "option": "spot", "quoteId": "…"}'`, the quote id being the Spot option's `quoteId` from `infra/jobs.sh api POST /api/v1/jobs/preview '{"recipe": "optimise", "molecule": {"name": "ethanol"}}'` issued within the hour. Before approving, check the quote's compute line names the frequency check. Wait with `infra/jobs.sh wait <key> 480` (repeat as needed). Then check: status DONE; the result's `meta.json` has `method` `B3LYP-D3(BJ)/def2-TZVPD`, `frequencyCheck.result` `minimum`, `geometrySource` ending `true minimum (no imaginary frequencies)`; `frequencies.json` is listed in `done.json` and opens through CloudFront with 21 wavenumbers; the provenance panel shows the frequency-check and dispersion lines and links `frequencies.json`; the job record's `charged` is within the approved maximum. Record the key, the quote, the charge, the wall time against the prediction, and the frequency-check stage's seconds against `parts.frequencySeconds`.

- [ ] **Step 3: HANDOFF**

Add a section `## Phase 6D — scientific credibility (<date>)` after the Phase 6C section of `docs/HANDOFF.md`, with these subsections, each stating what the earlier steps recorded:
- **What shipped** — full-group labels (`point_group.py`), virtual classes and the LVMO (`orbitals.py`), D3(BJ) on Linux and macOS (`dispersion.py`), the frequency check and `frequencies.json`, symmetry-free geometry work, the time budget, compute version 2, sizing v6, library v3, and the client changes.
- **Rulings** — this plan's "Rulings this plan makes" list, each with its measurement.
- **Library v3** — the generator commit, the per-call wall times from Task 14, the manifest's file count, each re-optimised molecule's step count and final max gradient, and any label or class that surprised (none expected).
- **Sizing version 6** — h as measured (Task 17: the job id, image, each molecule's numbers), the decisions it changed (water optimise, caffeine optimise), and whether the refit stayed version 6.
- **Deployed** — Task 16 and Task 17's image tags, job definition revisions, the site, the previews.
- **The owner's recipe-B job** — Step 2's record.
- **Risks and open points** — optimised geometries carry ~1e-5 Å noise, so a job's point group can be detected lower than its true one (its labels then name the lower group, honestly); the LVMO of water, ammonia and methane is a valence virtual orbital whose energy is an expectation value; `pyscf-dispersion` on this Mac is a stand-in (`dftd3`), so a local job's provenance names `dftd3 1.6.0`; Phase 6E reads `frequencies.json`.

- [ ] **Step 4: README**

In `README.md`: in the Molecules bullet that ends `…a divider at the HOMO–LUMO gap.`, replace that sentence's end with `…a divider at the HOMO–LUMO gap (a Kohn–Sham orbital gap — neither the optical gap nor the fundamental gap). Orbitals are labelled in the molecule's full point group (methane's HOMO is 1t₂, benzene's 1e₁g); a diffuse, basis-dependent virtual is marked, and where the LUMO is one, the LVMO — the antibonding orbital textbooks draw — is shown beside it.`; in the methods bullet, replace `B3LYP/def2-TZVP optimised` with `B3LYP-D3(BJ)/def2-TZVP optimised` and `**B3LYP/def2-TZVPD**` with `**B3LYP-D3(BJ)/def2-TZVPD**` (D3 changes energies and forces only, so the dipole and ESP discussion that follows stands); in the "How this was computed" paragraph, replace `B3LYP/def2-TZVP optimisation for the library` with `B3LYP-D3(BJ)/def2-TZVP optimisation for the library` and add after its file list `, and `frequencies.json` for an optimisation whose frequency check ran`; in "Geometries are frozen", replace `a B3LYP/def2-TZVP optimum` with `a B3LYP-D3(BJ)/def2-TZVP optimum`; and add to the source table rows for `tools/molecules/point_group.py` (full point-group labels by character projection), `tools/molecules/dispersion.py` (D3(BJ) on Linux and macOS) and `src/validation/geometry_honesty.ts` (which validation rows test the method).

- [ ] **Step 5: Commit**

```bash
git add docs/HANDOFF.md README.md
git commit -m "docs: Phase 6D shipped -- labels, honest virtuals, D3(BJ), frequency check, time budget, library v3 (Phase 6D)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

