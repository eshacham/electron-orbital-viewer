# Phase 5 — Bonds Mode (the First Bond, Exactly) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third mode, **Bonds**, for two-atom systems: H₂⁺ solved exactly at any internuclear distance R with its potential-energy curve, and precomputed 20-point bond-length scans of H₂, He₂, Li₂, B₂, C₂, N₂, O₂, F₂, CO and HF with a molecular-orbital energy diagram, every number labelled with its method and validated against published values.

**Architecture:** H₂⁺ is separated in prolate spheroidal coordinates; both separated equations become symmetric tridiagonal eigenproblems (a Legendre basis for μ, Jaffé's series for λ) and the energy is the root of their mismatch, all in TypeScript (`src/bonds/`), drawn as a new `'h2plus'` `FieldRecipe` through Phase 1's field pipeline. The diatomics come from an offline PySCF pipeline (`tools/molecules/`) that writes spec §4.2 files under `public/molecules/`, which a loader (`src/molecules/loader.ts`) fetches lazily; molecular orbitals and the total density are evaluated from the shipped Gaussian basis in the existing orbital worker as `'gaussianMO'` and `'gaussianDensity'` recipes. A `bondsSlice` holds the selection; `BondsPanel`, `MoDiagram` and `PotentialCurvePlot` live in the existing columns and phone tabs.

**Tech Stack:** TypeScript, React 19, MUI 7, three.js 0.176, Redux Toolkit, Vite, Jest + ts-jest. Offline: Python 3.12, PySCF 2.8.0, NumPy, SciPy, pytest (pinned in `tools/molecules/requirements.txt`, never a runtime dependency).

**Spec:** `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md` (§3 principles, §4.1 field sources, §4.2 molecule data format, §4.3 URL state and §4.4 validation table are binding; §5 "Phase 5 — Bonds mode" is the requirement). Builds on `docs/superpowers/plans/2026-09-25-phase-1-hybrids-and-stark.md` (Tasks 1–4, 8, 9, 11). Read `docs/HANDOFF.md` "Decisions that are not obvious from the code" before touching rendering.

## Global Constraints

- **Depends on Phase 1, by these exact names** (`src/field_source.ts`): `FieldRecipe` (a union with a `never` check in `makeFieldEvaluator(recipe)`), `AnalyticFieldSource`, `GridFieldSource` (values z-fastest: `index = (i * shape[1] + j) * shape[2] + k`), `FieldEvaluator`, `FieldRenderRequest { sources; colors; resolution; enclosedFraction; label }`. `src/orbital_mesh.ts`: `generateFieldMesh(source, resolution, enclosedFraction)`, `sampleFieldSource(source, resolution)`, `meshFromSamples(field, enclosedFraction, signAt)`, `generateFieldMeshes(request)`. `src/workers/orbitalWorker.ts`: message `{ type: 'calculateFields'; request }` → `{ type: 'fieldsSuccess'; meshes }`. `src/store/orbitalSlice.ts`: `currentField`, `startFieldCalculation`. `src/orbital_visualizer.ts`: `updateFieldInScene(context, request, showAxes?)`, `updateSceneWithMeshData(context, meshData, crossFadeFromShellView?)`. `src/validation/references.ts`: `ValidationRow`, `VALIDATION`, `relativeErrorPercent`, rows spread in from per-phase modules like `PHASE_1_ROWS`.
- **Depends on Phase 2** (`src/url_state.ts`, spec §4.3): `registerUrlKeys(mode, encoder: (state: RootState) => Record<string, string>, decoder: (params: URLSearchParams, dispatch: AppDispatch) => void)`. Mode `bonds` registers exactly the keys Phase 7's lessons write: `#mode=bonds&system=<h2plus | diatomic id>&R=<bohr>&state=<state id>`.
- **Phases 3–4 edit the same files** (`App.tsx`, `Controls.tsx`, `atomSlice.ts`). Anchor every edit below by the code quoted, never by line number.
- **Names Phase 6 extends, exactly:** `loadMoleculeIndex()`, `loadMoleculeMeta(id)`, `loadDensityGrid(meta): Promise<GridFieldSource>`, `loadBasis(id)` in `src/molecules/loader.ts`; `src/components/MoDiagram.tsx` (default export, props `{ orbitals, selectedIndex, onSelect?(index), footer?, width? }`); recipes `{ type: 'h2plus', R, state }` and `{ type: 'gaussianMO', moleculeId, index }`; `ViewMode` includes `'bonds'`; `tools/molecules/generate.py` exposes `basis_json(mol, mf) -> dict`.
- Spec validation, verbatim: "H₂⁺: R_e = 1.997 a₀ ± 0.5 %, E(R_e) = −0.6026 Ha ± 0.1 %. H₂: R_e = 1.401 a₀ ± 1 %, D_e = 4.75 eV ± 2 %. N₂ R_e 1.098 Å, O₂ 1.207 Å, F₂ 1.412 Å, CO 1.128 Å, HF 0.917 Å, each within 1 %. O₂ ground state is the triplet." Also asserted: H₂⁺ E_el(1σg, R = 2) = −1.10263421 Ha; 1σu has no minimum on the slider's range.
- Methods, verbatim: energies CCSD(T)/aug-cc-pVTZ (full CI for H₂; He₂ also full CI, see Design decisions); densities and orbitals B3LYP/def2-TZVP; O₂ (and B₂) unrestricted triplets.
- **Size budget:** each `public/molecules/<id>/` directory ≤ 3 MB (3 145 728 bytes), asserted by pytest. Molecules are lazy-loaded: nothing under `/molecules/` is fetched until Bonds mode picks a molecule.
- **Every number states its method** (§3.1); **failures are shown** (§3.5): a load error, an unbound He₂, an orbital not kept at this R are each an explicit message.
- **Performance** (§3.7): each Bonds view < 1.5 s on a 2020 laptop; meshing runs in the orbital worker; the H₂⁺ curve runs in its own worker.
- **Layout contract** (§3.8): desktop — `BondsPanel` in `.side-panel`, `Controls` + `PotentialCurvePlot` in `.view-panel`; phone — `.phone-header` line plus `PhoneSheet` tabs Explore (BondsPanel) / View (Controls) / Plot (curve).
- Atomic units in code (bohr, Hartree); Å and eV only at display, always beside the atomic-unit value. 1 bohr = 0.529177210903 Å; 1 Ha = 27.211386245988 eV.
- British spelling in comments and UI copy; comments explain *why*, in the register of `src/radial_distribution.ts`.
- TDD for every task. TS: `npx jest <path>`, `npx tsc --noEmit -p .`. Python: `tools/molecules/.venv/bin/python -m pytest tools/molecules -q`.
- **Run every command in the foreground.** Commands that can exceed ten minutes (the generator) are resumable and are run once per molecule.
- The dev server runs at http://localhost:5391 (`npx vite --port 5391 --strictPort`); start it only if it is not already up.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Mode round trips with work in flight.** Leaving Bonds for Basic Orbitals must redraw Basic Orbitals' own orbital or combination, and entering Bonds must never show a stale hybrid. Owning tests: Task 8 ("setMode('bonds') drops a Basic Orbitals field request"), Task 13 ("Bonds and back restores the Basic Orbitals request").
2. **An orbital that does not exist at the new geometry or molecule** (3σu* chosen, then He₂ picked; a label missing at another R). Expected: the density is drawn and a note says why, never a blank or stale picture. Owning test: Task 8 ("falls back to the density, saying so").
3. **A molecule that fails to load** (404, truncated gzip, offline). Expected: an explicit message naming the molecule and saying the canvas still shows the previous system. Owning tests: Task 6 (loader errors), Task 12 ("says the canvas still shows the previous system").
4. **URL values from outside the controls** (`R=0.01`, `R=1e6`, `system=xx`, `state=mo:garbage`). Expected: clamped or ignored, never thrown. Owning test: Task 14.
5. **Gzip handled by someone else** — a server that sets `Content-Encoding: gzip` (the browser then hands over already-inflated bytes) or a browser without `DecompressionStream`. Expected: the first still loads, the second says why it cannot. Owning test: Task 6.

---

## Design decisions (read before Task 1)

**H₂⁺ separation.** Nuclei at (0, 0, ±R/2). λ = (r₊ + r₋)/R ∈ [1, ∞), μ = (r₋ − r₊)/R ∈ [−1, 1], with r₊ the distance to the +z nucleus (so μ = +1 there). With ψ = Λ(λ)M(μ) (σ states, m = 0), p = (R/2)√(−2E_el) and separation constant A:

- μ: d/dμ[(1−μ²)M′] + (A + p²μ²)M = 0. In normalised Legendre functions P̄ₖ, A is the **lowest** eigenvalue of `diag(k(k+1)) − p²·X²`, X² the matrix of μ²: ⟨k|μ²|k⟩ = aₖ² + aₖ₋₁², ⟨k+2|μ²|k⟩ = aₖaₖ₊₁, aₖ = √(((k+1)² − m²)/((2k+1)(2k+3))). Even k is 1σg, odd k is 1σu. 24 terms.
- λ: d/dλ[(λ²−1)Λ′] + (−A + 2Rλ − p²λ²)Λ = 0. Jaffé's form Λ = (λ+1)^σ e^(−p(λ−1)) Σ gₙ xⁿ, x = (λ−1)/(λ+1), σ = R/p − 1, gives (derived for this plan, checked numerically) αₙgₙ₊₁ + βₙgₙ + γₙgₙ₋₁ = 0 with αₙ = (n+1)², βₙ = −2n² + (2σ − 4p)n + σ(2p+1) − p² − A, γₙ = (n−1−σ)². So A is the **highest** eigenvalue of the tridiagonal matrix with diagonal βₙ + A and off-diagonal √(αₙγₙ₊₁) = (n+1)|n−σ|. 40 terms. For both σ states σ ∈ (0, 1) on the whole range, so no γ vanishes.
- E_el is the root in p of A_λ,max(p) − A_μ,min(p), monotone on [10⁻³, 40]; bisection to 10⁻¹³.
- Prototyped while writing this plan: E_el(2.0) = −1.102634214495 (1σg) and −0.667534392202 (1σu), the published values; R_e = 1.997193 a₀, E(R_e) = −0.602634619 Ha; normalisation 1.0004 on an 81³ grid; averaged Kato cusp −0.99999; local energy within 2 × 10⁻⁶ Ha of E_el; 474 solves in 0.33 s.
- **1σu "repulsive":** its total energy decreases monotonically on the slider range 0.5–10 a₀ (asserted). It has a 0.06 mHa polarisation well at 12.5 a₀, outside the range; the caption says so rather than calling the curve purely repulsive.

**Diatomics pipeline decisions.**
- **Layout.** `public/molecules/<id>/meta.json`, `basis.json`, `density.bin.gz` are the §4.2 files for the scan point at the experimental R_e (scan index 07, factor 1.00). `scan.json` holds R, energies and the fit. `scan/NN/meta.json` and `scan/NN/basis.json` (NN = 00–19) hold each geometry; their molecule id is `<id>@NN`, which `moleculePath` maps to that folder, so `loadMoleculeMeta('n2@07')` works like `loadMoleculeMeta('n2')`.
- **Density ships once per molecule; the app computes it from the basis.** 20 density grids would break the 3 MB budget. The shipped grid (centred cube, 0.25 a₀, Phase 1's grid rule) serves §4.2, Phase 6, and a cross-check test that the TS density evaluator reproduces it. Bonds mode draws ρ = Σ occᵢψᵢ² through a new recipe `{ type: 'gaussianDensity', moleculeId }` whose evaluator returns √ρ — Phase 1's own convention for density grids, so `meshFromSamples` squares it back to ρ. This recipe is not in §4.1's list; it is the local addition §4.1 anticipates ("grows per phase").
- **The density is drawn at a fixed ρ, not an enclosed fraction.** A 0.15 a₀ grid cannot integrate a nitrogen 1s cusp (one sample holds 0.7 of its 2 electrons, or 0.9 when misaligned), so "90 % of the electrons" computed from samples is off by up to 15 %. Chemists draw ρ = 0.002 e/a₀³ as the molecular outline; the panel offers 0.002, 0.05 and 0.2. `FieldRenderRequest` gains optional `densityIsoValue`, converted in the worker into the fraction of the same samples above that value, so Phase 1's contour search lands on it.
- **Orbitals kept:** every occupied MO plus the virtuals with the largest projection onto PySCF's MINAO minimal basis, up to the minimal-basis size (N₂: 7 occupied + 1πg*, 1πg*, 3σu*). Labels come from PySCF's D∞h/C∞v symmetry (`symm.label_orb_symm`): nσg, nσu*, nπu, nπg* numbered per irrep; the star (antibonding) is by g/u for homonuclear molecules only; bond order = (bonding − antibonding electrons)/2 for homonuclear molecules, `null` for CO and HF.
- **Open shells pinned.** B₂ (³Σg⁻, not in the spec's list but its ground state is a triplet), C₂ and O₂ get explicit `irrep_nelec` so SCF cannot land in another state. UKS orbitals ship as α and β sets; the diagram draws levels at α energies with ↑ from α and ↓ from the same-labelled β orbital.
- **He₂** runs full CI like H₂ (the coordinator's instruction; four electrons is still exact within the basis and costs ~30 s a point). This stretches §7's "full CI for two electrons"; flagged for the owner. At this level He₂ has a van der Waals well of order 0.03 mHa (basis-set superposition error included); the pipeline asserts the well is < 0.1 mHa and the wall at 2.4 a₀ is > 5 mHa, and the app says "no chemical bond, bond order 0".
- **C₂** has strong multi-reference character; its caption says single-reference CCSD(T) and B3LYP are approximate there. Nothing about C₂ is asserted beyond bond order 2.
- **Frozen core** in CCSD(T) (1s on Li–F): aug-cc-pVTZ has no core-correlating functions. PySCF ≥ 2.3's `b3lyp` is the VWN-RPA variant (Gaussian's); recorded in `meta.generator.xc`.
- **PySCF AO convention mirrored in TS.** Spherical AOs, `mol.cart = False`. An AO is [Σₖ cₖ e^(−αₖr²)] · S_lm(x, y, z), cₖ the libcint coefficients (primitive normalisation included, `bas_ctr_coeff × gto_norm`), S_lm the real solid harmonics normalised on the unit sphere: s 0.28209479177387814; p (order **x, y, z**) 0.4886025119029199·{x, y, z}; d (m = −2…2) 1.0925484305920792·xy, 1.0925484305920792·yz, 0.31539156525252005·(2z² − x² − y²), 1.0925484305920792·xz, 0.5462742152960396·(x² − y²); f (m = −3…3) 0.5900435899266435·y(3x² − y²), 2.890611442640554·xyz, 0.4570457994644658·y(4z² − x² − y²), 0.3731763325901154·z(2z² − 3x² − 3y²), 0.4570457994644658·x(4z² − x² − y²), 1.445305721320277·z(x² − y²), 0.5900435899266435·x(x² − 3y²). General contractions are split into one shell per column (PySCF's AO order is contraction-major, m fastest). The generator asserts its own evaluation equals `mol.eval_gto('GTOval_sph')` to 10⁻¹⁰, and TS is checked against PySCF MO values in fixtures.
- **Data is committed, not built in CI.** The scans take ~1 h of CCSD(T)/FCI and there is no CI (deploy is `infra/deploy.sh` on a workstation). Every file records the PySCF version and git commit; `tools/molecules/.cache/` makes reruns resumable. About 15–20 MB total; regenerate only when a method changes.
- **Shipping `public/molecules`.** `vite.config.ts` sets `root: 'public'`, so Vite's `publicDir` resolves to `public/public` and **nothing under `public/molecules/` reaches `dist/`** (verified: `dist/` holds only `index.html` and `assets/`). Task 5 adds a small `closeBundle` plugin that copies it; dev serves it already.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/bonds/tridiagonal.ts` | Create | Sturm-count bisection for extreme eigenvalues; inverse iteration for eigenvectors |
| `src/bonds/h2plus.ts` | Create | Exact H₂⁺: energies, curve, equilibrium, wavefunction evaluator, source |
| `src/bonds/systems.ts` | Create | System ids/names, unit constants, `BONDS_RESOLUTION`, `DENSITY_ISO_VALUES`, `pointId`, `nearestScanIndex` |
| `src/bonds/bonds_request.ts` | Create | `bondsFieldRequest`: selection + basis → `FieldRenderRequest` (with density fallback) |
| `src/bonds/mo_diagram.ts` | Create | Pure diagram model: levels, boxes, arrows, core split, bond-order text, H₂⁺ levels |
| `src/bonds/captions.ts` | Create | Method and honesty captions per system |
| `src/bonds/useBondsData.ts` | Create | Loads scan/meta/basis for the selection; snaps R to the scan |
| `src/bonds/useH2PlusCurve.ts` | Create | H₂⁺ curve via its worker, cached for the session |
| `src/bonds/bonds_url.ts` | Create | URL keys for mode `bonds` |
| `src/molecules/types.ts` | Create | §4.2 JSON types |
| `src/molecules/loader.ts` | Create | Lazy, cached fetches; gzip decode; `GridFieldSource` |
| `src/molecules/gaussian_basis.ts` | Create | Solid harmonics, AO/MO/density evaluators, `densityOnGrid` |
| `src/molecules/basis_registry.ts` | Create | Bases registered in a worker for `gaussianMO`/`gaussianDensity` |
| `src/field_source.ts` | Modify | Recipes `h2plus`, `gaussianMO`, `gaussianDensity`; `FieldRenderRequest.bases`, `.densityIsoValue` |
| `src/orbital_mesh.ts` | Modify | `generateIsoValueMesh` |
| `src/workers/orbitalWorker.ts` | Modify | Register bases; iso-value meshing |
| `src/workers/h2plusCurveWorker.ts`, `createH2PlusCurveWorker.ts` | Create | H₂⁺ curve off the main thread |
| `src/clip_caps.ts`, `src/orbital_visualizer.ts` | Modify | Single "density" colour for density meshes and their caps |
| `src/store/bondsSlice.ts`, `atomSlice.ts`, `orbitalSlice.ts`, `index.ts` | Create/Modify | Bonds selection; `ViewMode` gains `'bonds'`; field request cleared on entering Bonds |
| `src/components/PotentialCurvePlot.tsx`, `MoDiagram.tsx`, `BondsPanel.tsx` | Create | The three Bonds panels |
| `src/components/Controls.tsx`, `src/App.tsx`, `src/main.tsx`, `src/style.css` | Modify | Mode toggle, wiring, layout, URL registration |
| `src/validation/phase5.ts`, `src/validation/generated/phase5_diatomics.json` | Create | Phase 5 validation rows |
| `vite.config.ts`, `.gitignore` | Modify | Copy molecule data into `dist/`; ignore the pipeline's venv/cache |
| `tools/molecules/*` | Create | Offline pipeline and its pytest suite |
| `public/molecules/**`, `tests/fixtures/molecules/*.json` | Generated | Data and PySCF fixtures, committed |

---

### Task 1: Exact H₂⁺ energies

**Files:**
- Create: `src/bonds/tridiagonal.ts`, `src/bonds/h2plus.ts`
- Test: `tests/bonds/tridiagonal.test.ts`, `tests/bonds/h2plus_energy.test.ts`

**Interfaces:**
- Produces: `countEigenvaluesBelow(diag: Float64Array, off: Float64Array, x: number): number`; `extremeEigenvalue(diag, off, which: 'lowest' | 'highest'): number`; `eigenvectorFor(diag, off, eigenvalue: number): Float64Array` (unit length). `type H2PlusState = '1sigma_g' | '1sigma_u'`; `H2PLUS_STATES`; `H2PLUS_LABELS: Record<H2PlusState, string>` (`'1σg'`, `'1σu*'`); `H2PLUS_R_RANGE = { min: 0.5, max: 10 }`; `h2plusElectronicEnergy(R, state): number`; `h2plusTotalEnergy(R, state): number`; `h2plusCurve(Rs: readonly number[], state): number[]`; `h2plusEquilibrium(): { R: number; totalEnergy: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/bonds/tridiagonal.test.ts
import { countEigenvaluesBelow, extremeEigenvalue, eigenvectorFor } from '../../src/bonds/tridiagonal';

const diag = Float64Array.from([2, 2, 2]);
const off = Float64Array.from([-1, -1]);

describe('symmetric tridiagonal eigenproblems', () => {
    it('counts eigenvalues below a shift (2 − √2, 2, 2 + √2)', () => {
        expect(countEigenvaluesBelow(diag, off, 0.5)).toBe(0);
        expect(countEigenvaluesBelow(diag, off, 2.0001)).toBe(2);
        expect(countEigenvaluesBelow(diag, off, 4)).toBe(3);
    });

    it('finds the extreme eigenvalues', () => {
        expect(extremeEigenvalue(diag, off, 'lowest')).toBeCloseTo(2 - Math.SQRT2, 12);
        expect(extremeEigenvalue(diag, off, 'highest')).toBeCloseTo(2 + Math.SQRT2, 12);
        expect(extremeEigenvalue(Float64Array.from([5]), new Float64Array(0), 'lowest')).toBe(5);
    });

    it('returns a unit eigenvector', () => {
        const v = eigenvectorFor(diag, off, 2 - Math.SQRT2);
        expect(Array.from(v, Math.abs).map(x => x.toFixed(8))).toEqual(['0.50000000', '0.70710678', '0.50000000']);
        expect(Math.sign(v[0])).toBe(Math.sign(v[1]));
    });
});
```

```ts
// tests/bonds/h2plus_energy.test.ts
import {
    h2plusElectronicEnergy, h2plusTotalEnergy, h2plusEquilibrium, H2PLUS_R_RANGE,
} from '../../src/bonds/h2plus';

describe('exact H2+ energies', () => {
    // Bates, Ledsham & Stewart (1953); Madsen & Peek (1970).
    it('reproduces the published electronic energies at R = 2 a0', () => {
        expect(h2plusElectronicEnergy(2, '1sigma_g')).toBeCloseTo(-1.1026342145, 9);
        expect(h2plusElectronicEnergy(2, '1sigma_u')).toBeCloseTo(-0.6675343922, 9);
    });

    it('finds the equilibrium within the spec tolerance (R_e = 1.997 a0 ± 0.5 %, E = -0.6026 Ha ± 0.1 %)', () => {
        const { R, totalEnergy } = h2plusEquilibrium();
        expect(Math.abs(R - 1.997) / 1.997).toBeLessThan(0.005);
        expect(Math.abs(totalEnergy + 0.6026) / 0.6026).toBeLessThan(0.001);
        expect(R).toBeCloseTo(1.99719, 3);
        expect(totalEnergy).toBeCloseTo(-0.6026346, 6);
    });

    it('has no minimum in 1σu over the slider range', () => {
        let previous = Infinity;
        for (let R = H2PLUS_R_RANGE.min; R <= H2PLUS_R_RANGE.max + 1e-9; R += 0.25) {
            const energy = h2plusTotalEnergy(R, '1sigma_u');
            expect(energy).toBeLessThan(previous);
            previous = energy;
        }
    });

    it('separates into H + H+ at large R, bonding below antibonding', () => {
        const g = h2plusTotalEnergy(10, '1sigma_g');
        const u = h2plusTotalEnergy(10, '1sigma_u');
        expect(Math.abs(g + 0.5)).toBeLessThan(2e-3);
        expect(Math.abs(u + 0.5)).toBeLessThan(2e-3);
        expect(g).toBeLessThan(u);
    });

    it.each([0, -1, Number.NaN, Infinity])('refuses R = %p', R => {
        expect(() => h2plusElectronicEnergy(R, '1sigma_g')).toThrow(RangeError);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/bonds`
Expected: FAIL, "Cannot find module '../../src/bonds/tridiagonal'".

- [ ] **Step 3: Implement**

```ts
// src/bonds/tridiagonal.ts
/**
 * The only linear algebra the exact H₂⁺ solver needs. Both separated
 * equations reduce to symmetric tridiagonal matrices, and only one extreme
 * eigenvalue of each is wanted, so a Sturm count and bisection (exact to
 * rounding, never misses a root) beats a general eigensolver.
 */
export function countEigenvaluesBelow(diag: Float64Array, off: Float64Array, x: number): number {
    let count = 0;
    let q = 1;
    for (let i = 0; i < diag.length; i++) {
        q = diag[i] - x - (i > 0 ? (off[i - 1] * off[i - 1]) / q : 0);
        // An exact zero pivot is a measure-zero accident; nudge it so the count stays defined.
        if (q === 0) q = 1e-300;
        if (q < 0) count++;
    }
    return count;
}

export function extremeEigenvalue(diag: Float64Array, off: Float64Array, which: 'lowest' | 'highest'): number {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < diag.length; i++) {
        const radius = (i > 0 ? Math.abs(off[i - 1]) : 0) + (i < off.length ? Math.abs(off[i]) : 0);
        lo = Math.min(lo, diag[i] - radius);
        hi = Math.max(hi, diag[i] + radius);
    }
    // The smallest x with `target` eigenvalues below it is the target-th eigenvalue.
    const target = which === 'lowest' ? 1 : diag.length;
    for (let iteration = 0; iteration < 200; iteration++) {
        const mid = 0.5 * (lo + hi);
        if (hi - lo <= 1e-14 * Math.max(1, Math.abs(mid))) break;
        if (countEigenvaluesBelow(diag, off, mid) >= target) hi = mid;
        else lo = mid;
    }
    return 0.5 * (lo + hi);
}

/** Inverse iteration with a shift a hair off the eigenvalue, solved by the Thomas algorithm. */
export function eigenvectorFor(diag: Float64Array, off: Float64Array, eigenvalue: number): Float64Array {
    const n = diag.length;
    const shift = eigenvalue + 1e-10 * Math.max(1, Math.abs(eigenvalue));
    let x = new Float64Array(n).fill(1);
    for (let iteration = 0; iteration < 4; iteration++) {
        const c = new Float64Array(n);
        const d = new Float64Array(n);
        let pivot = diag[0] - shift;
        c[0] = (n > 1 ? off[0] : 0) / pivot;
        d[0] = x[0] / pivot;
        for (let i = 1; i < n; i++) {
            pivot = diag[i] - shift - off[i - 1] * c[i - 1];
            c[i] = (i < n - 1 ? off[i] : 0) / pivot;
            d[i] = (x[i] - off[i - 1] * d[i - 1]) / pivot;
        }
        const y = new Float64Array(n);
        y[n - 1] = d[n - 1];
        for (let i = n - 2; i >= 0; i--) y[i] = d[i] - c[i] * y[i + 1];
        const norm = Math.sqrt(y.reduce((sum, v) => sum + v * v, 0));
        x = y.map(v => v / norm);
    }
    return x;
}
```

```ts
// src/bonds/h2plus.ts
import { eigenvectorFor, extremeEigenvalue } from './tridiagonal';

/**
 * H₂⁺, solved exactly within Born–Oppenheimer.
 *
 * In prolate spheroidal coordinates the one-electron two-centre problem
 * separates; each separated equation, expanded in a basis that satisfies its
 * boundary conditions exactly (normalised Legendre functions for μ, Jaffé's
 * series for λ), is a symmetric tridiagonal eigenproblem for the separation
 * constant A at a given p = (R/2)√(−2E). The energy is the p at which the two
 * agree. No basis-set error survives: both expansions converge geometrically
 * and the terms kept are far past convergence at every R offered.
 * See the plan's Design decisions for the derivation of the λ recurrence.
 */

export type H2PlusState = '1sigma_g' | '1sigma_u';
export const H2PLUS_STATES: readonly H2PlusState[] = ['1sigma_g', '1sigma_u'];
export const H2PLUS_LABELS: Record<H2PlusState, string> = { '1sigma_g': '1σg', '1sigma_u': '1σu*' };
/** The slider's range. Below 0.5 a₀ the picture is the He⁺ united atom; past 10 it is H + H⁺. */
export const H2PLUS_R_RANGE = { min: 0.5, max: 10 } as const;

const ANGULAR_TERMS = 24;
const RADIAL_TERMS = 40;

/** Legendre degrees of one state's μ expansion: even k is gerade, odd k ungerade. */
const DEGREES: Record<H2PlusState, number[]> = {
    '1sigma_g': Array.from({ length: ANGULAR_TERMS }, (_, i) => 2 * i),
    '1sigma_u': Array.from({ length: ANGULAR_TERMS }, (_, i) => 2 * i + 1),
};

interface Tridiagonal { diag: Float64Array; off: Float64Array }

/** ⟨k+1|μ|k⟩ between normalised Legendre functions (m = 0: both states are σ). */
function muCoupling(k: number): number {
    return Math.sqrt(((k + 1) ** 2) / ((2 * k + 1) * (2 * k + 3)));
}

/** μ² in one parity's Legendre basis: diagonal ⟨k|μ²|k⟩, off-diagonal ⟨k+2|μ²|k⟩. */
function muSquared(degrees: number[]): Tridiagonal {
    const diag = new Float64Array(degrees.length);
    const off = new Float64Array(degrees.length - 1);
    degrees.forEach((k, i) => {
        diag[i] = muCoupling(k) ** 2 + (k > 0 ? muCoupling(k - 1) ** 2 : 0);
        if (i < degrees.length - 1) off[i] = muCoupling(k) * muCoupling(k + 1);
    });
    return { diag, off };
}

function angularMatrix(p: number, degrees: number[]): Tridiagonal {
    const mu2 = muSquared(degrees);
    return {
        diag: Float64Array.from(degrees, (k, i) => k * (k + 1) - p * p * mu2.diag[i]),
        off: mu2.off.map(v => -p * p * v),
    };
}

function radialMatrix(p: number, R: number): Tridiagonal & { sigma: number } {
    const sigma = R / p - 1;
    const diag = new Float64Array(RADIAL_TERMS);
    const off = new Float64Array(RADIAL_TERMS - 1);
    for (let n = 0; n < RADIAL_TERMS; n++) {
        diag[n] = -2 * n * n + (2 * sigma - 4 * p) * n + sigma * (2 * p + 1) - p * p;
        if (n < RADIAL_TERMS - 1) off[n] = (n + 1) * Math.abs(n - sigma);
    }
    return { diag, off, sigma };
}

function mismatch(p: number, R: number, degrees: number[]): number {
    const radial = radialMatrix(p, R);
    const angular = angularMatrix(p, degrees);
    return extremeEigenvalue(radial.diag, radial.off, 'highest') - extremeEigenvalue(angular.diag, angular.off, 'lowest');
}

function checkR(R: number): void {
    if (!Number.isFinite(R) || !(R > 0)) {
        throw new RangeError(`H₂⁺ needs a positive, finite internuclear distance; got ${R}`);
    }
}

function separationP(R: number, state: H2PlusState): number {
    checkR(R);
    const degrees = DEGREES[state];
    let lo = 1e-3;
    let hi = 40;
    const signLo = Math.sign(mismatch(lo, R, degrees));
    if (signLo === Math.sign(mismatch(hi, R, degrees))) {
        throw new Error(`H₂⁺ ${H2PLUS_LABELS[state]}: no bound state bracketed at R = ${R} a₀`);
    }
    for (let i = 0; i < 100 && hi - lo > 1e-13; i++) {
        const mid = 0.5 * (lo + hi);
        if (Math.sign(mismatch(mid, R, degrees)) === signLo) lo = mid;
        else hi = mid;
    }
    return 0.5 * (lo + hi);
}

export function h2plusElectronicEnergy(R: number, state: H2PlusState): number {
    const p = separationP(R, state);
    return (-2 * p * p) / (R * R);
}

/** E_el + 1/R, the Born–Oppenheimer potential energy. */
export function h2plusTotalEnergy(R: number, state: H2PlusState): number {
    return h2plusElectronicEnergy(R, state) + 1 / R;
}

export function h2plusCurve(Rs: readonly number[], state: H2PlusState): number[] {
    return Rs.map(R => h2plusTotalEnergy(R, state));
}

/** Golden-section minimum of the 1σg curve on [1.5, 2.5] a₀. */
export function h2plusEquilibrium(): { R: number; totalEnergy: number } {
    const f = (R: number) => h2plusTotalEnergy(R, '1sigma_g');
    const ratio = (Math.sqrt(5) - 1) / 2;
    let a = 1.5;
    let b = 2.5;
    let c = b - ratio * (b - a);
    let d = a + ratio * (b - a);
    let fc = f(c);
    let fd = f(d);
    while (b - a > 1e-7) {
        if (fc < fd) { b = d; d = c; fd = fc; c = b - ratio * (b - a); fc = f(c); }
        else { a = c; c = d; fc = fd; d = a + ratio * (b - a); fd = f(d); }
    }
    const R = 0.5 * (a + b);
    return { R, totalEnergy: f(R) };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/bonds && npx tsc --noEmit -p .`
Expected: PASS (8 + 3 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/bonds/tridiagonal.ts src/bonds/h2plus.ts tests/bonds
git commit -m "feat(bonds): exact H2+ energies by prolate spheroidal separation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The H₂⁺ wavefunction as a field recipe

**Files:**
- Modify: `src/bonds/h2plus.ts` (append), `src/field_source.ts` (recipe + `makeFieldEvaluator` case)
- Test: `tests/bonds/h2plus_wavefunction.test.ts`

**Interfaces:**
- Consumes: Task 1 internals; Phase 1 `FieldRecipe`, `makeFieldEvaluator`, `AnalyticFieldSource`, `generateFieldMesh`.
- Produces: `interface H2PlusSolution { R; state; p; sigma; electronicEnergy; totalEnergy; degrees: number[]; angular: Float64Array; radial: Float64Array; normalisation: number }`; `solveH2Plus(R, state): H2PlusSolution`; `h2plusEvaluator(solution): FieldEvaluator`; `h2plusSamplingRadius(solution): number`; `h2plusSource(R, state): AnalyticFieldSource` (id `h2plus:<R to 4 dp>:<state>`); `interface H2PlusRecipe { type: 'h2plus'; R: number; state: H2PlusState }` in `field_source.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bonds/h2plus_wavefunction.test.ts
import { solveH2Plus, h2plusEvaluator, h2plusSource } from '../../src/bonds/h2plus';
import { makeFieldEvaluator } from '../../src/field_source';
import { generateFieldMesh } from '../../src/orbital_mesh';

const g = solveH2Plus(2, '1sigma_g');
const u = solveH2Plus(2, '1sigma_u');
const psiG = h2plusEvaluator(g);
const psiU = h2plusEvaluator(u);
const POINTS: Array<[number, number, number]> = [[0.4, 0.3, 0.6], [1.5, -0.7, 1.9], [-0.8, 0.2, -0.4]];

function localEnergy(psi: (x: number, y: number, z: number) => number, [x, y, z]: [number, number, number]): number {
    const h = 1e-3;
    const c = psi(x, y, z);
    const laplacian = (psi(x + h, y, z) + psi(x - h, y, z) + psi(x, y + h, z) + psi(x, y - h, z)
        + psi(x, y, z + h) + psi(x, y, z - h) - 6 * c) / (h * h);
    const potential = -1 / Math.hypot(x, y, z - 1) - 1 / Math.hypot(x, y, z + 1);
    return -0.5 * laplacian / c + potential;
}

describe('the exact H2+ wavefunction', () => {
    it.each([['1σg', psiG, g.electronicEnergy], ['1σu', psiU, u.electronicEnergy]] as const)(
        '%s satisfies the Schrödinger equation pointwise', (_name, psi, energy) => {
            for (const point of POINTS) expect(Math.abs(localEnergy(psi, point) - energy)).toBeLessThan(1e-4);
        });

    it('is normalised', () => {
        const n = 81, L = 8, step = (2 * L) / (n - 1);
        for (const psi of [psiG, psiU]) {
            let sum = 0;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
                sum += psi(-L + i * step, -L + j * step, -L + k * step) ** 2;
            }
            expect(Math.abs(sum * step ** 3 - 1)).toBeLessThan(2e-3);
        }
    });

    it('has the Kato cusp at each nucleus', () => {
        const h = 1e-4;
        for (const psi of [psiG, psiU]) {
            const at = psi(0, 0, 1);
            const slope = (dz: number) => (Math.log(Math.abs(psi(0, 0, 1 + dz))) - Math.log(Math.abs(at))) / h;
            expect((slope(h) + slope(-h)) / 2).toBeCloseTo(-1, 3);
        }
    });

    it('is gerade or ungerade, positive at the +z nucleus, and 1σu has its node on the midplane', () => {
        for (const [x, y, z] of POINTS) {
            expect(psiG(x, y, -z)).toBeCloseTo(psiG(x, y, z), 10);
            expect(psiU(x, y, -z)).toBeCloseTo(-psiU(x, y, z), 10);
        }
        expect(psiG(0, 0, 1)).toBeGreaterThan(0);
        expect(psiU(0, 0, 1)).toBeGreaterThan(0);
        expect(Math.abs(psiU(0.7, -0.3, 0))).toBeLessThan(1e-12);
        expect(psiG(0, 0, 0) / psiG(0, 0, 1)).toBeGreaterThan(0.6);
    });

    it('is the evaluator the h2plus recipe builds, and meshes through generateFieldMesh', () => {
        const source = h2plusSource(2, '1sigma_u');
        expect(source.id).toBe('h2plus:2.0000:1sigma_u');
        expect(source.recipe).toEqual({ type: 'h2plus', R: 2, state: '1sigma_u' });
        expect(makeFieldEvaluator(source.recipe)(0.4, 0.3, 0.6)).toBeCloseTo(psiU(0.4, 0.3, 0.6), 12);

        const bonding = generateFieldMesh(h2plusSource(2, '1sigma_g'), 40, 0.9);
        expect(new Set(bonding.psiSigns)).toEqual(new Set([1]));
        const antibonding = generateFieldMesh(source, 40, 0.9);
        antibonding.positions.forEach(([, , z], v) => {
            if (Math.abs(z) > 0.3) expect(antibonding.psiSigns[v]).toBe(z > 0 ? 1 : -1);
        });
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/bonds/h2plus_wavefunction.test.ts`
Expected: FAIL, "solveH2Plus is not exported" (TS2305).

- [ ] **Step 3: Implement**

Append to `src/bonds/h2plus.ts` (and add `import type { AnalyticFieldSource, FieldEvaluator } from '../field_source';` at the top — a type-only import, so `field_source.ts` can import this module at run time without a cycle):

```ts
export interface H2PlusSolution {
    R: number;
    state: H2PlusState;
    p: number;
    sigma: number;
    electronicEnergy: number;
    totalEnergy: number;
    degrees: number[];
    /** Unit coefficients of M(μ) on normalised Legendre functions of `degrees`. */
    angular: Float64Array;
    /** Jaffé coefficients gₙ of Λ(λ). */
    radial: Float64Array;
    normalisation: number;
}

function radialFactor(s: H2PlusSolution, lambda: number): number {
    const x = (lambda - 1) / (lambda + 1);
    let sum = 0;
    let power = 1;
    for (let n = 0; n < s.radial.length; n++) { sum += s.radial[n] * power; power *= x; }
    return Math.pow(lambda + 1, s.sigma) * Math.exp(-s.p * (lambda - 1)) * sum;
}

function angularFactor(s: H2PlusSolution, mu: number): number {
    let sum = 0;
    let term = 0;
    let previous = 0;
    let current = 1;   // P_0
    for (let k = 0; term < s.degrees.length; k++) {
        if (k === s.degrees[term]) { sum += s.angular[term] * Math.sqrt((2 * k + 1) / 2) * current; term++; }
        const next = ((2 * k + 1) * mu * current - k * previous) / (k + 1);
        previous = current;
        current = next;
    }
    return sum;
}

/** ∫|ΛM|² dV = (R/2)³ 2π ∫∫ Λ²M²(λ² − μ²) dλ dμ, with ∫M² dμ = 1 by construction. */
function normIntegral(s: H2PlusSolution): number {
    const lambdaMax = 1 + 40 / s.p;   // e^(−2p(λ−1)) is 10⁻³⁵ there
    const intervals = 4000;
    const h = (lambdaMax - 1) / intervals;
    let i0 = 0;
    let i2 = 0;
    for (let i = 0; i <= intervals; i++) {
        const lambda = 1 + i * h;
        const weight = i === 0 || i === intervals ? 1 : i % 2 ? 4 : 2;
        const L = radialFactor(s, lambda);
        i0 += weight * L * L;
        i2 += weight * L * L * lambda * lambda;
    }
    i0 *= h / 3;
    i2 *= h / 3;
    const mu2 = muSquared(s.degrees);
    let j2 = 0;
    for (let i = 0; i < s.degrees.length; i++) {
        j2 += s.angular[i] ** 2 * mu2.diag[i];
        if (i < s.degrees.length - 1) j2 += 2 * s.angular[i] * s.angular[i + 1] * mu2.off[i];
    }
    return (s.R / 2) ** 3 * 2 * Math.PI * (i2 - i0 * j2);
}

export function solveH2Plus(R: number, state: H2PlusState): H2PlusSolution {
    const p = separationP(R, state);
    const degrees = DEGREES[state];
    const angularM = angularMatrix(p, degrees);
    const angular = eigenvectorFor(angularM.diag, angularM.off, extremeEigenvalue(angularM.diag, angularM.off, 'lowest'));
    const radialM = radialMatrix(p, R);
    const v = eigenvectorFor(radialM.diag, radialM.off, extremeEigenvalue(radialM.diag, radialM.off, 'highest'));
    // Undo the symmetrisation: the recurrence's own coefficients are gₙ = vₙ/dₙ,
    // with d₀ = 1 and dₙ₊₁ = dₙ·√(αₙ/γₙ₊₁) = dₙ·(n+1)/|n−σ| (σ ∈ (0, 1), never an integer).
    const radial = new Float64Array(v.length);
    let scale = 1;
    for (let n = 0; n < v.length; n++) {
        radial[n] = v[n] / scale;
        scale *= (n + 1) / Math.abs(n - radialM.sigma);
    }
    const electronicEnergy = (-2 * p * p) / (R * R);
    const solution: H2PlusSolution = {
        R, state, p, sigma: radialM.sigma, electronicEnergy, totalEnergy: electronicEnergy + 1 / R,
        degrees, angular, radial, normalisation: 1,
    };
    // Positive at the +z nucleus (λ = 1, μ = 1), so both states share one phase convention on screen.
    if (radialFactor(solution, 1) * angularFactor(solution, 1) < 0) angular.forEach((c, i) => { angular[i] = -c; });
    solution.normalisation = 1 / Math.sqrt(normIntegral(solution));
    return solution;
}

export function h2plusEvaluator(s: H2PlusSolution): FieldEvaluator {
    const half = s.R / 2;
    return (x, y, z) => {
        const rho2 = x * x + y * y;
        const rPlus = Math.sqrt(rho2 + (z - half) ** 2);
        const rMinus = Math.sqrt(rho2 + (z + half) ** 2);
        const lambda = Math.max(1, (rPlus + rMinus) / s.R);
        const mu = Math.max(-1, Math.min(1, (rMinus - rPlus) / s.R));
        return s.normalisation * radialFactor(s, lambda) * angularFactor(s, mu);
    };
}

/** Half-width of the sampling box: past the far nucleus by 9/κ, where ψ² has fallen by e⁻¹⁸. */
export function h2plusSamplingRadius(s: H2PlusSolution): number {
    return s.R / 2 + 9 / Math.sqrt(-2 * s.electronicEnergy);
}

export function h2plusSource(R: number, state: H2PlusState): AnalyticFieldSource {
    return {
        kind: 'analytic',
        id: `h2plus:${R.toFixed(4)}:${state}`,
        recipe: { type: 'h2plus', R, state },
        rMax: h2plusSamplingRadius(solveH2Plus(R, state)),
    };
}
```

In `src/field_source.ts`: add `import { H2PlusState, h2plusEvaluator, solveH2Plus } from './bonds/h2plus';`, then

```ts
/** H₂⁺ solved exactly at internuclear distance R, nuclei at z = ±R/2 (Phase 5). */
export interface H2PlusRecipe {
    type: 'h2plus';
    R: number;
    state: H2PlusState;
}
```

extend the union to `HydrogenicRecipe | CombinationRecipe | Polarized1sRecipe | H2PlusRecipe`, and add to `makeFieldEvaluator`'s switch, before `default`:

```ts
        case 'h2plus': return h2plusEvaluator(solveH2Plus(recipe.R, recipe.state));
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/bonds tests/field_source.test.ts tests/field_mesh.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/bonds/h2plus.ts src/field_source.ts tests/bonds/h2plus_wavefunction.test.ts
git commit -m "feat(bonds): exact H2+ wavefunction as an 'h2plus' field recipe

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Pipeline scaffold — molecule table, basis export, orbital labels

**Files:**
- Create: `tools/molecules/requirements.txt`, `conftest.py`, `molecules.py`, `basis_export.py`, `labels.py`
- Modify: `.gitignore` (append `tools/molecules/.cache/` and `.pytest_cache/`)
- Test: `tools/molecules/test_basis_export.py`, `tools/molecules/test_labels.py`

**Interfaces:**
- Produces (Python): `Diatomic` dataclass, `DIATOMICS`, `SCAN_FACTORS`, `IRREP_NELEC_DOOH`, `DOOH_TO_D2H`, `ANGSTROM_TO_BOHR`, `BOHR_TO_ANGSTROM`, `HARTREE_TO_EV`, `REPO_ROOT`; `export_shells(mol) -> list[dict]`, `evaluate_aos(shells, atoms, points) -> ndarray`, `check_against_pyscf(mol, shells)`; `irrep_to_lambda(group, irrep) -> tuple[str, str]`, `label_orbitals(mol, coeff, energy, homonuclear) -> list[str]`, `select_orbitals(mol, coeff, occ) -> list[int]`, `bond_order(labels, occupations, homonuclear) -> float | None`.

- [ ] **Step 1: Create the environment**

`tools/molecules/requirements.txt`:

```
# Offline molecule pipeline for Bonds mode (Phase 5). Python 3.12: PySCF 2.8.0
# publishes wheels up to 3.13, and the system python may be newer.
pyscf==2.8.0
numpy>=1.26,<3
scipy>=1.11
pytest>=8.0
```

Run: `uv venv --python 3.12 tools/molecules/.venv && uv pip install --python tools/molecules/.venv/bin/python -r tools/molecules/requirements.txt`
Expected: installs; `tools/molecules/.venv/bin/python -c "import pyscf; print(pyscf.__version__)"` prints `2.8.0`.

- [ ] **Step 2: Write the failing tests**

```python
# tools/molecules/conftest.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
```

```python
# tools/molecules/test_basis_export.py
import numpy as np
import pytest
from pyscf import gto

from basis_export import evaluate_aos, export_shells, check_against_pyscf


@pytest.mark.parametrize('atoms', [[('N', (0, 0, -1.04)), ('N', (0, 0, 1.04))],
                                   [('H', (0, 0, -0.87)), ('F', (0, 0, 0.87))]])
def test_exported_shells_reproduce_pyscf_aos(atoms):
    mol = gto.M(atom=atoms, unit='Bohr', basis='def2-tzvp', verbose=0)
    shells = export_shells(mol)
    assert sum(2 * s['l'] + 1 for s in shells) == mol.nao
    assert max(s['l'] for s in shells) == 3 if atoms[0][0] == 'N' else True
    points = np.random.default_rng(7).uniform(-3, 3, size=(300, 3))
    ours = evaluate_aos(shells, [list(map(float, p)) for p in mol.atom_coords()], points)
    theirs = mol.eval_gto('GTOval_sph', points)
    assert np.max(np.abs(ours - theirs)) < 1e-10 * max(1.0, np.max(np.abs(theirs)))
    check_against_pyscf(mol, shells)


def test_refuses_cartesian_basis():
    mol = gto.M(atom='N 0 0 0; N 0 0 2.07', unit='Bohr', basis='def2-tzvp', cart=True, verbose=0)
    with pytest.raises(ValueError, match='spherical'):
        export_shells(mol)
```

```python
# tools/molecules/test_labels.py
import pytest
from pyscf import dft, gto

from labels import bond_order, irrep_to_lambda, label_orbitals, select_orbitals


@pytest.mark.parametrize('group,irrep,expected', [
    ('Dooh', 'A1g', ('σ', 'g')), ('Dooh', 'A1u', ('σ', 'u')), ('Dooh', 'E1ux', ('π', 'u')),
    ('Dooh', 'E1gy', ('π', 'g')), ('Coov', 'A1', ('σ', '')), ('Coov', 'E1x', ('π', '')),
    ('D2h', 'B3u', ('π', 'u')), ('D2h', 'B1u', ('σ', 'u')), ('C2v', 'B2', ('π', '')),
])
def test_irrep_to_lambda(group, irrep, expected):
    assert irrep_to_lambda(group, irrep) == expected


def test_unknown_irrep_is_loud():
    with pytest.raises(ValueError, match='No σ/π/δ label'):
        irrep_to_lambda('C3v', 'A1')


def test_bond_order_counts_bonding_minus_antibonding():
    assert bond_order(['1σg', '1σu*'], [2, 2], True) == 0
    assert bond_order(['1σg', '1σu*', '1πu', '1πu'], [2, 2, 2, 2], True) == 2
    assert bond_order(['1σ', '2σ'], [2, 2], False) is None


def test_nitrogen_orbitals_labels_and_kept_virtuals():
    mol = gto.M(atom='N 0 0 -1.0372; N 0 0 1.0372', unit='Bohr', basis='def2-tzvp', symmetry=True, verbose=0)
    mf = dft.RKS(mol)
    mf.xc = 'b3lyp'
    mf.kernel()
    labels = label_orbitals(mol, mf.mo_coeff, mf.mo_energy, homonuclear=True)
    kept = select_orbitals(mol, mf.mo_coeff, mf.mo_occ)
    occupied = sorted(labels[i] for i in kept if mf.mo_occ[i] > 0)
    virtual = sorted(labels[i] for i in kept if mf.mo_occ[i] == 0)
    assert occupied == sorted(['1σg', '1σu*', '2σg', '2σu*', '1πu', '1πu', '3σg'])
    assert virtual == sorted(['1πg*', '1πg*', '3σu*'])
    assert bond_order([labels[i] for i in kept], [mf.mo_occ[i] for i in kept], True) == 3
```

- [ ] **Step 3: Run to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'basis_export'`.

- [ ] **Step 4: Implement**

```python
# tools/molecules/molecules.py
"""The diatomics Bonds mode ships, the geometry each scan is centred on, and
the published value each is checked against."""
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BOHR_TO_ANGSTROM = 0.529177210903
ANGSTROM_TO_BOHR = 1 / BOHR_TO_ANGSTROM
HARTREE_TO_EV = 27.211386245988

# Dense near the minimum (R_e is fitted there), sparse out towards dissociation.
SCAN_FACTORS = (0.80, 0.85, 0.88, 0.91, 0.94, 0.96, 0.98, 1.00, 1.02, 1.04,
                1.06, 1.09, 1.12, 1.16, 1.22, 1.30, 1.45, 1.65, 1.95, 2.40)
EQUILIBRIUM_INDEX = SCAN_FACTORS.index(1.00)

HUBER_HERZBERG = 'Huber & Herzberg, Constants of Diatomic Molecules (1979), via NIST Chemistry WebBook'


@dataclass(frozen=True)
class Diatomic:
    id: str
    name: str
    formula: str
    elements: tuple[str, str]   # first at z = -R/2, second at +R/2
    spin: int                   # 2S, PySCF's convention
    r_ref_angstrom: float       # scan centre: experimental R_e where one exists
    energy_method: str          # 'fci' or 'ccsd(t)'
    reference_re_angstrom: float | None   # asserted within 1 %; None = not asserted
    reference_source: str
    note: str | None = None


DIATOMICS = (
    Diatomic('h2', 'Hydrogen', 'H₂', ('H', 'H'), 0, 0.7414, 'fci', 0.7414, HUBER_HERZBERG),
    Diatomic('he2', 'Helium dimer', 'He₂', ('He', 'He'), 0, 1.5875, 'fci', None, 'no chemical bond',
             'No chemical bond: bond order 0. The full-CI curve has only a van der Waals well of a few hundredths of a mHa, invisible at this scale.'),
    Diatomic('li2', 'Lithium', 'Li₂', ('Li', 'Li'), 0, 2.6729, 'ccsd(t)', None, HUBER_HERZBERG),
    Diatomic('b2', 'Boron', 'B₂', ('B', 'B'), 2, 1.5900, 'ccsd(t)', None, HUBER_HERZBERG,
             'Ground state is the triplet ³Σg⁻: two unpaired electrons in 1πu.'),
    Diatomic('c2', 'Carbon', 'C₂', ('C', 'C'), 0, 1.2425, 'ccsd(t)', None, HUBER_HERZBERG,
             'C₂ has strong multi-reference character; single-reference CCSD(T) and B3LYP are approximate here.'),
    Diatomic('n2', 'Nitrogen', 'N₂', ('N', 'N'), 0, 1.0977, 'ccsd(t)', 1.098, HUBER_HERZBERG),
    Diatomic('o2', 'Oxygen', 'O₂', ('O', 'O'), 2, 1.2075, 'ccsd(t)', 1.207, HUBER_HERZBERG,
             'Ground state is the triplet ³Σg⁻: two unpaired electrons in 1πg*.'),
    Diatomic('f2', 'Fluorine', 'F₂', ('F', 'F'), 0, 1.4119, 'ccsd(t)', 1.412, HUBER_HERZBERG),
    Diatomic('co', 'Carbon monoxide', 'CO', ('C', 'O'), 0, 1.1283, 'ccsd(t)', 1.128, HUBER_HERZBERG),
    Diatomic('hf', 'Hydrogen fluoride', 'HF', ('H', 'F'), 0, 0.9168, 'ccsd(t)', 0.917, HUBER_HERZBERG),
)

# Occupations pinned per D∞h irrep (alpha, beta), so SCF cannot settle into
# another state: B₂ 1πu², C₂ 1πu⁴ (not 3σg²), O₂ 1πg².
IRREP_NELEC_DOOH = {
    'b2': {'A1g': (2, 2), 'A1u': (2, 2), 'E1ux': (1, 0), 'E1uy': (1, 0)},
    'c2': {'A1g': (2, 2), 'A1u': (2, 2), 'E1ux': (1, 1), 'E1uy': (1, 1)},
    'o2': {'A1g': (3, 3), 'A1u': (2, 2), 'E1ux': (1, 1), 'E1uy': (1, 1), 'E1gx': (1, 0), 'E1gy': (1, 0)},
}
DOOH_TO_D2H = {'A1g': 'Ag', 'A1u': 'B1u', 'E1ux': 'B3u', 'E1uy': 'B2u', 'E1gx': 'B2g', 'E1gy': 'B3g'}
```

```python
# tools/molecules/basis_export.py
"""PySCF's spherical AOs, written out so src/molecules/gaussian_basis.ts can
rebuild them exactly. SOLID_HARMONICS here and in the TS file must match
line for line (see the plan's Design decisions)."""
import numpy as np
from pyscf import gto

CONVENTION = ('pyscf-sph: AO = [sum_k c_k exp(-a_k r^2)] * S_lm(x,y,z), S_lm real solid harmonics '
              'normalised on the unit sphere; p order x,y,z; l>=2 order m=-l..l')


def solid_harmonics(l, x, y, z):
    if l == 0:
        return [0.28209479177387814 * np.ones_like(x)]
    if l == 1:
        c = 0.4886025119029199
        return [c * x, c * y, c * z]
    if l == 2:
        return [1.0925484305920792 * x * y, 1.0925484305920792 * y * z,
                0.31539156525252005 * (2 * z * z - x * x - y * y),
                1.0925484305920792 * x * z, 0.5462742152960396 * (x * x - y * y)]
    if l == 3:
        return [0.5900435899266435 * y * (3 * x * x - y * y), 2.890611442640554 * x * y * z,
                0.4570457994644658 * y * (4 * z * z - x * x - y * y),
                0.3731763325901154 * z * (2 * z * z - 3 * x * x - 3 * y * y),
                0.4570457994644658 * x * (4 * z * z - x * x - y * y),
                1.445305721320277 * z * (x * x - y * y), 0.5900435899266435 * x * (x * x - 3 * y * y)]
    raise ValueError(f'l = {l}: the diatomics in def2-TZVP need nothing beyond f')


def export_shells(mol):
    if mol.cart:
        raise ValueError('export expects spherical AOs (mol.cart = False)')
    shells = []
    for ib in range(mol.nbas):
        l = mol.bas_angular(ib)
        exponents = mol.bas_exp(ib)
        # libcint's coefficients: contraction x primitive normalisation.
        coefficients = mol.bas_ctr_coeff(ib) * gto.gto_norm(l, exponents)[:, None]
        for column in range(coefficients.shape[1]):   # general contractions: one shell per column
            shells.append({'atom': int(mol.bas_atom(ib)), 'l': int(l),
                           'exponents': [float(a) for a in exponents],
                           'coefficients': [float(c) for c in coefficients[:, column]]})
    return shells


def evaluate_aos(shells, atoms, points):
    points = np.asarray(points, dtype=float)
    columns = []
    for shell in shells:
        d = points - np.asarray(atoms[shell['atom']])
        r2 = np.einsum('ij,ij->i', d, d)
        radial = sum(c * np.exp(-a * r2) for a, c in zip(shell['exponents'], shell['coefficients']))
        columns.extend(radial * angular for angular in solid_harmonics(shell['l'], d[:, 0], d[:, 1], d[:, 2]))
    return np.stack(columns, axis=1)


def check_against_pyscf(mol, shells):
    points = np.random.default_rng(11).uniform(-4, 4, size=(200, 3))
    atoms = [list(map(float, p)) for p in mol.atom_coords()]
    theirs = mol.eval_gto('GTOval_sph', points)
    error = np.max(np.abs(evaluate_aos(shells, atoms, points) - theirs))
    if error > 1e-10 * max(1.0, np.max(np.abs(theirs))):
        raise AssertionError(f'exported basis differs from PySCF by {error:.3e}')
```

```python
# tools/molecules/labels.py
"""σ/π labels, the orbitals worth shipping, and bond order."""
import re

import numpy as np
from pyscf import gto, symm

_D2H = {'Ag': ('σ', 'g'), 'B1u': ('σ', 'u'), 'B2u': ('π', 'u'), 'B3u': ('π', 'u'),
        'B2g': ('π', 'g'), 'B3g': ('π', 'g'), 'B1g': ('δ', 'g'), 'Au': ('δ', 'u')}
_C2V = {'A1': ('σ', ''), 'B1': ('π', ''), 'B2': ('π', ''), 'A2': ('δ', '')}
_LAMBDA = {'A': 'σ', 'E1': 'π', 'E2': 'δ', 'E3': 'φ'}
ANTIBONDING = {('σ', 'u'), ('π', 'g')}


def irrep_to_lambda(group, irrep):
    if group == 'D2h' and irrep in _D2H:
        return _D2H[irrep]
    if group == 'C2v' and irrep in _C2V:
        return _C2V[irrep]
    if group in ('Dooh', 'Coov'):
        match = re.fullmatch(r'(A1|A2|E\d+)([gu]?)([xy]?)', irrep)
        if match:
            kind = 'A' if match.group(1).startswith('A') else match.group(1)
            if kind in _LAMBDA and (group == 'Coov') == (match.group(2) == ''):
                return _LAMBDA[kind], match.group(2)
    raise ValueError(f'No σ/π/δ label for irrep {irrep!r} of group {group}')


def label_orbitals(mol, coeff, energy, homonuclear):
    irreps = symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, coeff)
    counts, last, labels = {}, {}, [''] * len(energy)
    for i in np.argsort(energy, kind='stable'):
        key = irrep_to_lambda(mol.groupname, irreps[i])
        previous = last.get(key)
        if key[0] != 'σ' and previous is not None and abs(energy[i] - previous[1]) < 1e-4:
            number = previous[0]   # the degenerate partner of a π pair shares its number
        else:
            number = counts.get(key, 0) + 1
            counts[key] = number
        last[key] = (number, float(energy[i]))
        star = '*' if homonuclear and key in ANTIBONDING else ''
        labels[i] = f'{number}{key[0]}{key[1]}{star}'
    return labels


def select_orbitals(mol, coeff, occ):
    """Every occupied orbital, plus the virtuals most like minimal-basis valence
    orbitals (largest projection onto MINAO) up to the minimal-basis size: the
    textbook diagram's σ*/π*, not the triple-zeta basis's diffuse extras."""
    minao = gto.M(atom=[(mol.atom_symbol(i), mol.atom_coord(i)) for i in range(mol.natm)],
                  unit='Bohr', basis='minao', spin=mol.spin, verbose=0)
    s12 = gto.intor_cross('int1e_ovlp', mol, minao)
    projector = s12 @ np.linalg.solve(minao.intor('int1e_ovlp'), s12.T)
    occupied = [i for i in range(len(occ)) if occ[i] > 0]
    virtual = [i for i in range(len(occ)) if occ[i] == 0]
    weight = {i: float(coeff[:, i] @ projector @ coeff[:, i]) for i in virtual}
    wanted = max(0, minao.nao - len(occupied))
    chosen = sorted(virtual, key=lambda i: -weight[i])[:wanted]
    return sorted(occupied + chosen)


def bond_order(labels, occupations, homonuclear):
    if not homonuclear:
        return None
    bonding = sum(o for label, o in zip(labels, occupations) if o > 0 and not label.endswith('*'))
    antibonding = sum(o for label, o in zip(labels, occupations) if o > 0 and label.endswith('*'))
    return (bonding - antibonding) / 2
```

Append to `.gitignore`:

```
tools/molecules/.cache/
.pytest_cache/
```

- [ ] **Step 5: Run to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules -q`
Expected: all PASS (about 15 s, the N₂ RKS dominates). If `check_against_pyscf` fails by a constant factor per shell, compare `mol._libcint_ctr_coeff(ib)` with the exported coefficients: that is the only convention in play.

- [ ] **Step 6: Commit**

```bash
git add tools/molecules/requirements.txt tools/molecules/conftest.py tools/molecules/molecules.py \
  tools/molecules/basis_export.py tools/molecules/labels.py tools/molecules/test_*.py .gitignore
git commit -m "feat(molecules): pipeline scaffold -- diatomics table, PySCF basis export, σ/π labels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Pipeline — energies, fit, file writers, `generate.py`

**Files:**
- Create: `tools/molecules/quantum.py`, `fit.py`, `outputs.py`, `generate.py`
- Test: `tools/molecules/test_fit.py`, `tools/molecules/test_outputs.py`

**Interfaces:**
- Consumes: Task 3.
- Produces: `reference_energy(d, r_bohr, *, spin=None, symmetry=True) -> float`, `hydrogen_atom_energy() -> float`, `kohn_sham(d, r_bohr) -> (mol, mf)`; `fit_minimum(r, e) -> dict` (`ReBohr`, `EminHartree`, `wellDepthHartree`, `bound`); `grid_spec(r_bohr)`, `density_on_grid(shells, atoms, orbitals, grid) -> np.ndarray[float32]`, `orbital_labels(mol, coeff, energy, homonuclear)`, `orbital_entries(mol, mf, homonuclear)`, `generate.basis_json(mol, mf) -> dict` (the `basis.json` payload without `id`, for any molecule — Phase 6 calls it), `assign_roles(entries)`, `cached(key, compute)`, `write_json(path, data)`, `validation_rows(out_root)`; CLI `generate.py [--only ID ...]`. File shapes are those of `src/molecules/types.ts` (Task 6).

- [ ] **Step 1: Write the failing tests**

```python
# tools/molecules/test_fit.py
import numpy as np

from fit import fit_minimum
from molecules import SCAN_FACTORS


def morse(r, de=0.17, a=1.0, re=1.4):
    return de * (1 - np.exp(-a * (r - re))) ** 2 - de


def test_fits_the_minimum_of_a_morse_curve():
    r = 1.4 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, morse(r))
    assert abs(fit['ReBohr'] - 1.4) < 1e-4 * 1.4
    assert abs(fit['EminHartree'] + 0.17) < 1e-5
    assert fit['bound'] is True


def test_a_repulsive_curve_is_not_bound():
    r = 3.0 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, np.exp(-r))
    assert fit['ReBohr'] is None and fit['bound'] is False


def test_a_van_der_waals_dimple_is_not_a_bond():
    r = 3.0 * np.array(SCAN_FACTORS)
    fit = fit_minimum(r, 0.5 * np.exp(-2 * r) - 3e-5 * np.exp(-((r - 5.6) ** 2)))
    assert fit['bound'] is False and fit['wellDepthHartree'] < 1e-4
```

```python
# tools/molecules/test_outputs.py
import numpy as np

from outputs import assign_roles, cached, density_on_grid, grid_spec


def test_grid_is_a_centred_cube_holding_both_atoms_with_padding():
    grid = grid_spec(2.07)
    side = grid['shape'][0]
    assert grid['shape'] == [side, side, side] and side % 2 == 1
    half = (side - 1) * grid['spacing'] / 2
    assert grid['origin'] == [-half] * 3
    assert half >= 2.07 / 2 + 6.5


def test_density_grid_is_z_fastest():
    shells = [{'atom': 0, 'l': 0, 'exponents': [2.0], 'coefficients': [1.0]}]
    orbitals = [{'occupation': 2.0, 'coefficients': [1.0]}]
    grid = {'shape': [5, 5, 5], 'origin': [-1.0, -1.0, -1.0], 'spacing': 0.5}
    rho = density_on_grid(shells, [[0.0, 0.0, 0.5]], orbitals, grid)
    assert rho.dtype == np.dtype('<f4')
    assert int(np.argmax(rho)) == (2 * 5 + 2) * 5 + 3   # i = j = 2 (x = y = 0), k = 3 (z = 0.5)


def test_roles_restricted_and_unrestricted():
    restricted = [{'spin': 'restricted', 'label': 'a', 'energyHartree': -1.0, 'occupation': 2.0},
                  {'spin': 'restricted', 'label': 'b', 'energyHartree': -0.5, 'occupation': 2.0},
                  {'spin': 'restricted', 'label': 'c', 'energyHartree': 0.1, 'occupation': 0.0}]
    assign_roles(restricted)
    assert [e.get('role') for e in restricted] == [None, 'HOMO', 'LUMO']
    open_shell = [{'spin': 'alpha', 'label': '1πg*', 'energyHartree': -0.3, 'occupation': 1.0},
                  {'spin': 'beta', 'label': '1πg*', 'energyHartree': -0.1, 'occupation': 0.0}]
    assign_roles(open_shell)
    assert [e.get('role') for e in open_shell] == ['SOMO', 'LUMO']


def test_basis_json_serves_any_scf_result():
    # Phase 6's contract: generate.basis_json(mol, mf) for molecules that are not diatomic scans.
    import json
    from pyscf import gto, scf
    import generate
    mol = gto.M(atom='H 0 0 0; H 0 0 0.74', basis='sto-3g', verbose=0)
    payload = generate.basis_json(mol, scf.RHF(mol).run())
    assert payload['nao'] == 2 and 'id' not in payload
    assert [o['label'] for o in payload['orbitals']] == ['MO 1', 'MO 2']
    json.dumps(payload)


def test_cached_computes_once(tmp_path, monkeypatch):
    import outputs
    monkeypatch.setattr(outputs, 'CACHE_DIR', tmp_path)
    calls = []
    assert cached('k', lambda: calls.append(1) or 1.5) == 1.5
    assert cached('k', lambda: calls.append(1) or 9.9) == 1.5
    assert calls == [1]
```

- [ ] **Step 2: Run to verify they fail**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/test_fit.py tools/molecules/test_outputs.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'fit'`.

- [ ] **Step 3: Implement**

```python
# tools/molecules/quantum.py
"""The two levels of theory the generator runs, and nothing else."""
from pyscf import cc, dft, fci, gto, scf

from molecules import DOOH_TO_D2H, IRREP_NELEC_DOOH

REFERENCE_BASIS = 'aug-cc-pvtz'
ORBITAL_BASIS = 'def2-tzvp'
XC = 'b3lyp'   # PySCF >= 2.3: the VWN-RPA variant, as in Gaussian


def build_mol(d, r_bohr, basis, *, spin=None, symmetry=True):
    return gto.M(atom=[(d.elements[0], (0.0, 0.0, -r_bohr / 2)), (d.elements[1], (0.0, 0.0, r_bohr / 2))],
                 unit='Bohr', basis=basis, spin=d.spin if spin is None else spin, symmetry=symmetry, verbose=0)


def pinned_occupations(d, mol):
    table = IRREP_NELEC_DOOH.get(d.id)
    if table is None or not mol.symmetry:
        return None
    if mol.groupname == 'Dooh':
        names = {k: k for k in table}
    elif mol.groupname == 'D2h':
        names = DOOH_TO_D2H
    else:
        raise ValueError(f'{d.id}: pinned occupations need Dooh or D2h, PySCF chose {mol.groupname}')
    return {names[k]: (v if mol.spin else sum(v)) for k, v in table.items()}


def run_scf(mf, pinned):
    if pinned:
        mf.irrep_nelec = pinned
    mf.conv_tol = 1e-10
    mf.kernel()
    if not mf.converged:
        raise RuntimeError(f'{type(mf).__name__} did not converge for {mf.mol.atom}')
    return mf


def frozen_core(mol):
    return sum(1 for i in range(mol.natm) if mol.atom_charge(i) > 2)


def reference_energy(d, r_bohr, *, spin=None, symmetry=True):
    mol = build_mol(d, r_bohr, REFERENCE_BASIS, spin=spin, symmetry=symmetry)
    mf = run_scf(scf.UHF(mol) if mol.spin else scf.RHF(mol), pinned_occupations(d, mol) if spin is None else None)
    if d.energy_method == 'fci':
        energy, _ = fci.FCI(mf).kernel()
        return float(energy)
    coupled = cc.CCSD(mf, frozen=frozen_core(mol))
    coupled.conv_tol = 1e-9
    coupled.kernel()
    if not coupled.converged:
        raise RuntimeError(f'{d.id}: CCSD did not converge at R = {r_bohr:.4f} bohr')
    return float(coupled.e_tot + coupled.ccsd_t())


def hydrogen_atom_energy():
    """Exact in this basis: one electron, so UHF is full CI."""
    mol = gto.M(atom='H 0 0 0', basis=REFERENCE_BASIS, spin=1, verbose=0)
    return float(run_scf(scf.UHF(mol), None).e_tot)


def kohn_sham(d, r_bohr):
    mol = build_mol(d, r_bohr, ORBITAL_BASIS)
    mf = dft.UKS(mol) if mol.spin else dft.RKS(mol)
    mf.xc = XC
    return mol, run_scf(mf, pinned_occupations(d, mol))
```

```python
# tools/molecules/fit.py
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.optimize import minimize_scalar

# A chemical bond is at least tens of meV deep; below 1 mHa (27 meV) it is a
# van der Waals dimple at most, and the app says "no chemical bond".
BOUND_THRESHOLD_HARTREE = 1e-3


def fit_minimum(r, e):
    r, e = np.asarray(r, float), np.asarray(e, float)
    i = int(np.argmin(e))
    if i in (0, len(r) - 1):
        return {'ReBohr': None, 'EminHartree': float(e[i]), 'wellDepthHartree': 0.0, 'bound': False}
    spline = CubicSpline(r, e)
    best = minimize_scalar(spline, bounds=(r[i - 1], r[i + 1]), method='bounded', options={'xatol': 1e-8})
    depth = float(e[-1] - best.fun)
    return {'ReBohr': float(best.x), 'EminHartree': float(best.fun), 'wellDepthHartree': depth,
            'bound': bool(depth > BOUND_THRESHOLD_HARTREE)}
```

```python
# tools/molecules/outputs.py
"""Everything written under public/molecules, in the shapes src/molecules/types.ts reads."""
import json
from pathlib import Path

import numpy as np
from pyscf import gto, symm

from basis_export import evaluate_aos
from labels import label_orbitals, select_orbitals
from molecules import BOHR_TO_ANGSTROM, DIATOMICS, HUBER_HERZBERG

CACHE_DIR = Path(__file__).resolve().parent / '.cache'
GRID_SPACING = 0.25
GRID_PADDING = 6.5
# Seven orders below the faintest surface offered (0.002 e/a0^3); zeros gzip well.
ZERO_BELOW = 1e-12
DENSITY_METHOD = 'B3LYP/def2-TZVP'
FIXTURE_POINTS = [(0.0, 0.0, 0.0), (0.0, 0.0, 0.5), (0.3, -0.2, 1.1), (1.0, 0.5, -0.7), (-1.5, 0.8, 2.0),
                  (0.2, 0.2, -1.9), (2.5, -1.0, 0.3), (0.0, 1.2, 0.0), (-0.6, -0.6, 0.9), (3.0, 2.0, -2.5)]


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def cached(key, compute):
    path = CACHE_DIR / f'{key}.json'
    if path.exists():
        return json.loads(path.read_text())['value']
    value = compute()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'value': value}))
    return value


def energy_method_label(d, spin):
    if d.energy_method == 'fci':
        return 'FCI/aug-cc-pVTZ'
    return ('UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core)' if spin
            else 'CCSD(T)/aug-cc-pVTZ (frozen core)')


def atoms_of(mol):
    return [list(map(float, mol.atom_coord(i))) for i in range(mol.natm)]


def assign_roles(entries):
    occupied = [e for e in entries if e['occupation'] > 0]
    empty = [e for e in entries if e['occupation'] == 0]
    if any(e['spin'] != 'restricted' for e in entries):
        for e in occupied:
            if e['spin'] == 'alpha' and not any(
                    b['spin'] == 'beta' and b['label'] == e['label'] and b['occupation'] > 0 for b in entries):
                e['role'] = 'SOMO'
    elif occupied:
        max(occupied, key=lambda e: e['energyHartree'])['role'] = 'HOMO'
    if empty:
        min(empty, key=lambda e: e['energyHartree'])['role'] = 'LUMO'


def orbital_labels(mol, coeff, energy, homonuclear):
    """σ/π labels for a diatomic; Mulliken labels (1b1, 3a1, as in spec §4.2) for
    any other symmetric molecule Phase 6 feeds through basis_json; plain
    numbers without symmetry."""
    if mol.natm == 2 and mol.symmetry:
        return label_orbitals(mol, coeff, energy, homonuclear)
    if mol.symmetry:
        irreps = symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, coeff)
        counts, labels = {}, [''] * len(energy)
        for i in np.argsort(energy, kind='stable'):
            counts[irreps[i]] = counts.get(irreps[i], 0) + 1
            labels[i] = f'{counts[irreps[i]]}{irreps[i].lower()}'
        return labels
    return [f'MO {i + 1}' for i in range(len(energy))]


def orbital_entries(mol, mf, homonuclear):
    unrestricted = np.asarray(mf.mo_coeff).ndim == 3
    spins = (('alpha', 0), ('beta', 1)) if unrestricted else (('restricted', None),)
    entries = []
    for spin, s in spins:
        coeff = mf.mo_coeff[s] if unrestricted else mf.mo_coeff
        energy = mf.mo_energy[s] if unrestricted else mf.mo_energy
        occ = mf.mo_occ[s] if unrestricted else mf.mo_occ
        labels = orbital_labels(mol, coeff, energy, homonuclear)
        for i in select_orbitals(mol, coeff, occ):
            entries.append({'spin': spin, 'pyscfIndex': int(i), 'label': labels[i],
                            'energyHartree': float(energy[i]), 'occupation': float(occ[i]),
                            'coefficients': [float(c) for c in coeff[:, i]]})
    for position, entry in enumerate(entries):
        entry['index'] = position
    assign_roles(entries)
    return entries


def grid_spec(r_bohr):
    half_steps = int(np.ceil((r_bohr / 2 + GRID_PADDING) / GRID_SPACING))
    half = half_steps * GRID_SPACING
    return {'shape': [2 * half_steps + 1] * 3, 'origin': [-half] * 3, 'spacing': GRID_SPACING}


def density_on_grid(shells, atoms, orbitals, grid, chunk=40000):
    side = grid['shape'][0]
    axis = grid['origin'][0] + grid['spacing'] * np.arange(side)
    x, y, z = np.meshgrid(axis, axis, axis, indexing='ij')   # C order: z fastest, like GridFieldSource
    points = np.stack([x.ravel(), y.ravel(), z.ravel()], axis=1)
    occupied = [(o['occupation'], np.asarray(o['coefficients'])) for o in orbitals if o['occupation'] > 0]
    rho = np.empty(len(points))
    for start in range(0, len(points), chunk):
        ao = evaluate_aos(shells, atoms, points[start:start + chunk])
        rho[start:start + chunk] = sum(occ * (ao @ c) ** 2 for occ, c in occupied)
    rho[rho < ZERO_BELOW] = 0.0
    return rho.astype('<f4')


def fixture(mol, orbitals, molecule_id):
    """PySCF's own MO values (its AOs, its coefficients) for the TS evaluator to match."""
    points = np.asarray(FIXTURE_POINTS)
    ao = mol.eval_gto('GTOval_sph', points)
    values = [ao @ np.asarray(o['coefficients']) for o in orbitals]
    density = sum(o['occupation'] * v ** 2 for o, v in zip(orbitals, values))
    return {'moleculeId': molecule_id, 'points': points.tolist(),
            'orbitals': [{'index': o['index'], 'values': v.tolist()} for o, v in zip(orbitals, values)],
            'density': density.tolist()}


def row(quantity, system, app, reference, unit, tolerance, source, method):
    return {'quantity': quantity, 'system': system, 'app': app, 'reference': reference, 'unit': unit,
            'tolerancePercent': tolerance, 'referenceSource': source, 'method': method}


def validation_rows(out_root):
    rows = []
    for d in DIATOMICS:
        path = out_root / d.id / 'scan.json'
        if d.reference_re_angstrom is None or not path.exists():
            continue
        scan = json.loads(path.read_text(encoding='utf-8'))
        method = scan['energyMethod']
        if d.id == 'h2':
            rows.append(row('R_e', 'H₂', scan['fit']['ReBohr'], 1.401, 'a0', 1, HUBER_HERZBERG, method))
            rows.append(row('D_e', 'H₂', scan['fit']['DeEv'], 4.75, 'eV', 2,
                            'Kołos & Wolniewicz, J. Chem. Phys. 49, 404 (1968)', method))
        else:
            rows.append(row('R_e', d.formula, scan['fit']['ReBohr'] * BOHR_TO_ANGSTROM,
                            d.reference_re_angstrom, 'Å', 1, d.reference_source, method))
    return rows


def molecule_for_basis(basis_atoms, symbols, spin):
    return gto.M(atom=[(s, p) for s, p in zip(symbols, basis_atoms)], unit='Bohr',
                 basis='def2-tzvp', spin=spin, verbose=0)
```

```python
# tools/molecules/generate.py
"""Bond-length scans for Bonds mode (spec §4.2, §5 Phase 5).

Run once per molecule, in the foreground:
    tools/molecules/.venv/bin/python tools/molecules/generate.py --only n2
Reference energies are cached in tools/molecules/.cache, so a run cut short
resumes where it stopped. Every run rewrites index.json, the validation
summary and (for n2, o2, hf) the TS fixtures from what is on disk.
"""
import argparse
import gzip
import json
import subprocess

import pyscf
from pyscf import gto

from basis_export import CONVENTION, check_against_pyscf, export_shells
from fit import fit_minimum
from labels import bond_order
from molecules import (ANGSTROM_TO_BOHR, DIATOMICS, EQUILIBRIUM_INDEX, HARTREE_TO_EV, REPO_ROOT,
                       SCAN_FACTORS)
from outputs import (DENSITY_METHOD, atoms_of, cached, density_on_grid, energy_method_label, fixture,
                     grid_spec, orbital_entries, validation_rows, write_json)
# basis_json below is also Phase 6's entry point: `generate.basis_json(mol, mf)`.
from quantum import XC, hydrogen_atom_energy, kohn_sham, reference_energy

OUT = REPO_ROOT / 'public' / 'molecules'
FIXTURE_IDS = ('n2', 'o2', 'hf')


def git_commit():
    sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=REPO_ROOT, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(['git', 'status', '--porcelain', 'tools/molecules'], cwd=REPO_ROOT,
                           capture_output=True, text=True).stdout.strip()
    return sha + ('-dirty' if dirty else '')


def basis_json(mol, mf):
    """The basis.json payload for any SCF result: shells, and the orbitals worth
    shipping with their coefficients. Phase 6 calls this for its library. No
    `id`: the caller (or loadBasis, from the path) supplies it."""
    shells = export_shells(mol)
    check_against_pyscf(mol, shells)
    homonuclear = mol.natm == 2 and mol.atom_charge(0) == mol.atom_charge(1)
    return {'spherical': True, 'convention': CONVENTION, 'atoms': atoms_of(mol), 'nao': int(mol.nao),
            'shells': shells, 'orbitals': orbital_entries(mol, mf, homonuclear)}


def run_molecule(d, commit):
    homonuclear = d.elements[0] == d.elements[1]
    r_ref = d.r_ref_angstrom * ANGSTROM_TO_BOHR
    method = {'density': DENSITY_METHOD, 'energies': energy_method_label(d, d.spin)}
    generator = {'pyscf': pyscf.__version__, 'xc': f'{XC} (PySCF >= 2.3: VWN-RPA)',
                 'script': 'tools/molecules/generate.py', 'commit': commit}
    references = ([{'quantity': 'R_e', 'value': d.reference_re_angstrom, 'unit': 'Å', 'source': d.reference_source}]
                  if d.reference_re_angstrom else [])
    points = []
    for i, factor in enumerate(SCAN_FACTORS):
        r = r_ref * factor
        e_ref = cached(f'{d.id}-{i:02d}-{d.energy_method}', lambda r=r: reference_energy(d, r))
        mol, mf = kohn_sham(d, r)
        payload = basis_json(mol, mf)
        shells, orbitals, atoms = payload['shells'], payload['orbitals'], payload['atoms']
        order = bond_order([o['label'] for o in orbitals], [o['occupation'] for o in orbitals], homonuclear)
        point_id = f'{d.id}@{i:02d}'

        def meta_for(molecule_id, source, grid=None):
            meta = {'id': molecule_id, 'name': d.name, 'formula': d.formula,
                    'atoms': [{'Z': int(mol.atom_charge(k)), 'position': atoms[k]} for k in range(2)],
                    'geometrySource': source, 'method': method, 'totalEnergyHartree': e_ref,
                    'dftEnergyHartree': float(mf.e_tot), 'spin': d.spin, 'bondOrder': order,
                    'orbitals': [{k: o[k] for k in ('index', 'label', 'energyHartree', 'occupation', 'spin', 'role') if k in o}
                                 for o in orbitals],
                    'references': references, 'generator': generator}
            if grid:
                meta['grid'] = grid
                meta['scan'] = 'scan.json'
            return meta

        def basis_for(molecule_id):
            return {'id': molecule_id, **payload}

        folder = OUT / d.id / 'scan' / f'{i:02d}'
        write_json(folder / 'meta.json', meta_for(point_id, f'scan point {i} of {len(SCAN_FACTORS)}, R = {r:.4f} bohr'))
        write_json(folder / 'basis.json', basis_for(point_id))
        if i == EQUILIBRIUM_INDEX:
            grid = grid_spec(r)
            source = ('experiment (R_e, Huber & Herzberg)' if d.reference_re_angstrom or d.id in ('li2', 'b2', 'c2')
                      else 'no equilibrium: scan centre')
            write_json(OUT / d.id / 'meta.json', meta_for(d.id, source, grid))
            write_json(OUT / d.id / 'basis.json', basis_for(d.id))
            density = density_on_grid(shells, atoms, orbitals, grid)
            (OUT / d.id / 'density.bin.gz').write_bytes(gzip.compress(density.tobytes(), compresslevel=9, mtime=0))
            if d.id in FIXTURE_IDS:
                write_json(REPO_ROOT / 'tests' / 'fixtures' / 'molecules' / f'{d.id}.json', fixture(mol, orbitals, d.id))
        points.append({'index': i, 'id': point_id, 'RBohr': r, 'energyHartree': e_ref, 'dftEnergyHartree': float(mf.e_tot)})

    fit = fit_minimum([p['RBohr'] for p in points], [p['energyHartree'] for p in points])
    fit['DeEv'] = None
    if d.id == 'h2':
        fit['DeEv'] = (2 * cached('h-atom', hydrogen_atom_energy) - fit['EminHartree']) * HARTREE_TO_EV
    spin_check = None
    if d.id == 'o2':
        r = r_ref
        triplet = cached('o2-spin-triplet', lambda: reference_energy(d, r, symmetry=False))
        singlet = cached('o2-spin-singlet', lambda: reference_energy(d, r, spin=0, symmetry=False))
        spin_check = {'RBohr': r, 'tripletHartree': triplet, 'singletHartree': singlet,
                      'method': 'UCCSD(T) triplet vs closed-shell CCSD(T) singlet, aug-cc-pVTZ, frozen core'}
    write_json(OUT / d.id / 'scan.json', {
        'id': d.id, 'name': d.name, 'formula': d.formula, 'spin': d.spin,
        'energyMethod': method['energies'], 'densityMethod': DENSITY_METHOD, 'points': points,
        'equilibriumIndex': EQUILIBRIUM_INDEX, 'fit': fit, 'spinCheck': spin_check, 'note': d.note,
        'reference': {'ReAngstrom': d.reference_re_angstrom, 'source': d.reference_source}})


def write_index():
    path = OUT / 'index.json'
    others = [e for e in (json.loads(path.read_text(encoding='utf-8')) if path.exists() else [])
              if e.get('category') != 'diatomic']
    diatomics = [{'id': d.id, 'name': d.name, 'formula': d.formula, 'category': 'diatomic',
                  'tags': ['bonds', 'homonuclear' if d.elements[0] == d.elements[1] else 'heteronuclear']}
                 for d in DIATOMICS if (OUT / d.id / 'scan.json').exists()]
    write_json(path, others + diatomics)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='*', default=None, help='molecule ids (default: all)')
    args = parser.parse_args(argv)
    known = {d.id: d for d in DIATOMICS}
    unknown = set(args.only or []) - set(known)
    if unknown:
        parser.error(f'unknown molecule ids: {sorted(unknown)}')
    commit = git_commit()
    for d in DIATOMICS:
        if args.only is None or d.id in args.only:
            print(f'{d.id}: scanning {len(SCAN_FACTORS)} geometries', flush=True)
            run_molecule(d, commit)
    write_index()
    write_json(REPO_ROOT / 'src' / 'validation' / 'generated' / 'phase5_diatomics.json', validation_rows(OUT))


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run to verify they pass**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/test_fit.py tools/molecules/test_outputs.py -q`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/molecules
git commit -m "feat(molecules): CCSD(T)/FCI scans, B3LYP orbitals, fit and §4.2 writers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Generate the data, validate it, and ship it

**Files:**
- Generated: `public/molecules/**`, `tests/fixtures/molecules/{n2,o2,hf}.json`, `src/validation/generated/phase5_diatomics.json`
- Modify: `vite.config.ts`
- Test: `tools/molecules/test_generated_data.py`

**Interfaces:**
- Consumes: Task 4 CLI and file shapes.
- Produces: the committed data every later TS task reads; `dist/molecules/` in builds.

- [ ] **Step 1: Write the failing data tests**

```python
# tools/molecules/test_generated_data.py
"""Checks on the committed output, read from public/molecules (spec §5 Phase 5 validation)."""
import json

import numpy as np
import pytest
from pyscf import dft

from basis_export import evaluate_aos
from molecules import BOHR_TO_ANGSTROM, DIATOMICS, REPO_ROOT, SCAN_FACTORS
from outputs import molecule_for_basis

OUT = REPO_ROOT / 'public' / 'molecules'
IDS = [d.id for d in DIATOMICS]


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def test_index_lists_every_diatomic():
    entries = [e for e in load(OUT / 'index.json') if e['category'] == 'diatomic']
    assert [e['id'] for e in entries] == IDS


@pytest.mark.parametrize('mol_id', IDS)
def test_every_scan_point_has_meta_and_basis(mol_id):
    scan = load(OUT / mol_id / 'scan.json')
    assert len(scan['points']) == len(SCAN_FACTORS) == 20
    for point in scan['points']:
        folder = OUT / mol_id / 'scan' / f"{point['index']:02d}"
        assert load(folder / 'meta.json')['id'] == point['id'] == f"{mol_id}@{point['index']:02d}"
        basis = load(folder / 'basis.json')
        assert all(len(o['coefficients']) == basis['nao'] for o in basis['orbitals'])


@pytest.mark.parametrize('mol_id', IDS)
def test_size_budget(mol_id):
    total = sum(p.stat().st_size for p in (OUT / mol_id).rglob('*') if p.is_file())
    assert total <= 3 * 1024 * 1024, f'{mol_id}: {total / 1e6:.2f} MB'


@pytest.mark.parametrize('d', DIATOMICS, ids=IDS)
def test_density_integrates_to_the_electron_count(d):
    basis = load(OUT / d.id / 'basis.json')
    mol = molecule_for_basis([a for a in basis['atoms']], d.elements, d.spin)
    grids = dft.gen_grid.Grids(mol)
    grids.level = 5
    grids.build()
    ao = evaluate_aos(basis['shells'], basis['atoms'], grids.coords)
    rho = sum(o['occupation'] * (ao @ np.asarray(o['coefficients'])) ** 2 for o in basis['orbitals'])
    assert abs(float(rho @ grids.weights) - mol.nelectron) < 1e-3 * mol.nelectron


@pytest.mark.parametrize('mol_id,reference', [('n2', 1.098), ('o2', 1.207), ('f2', 1.412), ('co', 1.128), ('hf', 0.917)])
def test_equilibrium_bond_lengths(mol_id, reference):
    fit = load(OUT / mol_id / 'scan.json')['fit']
    assert fit['bound'] is True
    assert abs(fit['ReBohr'] * BOHR_TO_ANGSTROM - reference) / reference < 0.01


def test_hydrogen_bond_length_and_dissociation_energy():
    fit = load(OUT / 'h2' / 'scan.json')['fit']
    assert abs(fit['ReBohr'] - 1.401) / 1.401 < 0.01
    assert abs(fit['DeEv'] - 4.75) / 4.75 < 0.02


def test_oxygen_ground_state_is_the_triplet():
    check = load(OUT / 'o2' / 'scan.json')['spinCheck']
    assert check['tripletHartree'] < check['singletHartree']


def test_helium_dimer_is_not_bound():
    scan = load(OUT / 'he2' / 'scan.json')
    energies = [p['energyHartree'] for p in scan['points']]
    assert scan['fit']['bound'] is False
    assert scan['fit']['wellDepthHartree'] < 1e-4
    assert energies[0] - energies[-1] > 5e-3   # the repulsive wall at 2.4 a0


@pytest.mark.parametrize('mol_id,order', [('h2', 1), ('he2', 0), ('li2', 1), ('b2', 1), ('c2', 2),
                                          ('n2', 3), ('o2', 2), ('f2', 1), ('co', None), ('hf', None)])
def test_bond_orders(mol_id, order):
    assert load(OUT / mol_id / 'meta.json')['bondOrder'] == order


@pytest.mark.parametrize('mol_id,label', [('o2', '1πg*'), ('b2', '1πu')])
def test_open_shells_put_two_unpaired_electrons_in_the_pi_pair(mol_id, label):
    orbitals = load(OUT / mol_id / 'meta.json')['orbitals']
    alpha = [o for o in orbitals if o['spin'] == 'alpha' and o['label'] == label]
    beta = [o for o in orbitals if o['spin'] == 'beta' and o['label'] == label]
    assert [o['occupation'] for o in alpha] == [1.0, 1.0]
    assert [o['occupation'] for o in beta] == [0.0, 0.0]
    assert all(o['role'] == 'SOMO' for o in alpha)


def test_validation_summary_matches_the_scans():
    rows = load(REPO_ROOT / 'src' / 'validation' / 'generated' / 'phase5_diatomics.json')
    assert {(r['system'], r['quantity']) for r in rows} == {
        ('H₂', 'R_e'), ('H₂', 'D_e'), ('N₂', 'R_e'), ('O₂', 'R_e'), ('F₂', 'R_e'), ('CO', 'R_e'), ('HF', 'R_e')}
```

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules/test_generated_data.py -q`
Expected: FAIL, `FileNotFoundError` for `public/molecules/index.json`.

- [ ] **Step 2: Generate, one molecule per command**

Run each of these as its own foreground command with the tool timeout at its 600000 ms maximum. If one is cut off, run it again: finished reference energies are read back from `tools/molecules/.cache/`.

```bash
tools/molecules/.venv/bin/python tools/molecules/generate.py --only h2
tools/molecules/.venv/bin/python tools/molecules/generate.py --only he2
tools/molecules/.venv/bin/python tools/molecules/generate.py --only li2
tools/molecules/.venv/bin/python tools/molecules/generate.py --only b2
tools/molecules/.venv/bin/python tools/molecules/generate.py --only c2
tools/molecules/.venv/bin/python tools/molecules/generate.py --only n2
tools/molecules/.venv/bin/python tools/molecules/generate.py --only o2
tools/molecules/.venv/bin/python tools/molecules/generate.py --only f2
tools/molecules/.venv/bin/python tools/molecules/generate.py --only co
tools/molecules/.venv/bin/python tools/molecules/generate.py --only hf
```

Expected: each prints `<id>: scanning 20 geometries` and exits 0. Then `du -sh public/molecules/*` shows every directory under 3 MB.

- [ ] **Step 3: Run the data tests**

Run: `tools/molecules/.venv/bin/python -m pytest tools/molecules -q`
Expected: all PASS. A failing R_e or D_e is a physics finding, not a test to loosen: report the measured value.

- [ ] **Step 4: Ship `public/molecules` in builds**

In `vite.config.ts`, add `import { cpSync, existsSync } from 'fs';`, change the `vite` import to `import { defineConfig, Plugin } from 'vite';`, add above `export default`:

```ts
/**
 * `root: 'public'` makes Vite's publicDir `public/public`, so nothing under
 * public/molecules would reach dist/ on its own. The dev server already
 * serves it (it is inside the root); this copies it for builds, keeping the
 * spec §4.2 paths (/molecules/<id>/...) identical in both.
 */
