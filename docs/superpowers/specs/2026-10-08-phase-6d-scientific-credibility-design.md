# Phase 6D — scientific credibility: design

**Date:** 2026-10-08. **Status:** approved by the owner as part of roadmap v2
(`docs/superpowers/plans/2026-10-08-ROADMAP-v2.md`, phase 2). Scientific
decisions are the developer's, made from
`docs/research/2026-10-08-user-needs-and-gaps.md` (§4 credibility issues,
R2/R3/R12) and `docs/research/2026-10-08-scans.md` (§4 worker bugs).

## 1. Goal

A chemist opening Molecules mode or a computed molecule finds nothing that
contradicts what they know, and every on-demand calculation meets current
best practice (dispersion-corrected DFT, optimised structures confirmed as
minima). Nothing ships that is prettier than it is true.

## 2. Scope

**In:**
1. Orbital labels in the molecule's full point group (§3).
2. Honest virtual orbitals: diffuse-basis virtuals classified and labelled,
   the lowest valence virtual identified (§4).
3. Wording: the HOMO–LUMO gap caveat; validation honesty where a geometry
   came from experiment (§5).
4. Dispersion: B3LYP-D3(BJ) for every on-demand recipe and the regenerated
   library (§6).
5. A frequency check after every optimisation, with one automatic
   displacement-and-reoptimise if the structure is a saddle point (§7).
6. Worker fixes found by the scans research: no symmetry constraints in
   geometry work; density-fitted gradients working; the dispersion package
   in the image (§8).
7. A worker time budget so a long optimisation ends with its best geometry,
   marked "not converged", instead of a timeout (§9).
8. Sizing and quotes priced for the frequency check (§10).
9. Library data version v3 with all of the above; computed jobs and their
   provenance state the new method (§11).

**Out (later phases):** vibrational spectra and mode animation (6E — the
frequencies computed here are stored so 6E can show them), charges and bond
orders, conformer search, solvent models, NMR, UV-Vis.

## 3. Full point-group orbital labels

**Problem.** PySCF labels orbitals only in D2h subgroups, so the library
shows methane's HOMO as b1/b2/b3 (D2) instead of t₂ (Td), ammonia's as a′
(Cs) instead of e (C3v), benzene's in D2h instead of D6h. Affected library
molecules: NH₃, PH₃ (C3v), CH₄, SiH₄ (Td), C₂H₆ (D3d), BF₃ (D3h), SF₆ (Oh),
benzene (D6h).

**Decision.** Label every MO, or degenerate set of MOs, by its irreducible
representation in the molecule's full point group (`mol.topgroup`), found by
numerical character projection:
- Detect the full group and its symmetry operations at the final geometry
  (PySCF's symmetry detection gives the group and the standard orientation).
- Group MOs into degenerate sets by energy (|ΔE| < 1e-5 Ha).
- For each set and each class representative operation R, compute the
  character χ(R) = Σᵢ ⟨ψᵢ|R ψᵢ⟩ by quadrature on the SCF's DFT grid
  (R applied to grid points; weights from the grid). Each value is rounded
  to the nearest allowed character; a set whose characters are not within
  0.05 of an allowed integer/irrational value is reported unlabelled with a
  note, never mislabelled.
- Decompose with the group's character table (standard Mulliken notation,
  lower case for orbitals: a₁, t₂, e_g, …). Tables shipped for: C1, Cs, Ci,
  C2, C2v, C2h, D2, D2h, C3v, D3h, D3d, D6h, Td, Oh. Linear molecules
  (C∞v, D∞h) keep their existing σ/π/δ labels, which PySCF already gives
  correctly.
- Numbering per irrep in energy order (1a₁, 2a₁, 1t₂ …), core included, as
  textbooks do.
- Unsupported groups fall back to the subgroup label with the subgroup named
  ("b₂ in C2v, a subgroup of …"), never silently.