function copyMoleculeData(): Plugin {
  return {
    name: 'copy-molecule-data',
    apply: 'build',
    closeBundle() {
      const from = resolve(__dirname, 'public/molecules');
      if (existsSync(from)) cpSync(from, resolve(__dirname, 'dist/molecules'), { recursive: true });
    },
  };
}
```

and change `plugins: [react()],` to `plugins: [react(), copyMoleculeData()],`.

Run: `npm run build && ls dist/molecules/n2 && test -f dist/molecules/n2/scan/19/basis.json && echo shipped`
Expected: lists `basis.json density.bin.gz meta.json scan scan.json`, then `shipped`.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts public/molecules tests/fixtures/molecules src/validation/generated tools/molecules/test_generated_data.py
git commit -m "feat(molecules): generated diatomic scans (CCSD(T)/FCI energies, B3LYP orbitals), shipped in builds

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Molecule types and the loader

**Files:**
- Create: `src/molecules/types.ts`, `src/molecules/loader.ts`
- Test: `tests/molecules/loader.test.ts`

**Interfaces:**
- Consumes: Phase 1 `GridFieldSource`; Task 5 files.
- Produces: types `MoleculeIndexEntry`, `MoleculeAtom`, `OrbitalSpin = 'restricted' | 'alpha' | 'beta'`, `MoleculeOrbitalInfo { index; label; energyHartree; occupation; spin?; role? }`, `GridSpec`, `MoleculeMeta`, `BasisShell`, `BasisOrbital extends MoleculeOrbitalInfo { spin: OrbitalSpin; coefficients: number[] }`, `MoleculeBasis`, `ScanPoint`, `MoleculeScan`; `MOLECULES_BASE_URL = '/molecules'`; `class MoleculeLoadError`; `moleculePath(id): string`; `loadMoleculeIndex(): Promise<MoleculeIndexEntry[]>`; `loadMoleculeMeta(id): Promise<MoleculeMeta>`; `loadBasis(id): Promise<MoleculeBasis>`; `loadScan(id): Promise<MoleculeScan>`; `decodeFloat32(bytes: ArrayBuffer, expectedLength: number, url: string): Promise<Float32Array>`; `loadDensityGrid(meta): Promise<GridFieldSource>`; `clearMoleculeCacheForTests()`.

- [ ] **Step 1: Write the failing test**

```ts
/** @jest-environment node */
// tests/molecules/loader.test.ts -- node, not jsdom: it needs Node's fetch, Blob and DecompressionStream.
import { gzipSync } from 'zlib';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
    moleculePath, loadMoleculeMeta, loadMoleculeIndex, loadBasis, loadDensityGrid, decodeFloat32,
    clearMoleculeCacheForTests, MoleculeLoadError,
} from '../../src/molecules/loader';
import { MoleculeMeta } from '../../src/molecules/types';

const ROOT = join(__dirname, '../..');
const asArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const floats = new Float32Array([1, 2.5, -3]);

let fetchMock: jest.SpyInstance;
beforeEach(() => {
    clearMoleculeCacheForTests();
    fetchMock = jest.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

describe('moleculePath', () => {
    it('maps a molecule and a scan point to their folders', () => {
        expect(moleculePath('n2')).toBe('/molecules/n2');
        expect(moleculePath('n2@07')).toBe('/molecules/n2/scan/07');
    });
    it.each(['', 'N2', '../x', 'n2@7', 'n2@07@1'])('refuses %p', id => {
        expect(() => moleculePath(id)).toThrow(MoleculeLoadError);
    });
});

describe('fetching', () => {
    it('names a basis after the path it came from', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ nao: 1 })));
        await expect(loadBasis('o2@03')).resolves.toEqual({ nao: 1, id: 'o2@03' });
        expect(fetchMock).toHaveBeenCalledWith('/molecules/o2/scan/03/basis.json');
    });

    it('loads meta once and reuses it', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'n2' })));
        await loadMoleculeMeta('n2@07');
        await loadMoleculeMeta('n2@07');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/molecules/n2/scan/07/meta.json');
    });

    it('names the file and status on failure, and retries next time', async () => {
        fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
        await expect(loadMoleculeIndex()).rejects.toThrow('Could not load /molecules/index.json (HTTP 404)');
        fetchMock.mockResolvedValueOnce(new Response('[]'));
        await expect(loadMoleculeIndex()).resolves.toEqual([]);
    });

    it('says when it cannot reach the server', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(loadMoleculeMeta('o2')).rejects.toThrow(/Could not reach \/molecules\/o2\/meta.json/);
    });
});