**Validation.** Methane: 1a₁ 2a₁ 1t₂ (HOMO t₂, triply degenerate); NH₃:
1a₁ 2a₁ 1e 3a₁ (HOMO 3a₁); benzene: HOMO 1e₁g, LUMO 1e₂u (π*); SF₆ and BF₃
per standard tables; water unchanged (C2v). A test per molecule pins the
occupied labels against textbook values.

## 4. Honest virtual orbitals

**Problem.** With def2-TZVPD's diffuse functions, the lowest virtuals of
water, methane and ammonia are near-zero or positive-energy, spatially
diffuse orbitals: basis-set artefacts of the continuum, not the σ* orbitals
textbooks draw. The app presents them as "LUMO" with no warning.

**Decision.**
- Classify each virtual by its **valence character**: the fraction of the
  orbital in the span of the intrinsic minimal basis (IAO projection onto
  MINAO, `pyscf.lo.iao`). Valence character < 0.5 → **diffuse** (labelled
  "diffuse, basis-dependent"); otherwise **valence**.
- Roles: `LUMO` stays the lowest virtual (it is what the calculation gives);
  a new role `LVMO` (lowest valence virtual MO) marks the lowest valence
  virtual when it differs from the LUMO. The orbital picker shows both, with
  the LVMO described as "the antibonding orbital textbooks draw" and the
  diffuse LUMO captioned "positive/near-zero energy: an unbound, basis-set
  dependent state, not a bound orbital".
- Default selection when a user asks for "the LUMO" view in lessons and
  captions: LVMO where it exists, with the caption saying so.
- The orbital-energy list marks diffuse virtuals with a symbol and legend.

## 5. Wording

- **Gap.** Everywhere the HOMO–LUMO gap appears: "Kohn–Sham orbital gap —
  neither the optical gap (absorption) nor the fundamental gap (IP − EA)".
  Where an LVMO differs from the LUMO, show both gaps, labelled.
- **Validation honesty.** For each library molecule, the validation table
  says where its geometry came from. Bond lengths and angles of molecules
  whose geometry is taken from experiment are shown as "geometry from
  experiment (not a test of the method)" and excluded from any "agrees with
  experiment" summary; only optimised geometries count as validation.
  Dipoles and other properties computed at those geometries still count.

## 6. Dispersion: B3LYP-D3(BJ)

**Decision.** All on-demand recipes and the regenerated library use
B3LYP-D3(BJ) (Grimme D3 with Becke–Johnson damping) via `pyscf-dispersion`:
- Recipe A (single): B3LYP-D3(BJ)/def2-TZVPD.
- Recipe B (optimise): B3LYP-D3(BJ)/def2-SVP optimisation, frequency check
  (§7), then the recipe-A single point.
- Library: the seven geometries optimised by the app are re-optimised at
  B3LYP-D3(BJ)/def2-TZVP; properties at B3LYP-D3(BJ)/def2-TZVPD.
- D3 changes energies and gradients only; orbitals, density and ESP are
  unchanged at a given geometry. Total energies shown include D3 and say so.
- If `pyscf-dispersion` has no wheel for the developer's Mac, library
  generation runs inside the worker image (Linux ARM64 under OrbStack),
  which also makes it reproducible.

## 7. Frequency check after optimisation

**Decision.** After recipe B's optimisation converges, compute the analytic
Hessian at the optimisation level (B3LYP-D3(BJ)/def2-SVP; the D3 Hessian by
finite differences of its analytic gradient — cheap), project out
translations and rotations, and harmonic frequencies:
- **No imaginary frequency** below −50 cm⁻¹ → "true minimum (no imaginary
  frequencies)". Small imaginary values between −50 and 0 cm⁻¹ are reported
  as numerical noise, not as saddle points.
- **One or more imaginary frequencies** → displace along the most negative
  mode by ±0.1 Å-scaled amplitude (both signs tried, lower energy kept),
  re-optimise once, and recheck. If still imaginary, the job finishes DONE
  with the structure labelled "saddle point (n imaginary frequencies), not a
  minimum" in provenance and in the viewer.