describe('decodeFloat32', () => {
    it('inflates gzip', async () => {
        const bytes = asArrayBuffer(gzipSync(Buffer.from(floats.buffer)));
        expect(Array.from(await decodeFloat32(bytes, 3, 'x'))).toEqual([1, 2.5, -3]);
    });

    // Review Focus 5: a server that set Content-Encoding: gzip hands over inflated bytes.
    it('accepts bytes a server already inflated', async () => {
        expect(Array.from(await decodeFloat32(floats.slice().buffer, 3, 'x'))).toEqual([1, 2.5, -3]);
    });

    it('refuses the wrong length', async () => {
        await expect(decodeFloat32(floats.slice().buffer, 4, 'd.bin.gz')).rejects.toThrow('d.bin.gz: expected 4 values, got 3');
    });

    it('says so when the browser cannot decompress', async () => {
        const saved = globalThis.DecompressionStream;
        // @ts-expect-error -- simulating an older browser
        delete globalThis.DecompressionStream;
        try {
            const bytes = asArrayBuffer(gzipSync(Buffer.from(floats.buffer)));
            await expect(decodeFloat32(bytes, 3, 'x')).rejects.toThrow(/DecompressionStream/);
        } finally {
            globalThis.DecompressionStream = saved;
        }
    });
});