- Frequencies, reduced masses and normal modes are stored in a new result
  file `frequencies.json` (feeds Phase 6E). Zero-point energy is reported.
- The check is part of recipe B, priced in the quote (§10).

## 8. Worker fixes

- **No symmetry in geometry work.** Optimisations and the Hessian run with
  `symmetry=False`; symmetry constrained the motion (a dihedral that should
  change stays fixed while reporting success). Labels (§3) are computed
  separately, so they lose nothing.
- **Density-fitted gradients.** The locked NumPy breaks PySCF 2.8.0's
  density-fitted gradients; upgrade PySCF to a release that supports the
  locked NumPy, or pin NumPy below 2.4 — whichever keeps every existing test
  and the library reproducible. (Phase 6B-4 needs density fitting; this
  phase only has to make it work.)
- **Image:** add `pyscf-dispersion` to the worker image and the lock.

## 9. Worker time budget

**Decision.** During an optimisation the worker tracks elapsed time against
the job's timeout. Before each new step it checks that the time left covers
the predicted remaining work (frequency check + final single point + file
writing, from the job's own sizing figures) with a 1.2× margin. If not, it
stops stepping and finishes with the current geometry: frequency check
skipped, final single point and files written, the job DONE with
"optimisation stopped by its time limit, not converged (max force …)" in
provenance and the viewer. The owner is charged the actual cost as usual.
This replaces failing at the timeout.

## 10. Sizing and quotes

- Sizing version 6 adds a Hessian term for recipe B: analytic Hessian cost ≈
  `h` × (one def2-SVP gradient step) × atoms, with `h` measured on water,
  ethanol and caffeine on AWS (a probe job, owner-approved, cents) and
  `PYSCF_MAX_MEMORY` set so it runs as real jobs do. Until measured, a
  conservative literature-based value is used and stated.
- The quote's compute line includes the check; the details list it as
  "frequency check (confirms a minimum)".
- The D3 cost is negligible and not priced separately.

## 11. Data, provenance, compatibility

- Library data version **v3**: new labels (`label`, `labelGroup` =
  full group), `valenceCharacter` and `class` (`valence`/`diffuse`) per
  virtual, the `LVMO` role, D3 energies, the D3(BJ) method string, the
  geometry-source field per validation row. Published immutably like v2;
  the app reads v3; v2 stays on S3.
- Computed jobs: new jobs record method `B3LYP-D3(BJ)` and the frequency
  check result in `meta.json` provenance; the provenance panel shows them.
  Old computed jobs keep their recorded method and display it honestly
  ("computed before dispersion was added").
- The web client reads both old and new metadata.

## 12. Testing and acceptance

- Labels: per-molecule tests against textbook labels for the 8 affected
  molecules plus water, N₂, CO₂; a degenerate-set test; an unsupported-group
  fallback test.
- Virtuals: water/methane/ammonia show a diffuse LUMO and a σ* LVMO;
  benzene's LUMO is valence (π*) with no separate LVMO.
- D3: energies match a reference D3(BJ) value for two molecules to 1e-6 Ha.
- Frequency check: water and ethanol are minima; a planar ammonia start
  (a saddle) is detected, displaced and re-optimised to the pyramidal
  minimum; frequencies within 5 % of literature harmonic B3LYP/SVP values.
- Time budget: a forced short timeout ends DONE "not converged" with files.
- Symmetry: the trans-H₂O₂ dihedral constraint moves (regression for §8).
- Live: library v3 in the viewer at desktop and phone sizes; one owner
  recipe-B job on AWS confirms the frequency check and its pricing.

## 13. Rollout

1. Code and tests (labels, virtuals, wording, D3, frequency check, worker
   fixes, time budget, sizing v6).
2. Library v3 generation and publication (about an hour of compute).
3. Deploy: worker image, compute stack, site.
4. Owner check: library molecules and one recipe-B job.