describe('loadDensityGrid', () => {
    it('decodes the committed N2 grid into a GridFieldSource', async () => {
        const meta = JSON.parse(readFileSync(join(ROOT, 'public/molecules/n2/meta.json'), 'utf8')) as MoleculeMeta;
        const gz = readFileSync(join(ROOT, 'public/molecules/n2/density.bin.gz'));
        fetchMock.mockResolvedValue(new Response(new Uint8Array(gz)));
        const source = await loadDensityGrid(meta);
        expect(fetchMock).toHaveBeenCalledWith('/molecules/n2/density.bin.gz');
        expect(source).toMatchObject({ kind: 'grid', id: 'density:n2', quantity: 'density', shape: meta.grid!.shape, origin: meta.grid!.origin, spacing: meta.grid!.spacing });
        expect(source.values.length).toBe(meta.grid!.shape[0] ** 3);
        expect(Math.max(...source.values.slice(0, 1000))).toBeLessThan(1e-3);
    });

    it('refuses a molecule without a grid', async () => {
        await expect(loadDensityGrid({ id: 'n2@03' } as MoleculeMeta)).rejects.toThrow('n2@03 ships no density grid');
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/molecules/loader.test.ts`
Expected: FAIL, "Cannot find module '../../src/molecules/loader'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/types.ts
/** The JSON shapes of spec §4.2, as tools/molecules/generate.py writes them. Positions in bohr. */
export type OrbitalSpin = 'restricted' | 'alpha' | 'beta';

export interface MoleculeIndexEntry { id: string; name: string; formula: string; category: string; tags: string[] }
export interface MoleculeAtom { Z: number; position: [number, number, number] }
export interface GridSpec { shape: [number, number, number]; origin: [number, number, number]; spacing: number }

export interface MoleculeOrbitalInfo {
    /** Position in basis.json's `orbitals`; what a 'gaussianMO' recipe's `index` means. */
    index: number;
    /** 'nσg', 'nπu', antibonding starred for homonuclear molecules. */
    label: string;
    energyHartree: number;
    occupation: number;
    spin?: OrbitalSpin;
    role?: 'HOMO' | 'LUMO' | 'SOMO';
}

export interface MoleculeMeta {
    id: string;
    name: string;
    formula: string;
    atoms: MoleculeAtom[];
    geometrySource: string;
    method: { density: string; energies: string };
    totalEnergyHartree: number;
    dftEnergyHartree?: number;
    dipoleDebye?: number;
    spin?: number;
    /** (bonding − antibonding)/2 for homonuclear diatomics; null where g/u counting does not apply. */
    bondOrder?: number | null;
    orbitals: MoleculeOrbitalInfo[];
    /** Present only where density.bin.gz ships. */
    grid?: GridSpec;
    /** Phase 6 adds ESP; diatomics ship none. */
    espGrid?: GridSpec;
    references: Array<{ quantity: string; value: number; unit: string; source: string }>;
    generator: { pyscf: string; script: string; commit: string; xc?: string };
    scan?: string;
}

export interface BasisShell { atom: number; l: 0 | 1 | 2 | 3; exponents: number[]; coefficients: number[] }
export interface BasisOrbital extends MoleculeOrbitalInfo { spin: OrbitalSpin; coefficients: number[] }

export interface MoleculeBasis {
    id: string;
    spherical: true;
    convention: string;
    atoms: Array<[number, number, number]>;
    nao: number;
    shells: BasisShell[];
    orbitals: BasisOrbital[];
}

export interface ScanPoint { index: number; id: string; RBohr: number; energyHartree: number; dftEnergyHartree: number }

export interface MoleculeScan {
    id: string;
    name: string;
    formula: string;
    spin: number;
    energyMethod: string;
    densityMethod: string;
    points: ScanPoint[];
    equilibriumIndex: number;
    fit: { ReBohr: number | null; EminHartree: number; wellDepthHartree: number; bound: boolean; DeEv: number | null };
    spinCheck: { RBohr: number; tripletHartree: number; singletHartree: number; method: string } | null;
    note: string | null;
    reference: { ReAngstrom: number | null; source: string };
}
```

```ts
// src/molecules/loader.ts
import type { GridFieldSource } from '../field_source';
import { MoleculeBasis, MoleculeIndexEntry, MoleculeMeta, MoleculeScan } from './types';

/**
 * Lazy, cached access to public/molecules (spec §4.2). Nothing is fetched
 * until a molecule is chosen; each file is fetched once per session, and a
 * failed fetch is forgotten so the next attempt really retries.
 */
export const MOLECULES_BASE_URL = '/molecules';

export class MoleculeLoadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MoleculeLoadError';
    }
}

const MOLECULE_ID = /^[a-z0-9]+$/;
const SCAN_POINT = /^\d{2}$/;

/** 'n2' → /molecules/n2; 'n2@07' (scan point 7) → /molecules/n2/scan/07. */
export function moleculePath(id: string): string {
    const [base, point, extra] = id.split('@');
    if (!MOLECULE_ID.test(base) || extra !== undefined || (point !== undefined && !SCAN_POINT.test(point))) {
        throw new MoleculeLoadError(`Not a molecule id: ${JSON.stringify(id)}`);
    }
    return point === undefined ? `${MOLECULES_BASE_URL}/${base}` : `${MOLECULES_BASE_URL}/${base}/scan/${point}`;
}

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = cache.get(key) as Promise<T> | undefined;
    if (!pending) {
        pending = load();
        cache.set(key, pending);
        pending.catch(() => cache.delete(key));
    }
    return pending;
}

export function clearMoleculeCacheForTests(): void {
    cache.clear();
}

async function fetchOk(url: string): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url);
    } catch (error) {
        throw new MoleculeLoadError(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw new MoleculeLoadError(`Could not load ${url} (HTTP ${response.status})`);
    return response;
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetchOk(url);
    try {
        return (await response.json()) as T;
    } catch {
        throw new MoleculeLoadError(`${url} is not valid JSON`);
    }
}

export function loadMoleculeIndex(): Promise<MoleculeIndexEntry[]> {
    return cached('index', () => fetchJson<MoleculeIndexEntry[]>(`${MOLECULES_BASE_URL}/index.json`));
}

export function loadMoleculeMeta(id: string): Promise<MoleculeMeta> {
    return cached(`meta:${id}`, () => fetchJson<MoleculeMeta>(`${moleculePath(id)}/meta.json`));
}

/** The id comes from the path asked for, so a basis.json written without one (Phase 6's) still registers correctly. */
export function loadBasis(id: string): Promise<MoleculeBasis> {
    return cached(`basis:${id}`, async () => ({ ...(await fetchJson<MoleculeBasis>(`${moleculePath(id)}/basis.json`)), id }));
}

export function loadScan(id: string): Promise<MoleculeScan> {
    return cached(`scan:${id}`, () => fetchJson<MoleculeScan>(`${moleculePath(id)}/scan.json`));
}

/**
 * Little-endian float32s, gzipped. Bytes that do not start with the gzip
 * magic number are taken as already inflated: a server that labels the file
 * Content-Encoding: gzip makes the browser inflate it before we see it.
 */
export async function decodeFloat32(bytes: ArrayBuffer, expectedLength: number, url: string): Promise<Float32Array> {
    let raw = bytes;
    const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
    if (head[0] === 0x1f && head[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined') {
            throw new MoleculeLoadError('This browser cannot decompress molecule data (it has no DecompressionStream); a current Chrome, Firefox or Safari can.');
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        raw = await new Response(stream).arrayBuffer();
    }
    if (raw.byteLength !== expectedLength * 4) {
        throw new MoleculeLoadError(`${url}: expected ${expectedLength} values, got ${raw.byteLength / 4}`);
    }
    return new Float32Array(raw);
}

export function loadDensityGrid(meta: MoleculeMeta): Promise<GridFieldSource> {
    const grid = meta.grid;
    if (!grid) return Promise.reject(new MoleculeLoadError(`${meta.id} ships no density grid`));
    const url = `${moleculePath(meta.id)}/density.bin.gz`;
    return cached(`density:${meta.id}`, async () => {
        const bytes = await (await fetchOk(url)).arrayBuffer();
        const values = await decodeFloat32(bytes, grid.shape[0] * grid.shape[1] * grid.shape[2], url);
        return {
            kind: 'grid', id: `density:${meta.id}`, quantity: 'density',
            shape: [...grid.shape], origin: [...grid.origin], spacing: grid.spacing, values,
        } satisfies GridFieldSource;
    });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/molecules/loader.test.ts && npx tsc --noEmit -p .`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules/types.ts src/molecules/loader.ts tests/molecules/loader.test.ts
git commit -m "feat(molecules): lazy cached loader for §4.2 files, gzip grids as GridFieldSource

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Gaussian basis evaluator, MO and density recipes, worker support

**Files:**
- Create: `src/molecules/gaussian_basis.ts`, `src/molecules/basis_registry.ts`
- Modify: `src/field_source.ts`, `src/orbital_mesh.ts` (append `generateIsoValueMesh`), `src/workers/orbitalWorker.ts`
- Test: `tests/molecules/gaussian_basis.test.ts`

**Interfaces:**
- Consumes: Task 6 types; Phase 1 `sampleFieldSource`, `meshFromSamples`, `generateFieldMeshes`, `FieldRenderRequest`.
- Produces: `solidHarmonics(l, x, y, z, out: Float64Array, offset)`; `makeAOEvaluator(basis): { nao; evaluate(x, y, z, out) }`; `moEvaluator(basis, index): FieldEvaluator`; `densityEvaluator(basis): FieldEvaluator` (ρ); `densityOnGrid(basis, grid: GridSpec): Float32Array`; `registerMoleculeBasis(basis)`, `registeredBasis(id): MoleculeBasis`; recipes `GaussianMORecipe { type: 'gaussianMO'; moleculeId: string; index: number }`, `GaussianDensityRecipe { type: 'gaussianDensity'; moleculeId: string }` (evaluates √ρ); `FieldRenderRequest.bases?: MoleculeBasis[]`, `FieldRenderRequest.densityIsoValue?: number`; `generateIsoValueMesh(source, resolution, isoValue): MeshData`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/molecules/gaussian_basis.test.ts
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { makeAOEvaluator, moEvaluator, densityEvaluator, densityOnGrid } from '../../src/molecules/gaussian_basis';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { makeFieldEvaluator } from '../../src/field_source';
import { generateIsoValueMesh } from '../../src/orbital_mesh';
import { MoleculeBasis, MoleculeMeta } from '../../src/molecules/types';

const ROOT = join(__dirname, '../..');
const json = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;
interface Fixture { points: number[][]; orbitals: Array<{ index: number; values: number[] }>; density: number[] }

describe.each(['n2', 'o2', 'hf'])('%s against PySCF', id => {
    const basis = json<MoleculeBasis>(`public/molecules/${id}/basis.json`);
    const fixture = json<Fixture>(`tests/fixtures/molecules/${id}.json`);
    const close = (ours: number, theirs: number) => expect(Math.abs(ours - theirs)).toBeLessThan(1e-9 + 1e-8 * Math.abs(theirs));

    it('evaluates every shipped orbital as PySCF does', () => {
        for (const { index, values } of fixture.orbitals) {
            const psi = moEvaluator(basis, index);
            fixture.points.forEach(([x, y, z], p) => close(psi(x, y, z), values[p]));
        }
    });

    it('evaluates the density as PySCF does', () => {
        const rho = densityEvaluator(basis);
        fixture.points.forEach(([x, y, z], p) => close(rho(x, y, z), fixture.density[p]));
    });
});

describe('densityOnGrid', () => {
    it('reproduces the shipped N2 density grid, index for index', () => {
        const meta = json<MoleculeMeta>('public/molecules/n2/meta.json');
        const shipped = new Float32Array(new Uint8Array(gunzipSync(readFileSync(join(ROOT, 'public/molecules/n2/density.bin.gz')))).buffer);
        const side = meta.grid!.shape[0];
        const small = { shape: [side, side, side] as [number, number, number], origin: meta.grid!.origin, spacing: meta.grid!.spacing };
        const basis = json<MoleculeBasis>('public/molecules/n2/basis.json');
        const rho = densityEvaluator(basis);
        for (let n = 0; n < shipped.length; n += 997) {
            const i = Math.floor(n / (side * side)), j = Math.floor(n / side) % side, k = n % side;
            const [ox, oy, oz] = small.origin;
            const expected = rho(ox + i * small.spacing, oy + j * small.spacing, oz + k * small.spacing);
            expect(Math.abs(shipped[n] - expected)).toBeLessThan(2e-7 * expected + 1e-11);
        }
        const tiny = densityOnGrid(basis, { shape: [3, 3, 3], origin: [-1, -1, -1], spacing: 1 });
        expect(tiny[(1 * 3 + 1) * 3 + 2]).toBeCloseTo(rho(0, 0, 1), 5);
    });
});

describe('recipes and meshing', () => {
    // One normalised s Gaussian, occupation 2: ρ = 2 (2α/π)^(3/2) e^(−2αr²).
    const alpha = 0.8;
    const c = (2 * alpha / Math.PI) ** 0.75 / 0.28209479177387814;
    const toy: MoleculeBasis = {
        id: 'toy@00', spherical: true, convention: 'test', atoms: [[0, 0, 0]], nao: 1,
        shells: [{ atom: 0, l: 0, exponents: [alpha], coefficients: [c] }],
        orbitals: [{ index: 0, label: '1σg', energyHartree: -0.5, occupation: 2, spin: 'restricted', coefficients: [1] }],
    };

    it('refuses a basis whose shells do not add up to nao', () => {
        expect(() => makeAOEvaluator({ ...toy, nao: 2 })).toThrow('toy@00: shells describe 1 AOs, file says 2');
    });

    it('builds MO and √ρ evaluators from a registered basis, and says when one is missing', () => {
        registerMoleculeBasis(toy);
        const psi = makeFieldEvaluator({ type: 'gaussianMO', moleculeId: 'toy@00', index: 0 });
        const root = makeFieldEvaluator({ type: 'gaussianDensity', moleculeId: 'toy@00' });
        expect(root(0.3, 0, 0) ** 2).toBeCloseTo(2 * psi(0.3, 0, 0) ** 2, 12);
        expect(() => makeFieldEvaluator({ type: 'gaussianMO', moleculeId: 'nope@01', index: 0 })).toThrow(/No basis registered for nope@01/);
        expect(() => makeFieldEvaluator({ type: 'gaussianMO', moleculeId: 'toy@00', index: 3 })).toThrow(/has no orbital 3/);
    });

    it('draws a density at the value asked for, not at an enclosed fraction', () => {
        registerMoleculeBasis(toy);
        const iso = 0.05;
        const peak = 2 * (2 * alpha / Math.PI) ** 1.5;
        const radius = Math.sqrt(Math.log(peak / iso) / (2 * alpha));
        const mesh = generateIsoValueMesh({ kind: 'analytic', id: 't', rMax: 4, recipe: { type: 'gaussianDensity', moleculeId: 'toy@00' } }, 64, iso);
        const mean = mesh.positions.reduce((s, [x, y, z]) => s + Math.hypot(x, y, z), 0) / mesh.positions.length;
        expect(Math.abs(mean - radius) / radius).toBeLessThan(0.02);
        expect(Math.abs(mesh.isoLevel - iso) / iso).toBeLessThan(0.05);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1]));
        expect(() => generateIsoValueMesh({ kind: 'analytic', id: 't', rMax: 4, recipe: { type: 'gaussianDensity', moleculeId: 'toy@00' } }, 16, 1e3))
            .toThrow(/No part of this density reaches ρ = 1000/);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/molecules/gaussian_basis.test.ts`
Expected: FAIL, "Cannot find module '../../src/molecules/gaussian_basis'".

- [ ] **Step 3: Implement**

```ts
// src/molecules/gaussian_basis.ts
import type { FieldEvaluator } from '../field_source';
import { GridSpec, MoleculeBasis } from './types';

/**
 * PySCF's spherical Gaussian AOs, rebuilt exactly (tools/molecules/basis_export.py
 * writes them; the plan's Design decisions state the convention). An AO is
 * [Σₖ cₖ e^(−αₖr²)] · S_lm(x, y, z) about its atom, S_lm the real solid
 * harmonics normalised on the unit sphere in PySCF's order (p: x, y, z;
 * l ≥ 2: m = −l … l). tests/molecules/gaussian_basis.test.ts pins this to
 * PySCF's own values; change nothing here without regenerating those fixtures.
 */
const S = 0.28209479177387814;
const P = 0.4886025119029199;
const D_XY = 1.0925484305920792, D_Z2 = 0.31539156525252005, D_X2Y2 = 0.5462742152960396;
const F_3 = 0.5900435899266435, F_XYZ = 2.890611442640554, F_1 = 0.4570457994644658;
const F_0 = 0.3731763325901154, F_2 = 1.445305721320277;

export function solidHarmonics(l: number, x: number, y: number, z: number, out: Float64Array, offset: number): void {
    switch (l) {
        case 0: out[offset] = S; return;
        case 1: out[offset] = P * x; out[offset + 1] = P * y; out[offset + 2] = P * z; return;
        case 2: {
            const xx = x * x, yy = y * y, zz = z * z;
            out[offset] = D_XY * x * y;
            out[offset + 1] = D_XY * y * z;
            out[offset + 2] = D_Z2 * (2 * zz - xx - yy);
            out[offset + 3] = D_XY * x * z;
            out[offset + 4] = D_X2Y2 * (xx - yy);
            return;
        }
        case 3: {
            const xx = x * x, yy = y * y, zz = z * z;
            out[offset] = F_3 * y * (3 * xx - yy);
            out[offset + 1] = F_XYZ * x * y * z;
            out[offset + 2] = F_1 * y * (4 * zz - xx - yy);
            out[offset + 3] = F_0 * z * (2 * zz - 3 * xx - 3 * yy);
            out[offset + 4] = F_1 * x * (4 * zz - xx - yy);
            out[offset + 5] = F_2 * z * (xx - yy);
            out[offset + 6] = F_3 * x * (xx - 3 * yy);
            return;
        }
        default: throw new RangeError(`l = ${l}: the Gaussian evaluator stops at f`);
    }
}

/** Below this a primitive is skipped: far past float32 and any drawn contour. */
const NEGLIGIBLE = 1e-14;

export interface AOEvaluator {
    readonly nao: number;
    evaluate(x: number, y: number, z: number, out: Float64Array): void;
}

export function makeAOEvaluator(basis: MoleculeBasis): AOEvaluator {
    let offset = 0;
    const shells = basis.shells.map(shell => {
        const [cx, cy, cz] = basis.atoms[shell.atom];
        // Screening radius: the furthest any primitive stays above NEGLIGIBLE.
        let cutoffSquared = 0;
        shell.exponents.forEach((alpha, k) => {
            const c = Math.abs(shell.coefficients[k]);
            if (c > NEGLIGIBLE) cutoffSquared = Math.max(cutoffSquared, Math.log(c / NEGLIGIBLE) / alpha);
        });
        const prepared = {
            cx, cy, cz, l: shell.l, width: 2 * shell.l + 1, offset, cutoffSquared,
            exponents: Float64Array.from(shell.exponents), coefficients: Float64Array.from(shell.coefficients),
        };
        offset += prepared.width;
        return prepared;
    });
    if (offset !== basis.nao) throw new Error(`Basis ${basis.id}: shells describe ${offset} AOs, file says ${basis.nao}`);
    return {
        nao: offset,
        evaluate(x, y, z, out) {
            for (const s of shells) {
                const dx = x - s.cx, dy = y - s.cy, dz = z - s.cz;
                const r2 = dx * dx + dy * dy + dz * dz;
                if (r2 > s.cutoffSquared) { out.fill(0, s.offset, s.offset + s.width); continue; }
                let radial = 0;
                for (let k = 0; k < s.exponents.length; k++) radial += s.coefficients[k] * Math.exp(-s.exponents[k] * r2);
                solidHarmonics(s.l, dx, dy, dz, out, s.offset);
                for (let m = 0; m < s.width; m++) out[s.offset + m] *= radial;
            }
        },
    };
}

export function moEvaluator(basis: MoleculeBasis, index: number): FieldEvaluator {
    const orbital = basis.orbitals[index];
    if (!orbital || orbital.index !== index) throw new RangeError(`Basis ${basis.id} has no orbital ${index}`);
    const aos = makeAOEvaluator(basis);
    const c = Float64Array.from(orbital.coefficients);
    const chi = new Float64Array(aos.nao);
    return (x, y, z) => {
        aos.evaluate(x, y, z, chi);
        let psi = 0;
        for (let mu = 0; mu < chi.length; mu++) psi += c[mu] * chi[mu];
        return psi;
    };
}

/** ρ = Σ occᵢ ψᵢ² over the shipped orbitals (every occupied one is shipped). */
export function densityEvaluator(basis: MoleculeBasis): FieldEvaluator {
    const aos = makeAOEvaluator(basis);
    const occupied = basis.orbitals.filter(o => o.occupation > 0)
        .map(o => ({ occupation: o.occupation, c: Float64Array.from(o.coefficients) }));
    const chi = new Float64Array(aos.nao);
    return (x, y, z) => {
        aos.evaluate(x, y, z, chi);
        let rho = 0;
        for (const { occupation, c } of occupied) {
            let psi = 0;
            for (let mu = 0; mu < chi.length; mu++) psi += c[mu] * chi[mu];
            rho += occupation * psi * psi;
        }
        return rho;
    };
}

/** ρ on a grid, z-fastest like GridFieldSource: index = (i * ny + j) * nz + k. */
export function densityOnGrid(basis: MoleculeBasis, grid: GridSpec): Float32Array {
    const rho = densityEvaluator(basis);
    const [nx, ny, nz] = grid.shape;
    const [ox, oy, oz] = grid.origin;
    const values = new Float32Array(nx * ny * nz);
    let index = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
        values[index++] = rho(ox + i * grid.spacing, oy + j * grid.spacing, oz + k * grid.spacing);
    }
    return values;
}
```

```ts
// src/molecules/basis_registry.ts
import { MoleculeBasis } from './types';

/**
 * Bases the current worker can evaluate. A recipe carries only a molecule id
 * (spec §4.1: recipes are small and serialisable); the request that carries
 * the recipe also carries the basis (FieldRenderRequest.bases), and the
 * worker registers it here before rebuilding any evaluator.
 */
const registry = new Map<string, MoleculeBasis>();

export function registerMoleculeBasis(basis: MoleculeBasis): void {
    registry.set(basis.id, basis);
}

export function registeredBasis(id: string): MoleculeBasis {
    const basis = registry.get(id);
    if (!basis) throw new Error(`No basis registered for ${id}; the render request must carry it`);
    return basis;
}
```

In `src/field_source.ts`: add

```ts
import { MoleculeBasis } from './molecules/types';
import { registeredBasis } from './molecules/basis_registry';
import { densityEvaluator, moEvaluator } from './molecules/gaussian_basis';

/** One molecular orbital from a shipped Gaussian basis (Phases 5–6). */
export interface GaussianMORecipe {
    type: 'gaussianMO';
    moleculeId: string;
    /** Position in the basis's `orbitals`. */
    index: number;
}

/**
 * A molecule's total density, evaluated from its basis (Phase 5). Evaluates
 * √ρ, the convention generateFieldMesh already uses for density grids: the
 * contour search squares its samples, so it sees ρ itself, and every vertex
 * is "positive" -- a density has no phase.
 */
export interface GaussianDensityRecipe {
    type: 'gaussianDensity';
    moleculeId: string;
}
```

extend the union with `| GaussianMORecipe | GaussianDensityRecipe`, add the switch cases

```ts
        case 'gaussianMO': return moEvaluator(registeredBasis(recipe.moleculeId), recipe.index);
        case 'gaussianDensity': {
            const rho = densityEvaluator(registeredBasis(recipe.moleculeId));
            return (x, y, z) => Math.sqrt(rho(x, y, z));
        }
```

and add to `FieldRenderRequest`:

```ts
    /** Bases the worker registers before evaluating 'gaussianMO'/'gaussianDensity' recipes. */
    bases?: MoleculeBasis[];
    /**
     * Draw each source at this value of ρ (e/a₀³) instead of at an enclosed
     * fraction. Density sources only; see generateIsoValueMesh for why.
     */
    densityIsoValue?: number;
```

Append to `src/orbital_mesh.ts`:

```ts
/**
 * A density drawn at a fixed ρ rather than an enclosed fraction. The sampled
 * sum cannot stand for the electron count when the grid is coarser than a
 * 1s cusp (one sample near a nitrogen nucleus holds a third of its core), so
 * "90 % of the electrons" would be off by up to 15 %; a value of ρ means the
 * same thing on any grid, and ρ = 0.002 is chemistry's molecular outline.
 * The value is turned into the share of these samples above it, which is the
 * one thing meshFromSamples' contour search can be asked for. `source` must
 * evaluate √ρ (a 'gaussianDensity' recipe).
 */
export function generateIsoValueMesh(source: AnalyticFieldSource, resolution: number, isoValue: number): MeshData {
    if (!(isoValue > 0)) throw new Error('Invalid parameters: isoValue must be positive');
    const field = sampleFieldSource(source, resolution);
    let total = 0;
    let above = 0;
    for (let i = 0; i < field.samples.length; i++) {
        const rho = field.samples[i] * field.samples[i];
        total += rho;
        if (rho > isoValue) above += rho;
    }
    if (!(above > 0)) throw new Error(`No part of this density reaches ρ = ${isoValue} e/a₀³ inside the box`);
    return meshFromSamples(field, Math.min(above / total, 1 - 1e-9), () => 1);
}
```

In `src/workers/orbitalWorker.ts`, add `import { registerMoleculeBasis } from '../molecules/basis_registry';` and `generateIsoValueMesh` to the `../orbital_mesh` import, and replace the `calculateFields` branch body with:

```ts
            const { request } = message;
            for (const basis of request.bases ?? []) registerMoleculeBasis(basis);
            const meshes = request.densityIsoValue !== undefined
                ? request.sources.map(source => generateIsoValueMesh(source, request.resolution, request.densityIsoValue!))
                : generateFieldMeshes(request);
            const response: WorkerFieldsSuccessResponse = { type: 'fieldsSuccess', meshes };
            worker.postMessage(response, meshes.map(mesh => mesh.densityMap.data.buffer));
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/molecules tests/field_source.test.ts tests/field_mesh.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/molecules src/field_source.ts src/orbital_mesh.ts src/workers/orbitalWorker.ts tests/molecules/gaussian_basis.test.ts
git commit -m "feat(molecules): PySCF-exact Gaussian MO and density recipes, drawn at a fixed density

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Bonds state and the render request

**Files:**
- Create: `src/bonds/systems.ts`, `src/store/bondsSlice.ts`, `src/bonds/bonds_request.ts`
- Modify: `src/store/atomSlice.ts` (`ViewMode`), `src/store/orbitalSlice.ts` (extraReducer), `src/store/index.ts`, `src/url_state.ts` (`URL_MODE`)
- Test: `tests/bonds/bonds_slice.test.ts`, `tests/bonds/bonds_request.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 6, 7.
- Produces: `DIATOMIC_IDS`, `type DiatomicId`, `type BondsSystemId = 'h2plus' | DiatomicId`, `BONDS_SYSTEMS: Array<{ id; formula; name }>`, `isBondsSystemId(v): v is BondsSystemId`, `systemFormula(id)`, `BOHR_TO_ANGSTROM`, `HARTREE_TO_EV`, `BONDS_RESOLUTION = 96`, `DENSITY_ISO_VALUES = [0.002, 0.05, 0.2]`, `MOLECULE_PADDING = 6.5`, `pointId(system, index): string`, `nearestScanIndex(points, R): number`. `type BondsView = { kind: 'h2plus'; state: H2PlusState } | { kind: 'mo'; label: string; spin: OrbitalSpin; component: number } | { kind: 'density' }`; `BondsState { system; R: number | null; scanIndex: number | null; view; densityIso }`; actions `selectBondsSystem(id)`, `setH2PlusR(R)`, `setScanPoint({ index, RBohr })`, `setBondsView(view)`, `setDensityIso(v)`, `restoreBonds({ system, R, view?, densityIso? })`; `ViewMode = 'atom' | 'hydrogenic' | 'bonds'`; `bondsFieldRequest(state, basis, enclosedFraction): { request: FieldRenderRequest; note: string | null } | null`; `findOrbital(basis, view)`; `DENSITY_SURFACE_HEX = '#cfd8dc'`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/bonds/bonds_slice.test.ts
import reducer, { selectBondsSystem, setH2PlusR, setScanPoint, setBondsView, setDensityIso, restoreBonds } from '../../src/store/bondsSlice';
import orbitalReducer, { startFieldCalculation } from '../../src/store/orbitalSlice';
import { setMode } from '../../src/store/atomSlice';

const initial = reducer(undefined, { type: '@@init' });

describe('bondsSlice', () => {
    it('starts on H2+ at 2 a0, bonding orbital', () => {
        expect(initial).toEqual({ system: 'h2plus', R: 2, scanIndex: null, view: { kind: 'h2plus', state: '1sigma_g' }, densityIso: 0.002 });
    });

    it('clamps H2+ R to the slider range and ignores nonsense', () => {
        expect(reducer(initial, setH2PlusR(0.01)).R).toBe(0.5);
        expect(reducer(initial, setH2PlusR(1e6)).R).toBe(10);
        expect(reducer(initial, setH2PlusR(Number.NaN)).R).toBe(2);
    });

    it('a molecule starts on its density with R pending until its scan loads', () => {
        const state = reducer(initial, selectBondsSystem('n2'));
        expect(state).toMatchObject({ system: 'n2', R: null, scanIndex: null, view: { kind: 'density' } });
        expect(reducer(state, setH2PlusR(3)).R).toBeNull();
        const snapped = reducer(state, setScanPoint({ index: 7, RBohr: 2.074 }));
        expect(snapped).toMatchObject({ scanIndex: 7, R: 2.074 });
    });

    it('accepts only views that belong to the system', () => {
        expect(reducer(initial, setBondsView({ kind: 'density' })).view).toEqual(initial.view);
        const n2 = reducer(initial, selectBondsSystem('n2'));
        expect(reducer(n2, setBondsView({ kind: 'h2plus', state: '1sigma_u' })).view).toEqual({ kind: 'density' });
        const mo = { kind: 'mo', label: '3σg', spin: 'restricted', component: 0 } as const;
        expect(reducer(n2, setBondsView(mo)).view).toEqual(mo);
        expect(reducer(n2, setDensityIso(0.05)).densityIso).toBe(0.05);
        expect(reducer(n2, setDensityIso(0.3)).densityIso).toBe(0.002);
        expect(reducer(initial, selectBondsSystem('xx' as never))).toEqual(initial);
    });

    it('restores a whole selection, keeping R for the scan to snap to', () => {
        const state = reducer(initial, restoreBonds({ system: 'o2', R: 2.3, view: { kind: 'density' }, densityIso: 0.05 }));
        expect(state).toMatchObject({ system: 'o2', R: 2.3, scanIndex: null, densityIso: 0.05 });
    });
});

// Review Focus 1.
describe('orbitalSlice on entering Bonds', () => {
    it('setMode("bonds") drops a Basic Orbitals field request', () => {
        const request = { sources: [], colors: [], resolution: 32, enclosedFraction: 0.9, label: 'sp3' };
        let state = orbitalReducer(undefined, startFieldCalculation(request));
        state = orbitalReducer(state, setMode('bonds'));
        expect(state.currentField).toBeNull();
        expect(state.isLoading).toBe(false);
    });
});
```

```ts
// tests/bonds/bonds_request.test.ts
import { bondsFieldRequest } from '../../src/bonds/bonds_request';
import reducer, { selectBondsSystem, setScanPoint, setBondsView } from '../../src/store/bondsSlice';
import { MoleculeBasis } from '../../src/molecules/types';

const basis: MoleculeBasis = {
    id: 'n2@07', spherical: true, convention: 'x', atoms: [[0, 0, -1.037], [0, 0, 1.037]], nao: 1,
    shells: [{ atom: 0, l: 0, exponents: [1], coefficients: [1] }],
    orbitals: [
        { index: 0, label: '3σg', energyHartree: -0.38, occupation: 2, spin: 'restricted', coefficients: [1] },
        { index: 1, label: '1πg*', energyHartree: -0.08, occupation: 0, spin: 'restricted', coefficients: [1] },
        { index: 2, label: '1πg*', energyHartree: -0.08, occupation: 0, spin: 'restricted', coefficients: [1] },
    ],
};
const n2 = reducer(reducer(undefined, selectBondsSystem('n2')), setScanPoint({ index: 7, RBohr: 2.074 }));

describe('bondsFieldRequest', () => {
    it('draws H2+ from the exact recipe', () => {
        const { request } = bondsFieldRequest(reducer(undefined, { type: '@@init' }), null, 0.9)!;
        expect(request.sources[0].recipe).toEqual({ type: 'h2plus', R: 2, state: '1sigma_g' });
        expect(request).toMatchObject({ resolution: 96, enclosedFraction: 0.9 });
        expect(request.label).toBe('H₂⁺ 1σg at R = 2.00 a₀');
    });

    it('waits for the basis of the snapped scan point', () => {
        expect(bondsFieldRequest(n2, null, 0.9)).toBeNull();
        expect(bondsFieldRequest(n2, { ...basis, id: 'n2@06' }, 0.9)).toBeNull();
    });

    it('draws the density at the chosen ρ, carrying the basis', () => {
        const { request } = bondsFieldRequest(n2, basis, 0.9)!;
        expect(request.sources[0].recipe).toEqual({ type: 'gaussianDensity', moleculeId: 'n2@07' });
        expect(request.densityIsoValue).toBe(0.002);
        expect(request.bases).toEqual([basis]);
        expect(request.sources[0].rMax).toBeCloseTo(1.037 + 6.5, 12);
    });

    it('draws the chosen component of a degenerate pair', () => {
        const view = setBondsView({ kind: 'mo', label: '1πg*', spin: 'restricted', component: 1 });
        const { request } = bondsFieldRequest(reducer(n2, view), basis, 0.9)!;
        expect(request.sources[0].recipe).toEqual({ type: 'gaussianMO', moleculeId: 'n2@07', index: 2 });
        expect(request.densityIsoValue).toBeUndefined();
    });

    // Review Focus 2.
    it('falls back to the density, saying so, when the orbital is not kept here', () => {
        const view = setBondsView({ kind: 'mo', label: '3σu*', spin: 'restricted', component: 0 });
        const result = bondsFieldRequest(reducer(n2, view), basis, 0.9)!;
        expect(result.request.sources[0].recipe.type).toBe('gaussianDensity');
        expect(result.note).toBe('3σu* is not among the orbitals kept at this geometry; showing the total density.');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/bonds/bonds_slice.test.ts tests/bonds/bonds_request.test.ts`
Expected: FAIL, "Cannot find module '../../src/store/bondsSlice'".

- [ ] **Step 3: Implement**

```ts
// src/bonds/systems.ts
import type { ScanPoint } from '../molecules/types';

export const DIATOMIC_IDS = ['h2', 'he2', 'li2', 'b2', 'c2', 'n2', 'o2', 'f2', 'co', 'hf'] as const;
export type DiatomicId = typeof DIATOMIC_IDS[number];
export type BondsSystemId = 'h2plus' | DiatomicId;

export const BONDS_SYSTEMS: ReadonlyArray<{ id: BondsSystemId; formula: string; name: string }> = [
    { id: 'h2plus', formula: 'H₂⁺', name: 'Hydrogen molecular ion — exact' },
    { id: 'h2', formula: 'H₂', name: 'Hydrogen' },
    { id: 'he2', formula: 'He₂', name: 'Helium dimer' },
    { id: 'li2', formula: 'Li₂', name: 'Lithium' },
    { id: 'b2', formula: 'B₂', name: 'Boron' },
    { id: 'c2', formula: 'C₂', name: 'Carbon' },
    { id: 'n2', formula: 'N₂', name: 'Nitrogen' },
    { id: 'o2', formula: 'O₂', name: 'Oxygen' },
    { id: 'f2', formula: 'F₂', name: 'Fluorine' },
    { id: 'co', formula: 'CO', name: 'Carbon monoxide' },
    { id: 'hf', formula: 'HF', name: 'Hydrogen fluoride' },
];

export function isBondsSystemId(value: unknown): value is BondsSystemId {
    return BONDS_SYSTEMS.some(system => system.id === value);
}

export function systemFormula(id: BondsSystemId): string {
    return BONDS_SYSTEMS.find(system => system.id === id)!.formula;
}

export const BOHR_TO_ANGSTROM = 0.529177210903;
export const HARTREE_TO_EV = 27.211386245988;
/** Bonds meshes sample 97³ points: an N₂ orbital (60 AOs, ~40 exponentials a point) stays inside 1.5 s. */
export const BONDS_RESOLUTION = 96;
/** e/a₀³. 0.002 is the conventional molecular outline; 0.05 shows the bond; 0.2 the cores. */
export const DENSITY_ISO_VALUES = [0.002, 0.05, 0.2] as const;
/** Sampling box beyond the outer nucleus, a₀; the same padding the shipped grids use. */
export const MOLECULE_PADDING = 6.5;

export function pointId(system: DiatomicId, index: number): string {
    return `${system}@${String(index).padStart(2, '0')}`;
}

export function nearestScanIndex(points: readonly ScanPoint[], R: number): number {
    let best = 0;
    points.forEach((point, i) => { if (Math.abs(point.RBohr - R) < Math.abs(points[best].RBohr - R)) best = i; });
    return best;
}
```

```ts
// src/store/bondsSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { H2PlusState, H2PLUS_R_RANGE } from '../bonds/h2plus';
import { BondsSystemId, DENSITY_ISO_VALUES, isBondsSystemId } from '../bonds/systems';
import { OrbitalSpin } from '../molecules/types';

/**
 * Bonds mode's selection. What is loaded for it (scan, meta, basis) is not
 * kept here -- it is large and lives in useBondsData's cache -- only what
 * the user chose. A molecule's R is the snapped scan point's; `R: null`
 * means "snap to the equilibrium once the scan is known", a number with
 * `scanIndex: null` means "snap to the point nearest this" (a restored URL).
 */
export type BondsView =
    | { kind: 'h2plus'; state: H2PlusState }
    /** By label, not index, so sliding R keeps "3σg" even where orbitals reorder. */
    | { kind: 'mo'; label: string; spin: OrbitalSpin; component: number }
    | { kind: 'density' };

export interface BondsState {
    system: BondsSystemId;
    R: number | null;
    scanIndex: number | null;
    view: BondsView;
    densityIso: number;
}

const initialState: BondsState = {
    system: 'h2plus', R: 2, scanIndex: null, view: { kind: 'h2plus', state: '1sigma_g' }, densityIso: DENSITY_ISO_VALUES[0],
};

const clampR = (R: number) => Math.min(H2PLUS_R_RANGE.max, Math.max(H2PLUS_R_RANGE.min, R));

function viewFits(system: BondsSystemId, view: BondsView): boolean {
    return (system === 'h2plus') === (view.kind === 'h2plus');
}

function choose(state: BondsState, system: BondsSystemId): void {
    state.system = system;
    state.scanIndex = null;
    if (system === 'h2plus') {
        state.R = clampR(state.R ?? 2);
        state.view = { kind: 'h2plus', state: '1sigma_g' };
    } else {
        state.R = null;
        state.view = { kind: 'density' };
    }
}

const bondsSlice = createSlice({
    name: 'bonds',
    initialState,
    reducers: {
        selectBondsSystem: (state, action: PayloadAction<BondsSystemId>) => {
            if (isBondsSystemId(action.payload)) choose(state, action.payload);
        },
        setH2PlusR: (state, action: PayloadAction<number>) => {
            if (state.system === 'h2plus' && Number.isFinite(action.payload)) state.R = clampR(action.payload);
        },
        setScanPoint: (state, action: PayloadAction<{ index: number; RBohr: number }>) => {
            const { index, RBohr } = action.payload;
            if (state.system === 'h2plus' || !Number.isInteger(index) || index < 0 || !(RBohr > 0)) return;
            state.scanIndex = index;
            state.R = RBohr;
        },
        setBondsView: (state, action: PayloadAction<BondsView>) => {
            if (viewFits(state.system, action.payload)) state.view = action.payload;
        },
        setDensityIso: (state, action: PayloadAction<number>) => {
            if ((DENSITY_ISO_VALUES as readonly number[]).includes(action.payload)) state.densityIso = action.payload;
        },
        restoreBonds: (state, action: PayloadAction<{ system: BondsSystemId; R: number | null; view?: BondsView; densityIso?: number }>) => {
            const { system, R, view, densityIso } = action.payload;
            if (!isBondsSystemId(system)) return;
            choose(state, system);
            if (R !== null && Number.isFinite(R) && R > 0) state.R = system === 'h2plus' ? clampR(R) : R;
            if (view && viewFits(system, view)) state.view = view;
            if (densityIso !== undefined && (DENSITY_ISO_VALUES as readonly number[]).includes(densityIso)) state.densityIso = densityIso;
        },
    },
});

export const { selectBondsSystem, setH2PlusR, setScanPoint, setBondsView, setDensityIso, restoreBonds } = bondsSlice.actions;
export default bondsSlice.reducer;
```

```ts
// src/bonds/bonds_request.ts
import { FieldRenderRequest } from '../field_source';
import { BondsState, BondsView } from '../store/bondsSlice';
import { BasisOrbital, MoleculeBasis } from '../molecules/types';
import { H2PLUS_LABELS, h2plusSource } from './h2plus';
import { BONDS_RESOLUTION, DiatomicId, MOLECULE_PADDING, pointId, systemFormula } from './systems';

/** Grey: a density has no phase, so it takes neither ψ colour. */
export const DENSITY_SURFACE_HEX = '#cfd8dc';

export function findOrbital(basis: MoleculeBasis, view: BondsView): BasisOrbital | null {
    if (view.kind !== 'mo') return null;
    const matches = basis.orbitals.filter(o => o.label === view.label && o.spin === view.spin);
    return matches[view.component] ?? null;
}

/**
 * The render the current selection asks for, or null while its data is still
 * loading. `note` says why the picture differs from the selection, when it does.
 */
export function bondsFieldRequest(
    state: BondsState, basis: MoleculeBasis | null, enclosedFraction: number,
): { request: FieldRenderRequest; note: string | null } | null {
    if (state.system === 'h2plus') {
        if (state.view.kind !== 'h2plus' || state.R === null) return null;
        return {
            note: null,
            request: {
                sources: [h2plusSource(state.R, state.view.state)], colors: ['#ffffff'],
                resolution: BONDS_RESOLUTION, enclosedFraction,
                label: `H₂⁺ ${H2PLUS_LABELS[state.view.state]} at R = ${state.R.toFixed(2)} a₀`,
            },
        };
    }
    if (state.scanIndex === null || !basis || basis.id !== pointId(state.system as DiatomicId, state.scanIndex)) return null;
    const rMax = Math.max(...basis.atoms.map(([, , z]) => Math.abs(z))) + MOLECULE_PADDING;
    const formula = systemFormula(state.system);
    const where = `at R = ${state.R!.toFixed(2)} a₀`;
    const orbital = findOrbital(basis, state.view);
    if (orbital) {
        return {
            note: null,
            request: {
                sources: [{ kind: 'analytic', id: `gaussianMO:${basis.id}:${orbital.index}`, rMax,
                    recipe: { type: 'gaussianMO', moleculeId: basis.id, index: orbital.index } }],
                colors: ['#ffffff'], resolution: BONDS_RESOLUTION, enclosedFraction, bases: [basis],
                label: `${formula} ${orbital.label} ${where}`,
            },
        };
    }
    return {
        note: state.view.kind === 'mo'
            ? `${state.view.label} is not among the orbitals kept at this geometry; showing the total density.`
            : null,
        request: {
            sources: [{ kind: 'analytic', id: `gaussianDensity:${basis.id}`, rMax,
                recipe: { type: 'gaussianDensity', moleculeId: basis.id } }],
            colors: [DENSITY_SURFACE_HEX], resolution: BONDS_RESOLUTION, enclosedFraction, bases: [basis],
            densityIsoValue: state.densityIso,
            label: `${formula} density ${where}`,
        },
    };
}
```

In `src/store/atomSlice.ts`: `export type ViewMode = 'atom' | 'hydrogenic' | 'bonds';`, with the doc line "'bonds' is Phase 5's Bonds mode; its selection lives in bondsSlice."

In `src/url_state.ts` (Phase 2), `URL_MODE: Record<ViewMode, string>` stops compiling until it names the new mode: `const URL_MODE: Record<ViewMode, string> = { atom: 'atom', hydrogenic: 'basic', bonds: 'bonds' };`. (Its keys are registered in Task 14.)

In `src/store/orbitalSlice.ts`, Phase 1's extraReducer condition becomes "anything but Basic Orbitals":

```ts
    builder.addCase(setMode, (state, action) => {
      // Combinations belong to Basic Orbitals and Bonds draws its own
      // requests: entering any other mode drops the request on screen, so no
      // effect can redraw a hybrid over an atom or a molecule.
      if (action.payload === 'hydrogenic' || !state.currentField) return;
      state.currentField = null;
      state.isLoading = false;
    });
```

In `src/store/index.ts`: `import bondsReducer from './bondsSlice';` and add `bonds: bondsReducer` to `reducer`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/bonds tests/orbital_slice.test.ts src/App.test.tsx && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/bonds/systems.ts src/bonds/bonds_request.ts src/store src/url_state.ts tests/bonds/bonds_slice.test.ts tests/bonds/bonds_request.test.ts
git commit -m "feat(bonds): Bonds mode state and its field render requests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Density colour in the scene; the H₂⁺ curve worker

**Files:**
- Modify: `src/clip_caps.ts` (append `setCapsPositiveColour`), `src/orbital_visualizer.ts` (`updateSceneWithMeshData`, `updateFieldInScene`)
- Create: `src/workers/h2plusCurveWorker.ts`, `src/workers/createH2PlusCurveWorker.ts`, `src/bonds/useH2PlusCurve.ts`
- Test: `tests/bonds/density_scene.test.ts`, `tests/bonds/use_h2plus_curve.test.tsx`

**Interfaces:**
- Consumes: Phase 1 `updateFieldInScene`; Task 1 `h2plusCurve`, `h2plusEquilibrium`.
- Produces: `setCapsPositiveColour(caps: THREE.Group, colour: THREE.Color)`; `DENSITY_SURFACE_COLOUR: THREE.Color` exported from `orbital_visualizer.ts`; `H2PLUS_CURVE_R: number[]` (0.5 to 10 by 0.05); `interface H2PlusCurve { R: number[]; sigmaG: number[]; sigmaU: number[]; equilibrium: { R: number; totalEnergy: number } }`; `useH2PlusCurve(): H2PlusCurve | null`; `resetH2PlusCurveForTests()`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/bonds/density_scene.test.ts
import * as THREE from 'three';

jest.mock('../../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createOrbitalWorker } from '../../src/workers/createOrbitalWorker';
import { VisualizerContext, updateFieldInScene, DENSITY_SURFACE_COLOUR } from '../../src/orbital_visualizer';
import { defaultSurfaceStyle, MeshData } from '../../src/types/orbital';
import { FieldRenderRequest } from '../../src/field_source';

function buildContext(): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(), camera,
        renderer: { domElement: document.createElement('canvas') } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null, currentAxesHelper: null, isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle }, clipPlane, clippingPlanes: [clipPlane],
        currentCaps: null, activeWorker: null, requestCounter: 0,
    };
}

const mesh: MeshData = {
    positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], cells: [[0, 1, 2]], psiSigns: [1, 1, 1],
    densityMap: { data: new Uint8Array(8).fill(200), side: 2, rMax: 8 }, isoLevel: 0.002,
};

async function draw(request: FieldRenderRequest): Promise<VisualizerContext> {
    const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null };
    (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
    const context = buildContext();
    const pending = updateFieldInScene(context, request);
    worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [mesh] } });
    await pending;
    return context;
}

const base = { sources: [], colors: ['#ffffff'], resolution: 96, enclosedFraction: 0.9, label: 'x' };
const vertexColours = (context: VisualizerContext) =>
    Array.from(((context.currentOrbitalGroup!.children[0] as THREE.Mesh).geometry.getAttribute('color').array));

describe('density colour', () => {
    it('paints a density surface and its cut face one colour', async () => {
        const context = await draw({ ...base, densityIsoValue: 0.002 });
        const c = DENSITY_SURFACE_COLOUR;
        expect(vertexColours(context)).toEqual([c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b].map(Math.fround));
        const capColours: THREE.Color[] = [];
        context.currentCaps!.traverse(object => {
            const material = (object as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
            if (material?.uniforms?.positivePhase) capColours.push(material.uniforms.positivePhase.value);
        });
        expect(capColours.length).toBeGreaterThan(0);
        expect(capColours.every(colour => colour.equals(c))).toBe(true);
    });

    it('keeps phase colours for an orbital', async () => {
        const context = await draw(base);
        expect(vertexColours(context).slice(0, 3)).toEqual([1, 0, 0]);
    });
});
```

```tsx
// tests/bonds/use_h2plus_curve.test.tsx
import { renderHook, act } from '@testing-library/react';

const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: { data: unknown }) => void) | null };
jest.mock('../../src/workers/createH2PlusCurveWorker', () => ({ createH2PlusCurveWorker: jest.fn(() => worker) }));

import { createH2PlusCurveWorker } from '../../src/workers/createH2PlusCurveWorker';
import { useH2PlusCurve, resetH2PlusCurveForTests, H2PLUS_CURVE_R } from '../../src/bonds/useH2PlusCurve';

describe('useH2PlusCurve', () => {
    beforeEach(() => { resetH2PlusCurveForTests(); jest.clearAllMocks(); });

    it('asks the worker once and shares the result', () => {
        const first = renderHook(() => useH2PlusCurve());
        expect(first.result.current).toBeNull();
        expect(worker.postMessage).toHaveBeenCalledWith({ R: H2PLUS_CURVE_R });
        const curve = { R: [1], sigmaG: [-0.5], sigmaU: [0.2], equilibrium: { R: 1.997, totalEnergy: -0.6026 } };
        act(() => worker.onmessage!({ data: curve }));
        expect(first.result.current).toEqual(curve);
        expect(worker.terminate).toHaveBeenCalled();
        const second = renderHook(() => useH2PlusCurve());
        expect(second.result.current).toEqual(curve);
        expect(createH2PlusCurveWorker).toHaveBeenCalledTimes(1);
    });

    it('spans the slider range in 0.05 a0 steps', () => {
        expect(H2PLUS_CURVE_R[0]).toBe(0.5);
        expect(H2PLUS_CURVE_R[H2PLUS_CURVE_R.length - 1]).toBeCloseTo(10, 12);
        expect(H2PLUS_CURVE_R).toHaveLength(191);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/bonds/density_scene.test.ts tests/bonds/use_h2plus_curve.test.tsx`
Expected: FAIL, "DENSITY_SURFACE_COLOUR is not exported"; "Cannot find module .../createH2PlusCurveWorker".

- [ ] **Step 3: Implement**

Append to `src/clip_caps.ts`:

```ts
/** Recolours the cut face's "positive" shade; a density has no phase, so it takes the surface's own colour. */
export function setCapsPositiveColour(caps: THREE.Group, colour: THREE.Color): void {
    caps.traverse(object => {
        const material = (object as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (material?.uniforms?.positivePhase) material.uniforms.positivePhase.value.copy(colour);
    });
}
```

In `src/orbital_visualizer.ts`: import `setCapsPositiveColour` from `./clip_caps`, and `DENSITY_SURFACE_HEX` from `./bonds/bonds_request`; add

```ts
/** One colour for a total density (spec §4.1): ψ's red and blue would claim a phase it does not have. */
export const DENSITY_SURFACE_COLOUR = new THREE.Color(DENSITY_SURFACE_HEX);
```

Give `updateSceneWithMeshData` a trailing parameter `uniformColour?: THREE.Color`. In its colour loop, when `uniformColour` is set write `uniformColour.r/g/b` for every vertex instead of the sign colours; after `const caps = createClipCaps(...)` add `if (uniformColour) setCapsPositiveColour(caps, uniformColour);`. In `updateFieldInScene`, the single-source call becomes:

```ts
                        updateSceneWithMeshData(context, meshes[0], false,
                            request.densityIsoValue !== undefined ? DENSITY_SURFACE_COLOUR : undefined);
```

```ts
// src/workers/h2plusCurveWorker.ts
import { h2plusCurve, h2plusEquilibrium } from '../bonds/h2plus';

interface WorkerScope {
    onmessage: ((event: MessageEvent<{ R: number[] }>) => void) | null;
    postMessage(message: unknown): void;
}
const worker = self as unknown as WorkerScope;

// ~0.3 s of eigenproblems: small, but not something to do on the UI thread (spec §3.7).
worker.onmessage = event => {
    const { R } = event.data;
    worker.postMessage({ R, sigmaG: h2plusCurve(R, '1sigma_g'), sigmaU: h2plusCurve(R, '1sigma_u'), equilibrium: h2plusEquilibrium() });
};
```

```ts
// src/workers/createH2PlusCurveWorker.ts
/** Isolated for the same reason as createOrbitalWorker.ts: `import.meta.url` does not load under ts-jest. */
export function createH2PlusCurveWorker(): Worker {
    return new Worker(new URL('./h2plusCurveWorker.ts', import.meta.url), { type: 'module' });
}
```

```ts
// src/bonds/useH2PlusCurve.ts
import { useEffect, useState } from 'react';
import { createH2PlusCurveWorker } from '../workers/createH2PlusCurveWorker';
import { H2PLUS_R_RANGE } from './h2plus';

export interface H2PlusCurve {
    R: number[];
    sigmaG: number[];
    sigmaU: number[];
    equilibrium: { R: number; totalEnergy: number };
}

export const H2PLUS_CURVE_R: number[] = Array.from(
    { length: Math.round((H2PLUS_R_RANGE.max - H2PLUS_R_RANGE.min) / 0.05) + 1 },
    (_, i) => H2PLUS_R_RANGE.min + i * 0.05,
);

let curve: H2PlusCurve | null = null;
let pending: Promise<H2PlusCurve> | null = null;

function computeCurve(): Promise<H2PlusCurve> {
    if (!pending) {
        pending = new Promise(resolve => {
            const worker = createH2PlusCurveWorker();
            worker.onmessage = (event: MessageEvent<H2PlusCurve>) => {
                curve = event.data;
                worker.terminate();
                resolve(event.data);
            };
            worker.postMessage({ R: H2PLUS_CURVE_R });
        });
    }
    return pending;
}

export function resetH2PlusCurveForTests(): void {
    curve = null;
    pending = null;
}

/** The exact 1σg and 1σu curves, computed once per session off the main thread. */
export function useH2PlusCurve(): H2PlusCurve | null {
    const [value, setValue] = useState<H2PlusCurve | null>(curve);
    useEffect(() => {
        let live = true;
        if (!curve) void computeCurve().then(result => { if (live) setValue(result); });
        return () => { live = false; };
    }, []);
    return value;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/bonds tests/field_visualizer.test.ts tests/atom/visualizer_dispatch.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/clip_caps.ts src/orbital_visualizer.ts src/workers/h2plusCurveWorker.ts src/workers/createH2PlusCurveWorker.ts src/bonds/useH2PlusCurve.ts tests/bonds
git commit -m "feat(bonds): single density colour on surface and cut face; H2+ curve worker

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `PotentialCurvePlot`

**Files:**
- Create: `src/components/PotentialCurvePlot.tsx`
- Test: `tests/bonds/potential_curve_plot.test.tsx`

**Interfaces:**
- Produces: `interface CurveSeries { key: string; label: string; color: string; points: Array<{ R: number; E: number }> }`; `interpolateEnergy(points, R): number | null`; component props `{ title: string; unit: string; series: CurveSeries[]; xRange: [number, number]; yRange: [number, number]; markerR: number | null; snapRs?: number[]; referenceR?: { R: number; label: string } | null; caption: string; width: number; onSelectR?: (R: number) => void }`.

**Decision:** a new small SVG component rather than extending `RadialPlot`, whose props, hover linkage and titles are all about D(r). It reuses RadialPlot's CSS classes (`radial-plot`, `radial-plot-title`, `radial-plot-line`, `radial-plot-legend*`, `radial-plot-scale`), with colour through `style` (HANDOFF: a CSS stroke beats a presentation attribute).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/bonds/potential_curve_plot.test.tsx
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import PotentialCurvePlot, { interpolateEnergy, CurveSeries } from '../../src/components/PotentialCurvePlot';

const series: CurveSeries[] = [
    { key: 'g', label: '1σg', color: '#ff0000', points: [{ R: 1, E: -0.4 }, { R: 2, E: -0.6 }, { R: 4, E: -0.55 }] },
    { key: 'u', label: '1σu*', color: '#0000ff', points: [{ R: 1, E: 0.5 }, { R: 2, E: -0.1 }, { R: 4, E: -0.45 }] },
];
const props = { title: 'Potential energy', unit: 'Ha', series, xRange: [0, 4] as [number, number], yRange: [-0.7, -0.3] as [number, number], markerR: 2, caption: 'exact', width: 300 };

describe('PotentialCurvePlot', () => {
    it('interpolates linearly and refuses R outside the curve', () => {
        expect(interpolateEnergy(series[0].points, 3)).toBeCloseTo(-0.575, 12);
        expect(interpolateEnergy(series[0].points, 5)).toBeNull();
    });

    it('draws one clipped path per series, coloured through style, with the caption', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        const paths = container.querySelectorAll('path.radial-plot-line');
        expect(paths).toHaveLength(2);
        expect((paths[1] as SVGPathElement).style.stroke).toBe('rgb(0, 0, 255)');
        expect(container.querySelector('clipPath')).not.toBeNull();
        expect(screen.getByText('exact')).toBeInTheDocument();
    });

    it('marks the current R and each curve there', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        const marker = container.querySelector('.potential-marker')!;
        // left padding 34, plot width 300 - 34 - 8 = 258: R = 2 of [0, 4] is the middle.
        expect(Number(marker.getAttribute('x1'))).toBeCloseTo(34 + 129, 6);
        expect(container.querySelectorAll('.potential-marker-dot')).toHaveLength(2);
    });

    it('reports the R clicked', () => {
        const onSelectR = jest.fn();
        const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} />);
        const svg = container.querySelector('svg')!;
        jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 130, right: 300, bottom: 130, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
        fireEvent.click(svg, { clientX: 34 + 258 * 0.75, clientY: 50 });
        expect(onSelectR).toHaveBeenCalledWith(3);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/bonds/potential_curve_plot.test.tsx`
Expected: FAIL, "Cannot find module '../../src/components/PotentialCurvePlot'".

- [ ] **Step 3: Implement**

```tsx
// src/components/PotentialCurvePlot.tsx
import React, { useId } from 'react';

/**
 * Energy against internuclear distance, with the geometry on screen marked.
 * Presentational: the caller chooses what E means (absolute Ha for H₂⁺,
 * E − E_min in eV for a scan) and says so in `unit` and `caption`.
 */
export interface CurveSeries {
    key: string;
    label: string;
    color: string;
    points: Array<{ R: number; E: number }>;
}

interface PotentialCurvePlotProps {
    title: string;
    unit: string;
    series: CurveSeries[];
    xRange: [number, number];
    yRange: [number, number];
    markerR: number | null;
    /** Scan geometries, ticked on the axis: the slider snaps to these. */
    snapRs?: number[];
    referenceR?: { R: number; label: string } | null;
    caption: string;
    width: number;
    onSelectR?: (R: number) => void;
}

const HEIGHT = 130;
const PAD = { left: 34, right: 8, top: 8, bottom: 18 };

export function interpolateEnergy(points: Array<{ R: number; E: number }>, R: number): number | null {
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (R >= a.R && R <= b.R) return a.E + ((R - a.R) / (b.R - a.R)) * (b.E - a.E);
    }
    return null;
}

const PotentialCurvePlot: React.FC<PotentialCurvePlotProps> = ({
    title, unit, series, xRange, yRange, markerR, snapRs = [], referenceR = null, caption, width, onSelectR,
}) => {
    const clipId = useId();
    const plotWidth = width - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const x = (R: number) => PAD.left + ((R - xRange[0]) / (xRange[1] - xRange[0])) * plotWidth;
    const y = (E: number) => PAD.top + (1 - (E - yRange[0]) / (yRange[1] - yRange[0])) * plotHeight;

    const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
        if (!onSelectR) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const svgX = (event.clientX - rect.left) * (rect.width > 0 ? width / rect.width : 1);
        const R = xRange[0] + ((svgX - PAD.left) / plotWidth) * (xRange[1] - xRange[0]);
        onSelectR(Math.min(xRange[1], Math.max(xRange[0], R)));
    };

    return (
        <div className="radial-plot potential-curve" aria-label="potential energy curve" style={{ maxWidth: width + 22 }}>
            <div className="radial-plot-title">{title} ({unit})</div>
            <svg width={width} height={HEIGHT} role="img" aria-label={`${title} against R`} onClick={handleClick}
                style={{ cursor: onSelectR ? 'pointer' : undefined }}>
                <defs>
                    <clipPath id={clipId}><rect x={PAD.left} y={PAD.top} width={plotWidth} height={plotHeight} /></clipPath>
                </defs>
                <g clipPath={`url(#${clipId})`}>
                    {series.map(s => (
                        <path key={s.key} className="radial-plot-line" fill="none" style={{ stroke: s.color }}
                            d={`M ${s.points.map(p => `${x(p.R).toFixed(2)},${y(p.E).toFixed(2)}`).join(' L ')}`} />
                    ))}
                </g>
                <line className="radial-plot-axis" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight} />
                {snapRs.map(R => (
                    <line key={R} className="radial-plot-peak" x1={x(R)} x2={x(R)} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight - 4} />
                ))}
                {referenceR && (
                    <line className="potential-reference" x1={x(referenceR.R)} x2={x(referenceR.R)} y1={PAD.top} y2={PAD.top + plotHeight}>
                        <title>{referenceR.label}</title>
                    </line>
                )}
                {markerR !== null && (
                    <>
                        <line className="potential-marker" x1={x(markerR)} x2={x(markerR)} y1={PAD.top} y2={PAD.top + plotHeight} />
                        {series.map(s => {
                            const E = interpolateEnergy(s.points, markerR);
                            return E === null || E < yRange[0] || E > yRange[1] ? null : (
                                <circle key={s.key} className="potential-marker-dot" cx={x(markerR)} cy={y(E)} r={3} style={{ fill: s.color }} />
                            );
                        })}
                    </>
                )}
                <text x={2} y={PAD.top + 8} className="potential-axis-label">{yRange[1].toPrecision(3)}</text>
                <text x={2} y={PAD.top + plotHeight} className="potential-axis-label">{yRange[0].toPrecision(3)}</text>
            </svg>
            <div className="radial-plot-legend">
                {series.map(s => (
                    <span key={s.key} className="radial-plot-legend-item">
                        <span className="radial-plot-legend-swatch" style={{ background: s.color }} />{s.label}
                    </span>
                ))}
            </div>
            <div className="radial-plot-scale" style={{ width }}>
                <span>{xRange[0]}</span>
                <span>R ({xRange[1]} a₀)</span>
            </div>
            <div className="radial-plot-note">{caption}</div>
        </div>
    );
};

export default PotentialCurvePlot;
```

Append to `src/style.css`:

```css
.potential-marker { stroke: #ffffff; stroke-width: 1; stroke-dasharray: 3 2; }
.potential-reference { stroke: #8bc34a; stroke-width: 1; stroke-dasharray: 1 3; }
.potential-axis-label { fill: #9aa4ad; font-size: 9px; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/bonds/potential_curve_plot.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PotentialCurvePlot.tsx src/style.css tests/bonds/potential_curve_plot.test.tsx
git commit -m "feat(bonds): potential-energy curve plot with the current R marked

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The MO energy diagram

**Files:**
- Create: `src/bonds/mo_diagram.ts`, `src/components/MoDiagram.tsx`
- Test: `tests/bonds/mo_diagram.test.tsx`

**Interfaces:**
- Consumes: `MoleculeOrbitalInfo` (Task 6); `h2plusElectronicEnergy`, `H2PLUS_LABELS` (Task 1).
- Produces: `interface DiagramBox { orbitalIndex: number; up: boolean; down: boolean }`; `interface DiagramLevel { label: string; spin: OrbitalSpin; energyHartree: number; boxes: DiagramBox[]; core: boolean }`; `interface MoDiagramModel { levels: DiagramLevel[]; unrestricted: boolean }`; `buildMoDiagram(orbitals): MoDiagramModel`; `bondOrderText(order: number | null | undefined): string`; `h2plusOrbitals(R): MoleculeOrbitalInfo[]`; default-exported component `MoDiagram` with props `{ orbitals: MoleculeOrbitalInfo[]; selectedIndex: number | null; onSelect?: (index: number) => void; footer?: string; width?: number }` — the exact shape Phase 6 renders it with (`<MoDiagram orbitals={meta.orbitals} selectedIndex=… onSelect=… width=… />`).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/bonds/mo_diagram.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildMoDiagram, bondOrderText, h2plusOrbitals } from '../../src/bonds/mo_diagram';
import MoDiagram from '../../src/components/MoDiagram';
import { MoleculeOrbitalInfo } from '../../src/molecules/types';

const r = (index: number, label: string, energyHartree: number, occupation: number): MoleculeOrbitalInfo =>
    ({ index, label, energyHartree, occupation, spin: 'restricted' });
const n2 = [r(0, '1σg', -14.4, 2), r(1, '1σu*', -14.4, 2), r(2, '2σg', -1.1, 2), r(3, '2σu*', -0.5, 2),
    r(4, '1πu', -0.43, 2), r(5, '1πu', -0.43, 2), r(6, '3σg', -0.38, 2), r(7, '1πg*', -0.08, 0), r(8, '1πg*', -0.08, 0)];
const o2alpha = (index: number, label: string, e: number, occupation: number): MoleculeOrbitalInfo => ({ index, label, energyHartree: e, occupation, spin: 'alpha' });
const o2beta = (index: number, label: string, e: number, occupation: number): MoleculeOrbitalInfo => ({ index, label, energyHartree: e, occupation, spin: 'beta' });
const o2 = [o2alpha(0, '1πu', -0.6, 1), o2alpha(1, '1πu', -0.6, 1), o2alpha(2, '1πg*', -0.35, 1), o2alpha(3, '1πg*', -0.35, 1),
    o2beta(4, '1πu', -0.55, 1), o2beta(5, '1πu', -0.55, 1), o2beta(6, '1πg*', -0.25, 0), o2beta(7, '1πg*', -0.25, 0)];

describe('buildMoDiagram', () => {
    it('groups degenerate pairs into one level and fills boxes from occupations', () => {
        const model = buildMoDiagram(n2);
        const pi = model.levels.find(level => level.label === '1πu')!;
        expect(pi.boxes).toEqual([{ orbitalIndex: 4, up: true, down: true }, { orbitalIndex: 5, up: true, down: true }]);
        expect(model.levels.find(level => level.label === '1πg*')!.boxes.every(b => !b.up && !b.down)).toBe(true);
    });

    it('puts levels below the largest gap over 1 Ha into the core', () => {
        const model = buildMoDiagram(n2);
        expect(model.levels.filter(l => l.core).map(l => l.label)).toEqual(['1σg', '1σu*']);
    });

    it("shows O2's two unpaired π* electrons: α up arrows, no β partner", () => {
        const model = buildMoDiagram(o2);
        expect(model.unrestricted).toBe(true);
        const piStar = model.levels.find(level => level.label === '1πg*')!;
        expect(piStar.boxes).toEqual([{ orbitalIndex: 2, up: true, down: false }, { orbitalIndex: 3, up: true, down: false }]);
        expect(model.levels.find(level => level.label === '1πu')!.boxes.every(b => b.up && b.down)).toBe(true);
    });

    it('states the bond order, and He2 has none', () => {
        expect(bondOrderText(3)).toBe('Bond order 3');
        expect(bondOrderText(0)).toBe('Bond order 0 — no bond: the antibonding electrons cancel the bonding ones.');
        expect(bondOrderText(0.5)).toBe('Bond order ½');
        expect(bondOrderText(null)).toBe('Bond order is not defined by g/u counting for a heteronuclear molecule.');
    });

    it('builds the exact H2+ levels, one electron in 1σg', () => {
        const levels = h2plusOrbitals(2);
        expect(levels.map(o => [o.label, o.occupation])).toEqual([['1σg', 1], ['1σu*', 0]]);
        expect(levels[0].energyHartree).toBeCloseTo(-1.1026342145, 9);
    });
});

describe('MoDiagram', () => {
    it('draws arrows and selects a box on click', () => {
        const onSelect = jest.fn();
        render(<MoDiagram orbitals={n2} selectedIndex={6} onSelect={onSelect} footer="Bond order 3" />);
        expect(screen.getAllByText('↑')).toHaveLength(7);
        expect(screen.getAllByText('↓')).toHaveLength(7);
        fireEvent.click(screen.getByRole('button', { name: /1πg\* \(2 of 2\)/ }));
        expect(onSelect).toHaveBeenCalledWith(8);
        expect(screen.getByRole('button', { name: /3σg \(1 of 1\)/ })).toHaveClass('selected');
        expect(screen.getByText('Bond order 3')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/bonds/mo_diagram.test.tsx`
Expected: FAIL, "Cannot find module '../../src/bonds/mo_diagram'".

- [ ] **Step 3: Implement**

```ts
// src/bonds/mo_diagram.ts
import { MoleculeOrbitalInfo, OrbitalSpin } from '../molecules/types';
import { H2PLUS_LABELS, H2PLUS_STATES, h2plusElectronicEnergy } from './h2plus';

export interface DiagramBox { orbitalIndex: number; up: boolean; down: boolean }
export interface DiagramLevel { label: string; spin: OrbitalSpin; energyHartree: number; boxes: DiagramBox[]; core: boolean }
export interface MoDiagramModel { levels: DiagramLevel[]; unrestricted: boolean }

/** A gap this wide separates the 1s cores from the valence levels drawn to scale. */
const CORE_GAP_HARTREE = 1;

function groupByLabel(orbitals: MoleculeOrbitalInfo[]): Map<string, MoleculeOrbitalInfo[]> {
    const groups = new Map<string, MoleculeOrbitalInfo[]>();
    for (const orbital of [...orbitals].sort((a, b) => a.index - b.index)) {
        groups.set(orbital.label, [...(groups.get(orbital.label) ?? []), orbital]);
    }
    return groups;
}

/**
 * Levels of the textbook diagram. Restricted: one level per label, a box per
 * degenerate partner, ↑↓ from its occupation. Unrestricted (O₂, B₂): levels
 * at α energies, ↑ from the α orbital and ↓ from the same-labelled β one, so
 * the unpaired electrons show as boxes with an up arrow alone.
 */
export function buildMoDiagram(orbitals: MoleculeOrbitalInfo[]): MoDiagramModel {
    const unrestricted = orbitals.some(o => o.spin === 'alpha' || o.spin === 'beta');
    const levels: DiagramLevel[] = [];
    if (!unrestricted) {
        for (const [label, group] of groupByLabel(orbitals)) {
            levels.push({ label, spin: 'restricted', energyHartree: group[0].energyHartree, core: false,
                boxes: group.map(o => ({ orbitalIndex: o.index, up: o.occupation >= 1, down: o.occupation >= 2 })) });
        }
    } else {
        const alpha = groupByLabel(orbitals.filter(o => o.spin === 'alpha'));
        const beta = groupByLabel(orbitals.filter(o => o.spin === 'beta'));
        for (const [label, group] of alpha) {
            const partners = beta.get(label) ?? [];
            levels.push({ label, spin: 'alpha', energyHartree: group[0].energyHartree, core: false,
                boxes: group.map((o, i) => ({ orbitalIndex: o.index, up: o.occupation > 0, down: (partners[i]?.occupation ?? 0) > 0 })) });
        }
        for (const [label, group] of beta) {
            if (alpha.has(label)) continue;
            levels.push({ label, spin: 'beta', energyHartree: group[0].energyHartree, core: false,
                boxes: group.map(o => ({ orbitalIndex: o.index, up: false, down: o.occupation > 0 })) });
        }
    }
    levels.sort((a, b) => a.energyHartree - b.energyHartree);
    let widest = 0;
    let split = 0;
    for (let i = 1; i < levels.length; i++) {
        const gap = levels[i].energyHartree - levels[i - 1].energyHartree;
        if (gap > widest) { widest = gap; split = i; }
    }
    if (widest > CORE_GAP_HARTREE) levels.slice(0, split).forEach(level => { level.core = true; });
    return { levels, unrestricted };
}

export function bondOrderText(order: number | null | undefined): string {
    if (order === null || order === undefined) return 'Bond order is not defined by g/u counting for a heteronuclear molecule.';
    if (order === 0) return 'Bond order 0 — no bond: the antibonding electrons cancel the bonding ones.';
    return `Bond order ${Number.isInteger(order) ? order : `${Math.floor(order) || ''}½`}`;
}

/** H₂⁺'s one electron: each level's energy is the exact E_el of that state. */
export function h2plusOrbitals(R: number): MoleculeOrbitalInfo[] {
    return H2PLUS_STATES.map((state, index) => ({
        index, label: H2PLUS_LABELS[state], energyHartree: h2plusElectronicEnergy(R, state),
        occupation: index === 0 ? 1 : 0, spin: 'restricted',
    }));
}
```

```tsx
// src/components/MoDiagram.tsx
import React, { useMemo } from 'react';
import { DiagramLevel, buildMoDiagram } from '../bonds/mo_diagram';
import { MoleculeOrbitalInfo } from '../molecules/types';

interface MoDiagramProps {
    /** meta.json's `orbitals`, or H₂⁺'s two exact levels (h2plusOrbitals). */
    orbitals: MoleculeOrbitalInfo[];
    /** The orbital on screen, by index; its box is outlined. */
    selectedIndex: number | null;
    /** The clicked box's orbital index (the α orbital of an unrestricted pair). */
    onSelect?: (index: number) => void;
    /** Bond order and method, under the diagram. */
    footer?: string;
    width?: number;
}

const HEIGHT = 220;
const CORE_BAND = 28;
const BOX = 22;
const MIN_ROW = 20;
/** Core levels (1σg, 1σu*: millihartree apart) share the band's one row, side by side. */
const CORE_COLUMN = 110;

/**
 * The molecular-orbital energy diagram: valence levels to scale, cores in a
 * compressed band under a break (they sit 10+ Ha lower and would flatten
 * everything else). Each box is a button that draws that orbital.
 */
const MoDiagram: React.FC<MoDiagramProps> = ({ orbitals, selectedIndex, onSelect, footer, width = 260 }) => {
    const model = useMemo(() => buildMoDiagram(orbitals), [orbitals]);
    const valence = model.levels.filter(level => !level.core);
    const core = model.levels.filter(level => level.core);
    const energies = valence.map(level => level.energyHartree);
    const lo = Math.min(...energies);
    const hi = Math.max(...energies);
    const span = hi - lo || 1;
    const top = 10;
    const bottom = HEIGHT - (core.length ? CORE_BAND : 0) - 14;
    // To scale, but never closer than one row: O₂'s 3σg and 1πu sit 0.01 Ha apart.
    const ys: number[] = [];
    valence.forEach((level, i) => {
        const y = bottom - ((level.energyHartree - lo) / span) * (bottom - top);
        ys.push(i === 0 ? y : Math.min(y, ys[i - 1] - MIN_ROW));
    });

    const renderLevel = (level: DiagramLevel, y: number, left = 0) => (
        <div key={`${level.spin}:${level.label}`} className="mo-level" style={{ top: y, left }}>
            {level.boxes.map((box, i) => (
                <button
                    key={box.orbitalIndex}
                    type="button"
                    className={`mo-box${box.orbitalIndex === selectedIndex ? ' selected' : ''}`}
                    style={{ width: BOX }}
                    aria-label={`${level.label} (${i + 1} of ${level.boxes.length}), ${level.energyHartree.toFixed(3)} Ha`}
                    title={`${level.label}: ε = ${level.energyHartree.toFixed(4)} Ha`}
                    onClick={() => onSelect?.(box.orbitalIndex)}
                >
                    {box.up && <span>↑</span>}
                    {box.down && <span>↓</span>}
                </button>
            ))}
            <span className="mo-label">{level.label}</span>
        </div>
    );

    return (
        <div className="mo-diagram" style={{ width }} aria-label="molecular orbital energy diagram">
            <div className="mo-levels" style={{ height: HEIGHT }}>
                {valence.map((level, i) => renderLevel(level, ys[i]))}
                {core.length > 0 && <div className="mo-break" style={{ top: HEIGHT - CORE_BAND - 8 }}>≈ core</div>}
                {core.map((level, i) => renderLevel(level, HEIGHT - CORE_BAND + 4, i * CORE_COLUMN))}
            </div>
            {model.unrestricted && <div className="mo-note">α energies; ↓ marks the matching β orbital.</div>}
            {footer && <div className="mo-footer">{footer}</div>}
        </div>
    );
};

export default MoDiagram;
```

Append to `src/style.css`:

```css
.mo-diagram { font-size: 12px; color: #d8dee4; }
.mo-levels { position: relative; }
.mo-level { position: absolute; left: 0; display: flex; align-items: center; gap: 4px; transform: translateY(-50%); }
.mo-box { height: 18px; padding: 0; border: 0; border-bottom: 2px solid #d8dee4; background: none; color: inherit; font: inherit; cursor: pointer; }
.mo-box.selected { outline: 1px solid #4da3ff; }
.mo-label { margin-left: 6px; }
.mo-break, .mo-note, .mo-footer { color: #9aa4ad; font-size: 11px; }
.mo-break { position: absolute; left: 0; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/bonds/mo_diagram.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bonds/mo_diagram.ts src/components/MoDiagram.tsx src/style.css tests/bonds/mo_diagram.test.tsx
git commit -m "feat(bonds): MO energy diagram with occupations, unpaired electrons and bond order

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Loading the selection, captions and `BondsPanel`

**Files:**
- Create: `src/bonds/useBondsData.ts`, `src/bonds/captions.ts`, `src/components/BondsPanel.tsx`
- Test: `tests/bonds/use_bonds_data.test.tsx`, `tests/bonds/bonds_panel.test.tsx`

**Interfaces:**
- Consumes: Tasks 6, 8, 11; `useAppSelector`, `useAppDispatch`.
- Produces: `interface BondsData { scan: MoleculeScan | null; meta: MoleculeMeta | null; basis: MoleculeBasis | null; loading: boolean; error: string | null }`; `useBondsData(): BondsData` (dispatches `setScanPoint` to snap); `bondsCaptions(system, scan): string[]`; `BondsPanel` props `{ bonds: BondsState; data: BondsData; note: string | null; onSelectSystem(id); onCommitH2PlusR(R); onScanIndex(index); onView(view); onDensityIso(v) }`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/bonds/use_bonds_data.test.tsx
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import bondsReducer, { selectBondsSystem, restoreBonds } from '../../src/store/bondsSlice';

jest.mock('../../src/molecules/loader', () => ({
    loadScan: jest.fn(), loadMoleculeMeta: jest.fn(), loadBasis: jest.fn(),
}));
import { loadScan, loadMoleculeMeta, loadBasis } from '../../src/molecules/loader';
import { useBondsData } from '../../src/bonds/useBondsData';

const scan = { points: [1.8, 2.0, 2.2].map((RBohr, index) => ({ index, id: `n2@0${index}`, RBohr, energyHartree: -1, dftEnergyHartree: -1 })), equilibriumIndex: 1 };

function setup() {
    const store = configureStore({ reducer: { bonds: bondsReducer } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
    return { store, wrapper };
}

beforeEach(() => {
    (loadScan as jest.Mock).mockResolvedValue(scan);
    (loadMoleculeMeta as jest.Mock).mockImplementation(async (id: string) => ({ id }));
    (loadBasis as jest.Mock).mockImplementation(async (id: string) => ({ id }));
});

describe('useBondsData', () => {
    it('loads nothing for H2+', () => {
        const { wrapper } = setup();
        const { result } = renderHook(() => useBondsData(), { wrapper });
        expect(result.current).toEqual({ scan: null, meta: null, basis: null, loading: false, error: null });
        expect(loadScan).not.toHaveBeenCalled();
    });

    it('snaps a fresh molecule to its equilibrium point and loads that point', async () => {
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(result.current.basis).toEqual({ id: 'n2@01' }));
        expect(store.getState().bonds).toMatchObject({ scanIndex: 1, R: 2.0 });
        expect(result.current.meta).toEqual({ id: 'n2@01' });
    });

    it('snaps a restored R to the nearest scan point', async () => {
        const { store, wrapper } = setup();
        store.dispatch(restoreBonds({ system: 'n2', R: 2.19 }));
        renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(store.getState().bonds.scanIndex).toBe(2));
    });

    it('reports a failed load', async () => {
        (loadScan as jest.Mock).mockRejectedValue(new Error('Could not load /molecules/n2/scan.json (HTTP 404)'));
        const { store, wrapper } = setup();
        store.dispatch(selectBondsSystem('n2'));
        const { result } = renderHook(() => useBondsData(), { wrapper });
        await waitFor(() => expect(result.current.error).toMatch(/HTTP 404/));
        expect(result.current.loading).toBe(false);
    });
});
```

```tsx
// tests/bonds/bonds_panel.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BondsPanel from '../../src/components/BondsPanel';
import reducer, { selectBondsSystem, setScanPoint } from '../../src/store/bondsSlice';
import { bondsCaptions } from '../../src/bonds/captions';
import { MoleculeMeta, MoleculeScan } from '../../src/molecules/types';

const handlers = { onSelectSystem: jest.fn(), onCommitH2PlusR: jest.fn(), onScanIndex: jest.fn(), onView: jest.fn(), onDensityIso: jest.fn() };
const empty = { scan: null, meta: null, basis: null, loading: false, error: null };
const h2plus = reducer(undefined, { type: '@@init' });

const heScan = {
    id: 'he2', formula: 'He₂', spin: 0, energyMethod: 'FCI/aug-cc-pVTZ', densityMethod: 'B3LYP/def2-TZVP',
    points: [2.4, 3.0, 3.6].map((RBohr, index) => ({ index, id: `he2@0${index}`, RBohr, energyHartree: -5.8 + 0.01 / RBohr, dftEnergyHartree: -5.8 })),
    equilibriumIndex: 1, fit: { ReBohr: 5.6, EminHartree: -5.8, wellDepthHartree: 3e-5, bound: false, DeEv: null },
    spinCheck: null, note: 'No chemical bond: bond order 0.', reference: { ReAngstrom: null, source: 'none' },
} as unknown as MoleculeScan;
const heMeta = { id: 'he2@01', bondOrder: 0, orbitals: [
    { index: 0, label: '1σg', energyHartree: -0.57, occupation: 2, spin: 'restricted' },
    { index: 1, label: '1σu*', energyHartree: -0.55, occupation: 2, spin: 'restricted' }] } as unknown as MoleculeMeta;
const he2 = reducer(reducer(undefined, selectBondsSystem('he2')), setScanPoint({ index: 1, RBohr: 3.0 }));

describe('bondsCaptions', () => {
    it('states the method of every quantity', () => {
        expect(bondsCaptions('h2plus', null).join(' ')).toMatch(/Exact within Born–Oppenheimer/);
        expect(bondsCaptions('h2plus', null).join(' ')).toMatch(/12\.5 a₀/);
        const he = bondsCaptions('he2', heScan).join(' ');
        expect(he).toMatch(/Energies: FCI\/aug-cc-pVTZ/);
        expect(he).toMatch(/not ionisation energies/);
        expect(he).toMatch(/No chemical bond/);
    });
});

describe('BondsPanel', () => {
    it('offers H2+ bonding and antibonding and a continuous R', () => {
        render(<BondsPanel bonds={h2plus} data={empty} note={null} {...handlers} />);
        expect(screen.getByRole('button', { name: '1σg (bonding)' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: '1σu* (antibonding)' }));
        expect(handlers.onView).toHaveBeenCalledWith({ kind: 'h2plus', state: '1sigma_u' });
        expect(screen.getByText(/R = 2\.00 a₀ \(1\.058 Å\)/)).toBeInTheDocument();
        expect(screen.getByText(/E = −0\.60263 Ha/)).toBeInTheDocument();
    });

    it("shows He2's zero bond order and the density choices", () => {
        render(<BondsPanel bonds={he2} data={{ ...empty, scan: heScan, meta: heMeta }} note={null} {...handlers} />);
        expect(screen.getByText(/Bond order 0 — no bond/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'ρ = 0.05' }));
        expect(handlers.onDensityIso).toHaveBeenCalledWith(0.05);
        fireEvent.click(screen.getByRole('button', { name: /1σu\* \(1 of 1\)/ }));
        expect(handlers.onView).toHaveBeenCalledWith({ kind: 'mo', label: '1σu*', spin: 'restricted', component: 0 });
    });

    // Review Focus 3.
    it('says the canvas still shows the previous system when loading fails', () => {
        const n2 = reducer(undefined, selectBondsSystem('n2'));
        render(<BondsPanel bonds={n2} data={{ ...empty, error: 'Could not load /molecules/n2/scan.json (HTTP 404)' }} note={null} {...handlers} />);
        expect(screen.getByRole('alert')).toHaveTextContent('N₂ could not be loaded: Could not load /molecules/n2/scan.json (HTTP 404). The view still shows the previous system.');
    });

    it('shows why the picture differs from the selection', () => {
        render(<BondsPanel bonds={he2} data={{ ...empty, scan: heScan, meta: heMeta }} note="3σu* is not among the orbitals kept at this geometry; showing the total density." {...handlers} />);
        expect(screen.getByText(/3σu\* is not among the orbitals kept/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/bonds/use_bonds_data.test.tsx tests/bonds/bonds_panel.test.tsx`
Expected: FAIL, "Cannot find module '../../src/bonds/useBondsData'".

- [ ] **Step 3: Implement**

```ts
// src/bonds/useBondsData.ts
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setScanPoint } from '../store/bondsSlice';
import { loadBasis, loadMoleculeMeta, loadScan } from '../molecules/loader';
import { MoleculeBasis, MoleculeMeta, MoleculeScan } from '../molecules/types';
import { DiatomicId, nearestScanIndex, pointId } from './systems';

export interface BondsData {
    scan: MoleculeScan | null;
    meta: MoleculeMeta | null;
    basis: MoleculeBasis | null;
    loading: boolean;
    error: string | null;
}

const NOTHING: BondsData = { scan: null, meta: null, basis: null, loading: false, error: null };
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * What the Bonds selection needs from public/molecules, fetched lazily. Also
 * snaps R to the scan once it is known: to the equilibrium point for a fresh
 * molecule, to the nearest point for an R that came from a URL.
 */
export function useBondsData(): BondsData {
    const dispatch = useAppDispatch();
    const { system, R, scanIndex } = useAppSelector(state => state.bonds);
    const [scan, setScan] = useState<MoleculeScan | null>(null);
    const [point, setPoint] = useState<{ meta: MoleculeMeta; basis: MoleculeBasis } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setScan(null);
        setPoint(null);
        setError(null);
        if (system === 'h2plus') return;
        let live = true;
        loadScan(system).then(s => { if (live) setScan(s); }, e => { if (live) setError(message(e)); });
        return () => { live = false; };
    }, [system]);

    useEffect(() => {
        if (!scan || scanIndex !== null || system === 'h2plus') return;
        const index = R === null ? scan.equilibriumIndex : nearestScanIndex(scan.points, R);
        dispatch(setScanPoint({ index, RBohr: scan.points[index].RBohr }));
    }, [scan, scanIndex, R, system, dispatch]);

    useEffect(() => {
        if (system === 'h2plus' || scanIndex === null) return;
        const id = pointId(system as DiatomicId, scanIndex);
        let live = true;
        Promise.all([loadMoleculeMeta(id), loadBasis(id)])
            .then(([meta, basis]) => { if (live) setPoint({ meta, basis }); }, e => { if (live) setError(message(e)); });
        return () => { live = false; };
    }, [system, scanIndex]);

    if (system === 'h2plus') return NOTHING;
    const current = point && scanIndex !== null && point.basis.id === pointId(system as DiatomicId, scanIndex) ? point : null;
    return { scan, meta: current?.meta ?? null, basis: current?.basis ?? null, loading: !error && !current, error };
}
```

```ts
// src/bonds/captions.ts
import { MoleculeScan } from '../molecules/types';
import { BondsSystemId } from './systems';

/** Spec §3.1 and §3.3: the method behind every number and picture in the Bonds panel. */
export function bondsCaptions(system: BondsSystemId, scan: MoleculeScan | null): string[] {
    if (system === 'h2plus') {
        return [
            'Exact within Born–Oppenheimer: the separated spheroidal equations are solved to 10⁻¹⁰ Ha, with no basis set.',
            'E = E_el + 1/R. One electron, so its orbital energy is the exact electronic energy.',
            '1σu* has no minimum between 0.5 and 10 a₀; its only well, 0.06 mHa deep at 12.5 a₀, is a polarisation effect outside this range.',
        ];
    }
    if (!scan) return [];
    const captions = [
        `Energies: ${scan.energyMethod}.`,
        `Orbitals and density: ${scan.densityMethod} — Kohn–Sham orbitals are a model, and their energies are not ionisation energies.`,
        `Precomputed at ${scan.points.length} bond lengths; the slider snaps to them.`,
    ];
    if (scan.spin > 0) captions.push('Unrestricted Kohn–Sham: α and β orbitals differ; levels are drawn at α energies.');
    if (!scan.fit.bound) captions.push(`No chemical bond: the deepest point is ${(scan.fit.wellDepthHartree * 1000).toFixed(2)} mHa below the longest distance scanned.`);
    if (scan.note) captions.push(scan.note);
    return captions;
}
```

```tsx
// src/components/BondsPanel.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FormControl, InputLabel, LinearProgress, MenuItem, Select, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { BondsState, BondsView } from '../store/bondsSlice';
import { BondsData } from '../bonds/useBondsData';
import { BONDS_SYSTEMS, BOHR_TO_ANGSTROM, BondsSystemId, DENSITY_ISO_VALUES, systemFormula } from '../bonds/systems';
import { H2PLUS_R_RANGE, h2plusTotalEnergy } from '../bonds/h2plus';
import { bondsCaptions } from '../bonds/captions';
import { bondOrderText, h2plusOrbitals } from '../bonds/mo_diagram';
import MoDiagram from './MoDiagram';

interface BondsPanelProps {
    bonds: BondsState;
    data: BondsData;
    /** Why the drawn picture differs from the selection, if it does. */
    note: string | null;
    onSelectSystem: (id: BondsSystemId) => void;
    onCommitH2PlusR: (R: number) => void;
    onScanIndex: (index: number) => void;
    onView: (view: BondsView) => void;
    onDensityIso: (value: number) => void;
}

const lengths = (R: number) => `R = ${R.toFixed(2)} a₀ (${(R * BOHR_TO_ANGSTROM).toFixed(3)} Å)`;

/** Bonds mode's navigation: system, geometry, what to draw, the diagram, and every method. */
const BondsPanel: React.FC<BondsPanelProps> = ({ bonds, data, note, onSelectSystem, onCommitH2PlusR, onScanIndex, onView, onDensityIso }) => {
    const isExact = bonds.system === 'h2plus';
    // The slider moves freely while dragged; the (heavier) redraw waits for release.
    const [draftR, setDraftR] = useState(bonds.R ?? 2);
    useEffect(() => { if (bonds.R !== null) setDraftR(bonds.R); }, [bonds.R]);

    const orbitals = useMemo(
        () => (isExact ? h2plusOrbitals(bonds.R ?? 2) : data.meta?.orbitals ?? null),
        [isExact, bonds.R, data.meta],
    );
    /** The diagram reports an orbital index; the store keeps label, spin and component (see BondsView). */
    const viewForIndex = (index: number): BondsView => {
        if (isExact) return { kind: 'h2plus', state: index === 0 ? '1sigma_g' : '1sigma_u' };
        const orbital = orbitals!.find(o => o.index === index)!;
        const spin = orbital.spin ?? 'restricted';
        const siblings = orbitals!.filter(o => o.label === orbital.label && (o.spin ?? 'restricted') === spin);
        return { kind: 'mo', label: orbital.label, spin, component: siblings.findIndex(o => o.index === index) };
    };
    // A local const, so the narrowing below survives into the filter callback.
    const view = bonds.view;
    const selectedIndex = view.kind === 'h2plus' ? (view.state === '1sigma_g' ? 0 : 1)
        : view.kind === 'mo' && orbitals
            ? orbitals.filter(o => o.label === view.label && (o.spin ?? 'restricted') === view.spin)[view.component]?.index ?? null
            : null;
    const formula = systemFormula(bonds.system);
    const energy = isExact
        ? `E = ${h2plusTotalEnergy(bonds.R ?? 2, bonds.view.kind === 'h2plus' ? bonds.view.state : '1sigma_g').toFixed(5).replace('-', '−')} Ha (exact)`
        : data.meta ? `E = ${data.meta.totalEnergyHartree.toFixed(5).replace('-', '−')} Ha, ${data.meta.method.energies}` : null;
    const footer = isExact ? `${bondOrderText(0.5)}. One electron, exact energies.` : `${bondOrderText(data.meta?.bondOrder)}.`;

    return (
        <div className="bonds-panel">
            <FormControl fullWidth size="small" margin="dense">
                <InputLabel id="bonds-system-label">System</InputLabel>
                <Select labelId="bonds-system-label" label="System" value={bonds.system}
                    onChange={event => onSelectSystem(event.target.value as BondsSystemId)}>
                    {BONDS_SYSTEMS.map(s => <MenuItem key={s.id} value={s.id}>{s.formula} — {s.name}</MenuItem>)}
                </Select>
            </FormControl>

            {data.error && (
                <Alert severity="error" role="alert">
                    {`${formula} could not be loaded: ${data.error}. The view still shows the previous system.`}
                </Alert>
            )}
            {data.loading && <LinearProgress aria-label={`loading ${formula}`} />}

            <Typography variant="body2" id="bonds-r-label">{lengths(isExact ? draftR : bonds.R ?? 0)}</Typography>
            {isExact ? (
                <Slider aria-labelledby="bonds-r-label" size="small" min={H2PLUS_R_RANGE.min} max={H2PLUS_R_RANGE.max} step={0.01}
                    value={draftR} onChange={(_, v) => setDraftR(v as number)} onChangeCommitted={(_, v) => onCommitH2PlusR(v as number)} />
            ) : data.scan && bonds.scanIndex !== null && (
                <Slider aria-labelledby="bonds-r-label" size="small" step={null}
                    min={data.scan.points[0].RBohr} max={data.scan.points[data.scan.points.length - 1].RBohr}
                    marks={data.scan.points.map(p => ({ value: p.RBohr }))} value={data.scan.points[bonds.scanIndex].RBohr}
                    onChangeCommitted={(_, v) => onScanIndex(data.scan!.points.findIndex(p => p.RBohr === v))} />
            )}
            {energy && <Typography variant="body2" className="bonds-energy">{energy}</Typography>}

            {isExact ? (
                <ToggleButtonGroup exclusive size="small" fullWidth value={bonds.view.kind === 'h2plus' ? bonds.view.state : null}
                    onChange={(_, state) => state && onView({ kind: 'h2plus', state })}>
                    <ToggleButton value="1sigma_g" aria-label="1σg (bonding)">1σg bonding</ToggleButton>
                    <ToggleButton value="1sigma_u" aria-label="1σu* (antibonding)">1σu* antibonding</ToggleButton>
                </ToggleButtonGroup>
            ) : (
                <>
                    <ToggleButton size="small" fullWidth value="density" selected={bonds.view.kind === 'density'}
                        onChange={() => onView({ kind: 'density' })}>Total density</ToggleButton>
                    {bonds.view.kind === 'density' && (
                        <ToggleButtonGroup exclusive size="small" fullWidth value={bonds.densityIso}
                            onChange={(_, v) => v !== null && onDensityIso(v)}>
                            {DENSITY_ISO_VALUES.map(v => <ToggleButton key={v} value={v} aria-label={`ρ = ${v}`}>ρ = {v}</ToggleButton>)}
                        </ToggleButtonGroup>
                    )}
                </>
            )}
            {note && <Typography variant="caption" className="bonds-note">{note}</Typography>}

            {orbitals && (
                <MoDiagram orbitals={orbitals} selectedIndex={selectedIndex} footer={footer}
                    onSelect={index => onView(viewForIndex(index))} />
            )}

            <ul className="bonds-captions">
                {bondsCaptions(bonds.system, data.scan).map(caption => <li key={caption}>{caption}</li>)}
            </ul>
        </div>
    );
};

export default BondsPanel;
```

Append to `src/style.css`:

```css
.bonds-panel { display: flex; flex-direction: column; gap: 8px; color: #d8dee4; }
.bonds-captions { margin: 0; padding-left: 16px; color: #9aa4ad; font-size: 11px; }
.bonds-note { color: #ffcc80; }
.bonds-header { font-size: 14px; color: #d8dee4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/bonds && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/bonds/useBondsData.ts src/bonds/captions.ts src/components/BondsPanel.tsx src/style.css tests/bonds
git commit -m "feat(bonds): Bonds panel -- system, R, orbital choice, diagram and method captions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Wire Bonds mode into the app

**Files:**
- Modify: `src/components/Controls.tsx`, `src/App.tsx`
- Test: `src/components/Controls.test.tsx` (append), `src/App.test.tsx` (append)

**Interfaces:**
- Consumes: everything above; Phase 1's `startFieldCalculation`, `currentField`, OrbitalViewer field effect (it draws `currentField` whenever `atomMode !== 'atom'`, which includes Bonds — no OrbitalViewer change is needed).
- Produces: the Bonds mode UI. `Controls` gains prop `fractionNote?: string` (when set, the Electron-enclosed select is disabled and the note is its helper text).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/Controls.test.tsx` (inside its top-level `describe`, reusing its `baseProps`):

```tsx
    describe('Bonds mode', () => {
        it('offers Bonds in the mode switch', () => {
            const onModeChange = jest.fn();
            render(<Controls {...baseProps} mode="hydrogenic" onModeChange={onModeChange} />);
            fireEvent.click(screen.getByRole('button', { name: 'bonds mode' }));
            expect(onModeChange).toHaveBeenCalledWith('bonds');
        });

        it('has no n/l/mL, no element, no Update Orbital, and says why the fraction is fixed', () => {
            render(<Controls {...baseProps} mode="bonds" fractionNote="the density is drawn at a fixed ρ" />);
            expect(screen.queryByLabelText('Principal (n)')).toBeNull();
            expect(screen.queryByRole('button', { name: 'Update Orbital' })).toBeNull();
            expect(screen.queryByText(/One electron, Z = 1/)).toBeNull();
            expect(screen.getByText('the density is drawn at a fixed ρ')).toBeInTheDocument();
        });
    });
```

Append to `src/App.test.tsx`, beside the other `jest.mock` calls at the top:

```tsx
jest.mock('./workers/createH2PlusCurveWorker', () => ({
    createH2PlusCurveWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null })),
}));
```

and inside the main `describe`, using the file's existing store/render helper (the one the Basic Orbitals mode tests use; call it `renderApp` below):

```tsx
    describe('Bonds mode', () => {
        it('draws exact H2+ and shows the Bonds panel beside the curve', () => {
            const { store } = renderApp();
            fireEvent.click(screen.getByRole('button', { name: 'bonds mode' }));
            expect(store.getState().orbital.currentField?.sources[0].recipe).toEqual({ type: 'h2plus', R: 2, state: '1sigma_g' });
            expect(screen.getByText(/Exact within Born–Oppenheimer/)).toBeInTheDocument();
            expect(screen.getByLabelText('molecular orbital energy diagram')).toBeInTheDocument();
        });

        // Review Focus 1.
        it('Bonds and back restores the Basic Orbitals request', () => {
            const { store } = renderApp();
            fireEvent.click(screen.getByRole('button', { name: 'basic orbitals mode' }));
            const basic = store.getState().orbital.currentParams;
            fireEvent.click(screen.getByRole('button', { name: 'bonds mode' }));
            expect(store.getState().orbital.currentParams).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'basic orbitals mode' }));
            expect(store.getState().orbital.currentField).toBeNull();
            expect(store.getState().orbital.currentParams).toEqual(basic);
        });
    });
```

(If `App.test.tsx` builds its store inline rather than through a helper, add `bonds: bondsReducer` — `import bondsReducer from './store/bondsSlice';` — to that `configureStore` call and render the same way its Basic Orbitals tests do.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/components/Controls.test.tsx src/App.test.tsx -t "Bonds"`
Expected: FAIL, "Unable to find an accessible element with the role "button" and name "bonds mode"".

- [ ] **Step 3: Implement `Controls.tsx`**

1. Props: add `/** When set, the enclosed fraction does not apply to what is drawn; this says why. */ fractionNote?: string;` and destructure it.
2. After `const isAtomMode = mode === 'atom';` add `const isBasicMode = mode === 'hydrogenic';`.
3. In the mode `ToggleButtonGroup`, after the Basic Orbitals button: `<ToggleButton value="bonds" aria-label="bonds mode">Bonds</ToggleButton>`.
4. Change the n/l/mₗ block guard `{!isAtomMode && (` to `{isBasicMode && (`; change the Update Orbital guard `{!isAtomMode && (` to `{isBasicMode && (`; change the element-picker ternary `{isAtomMode ? (showElementPicker && ( … )) : ( <FormHelperText className="basic-orbitals-note"> … )}` so its else branch renders only `isBasicMode && (…)`. Phase 1's combination controls live inside the Basic Orbitals block, so they follow it.
5. Electron-enclosed `Select`: add `disabled={Boolean(fractionNote)}`, and make the first branch of its `FormHelperText` `fractionNote ? fractionNote : …existing expression…`.

- [ ] **Step 4: Implement `App.tsx`**

1. Imports:

```ts
import BondsPanel from './components/BondsPanel';
import PotentialCurvePlot, { CurveSeries } from './components/PotentialCurvePlot';
import { useBondsData } from './bonds/useBondsData';
import { useH2PlusCurve } from './bonds/useH2PlusCurve';
import { bondsFieldRequest } from './bonds/bonds_request';
import { BOHR_TO_ANGSTROM, HARTREE_TO_EV, systemFormula, BondsSystemId } from './bonds/systems';
import { H2PLUS_LABELS, H2PLUS_R_RANGE } from './bonds/h2plus';
import { selectBondsSystem, setH2PlusR, setScanPoint, setBondsView, setDensityIso, BondsView } from './store/bondsSlice';
import { DENSITY_SURFACE_HEX } from './bonds/bonds_request';
```

and add `startFieldCalculation`, `failOrbitalCalculation` to the `./store/orbitalSlice` import if not already there.

2. Beside `const isAtomMode = atomMode === 'atom';`:

```ts
    const isBasicMode = atomMode === 'hydrogenic';
    const isBondsMode = atomMode === 'bonds';
```

3. `handleModeChange`'s parameter type becomes `ViewMode` (import it from `./store/atomSlice`).
4. Basic Orbitals' render effects must stay silent in Bonds mode and fire again on the way back. Find every effect that dispatches a Basic Orbitals render: `grep -n "basicOrbitalParams(\|fieldRequestFor(" src/App.tsx`. In each, an early return on `isAtomMode` becomes `if (!isBasicMode) return;` (keep any other condition in it, e.g. `|| combination.kind !== 'none'`), and a dependency list that holds `isAtomMode` holds `atomMode` instead. After Phase 2 the plain-orbital effect is keyed on `basicRenderNonce`, which `setMode('hydrogenic')` bumps, so there only the guard changes; the combination effect (Phase 1) needs both changes, or an enclosed-fraction change in Bonds mode would draw a hybrid.
5. The Bonds render, after those effects:

```ts
    // Bonds mode (spec §5 Phase 5). The selection is in bondsSlice; the data
    // for it loads lazily (useBondsData), and each complete selection becomes
    // one field request -- the same path Basic Orbitals' combinations take.
    const bonds = useAppSelector(state => state.bonds);
    const bondsData = useBondsData();
    const h2plusCurve = useH2PlusCurve();
    const bondsRender = useMemo(
        () => (isBondsMode ? bondsFieldRequest(bonds, bondsData.basis, enclosedFraction) : null),
        [isBondsMode, bonds, bondsData.basis, enclosedFraction],
    );
    useEffect(() => {
        if (bondsRender) dispatch(startFieldCalculation(bondsRender.request));
    }, [bondsRender, dispatch]);
    useEffect(() => {
        if (isBondsMode && bondsData.error) dispatch(failOrbitalCalculation(bondsData.error));
    }, [isBondsMode, bondsData.error, dispatch]);
    const isBondsDensity = isBondsMode && bondsRender?.request.densityIsoValue !== undefined;
```

6. Legends: `showPhaseLegend` gains `&& !isBondsDensity` and, where Phase 1 wrote `(!isAtomMode || atomLevel === 'orbital')`, keep it (Bonds is not atom mode, so orbitals show ψ colours). After the phase legend:

```tsx
                {isBondsDensity && (
                    <div className="phase-legend" aria-label="surface colour key">
                        <span className="phase-legend-item">
                            <span className="phase-legend-swatch" style={{ background: DENSITY_SURFACE_HEX }} />
                            ρ = {bonds.densityIso} e/a₀³, total electron density
                        </span>
                    </div>
                )}
```

7. The panel and the plot:

```tsx
    const bondsPanel = (
        <BondsPanel
            bonds={bonds}
            data={bondsData}
            note={bondsRender?.note ?? null}
            onSelectSystem={(id: BondsSystemId) => dispatch(selectBondsSystem(id))}
            onCommitH2PlusR={(R: number) => dispatch(setH2PlusR(R))}
            onScanIndex={(index: number) => bondsData.scan && index >= 0
                && dispatch(setScanPoint({ index, RBohr: bondsData.scan.points[index].RBohr }))}
            onView={(view: BondsView) => dispatch(setBondsView(view))}
            onDensityIso={(value: number) => dispatch(setDensityIso(value))}
        />
    );

    const renderBondsPlot = (width: number) => {
        if (bonds.system === 'h2plus') {
            if (!h2plusCurve) return null;
            const points = (E: number[]) => h2plusCurve.R.map((R, i) => ({ R, E: E[i] }));
            const series: CurveSeries[] = [
                { key: 'g', label: H2PLUS_LABELS['1sigma_g'], color: CURVE_COLORS[0], points: points(h2plusCurve.sigmaG) },
                { key: 'u', label: H2PLUS_LABELS['1sigma_u'], color: CURVE_COLORS[1], points: points(h2plusCurve.sigmaU) },
                { key: 'limit', label: 'H + H⁺', color: '#9aa4ad', points: [{ R: H2PLUS_R_RANGE.min, E: -0.5 }, { R: H2PLUS_R_RANGE.max, E: -0.5 }] },
            ];
            return (
                <PotentialCurvePlot title="E = E_el + 1/R" unit="Ha" series={series} width={width}
                    xRange={[H2PLUS_R_RANGE.min, H2PLUS_R_RANGE.max]} yRange={[-0.65, -0.2]} markerR={bonds.R}
                    referenceR={{ R: h2plusCurve.equilibrium.R, label: `R_e = ${h2plusCurve.equilibrium.R.toFixed(3)} a₀` }}
                    caption={`Exact (Born–Oppenheimer). R_e = ${h2plusCurve.equilibrium.R.toFixed(3)} a₀, E = ${h2plusCurve.equilibrium.totalEnergy.toFixed(4)} Ha; grey line: H + H⁺ at −0.5 Ha.`}
                    onSelectR={R => dispatch(setH2PlusR(R))} />
            );
        }
        const scan = bondsData.scan;
        if (!scan) return null;
        const eMin = Math.min(...scan.points.map(p => p.energyHartree));
        const series: CurveSeries[] = [{ key: 'e', label: systemFormula(bonds.system), color: CURVE_COLORS[0],
            points: scan.points.map(p => ({ R: p.RBohr, E: (p.energyHartree - eMin) * HARTREE_TO_EV })) }];
        const yMax = Math.min(10, Math.max(...series[0].points.map(p => p.E)));
        const fitted = scan.fit.bound && scan.fit.ReBohr !== null
            ? `R_e (fit) = ${scan.fit.ReBohr.toFixed(3)} a₀ = ${(scan.fit.ReBohr * BOHR_TO_ANGSTROM).toFixed(3)} Å${scan.reference.ReAngstrom ? `; experiment ${scan.reference.ReAngstrom} Å` : ''}.`
            : 'No chemical bond at this level of theory.';
        return (
            <PotentialCurvePlot title="E − E_min" unit="eV" series={series} width={width}
                xRange={[scan.points[0].RBohr, scan.points[scan.points.length - 1].RBohr]} yRange={[-0.05 * yMax, yMax]}
                markerR={bonds.R} snapRs={scan.points.map(p => p.RBohr)}
                referenceR={scan.fit.bound && scan.fit.ReBohr !== null ? { R: scan.fit.ReBohr, label: 'fitted R_e' } : null}
                caption={`${scan.energyMethod}. ${fitted}`}
                onSelectR={R => {
                    const index = scan.points.reduce((best, p, i) => Math.abs(p.RBohr - R) < Math.abs(scan.points[best].RBohr - R) ? i : best, 0);
                    dispatch(setScanPoint({ index, RBohr: scan.points[index].RBohr }));
                }} />
        );
    };
```

`renderRadialPlot` starts with `if (isBondsMode) return renderBondsPlot(width);`.

8. Layout. Desktop `.side-panel`: `{isAtomMode && (<LevelNav …/>)}` becomes `{isAtomMode && (<LevelNav …/>)}{isBondsMode && bondsPanel}`. Phone: the header block gains

```tsx
                        {isBondsMode && (
                            <div className="phone-header">
                                <span className="bonds-header">
                                    {systemFormula(bonds.system)} · {bonds.R !== null ? `R = ${bonds.R.toFixed(2)} a₀` : 'loading…'}
                                </span>
                            </div>
                        )}
```

and `phoneTabs` becomes a three-way choice, with Bonds first:

```tsx
    const phoneTabs = isBondsMode
        ? [
            { key: 'explore', label: 'Explore', content: bondsPanel },
            { key: 'view', label: 'View', content: controls },
            { key: 'plot', label: 'Plot', content: renderRadialPlot(PHONE_PLOT_WIDTH, false) },
        ]
        : isAtomMode ? [ /* existing atom tabs */ ] : [ /* existing Basic Orbitals tabs */ ];
```

9. `<Controls …>` gains `fractionNote={isBondsDensity ? 'The density is drawn at a fixed ρ (Bonds panel), not at an enclosed fraction.' : undefined}`.

10. Busy label: Phase 1's non-atom branch already reads `renderedField.label` ("Computing N₂ 3σg at R = 2.07 a₀…"); nothing to add.

- [ ] **Step 5: Run to verify it passes, and nothing else moved**

Run: `npx jest src tests/bonds && npx tsc --noEmit -p .`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Verify live**

Open http://localhost:5391 in the browser tool (Playwright or Chrome DevTools MCP), clear the console, and check at **1440×900**:
1. Mode switch (right `.view-panel`) shows Atom / Basic Orbitals / Bonds on one row. Click **Bonds**: the left `.side-panel` shows the Bonds panel (System = H₂⁺), the right shows the controls and the potential curve with two curves, the marker at 2.00 and the R_e line near 1.997. The canvas shows the 1σg surface in one colour (ψ > 0) spanning both nuclei, vertical (z up).
2. Click **1σu\* antibonding**: two lobes, red on top, blue below, a node across the middle. Cut along z at 50 % shows the empty midplane.
3. Drag the R slider to 6 and release: one redraw (not one per pixel); the marker moves; the canvas's busy label reads "Computing H₂⁺ 1σu* at R = 6.00 a₀…" if it takes over 0.4 s. The console logs the render time (`drawn in N ms`) under 1500.
4. Pick **N₂**: the slider now has 20 marks and snaps; the density surface is grey with the "ρ = 0.002 e/a₀³" legend; the diagram shows 1σg/1σu* in the core band, 1πu ↑↓↑↓, 3σg ↑↓ and empty 1πg*, and "Bond order 3". The Electron-enclosed select is disabled with its note. Click a 1πg* box: a π* orbital with four lobes; drag R to the last mark: still 1πg*.
5. Pick **O₂**: 1πg* shows ↑ ↑ with no ↓; "Bond order 2"; captions mention unrestricted Kohn–Sham and the triplet.
6. Pick **He₂**: "Bond order 0 — no bond"; the curve rises to the left with no well; the caption says no chemical bond.
7. Switch to **Basic Orbitals**, then **Atom**, then **Bonds**: each mode shows its own picture; no stale surface survives a switch.
8. Network tab: nothing under `/molecules/` was requested until step 4; `n2/scan.json`, `n2/scan/07/meta.json` and `basis.json` then load once each.

Then at **390×844** (touch emulation): the `.phone-header` reads "N₂ · R = 2.07 a₀"; the sheet has Explore / View / Plot; Explore holds the Bonds panel with the diagram fully visible when scrolled; Plot holds the curve at the sheet's width; the canvas stays usable with the sheet folded. Record any console error; there should be none.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/Controls.tsx src/components/Controls.test.tsx
git commit -m "feat(bonds): Bonds mode -- third mode with exact H2+ and precomputed diatomics

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: URL keys and validation rows

**Files:**
- Create: `src/bonds/bonds_url.ts`, `src/validation/phase5.ts`
- Modify: `src/validation/references.ts`, `src/main.tsx`
- Test: `tests/bonds/bonds_url.test.ts`, `tests/validation/phase5.test.ts`

**Interfaces:**
- Consumes: Phase 2 `registerUrlKeys`; Task 8 `restoreBonds`; Task 1 `h2plusEquilibrium`, `h2plusElectronicEnergy`; Task 5 `phase5_diatomics.json`.
- Produces: `encodeBondsUrl(state: RootState): Record<string, string>`, `decodeBondsUrl(params: URLSearchParams, dispatch: AppDispatch): void`, `registerBondsUrlKeys(): void`; `PHASE_5_ROWS: ValidationRow[]`. Keys — exactly these three, the ones Phase 7's lessons write (`#mode=bonds&system=<id>&R=<bohr>&state=<id>`): `system` (`h2plus` or a diatomic id), `R` (bohr, 3 dp), `state` (`1sigma_g` | `1sigma_u` | `density` | `density:<ρ>` | `mo:<spin>:<label>:<component>`; the density contour rides inside `state` so no fourth key is needed).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/bonds/bonds_url.test.ts
import { configureStore } from '@reduxjs/toolkit';
jest.mock('../../src/url_state', () => ({ registerUrlKeys: jest.fn() }));
import { registerUrlKeys } from '../../src/url_state';
import atomReducer from '../../src/store/atomSlice';
import orbitalReducer from '../../src/store/orbitalSlice';
import bondsReducer, { selectBondsSystem, setScanPoint, setBondsView, setH2PlusR } from '../../src/store/bondsSlice';
import { encodeBondsUrl, decodeBondsUrl, registerBondsUrlKeys } from '../../src/bonds/bonds_url';
import type { RootState } from '../../src/store';

const makeStore = () => configureStore({ reducer: { atom: atomReducer, orbital: orbitalReducer, bonds: bondsReducer } });

function roundTrip(prepare: (s: ReturnType<typeof makeStore>) => void) {
    const from = makeStore();
    prepare(from);
    const to = makeStore();
    decodeBondsUrl(new URLSearchParams(encodeBondsUrl(from.getState() as RootState)), to.dispatch);
    return { from: from.getState().bonds, to: to.getState().bonds };
}

describe('Bonds URL keys', () => {
    it('registers under mode "bonds"', () => {
        registerBondsUrlKeys();
        expect(registerUrlKeys).toHaveBeenCalledWith('bonds', encodeBondsUrl, decodeBondsUrl);
    });

    it('round-trips H2+ at any R and state', () => {
        const { from, to } = roundTrip(s => { s.dispatch(setH2PlusR(3.456)); s.dispatch(setBondsView({ kind: 'h2plus', state: '1sigma_u' })); });
        expect(to).toEqual(from);
    });

    it('round-trips a molecule orbital, leaving R for the scan to snap', () => {
        const { to } = roundTrip(s => {
            s.dispatch(selectBondsSystem('o2'));
            s.dispatch(setScanPoint({ index: 9, RBohr: 2.3265 }));
            s.dispatch(setBondsView({ kind: 'mo', label: '1πg*', spin: 'alpha', component: 1 }));
        });
        expect(to).toMatchObject({ system: 'o2', R: 2.327, scanIndex: null, view: { kind: 'mo', label: '1πg*', spin: 'alpha', component: 1 } });
    });

    // Review Focus 4.
    it.each([
        ['system=xx&R=2', 'h2plus', 2],
        ['system=h2plus&R=0.01', 'h2plus', 0.5],
        ['system=h2plus&R=1e6', 'h2plus', 10],
        ['system=h2plus&R=abc', 'h2plus', 2],
    ])('never throws on %s', (hash, system, R) => {
        const store = makeStore();
        expect(() => decodeBondsUrl(new URLSearchParams(hash), store.dispatch)).not.toThrow();
        expect(store.getState().bonds).toMatchObject({ system, R });
    });

    it('ignores a malformed state', () => {
        const store = makeStore();
        decodeBondsUrl(new URLSearchParams('system=n2&state=mo:garbage'), store.dispatch);
        expect(store.getState().bonds).toMatchObject({ system: 'n2', view: { kind: 'density' }, densityIso: 0.002 });
        decodeBondsUrl(new URLSearchParams('system=n2&state=density:7'), store.dispatch);
        expect(store.getState().bonds.densityIso).toBe(0.002);
    });

    it('uses exactly the keys Phase 7 lessons write', () => {
        const store = makeStore();
        store.dispatch(selectBondsSystem('n2'));
        store.dispatch(setScanPoint({ index: 7, RBohr: 2.0743 }));
        expect(encodeBondsUrl(store.getState() as RootState)).toEqual({ system: 'n2', R: '2.074', state: 'density:0.002' });
        const lesson = makeStore();
        decodeBondsUrl(new URLSearchParams('system=h2plus&R=2&state=1sigma_u'), lesson.dispatch);
        expect(lesson.getState().bonds).toMatchObject({ system: 'h2plus', R: 2, view: { kind: 'h2plus', state: '1sigma_u' } });
        expect(lesson.getState().atom.mode).toBe('bonds');
    });
});
```

```ts
// tests/validation/phase5.test.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { PHASE_5_ROWS } from '../../src/validation/phase5';
import { VALIDATION, relativeErrorPercent } from '../../src/validation/references';

describe('phase 5 validation rows', () => {
    it('are in the shared table, each within its tolerance', () => {
        const names = PHASE_5_ROWS.map(row => `${row.system} ${row.quantity}`);
        expect(names).toEqual(expect.arrayContaining([
            'H₂⁺ E_el(1σg, R = 2 a₀)', 'H₂⁺ R_e', 'H₂⁺ E(R_e)', 'H₂ R_e', 'H₂ D_e',
            'N₂ R_e', 'O₂ R_e', 'F₂ R_e', 'CO R_e', 'HF R_e',
        ]));
        for (const row of PHASE_5_ROWS) {
            expect(VALIDATION).toContain(row);
            expect(relativeErrorPercent(row)).toBeLessThanOrEqual(row.tolerancePercent);
        }
    });

    it('carry the scans\' own numbers, not typed ones', () => {
        const scan = JSON.parse(readFileSync(join(__dirname, '../../public/molecules/n2/scan.json'), 'utf8'));
        const row = PHASE_5_ROWS.find(r => r.system === 'N₂')!;
        expect(row.app).toBeCloseTo(scan.fit.ReBohr * 0.529177210903, 10);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/bonds/bonds_url.test.ts tests/validation/phase5.test.ts`
Expected: FAIL, "Cannot find module '../../src/bonds/bonds_url'".

- [ ] **Step 3: Implement**

```ts
// src/bonds/bonds_url.ts
import { registerUrlKeys } from '../url_state';
import type { AppDispatch, RootState } from '../store';
import { setMode } from '../store/atomSlice';
import { BondsView, restoreBonds } from '../store/bondsSlice';
import { OrbitalSpin } from '../molecules/types';
import { isBondsSystemId } from './systems';

/**
 * Bonds mode in the URL (spec §4.3): `system`, `R` (bohr) and `state` --
 * exactly the keys Phase 7's lessons write, e.g.
 * `#mode=bonds&system=h2plus&R=2&state=1sigma_u`. The density's contour
 * rides inside `state` (`density:0.05`) rather than adding a fourth key.
 */
const MO_LABEL = /^\d+[σπδ][gu]?\*?$/;
const SPINS: readonly OrbitalSpin[] = ['restricted', 'alpha', 'beta'];

function stateToken(view: BondsView, densityIso: number): string {
    if (view.kind === 'h2plus') return view.state;
    if (view.kind === 'density') return `density:${densityIso}`;
    return `mo:${view.spin}:${view.label}:${view.component}`;
}

function parseState(token: string | null): { view?: BondsView; densityIso?: number } {
    if (token === '1sigma_g' || token === '1sigma_u') return { view: { kind: 'h2plus', state: token } };
    if (token === 'density') return { view: { kind: 'density' } };
    const parts = token?.split(':') ?? [];
    if (parts.length === 2 && parts[0] === 'density') {
        const iso = Number(parts[1]);
        return { view: { kind: 'density' }, densityIso: Number.isFinite(iso) ? iso : undefined };
    }
    if (parts.length !== 4 || parts[0] !== 'mo') return {};
    const [, spin, label, component] = parts;
    if (!SPINS.includes(spin as OrbitalSpin) || !MO_LABEL.test(label) || !/^[01]$/.test(component)) return {};
    return { view: { kind: 'mo', spin: spin as OrbitalSpin, label, component: Number(component) } };
}

export function encodeBondsUrl(state: RootState): Record<string, string> {
    const { system, R, view, densityIso } = state.bonds;
    const keys: Record<string, string> = { system, state: stateToken(view, densityIso) };
    if (R !== null) keys.R = R.toFixed(3);
    return keys;
}

/** Unknown or invalid keys are ignored (spec §4.3); the slice clamps R and checks every view. */
export function decodeBondsUrl(params: URLSearchParams, dispatch: AppDispatch): void {
    const system = params.get('system');
    if (!isBondsSystemId(system)) return;
    const R = Number(params.get('R') ?? Number.NaN);
    const { view, densityIso } = parseState(params.get('state'));
    dispatch(setMode('bonds'));
    dispatch(restoreBonds({ system, R: Number.isFinite(R) && R > 0 ? R : null, view, densityIso }));
}

export function registerBondsUrlKeys(): void {
    registerUrlKeys('bonds', encodeBondsUrl, decodeBondsUrl);
}
```

A `system=xx` URL never reaches the slice, which is why that case keeps H₂⁺ at 2; an invalid `density:<ρ>` keeps the current contour because `restoreBonds` accepts only the offered values.

In `src/main.tsx`, Phase 2 calls `bindUrlStateStore(store); registerBuiltInUrlKeys(); applyState(window.location.hash);` before the first render. Add `import { registerBondsUrlKeys } from './bonds/bonds_url';` and call `registerBondsUrlKeys();` directly after `registerBuiltInUrlKeys();`, so a Bonds link is decodable by the time `applyState` runs.

```ts
// src/validation/phase5.ts
import type { ValidationRow } from './references';
import { h2plusElectronicEnergy, h2plusEquilibrium } from '../bonds/h2plus';
import diatomics from './generated/phase5_diatomics.json';

/**
 * Bonds mode. H₂⁺'s `app` values are computed here by the solver the app
 * draws with (~0.1 s at import); the diatomics' come from
 * tools/molecules/generate.py, which wrote them from the committed scans.
 */
const H2PLUS_METHOD = 'exact (Born–Oppenheimer), prolate spheroidal separation';
const WIND = 'Wind, J. Chem. Phys. 42, 2371 (1965)';
const equilibrium = h2plusEquilibrium();

export const PHASE_5_ROWS: ValidationRow[] = [
    { phase: 5, quantity: 'E_el(1σg, R = 2 a₀)', system: 'H₂⁺', app: h2plusElectronicEnergy(2, '1sigma_g'), reference: -1.1026342145, unit: 'Ha', tolerancePercent: 1e-6, referenceSource: 'Bates, Ledsham & Stewart, Phil. Trans. R. Soc. A 246, 215 (1953)', method: H2PLUS_METHOD },
    { phase: 5, quantity: 'R_e', system: 'H₂⁺', app: equilibrium.R, reference: 1.997, unit: 'a0', tolerancePercent: 0.5, referenceSource: WIND, method: H2PLUS_METHOD },
    { phase: 5, quantity: 'E(R_e)', system: 'H₂⁺', app: equilibrium.totalEnergy, reference: -0.6026, unit: 'Ha', tolerancePercent: 0.1, referenceSource: WIND, method: H2PLUS_METHOD },
    ...(diatomics as Array<Omit<ValidationRow, 'phase'>>).map(row => ({ phase: 5, ...row })),
];
```

In `src/validation/references.ts`: `import { PHASE_5_ROWS } from './phase5';` and append `...PHASE_5_ROWS` at the end of the `VALIDATION` array literal.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/bonds/bonds_url.test.ts tests/validation && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Verify live**

At http://localhost:5391, 1440×900: in Bonds mode pick O₂, the scan point nearest 2.33 a₀, and a 1πg* box; use Phase 2's Share to copy the URL; open it in a new tab: O₂, the same R mark, the same π* orbital. Edit the hash to `#mode=bonds&system=h2plus&R=1e6&state=1sigma_u`: the app opens on H₂⁺ 1σu* at R = 10.00 a₀ with no console error. Repeat the O₂ URL at 390×844: the phone header reads "O₂ · R = 2.33 a₀".

- [ ] **Step 6: Commit**

```bash
git add src/bonds/bonds_url.ts src/validation src/main.tsx tests/bonds/bonds_url.test.ts tests/validation/phase5.test.ts
git commit -m "feat(bonds): shareable Bonds URLs; phase 5 rows in the validation table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Documentation, full verification, deployment

**Files:**
- Modify: `README.md`, `docs/HANDOFF.md`

- [ ] **Step 1: Document**

`README.md`: a "Bonds mode" section — H₂⁺ exact (method, R range, validation numbers), the ten diatomics (methods per quantity, 20-point scans, what the diagram shows, He₂/O₂/B₂/C₂ notes), the density drawn at a fixed ρ and why, and how to regenerate data (`uv venv --python 3.12 tools/molecules/.venv`, `generate.py --only <id>`, pytest).

`docs/HANDOFF.md`, "Decisions that are not obvious from the code": the λ recurrence and its sign conventions (μ = +1 at the +z nucleus); why density ships once and is computed from the basis; why ρ is drawn at a value, not a fraction; the `publicDir` trap and the copy plugin; orbitals chosen by label, not index, across R; B₂ triplet and He₂ full CI as owner-visible deviations; the 1σu polarisation well at 12.5 a₀.

- [ ] **Step 2: Full verification**

Run each in the foreground:
- `npx jest` — Expected: all pass (about a minute plus the new suites).
- `npx tsc --noEmit -p .` — Expected: clean.
- `tools/molecules/.venv/bin/python -m pytest tools/molecules -q` — Expected: all pass (a few minutes: the Becke integrations).
- `npm run build && du -sh dist/molecules && ls dist/molecules` — Expected: builds; about 15–20 MB; ten molecule folders and `index.json`.

- [ ] **Step 3: End-to-end drive**

At 1440×900 and 390×844 (touch emulation) visit every system once: H₂⁺ at R = 0.5, 2 and 10 in both states; each diatomic's density, one bonding and one antibonding orbital at the first, equilibrium and last scan points. Check: no console errors; each render's logged time under 1500 ms on this machine; every energy on screen has its method beside it; no request under `/molecules/` before Bonds mode picks a molecule.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/HANDOFF.md
git commit -m "docs: Bonds mode -- methods, validation, data pipeline and decisions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Deploy (with the owner's go-ahead: it needs AWS credentials)**

Run: `./deploy.sh`
Expected: `cdk deploy` completes. Then fetch `https://<CloudFrontURL>/molecules/n2/scan.json` (from the stack output): HTTP 200, JSON. Open the site, switch to Bonds, pick N₂: the density draws. If `BucketDeployment` fails for memory on the larger asset, add `memory_limit=512` to `s3deploy.BucketDeployment(...)` in `infra/infra_stack.py` and redeploy.

---

## Self-Review

**Spec coverage.** Bonds as a third mode (Task 13); H₂⁺ exact in prolate spheroidal coordinates at any R from a slider (Tasks 1–2, 12), live in a worker (mesh in the orbital worker, curve in its own worker: Tasks 7, 9); curve with current R marked (Tasks 10, 13); bonding 1σg and antibonding 1σu* drawn, pile-up and node asserted (Task 2); ten diatomics with 20-point scans and snapping slider (Tasks 4–5, 12); MO diagram with occupations, O₂'s unpaired π*, He₂'s zero bond order (Tasks 5, 11); CCSD(T)/aug-cc-pVTZ energies, full CI for H₂, B3LYP/def2-TZVP densities and orbitals (Task 4); every validation line of the spec (Tasks 1, 5, 14); §4.1 recipes (Tasks 2, 7); §4.2 files and 3 MB budget (Tasks 4–6); §4.3 URL keys (Task 14); §4.4 rows with computed `app` (Task 14); methods on screen (Tasks 12, 13); layout contract and live checks at both sizes (Tasks 13, 14, 15); deployment (Tasks 5, 15).

**Placeholder scan.** No TBD/TODO. The places that depend on code other phases write name how to find it: Basic Orbitals' render effects after Phases 1–2 (`grep -n "basicOrbitalParams(\|fieldRequestFor(" src/App.tsx`) and App.test's render helper (with the inline-store alternative spelled out).

**Type consistency.** `H2PlusState`, `BondsView`, `BondsState`, `FieldRenderRequest.bases/densityIsoValue`, `MoleculeBasis.orbitals[].index`, `pointId`, `bondsFieldRequest` return `{ request, note }`, `DiagramLevel.spin` feeding `BondsView.spin`, and `DENSITY_SURFACE_HEX`/`DENSITY_SURFACE_COLOUR` are used with the same names and shapes in every task that touches them.

**Review Focus.** Each of the five lines has its test in the owning task (Tasks 8, 13, 8, 6/12, 14, 6).
