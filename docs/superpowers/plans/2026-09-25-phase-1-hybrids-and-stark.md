# Phase 1 — Hybrids and the Stark Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Basic Orbitals gains a *Combination* picker next to n/l/mₗ: sp, sp², sp³ hybrids (one at a time, or all overlaid in distinct colours) and hydrogen in an electric field (n = 1 polarised by first-order perturbation theory; n = 2 Stark states with their ±3F shifts), every number validated against a published value in a shared validation table.

**Architecture:** A new `src/field_source.ts` defines the spec §4.1 `FieldSource` union and turns a serialisable `FieldRecipe` into a ψ(x, y, z) evaluator. `generateOrbitalMesh` becomes a thin wrapper over a new `generateFieldMesh(source, resolution, enclosedFraction)`, and a batch `generateFieldMeshes(request)` samples each shared basis orbital once for overlays. The orbital worker gains a `calculateFields` message; the visualizer gains `updateFieldInScene`, which draws one source exactly like an orbital (phase colours, cut-face caps) and several as one merged, per-member-coloured overlay. Physics lives in `src/hybrids.ts` and `src/stark.ts`; the UI selection model in `src/combinations.ts`; the validation table in `src/validation/`.

**Tech Stack:** TypeScript, React 19, MUI 7, three.js 0.176, Redux Toolkit, Vite, Jest + ts-jest (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md` (§3 principles and §4.1 are binding; §5 Phase 1 is the requirement). Read `docs/HANDOFF.md` "Decisions that are not obvious from the code" before touching rendering.

## Global Constraints

- **Every number states its method** (spec §3.1): each displayed dipole, field, energy shift carries its level of theory in a caption.
- **Validated before shipped** (§3.2): every quantitative feature has a reference and a test asserting agreement within a stated tolerance, recorded as a row in `src/validation/references.ts`.
- **Qualitative is labelled qualitative** (§3.3): hybrids and perturbation theory say so on screen, with range of validity.
- **Failures are shown, not hidden** (§3.5): a refused field is an explicit message, never a silently wrong picture.
- **The existing renderer is the renderer** (§3.6): new physics is an analytic ψ evaluator or a grid, through marching cubes, phase colouring, cut-away caps and the enclosed-fraction contour.
- **Performance budget** (§3.7): any new view renders in under 1.5 s on a 2020 laptop, under 4 s on a mid-range phone; heavy work in a worker.
- **Layout contract** (§3.8): desktop navigation left (`.side-panel`), view settings right (`.view-panel`); phone uses `PhoneSheet` tabs. No new floating panel over the canvas.
- Spec §4.1 types verbatim: `AnalyticFieldSource`, `GridFieldSource`, `FieldSource`; `FieldRecipe` variants `'hydrogenic'`, `'combination'`, `'polarized1s'` now (`'h2plus'`, `'gaussianMO'` are later phases — adding one must be a local change).
- `generateOrbitalMesh`'s signature and behaviour are unchanged; every existing test stays green.
- Validation (verbatim): "Hybrids orthonormal on the sampling grid (|⟨i|j⟩ − δᵢⱼ| < 10⁻³); sp³ lobe axes at 109.47° ± 0.5°; α computed from the drawn ψ by numerical integration = 4.5 ± 1 %; |⟨2s|z|2p_z⟩| = 3 a₀ ± 1 %."
- Field slider "0 to 0.05 a.u., with the V/m equivalent shown"; 1 a.u. of field = 5.142 × 10¹¹ V/m; "refuses fields above 0.05 a.u."
- Captions (verbatim content): hybrids — "a basis choice for one atom — hybrids describe bonding directions, not a free atom's ground state"; field — validity "F ≪ 1 a.u.; ionisation by tunnelling ignored".
- Atomic units throughout (ħ = mₑ = e = a₀ = 1). Perturbation H′ = +F z (field along +z; the electron is pulled towards −z).
- British spelling in comments and UI copy. Comments explain *why*, in the register of `src/radial_distribution.ts`.
- TDD for every task: failing test, watch it fail, minimal code, watch it pass, commit. Tests: `npx jest <path>`; types: `npx tsc --noEmit -p .`.
- Run every command in the foreground. The full suite takes about a minute; `npx jest tests/hybrids.test.ts` about 10 s.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The dev server is already running at http://localhost:5391 (`npx vite --port 5391 --strictPort`); do not start another.

## Review Focus

1. **Combination back to None.** The canvas must return to the n/l/mₗ shown in the panel, not stay on the hybrid. Owning test: Task 11, "None redraws the orbital in the panel".
2. **Leaving Basic Orbitals with a combination selected.** Atom mode must never have a stale hybrid drawn over it, and coming back must redraw the combination. Owning tests: Task 8 (`setMode('atom')` clears `currentField`), Task 11 ("a combination survives a round trip through atom mode").
3. **An out-of-range field that did not come from the slider** (Phase 2 URL state will make this reachable: `F=0.08`, or `F=0.01` at n = 2) must be refused with a message and never drawn. Owning tests: Task 7 (`fieldRequestFor` returns null), Task 10 (the Alert shows).
4. **First-order ψ has a spurious node.** ψ₁ₛ(1 − F z(1 + r/2)) changes sign where F z(1 + r/2) = 1, at z ≈ 5.4 a₀ when F = 0.05. No drawn contour at any offered enclosed fraction may show that false nodal surface. Owning test: Task 6, "never draws the first-order node".
5. **Surface controls on the overlay.** Wireframe, opacity and cut must restyle the merged overlay in place, without a recompute. Owning test: Task 9, "restyles the overlay without recomputing".

---

## Design decisions (read before Task 1)

**Hybrid coefficients.** With unit lobe directions dᵢ and k p orbitals (sp: k = 1, sp²: 2, sp³: 3):

hᵢ = −(1/√(k+1)) ψ₂ₛ + √(k/(k+1)) (dᵢ · p), with p = (ψ₂ₚₓ, ψ₂ₚᵧ, ψ₂ₚ_z)

- sp: d = (0,0,±1). sp²: d = (1,0,0), (−½, √3/2, 0), (−½, −√3/2, 0), in the xy plane, so p_z remains for π. sp³: d = (1,1,1)/√3, (1,−1,−1)/√3, (−1,1,−1)/√3, (−1,−1,1)/√3.
- Orthonormality: ⟨hᵢ|hⱼ⟩ = 1/(k+1) + (k/(k+1)) dᵢ·dⱼ. With dᵢ·dⱼ = −1, −½, −⅓ this is 0 for sp, sp², sp³, and 1 on the diagonal.
- **Why −ψ₂ₛ:** the hydrogenic R₂₀ = (1/√2)(1 − r/2)e^(−r/2) is positive only inside its node at r = 2 a₀. 94.7 % of the 2s density lies beyond it, where R₂₀ is negative. With +ψ₂ₛ, (2s + 2p_z)/√2 ∝ (2 − r + z)e^(−r/2) puts its large lobe on −z, *opposite* its label. With −ψ₂ₛ, the large lobe (which is also the positive lobe) points along dᵢ and holds 92 % / 87 % / 84 % of the density for sp / sp² / sp³.
- In `makeWaveFunctionEvaluator`'s real harmonics, mₗ = +1 is p_x (cos φ), mₗ = −1 is p_y (sin φ) and mₗ = 0 is p_z.

**Lobe axis = density-weighted centroid of the positive lobe**, Σ_{ψ>0} r ψ² / Σ_{ψ>0} ψ² on the sampling grid. We do not use the grid argmax of |ψ|²: it snaps to grid points, and with 0.33 a₀ voxels and the maximum at 3–4 a₀ that is up to ~5° of direction error, ten times the tolerance. The centroid uses the whole drawn lobe. The cube's symmetries (axis permutations and sign flips) map the sp and sp³ sets into themselves, so their centroids are exact to rounding. sp² (a 120° rotation is not a cube symmetry) shows the real grid error, which is about 10⁻⁴°.

**Polarised 1s** (Dalgarno–Lewis, H′ = +Fz): ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ, ψ₁ₛ = e^(−r)/√π.
⟨z⟩ = −2F ⟨ψ₁ₛ| z²(1 + r/2) |ψ₁ₛ⟩ = −2F (⟨r²⟩/3 + ⟨r³⟩/6) = −2F (3/3 + 7.5/6) = −9F/2, so μ = −⟨z⟩ (electron charge −1) = (9/2) F and α = 9/2 a₀³. (For 1s, ⟨rᵏ⟩ = (k+2)!/2^(k+1): ⟨r²⟩ = 3, ⟨r³⟩ = 7.5.)
- The drawn ψ is first-order and unnormalised; ⟨ψ|ψ⟩ = 1 + F²·5.375. μ from the drawn ψ, −⟨ψ|z|ψ⟩/⟨ψ|ψ⟩, therefore reads 4.44 at F = 0.05 (−1.4 %) through normalisation alone. **α is validated at F = 0.01**, where that effect is 0.05 %. Measured on the 129³ render grid (box 7.6 a₀): 4.4966, −0.08 %.
- The next-order term: μ = αF + γF³/6, with γ = 10665/8 a.u. for hydrogen. Its share of μ is γF²/(6α), which is 4.4 % at 0.03 and 12.3 % at 0.05. The caption states the value for the current F.
- Over-the-barrier field: V = −1/r + Fz peaks at −2√F on the −z side, so a state of energy E escapes classically once F > E²/4. n = 1: 0.0625 a.u., which is why 0.05 is a safe maximum. **n = 2: 1/256 ≈ 0.0039 a.u.** — the n = 2 slider stops at 0.0039, and anything above it is refused as "not bound" (§3.5). The spec's 0.05 a.u. is for n = 1; at 0.05 the n = 2 "shift" of 0.15 Ha would exceed the 0.125 Ha binding energy.

**n = 2 Stark states.** ⟨2s|z|2p_z⟩ = [∫R₂₀R₂₁ r³ dr]·[∫Y₀₀ cos θ Y₁₀ dΩ] = (−3√3)(1/√3) = **−3 a₀** in this code's sign convention. Here ∫R₂₀R₂₁r³dr = (1/√48)∫(1 − r/2) r⁴ e^(−r) dr = (24 − 60)/√48. So (2s + 2p_z)/√2 has ⟨z⟩ = −3, its density sits at −z, and its shift is **−3F (lower)**. (2s − 2p_z)/√2 has shift **+3F (upper)**. The sp hybrid h₁ = (−2s + 2p_z)/√2 is exactly −(upper state), which is the spec's "also the sp hybrid shape". Measured on the grid: −2.99998.

**Boxes and resolution.** `combinationSamplingRadius(n)` is the largest `computeSamplingRadius(n, l, 1)` over l < n: 21 a₀ for n = 2 and 7.6 a₀ for n = 1. That is the physics-derived box, never a new formula (HANDOFF). At 129³ and 21 a₀ the grid norms are N₂ₛ = 1.00024 and N₂ₚ = 0.999999, so the worst orthonormality error is about 1.2 × 10⁻⁴. The polarised 1s at F = 0.05 and 99 % reaches z = −4.75 / +3.32, inside 7.6. Single sources render at `ORBITAL_RESOLUTION` (128). Overlays render at `OVERLAY_RESOLUTION = 96`: an sp³ overlay is four meshes, and the composition view already sets the precedent of lower resolution when many lobes share the screen. Overlays also share each basis orbital's samples across members (Task 4), which cut sp³-all from ~2.5 s to ~0.8 s measured locally.

**Overlay drawing.** Members are merged into **one** geometry with per-vertex colours: the member's colour, darkened ×0.45 where ψ < 0 so phase stays legible. There are **no cut-face caps**, because the stencil caps assume a single capped object (see `shell_composition_view.ts`'s module doc; the composition lobes set the precedent). Overlay colours are `CURVE_COLORS[2..5]` (yellow, green, purple, orange), keeping away from the red/blue that means ψ > 0 / ψ < 0 everywhere else.

**Radial plot for combinations: show the components.** The spherical average of |Σ cᵢ R_{n lᵢ} Y_{lᵢ mᵢ}|² is Σ cᵢ² R², because the cross terms integrate to zero over angles. So a hybrid's radial distribution *is exactly* (1/(k+1))·P₂ₛ + (k/(k+1))·P₂ₚ. Plotting 2s, 2p and that weighted sum is a true statement that also teaches what went in. For the polarised 1s the first-order change averages to zero, and the plot says so.

**UI state.** The combination selection is App local state, like n/l/mₗ. Unlike n/l/mₗ it renders reactively: there is no "Update Orbital" step, because the picker, member buttons and slider each commit a complete choice. The slider commits on release (`onChangeCommitted`). While a combination is active, the n/l/mₗ selects stay visible but are disabled, and Update Orbital is hidden. The render request lives in Redux as `orbital.currentField`, beside `currentParams`, and exactly one of the two is non-null.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/validation/references.ts` | Create | `ValidationRow`, `VALIDATION` (phase 0 rows + phase 1 rows), `relativeErrorPercent` |
| `src/validation/phase1.ts` | Create | Phase 1 rows, `app` computed by the same functions the physics tests call |
| `src/field_source.ts` | Create | §4.1 types, `FieldRecipe` union, `FieldRenderRequest`, `makeFieldEvaluator`, `hydrogenicSource`, `fieldProblem`, `radialOverrideFromSamples` |
| `src/orbital_mesh.ts` | Modify | `sampleEvaluator`, `sampleFieldSource`, `meshFromSamples`, `generateFieldMesh`, `generateFieldMeshes`; `generateOrbitalMesh` becomes a wrapper |
| `src/field_integrals.ts` | Create | Grid quadrature: overlap, ⟨a|z|b⟩, positive-lobe centroid and share, angles |
| `src/hybrids.ts` | Create | Hybrid directions, recipes, sources, lobe axes |
| `src/stark.ts` | Create | Polarised 1s source, Stark states, α and ⟨2s|z|2p_z⟩ from the grid, unit conversions, barrier field |
| `src/combinations.ts` | Create | `CombinationSelection`, `fieldRequestFor`, titles, radial curves, overlay legend, `selectionProblem` |
| `src/orbital_presets.ts` | Modify | `combinationSamplingRadius`, `OVERLAY_RESOLUTION`, `basicOrbitalParams` |
| `src/workers/orbitalWorker.ts` | Modify | `calculateFields` message |
| `src/store/orbitalSlice.ts` | Modify | `currentField`, `startFieldCalculation`, clear on `setMode('atom')` |
| `src/field_overlay_view.ts` | Create | Merged, per-member-coloured overlay group |
| `src/orbital_visualizer.ts` | Modify | `updateFieldInScene`; drop the unused `params` argument of `updateSceneWithMeshData` |
| `src/components/CombinationControls.tsx` | Create | Picker, member buttons, field slider, readouts, captions |
| `src/components/Controls.tsx` | Modify | Hosts CombinationControls; disables n/l/mₗ while a combination is active |
| `src/components/OrbitalViewer.tsx` | Modify | Renders `currentField` |
| `src/App.tsx` | Modify | Selection state, reactive dispatch, overlay legend, plot curves, busy label |
| `src/style.css` | Modify | `.combination-swatch`, `.combination-readout` |
| `README.md`, `docs/HANDOFF.md` | Modify | Feature description, limits, decisions |

Tests: `tests/validation/references.test.ts`, `tests/field_source.test.ts`, `tests/field_mesh.test.ts`, `tests/hybrids.test.ts`, `tests/stark.test.ts`, `tests/combinations.test.ts`, `tests/orbital_slice.test.ts`, `tests/field_visualizer.test.ts`, `tests/combination_controls.test.tsx`, plus additions to `src/components/Controls.test.tsx` and `src/App.test.tsx`.

---

### Task 1: Shared validation table

**Files:**
- Create: `src/validation/references.ts`
- Test: `tests/validation/references.test.ts`

**Interfaces:**
- Produces: `interface ValidationRow { phase: number; quantity: string; system: string; app: number; reference: number; unit: string; tolerancePercent: number; referenceSource: string; method: string }`, `const VALIDATION: ValidationRow[]`, `relativeErrorPercent(row: ValidationRow): number`. Later phases append rows; Phase 7's Methods page reads `VALIDATION`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/validation/references.test.ts
import { VALIDATION, relativeErrorPercent } from '../../src/validation/references';

describe('validation table', () => {
    it('carries the atom-mode NIST LDA validations as phase 0', () => {
        const phase0 = VALIDATION.filter(row => row.phase === 0).map(row => `${row.system} ${row.quantity}`);
        expect(phase0).toEqual([
            'He total energy', 'Ne total energy', 'Ar total energy', 'Ar 2s eigenvalue', 'Ar 2p eigenvalue',
        ]);
    });

    it.each(VALIDATION.map(row => [`phase ${row.phase}: ${row.system} ${row.quantity}`, row] as const))(
        '%s agrees with its reference within the stated tolerance',
        (_name, row) => {
            expect(relativeErrorPercent(row)).toBeLessThanOrEqual(row.tolerancePercent);
        }
    );

    it('states a unit, a source and a method for every row, and names each quantity once', () => {
        for (const row of VALIDATION) {
            expect(row.unit.length).toBeGreaterThan(0);
            expect(row.referenceSource.length).toBeGreaterThan(0);
            expect(row.method.length).toBeGreaterThan(0);
            expect(row.reference).not.toBe(0);
            expect(row.tolerancePercent).toBeGreaterThan(0);
        }
        const keys = VALIDATION.map(row => `${row.phase}|${row.system}|${row.quantity}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('measures the error relative to the reference, whatever its sign', () => {
        expect(relativeErrorPercent({ ...VALIDATION[0], app: 101, reference: 100 })).toBeCloseTo(1, 12);
        expect(relativeErrorPercent({ ...VALIDATION[0], app: -99, reference: -100 })).toBeCloseTo(1, 12);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/validation/references.test.ts`
Expected: FAIL, "Cannot find module '../../src/validation/references'".

- [ ] **Step 3: Implement**

```ts
// src/validation/references.ts
/**
 * Every quantitative claim the app makes, beside the published value it is
 * checked against (spec §3.2). Each phase appends its rows; the Methods page
 * (Phase 7) renders this table as it stands, so the numbers users read are
 * the numbers the tests assert.
 *
 * Phase 0 rows are the atom-mode engine's recorded agreement with NIST
 * (docs/HANDOFF.md); tests/atom/scf.test.ts is what pins those values, with
 * the same tolerances (0.001 % total energy, 0.02 % eigenvalues). Rows from
 * phase 1 on compute `app` by calling the very functions their physics tests
 * call, at import -- about a second of grid quadrature -- so import this only
 * from tests and from a lazily loaded page, never from the app's entry.
 */
import { PHASE_1_ROWS } from './phase1';

export interface ValidationRow {
    phase: number;
    quantity: string;
    system: string;
    app: number;
    reference: number;
    unit: string;
    tolerancePercent: number;
    referenceSource: string;
    method: string;
}

const NIST_LDA = 'NIST Atomic Reference Data (LDA)';
const ATOM_METHOD = 'central-field SCF, LDA exchange + VWN5';

const PHASE_0_ROWS: ValidationRow[] = [
    { phase: 0, quantity: 'total energy', system: 'He', app: -2.834829, reference: -2.834836, unit: 'Ha', tolerancePercent: 0.001, referenceSource: NIST_LDA, method: ATOM_METHOD },
    { phase: 0, quantity: 'total energy', system: 'Ne', app: -128.233250, reference: -128.233481, unit: 'Ha', tolerancePercent: 0.001, referenceSource: NIST_LDA, method: ATOM_METHOD },
    { phase: 0, quantity: 'total energy', system: 'Ar', app: -525.945350, reference: -525.946195, unit: 'Ha', tolerancePercent: 0.001, referenceSource: NIST_LDA, method: ATOM_METHOD },
    { phase: 0, quantity: '2s eigenvalue', system: 'Ar', app: -10.794, reference: -10.794172, unit: 'Ha', tolerancePercent: 0.02, referenceSource: NIST_LDA, method: ATOM_METHOD },
    { phase: 0, quantity: '2p eigenvalue', system: 'Ar', app: -8.443, reference: -8.443439, unit: 'Ha', tolerancePercent: 0.02, referenceSource: NIST_LDA, method: ATOM_METHOD },
];

export const VALIDATION: ValidationRow[] = [...PHASE_0_ROWS, ...PHASE_1_ROWS];

export function relativeErrorPercent(row: ValidationRow): number {
    return (Math.abs(row.app - row.reference) / Math.abs(row.reference)) * 100;
}
```

```ts
// src/validation/phase1.ts
import type { ValidationRow } from './references';

/** Hybrids and the Stark effect. Filled in by Tasks 5 and 6. */
export const PHASE_1_ROWS: ValidationRow[] = [];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/validation/references.test.ts`
Expected: PASS (5 phase-0 rows + 3 other tests).

- [ ] **Step 5: Commit**

```bash
git add src/validation tests/validation
git commit -m "feat(validation): shared table of app values against published references

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Field sources and their evaluators

**Files:**
- Create: `src/field_source.ts`
- Test: `tests/field_source.test.ts`

**Interfaces:**
- Consumes: `makeWaveFunctionEvaluator(n, l, ml, Z, radialOverride?)` from `src/quantum_functions.ts`; `interpolateOnGrid`, `RadialGrid` from `src/atom/radial_grid.ts`; `OrbitalParams` from `src/types/orbital.ts`.
- Produces: types `HydrogenicRecipe`, `CombinationRecipe`, `Polarized1sRecipe`, `FieldRecipe`, `AnalyticFieldSource`, `GridFieldSource`, `FieldSource`, `FieldEvaluator = (x, y, z) => number`, `FieldRenderRequest { sources: AnalyticFieldSource[]; colors: string[]; resolution: number; enclosedFraction: number; label: string }`; `MAX_FIELD_AU = 0.05`; `fieldProblem(field: number): string | null`; `radialOverrideFromSamples(samples): (r) => number`; `hydrogenicSource(params: OrbitalParams): AnalyticFieldSource`; `makeFieldEvaluator(recipe: FieldRecipe): FieldEvaluator`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/field_source.test.ts
import { makeFieldEvaluator, hydrogenicSource, fieldProblem, MAX_FIELD_AU, HydrogenicRecipe } from '../src/field_source';
import { makeWaveFunctionEvaluator, radialWaveFunction } from '../src/quantum_functions';

const POINTS: Array<[number, number, number]> = [[0.3, -0.4, 1.2], [2, 1, -1.5], [-3, 0.5, 0.2], [0, 0, 4]];
const hydrogenic = (n: number, l: number, ml: number): HydrogenicRecipe => ({ type: 'hydrogenic', n, l, ml, Z: 1 });

describe('makeFieldEvaluator', () => {
    it('evaluates a hydrogenic recipe exactly as makeWaveFunctionEvaluator does', () => {
        const field = makeFieldEvaluator(hydrogenic(3, 2, -1));
        const reference = makeWaveFunctionEvaluator(3, 2, -1, 1);
        for (const [x, y, z] of POINTS) expect(field(x, y, z)).toBe(reference(x, y, z));
    });

    it('uses a numerical R(r) when the recipe carries one', () => {
        const rMin = 1e-4, dx = 0.01, size = 1501;
        const R = Float64Array.from({ length: size }, (_, j) => radialWaveFunction(2, 0, rMin * Math.exp(j * dx), 1));
        const field = makeFieldEvaluator({ ...hydrogenic(2, 0, 0), radialSamples: { R, rMin, dx, size } });
        const reference = makeWaveFunctionEvaluator(2, 0, 0, 1);
        for (const [x, y, z] of POINTS) {
            expect(Math.abs(field(x, y, z) - reference(x, y, z))).toBeLessThan(1e-4 * Math.abs(reference(x, y, z)) + 1e-12);
        }
    });

    it('sums a combination term by term', () => {
        const field = makeFieldEvaluator({ type: 'combination', terms: [
            { coefficient: 0.6, orbital: hydrogenic(2, 0, 0) },
            { coefficient: -0.8, orbital: hydrogenic(2, 1, 0) },
        ] });
        const s = makeWaveFunctionEvaluator(2, 0, 0, 1);
        const pz = makeWaveFunctionEvaluator(2, 1, 0, 1);
        for (const [x, y, z] of POINTS) expect(field(x, y, z)).toBeCloseTo(0.6 * s(x, y, z) - 0.8 * pz(x, y, z), 14);
    });

    it('refuses an empty combination', () => {
        expect(() => makeFieldEvaluator({ type: 'combination', terms: [] })).toThrow(/at least one term/);
    });

    it('draws the first-order polarised 1s, psi = psi1s (1 - F z (1 + r/2))', () => {
        const unperturbed = makeFieldEvaluator({ type: 'polarized1s', field: 0 });
        const oneS = makeWaveFunctionEvaluator(1, 0, 0, 1);
        for (const [x, y, z] of POINTS) expect(unperturbed(x, y, z)).toBeCloseTo(oneS(x, y, z), 14);

        const polarised = makeFieldEvaluator({ type: 'polarized1s', field: 0.05 });
        // (0, 0, 1): r = 1, so the factor is 1 - 0.05 * 1 * 1.5.
        expect(polarised(0, 0, 1)).toBeCloseTo((Math.exp(-1) / Math.sqrt(Math.PI)) * 0.925, 14);
        // The electron is pulled towards -z: more density below than above.
        expect(Math.abs(polarised(0, 0, -2))).toBeGreaterThan(Math.abs(polarised(0, 0, 2)));
    });

    it.each([0.0501, 0.2, -0.001, Number.NaN])('refuses a field of %p a.u.', field => {
        expect(fieldProblem(field)).toMatch(/refused/);
        expect(() => makeFieldEvaluator({ type: 'polarized1s', field })).toThrow(/refused/);
    });

    it('accepts the whole slider range', () => {
        expect(fieldProblem(0)).toBeNull();
        expect(fieldProblem(MAX_FIELD_AU)).toBeNull();
    });
});

describe('hydrogenicSource', () => {
    it('wraps OrbitalParams with a stable id and the same box', () => {
        const source = hydrogenicSource({ n: 2, l: 1, ml: 0, Z: 1, resolution: 64, rMax: 20, enclosedFraction: 0.9 });
        expect(source).toEqual({
            kind: 'analytic', id: 'hydrogenic:2,1,0,Z1', rMax: 20,
            recipe: { type: 'hydrogenic', n: 2, l: 1, ml: 0, Z: 1 },
        });
    });

    it('marks an SCF radial function in the id, so a cache cannot confuse it with the analytic one', () => {
        const radialSamples = { R: new Float64Array(3), rMin: 1e-3, dx: 0.1, size: 3 };
        const source = hydrogenicSource({ n: 2, l: 1, ml: 0, Z: 18, resolution: 64, rMax: 2, enclosedFraction: 0.9, radialSamples });
        expect(source.id).toBe('hydrogenic:2,1,0,Z18:scf');
        expect(source.recipe).toEqual({ type: 'hydrogenic', n: 2, l: 1, ml: 0, Z: 18, radialSamples });
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/field_source.test.ts`
Expected: FAIL, "Cannot find module '../src/field_source'".

- [ ] **Step 3: Implement**

```ts
// src/field_source.ts
import { makeWaveFunctionEvaluator } from './quantum_functions';
import { RadialGrid, interpolateOnGrid } from './atom/radial_grid';
import { OrbitalParams } from './types/orbital';

/**
 * Everything the renderer draws is one of two sources (spec §4.1): an analytic
 * ψ rebuilt from a serialisable recipe on the far side of the worker boundary,
 * or a sampled grid. `FieldRecipe` grows by one variant per kind of physics;
 * adding one is a new interface here, a member of the union, and a case in
 * `makeFieldEvaluator` -- the `never` check there makes a missed case a
 * compile error rather than a blank screen.
 */

export type RadialSamples = NonNullable<OrbitalParams['radialSamples']>;

export interface HydrogenicRecipe {
    type: 'hydrogenic';
    n: number;
    l: number;
    ml: number;
    Z: number;
    /** An SCF solution's numerical R(r) in place of the analytic one (see OrbitalParams.radialSamples). */
    radialSamples?: RadialSamples;
}

/** A fixed linear combination of hydrogenic orbitals: hybrids, Stark states. */
export interface CombinationRecipe {
    type: 'combination';
    terms: Array<{ coefficient: number; orbital: HydrogenicRecipe }>;
}

/** Hydrogen's 1s to first order in a field F along +z (Dalgarno–Lewis). */
export interface Polarized1sRecipe {
    type: 'polarized1s';
    field: number;
}

export type FieldRecipe = HydrogenicRecipe | CombinationRecipe | Polarized1sRecipe;

/** An analytic field, evaluated on demand in a worker. */
export interface AnalyticFieldSource {
    kind: 'analytic';
    /** Stable id for caching, e.g. 'hydrogenic:2,1,0,Z1' or 'hybrid:sp3:0'. */
    id: string;
    /** Serialisable recipe; the worker rebuilds the evaluator from it. */
    recipe: FieldRecipe;
    /** Half-width of the sampling box, a0. */
    rMax: number;
}

/** A precomputed or client-computed grid. */
export interface GridFieldSource {
    kind: 'grid';
    id: string;
    /** Points per axis. */
    shape: [number, number, number];
    /** World position of grid point (0,0,0), a0. */
    origin: [number, number, number];
    /** Spacing, a0. */
    spacing: number;
    /** ψ (signed) or ρ (non-negative); tells the renderer whether to phase-colour. */
    quantity: 'psi' | 'density';
    /** z-fastest, like DensityMap: index = (i * shape[1] + j) * shape[2] + k. */
    values: Float32Array;
}

export type FieldSource = AnalyticFieldSource | GridFieldSource;

export type FieldEvaluator = (x: number, y: number, z: number) => number;

/**
 * One render: a single source is drawn like any orbital (phase colours, cut
 * face); several are overlaid, one colour each (`colors[i]` for `sources[i]`).
 * `label` names it in the busy indicator.
 */
export interface FieldRenderRequest {
    sources: AnalyticFieldSource[];
    colors: string[];
    resolution: number;
    enclosedFraction: number;
    label: string;
}

/**
 * The strongest field drawn (spec §5 Phase 1). Hydrogen's 1s goes over the
 * barrier at E²/4 = 0.0625 a.u., and first-order theory is already 12 % off in
 * μ at 0.05, so beyond this the picture would be a fiction.
 */
export const MAX_FIELD_AU = 0.05;

/** Why a field cannot be drawn, or null if it can. */
export function fieldProblem(field: number): string | null {
    if (Number.isFinite(field) && field >= 0 && field <= MAX_FIELD_AU) return null;
    return `A field of ${field} a.u. is refused: first-order perturbation theory is drawn only from 0 to ${MAX_FIELD_AU} a.u., and stronger fields ionise the atom.`;
}

/**
 * Rebuilds the interpolating closure an SCF solution's R(r) was flattened
 * into to cross the worker boundary. `interpolateOnGrid` reads only `rMin`,
 * `dx` and `size`, so a RadialGrid-shaped object is enough.
 */
export function radialOverrideFromSamples(samples: RadialSamples): (r: number) => number {
    const { R, rMin, dx, size } = samples;
    const grid: RadialGrid = { r: new Float64Array(0), dx, size, rMin, rMax: rMin * Math.exp((size - 1) * dx) };
    return (r: number) => interpolateOnGrid(grid, R, r);
}

export function hydrogenicSource(params: OrbitalParams): AnalyticFieldSource {
    const { n, l, ml, Z, rMax, radialSamples } = params;
    const recipe: HydrogenicRecipe = radialSamples
        ? { type: 'hydrogenic', n, l, ml, Z, radialSamples }
        : { type: 'hydrogenic', n, l, ml, Z };
    return {
        kind: 'analytic',
        id: `hydrogenic:${n},${l},${ml},Z${Z}${radialSamples ? ':scf' : ''}`,
        recipe,
        rMax,
    };
}

function hydrogenicEvaluator(recipe: HydrogenicRecipe): FieldEvaluator {
    return makeWaveFunctionEvaluator(
        recipe.n, recipe.l, recipe.ml, recipe.Z,
        recipe.radialSamples ? radialOverrideFromSamples(recipe.radialSamples) : undefined
    );
}

function combinationEvaluator(recipe: CombinationRecipe): FieldEvaluator {
    if (recipe.terms.length === 0) throw new Error('A combination needs at least one term');
    const coefficients = recipe.terms.map(term => {
        if (!Number.isFinite(term.coefficient)) throw new Error('A combination coefficient must be a finite number');
        return term.coefficient;
    });
    const evaluators = recipe.terms.map(term => hydrogenicEvaluator(term.orbital));
    return (x, y, z) => {
        let sum = 0;
        for (let i = 0; i < evaluators.length; i++) sum += coefficients[i] * evaluators[i](x, y, z);
        return sum;
    };
}

function polarized1sEvaluator(field: number): FieldEvaluator {
    const problem = fieldProblem(field);
    if (problem) throw new Error(problem);
    const norm = 1 / Math.sqrt(Math.PI);
    return (x, y, z) => {
        const r = Math.sqrt(x * x + y * y + z * z);
        return norm * Math.exp(-r) * (1 - field * z * (1 + r / 2));
    };
}

export function makeFieldEvaluator(recipe: FieldRecipe): FieldEvaluator {
    switch (recipe.type) {
        case 'hydrogenic': return hydrogenicEvaluator(recipe);
        case 'combination': return combinationEvaluator(recipe);
        case 'polarized1s': return polarized1sEvaluator(recipe.field);
        default: {
            const unhandled: never = recipe;
            throw new Error(`Unknown field recipe: ${JSON.stringify(unhandled)}`);
        }
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/field_source.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/field_source.ts tests/field_source.test.ts
git commit -m "feat(field): field sources and recipe evaluators (spec §4.1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `generateFieldMesh`, with `generateOrbitalMesh` as its wrapper

**Files:**
- Modify: `src/orbital_mesh.ts` (remove the private `radialOverrideFromSamples`, lines 7–25; replace `generateOrbitalMesh`, lines 132–207; imports lines 1–5)
- Test: `tests/field_mesh.test.ts`; the existing `tests/orbital_mesh.test.ts` and `tests/orbital_presets.test.ts` must stay green unchanged

**Interfaces:**
- Consumes: `FieldSource`, `AnalyticFieldSource`, `GridFieldSource`, `FieldEvaluator`, `makeFieldEvaluator`, `hydrogenicSource` (Task 2).
- Produces: `interface SampledField { samples: Float32Array; side: number; step: number; origin: number }`; `sampleEvaluator(evaluate, rMax, resolution): SampledField`; `sampleFieldSource(source: AnalyticFieldSource, resolution): SampledField`; `meshFromSamples(field: SampledField, enclosedFraction, signAt: FieldEvaluator): MeshData`; `generateFieldMesh(source: FieldSource, resolution: number, enclosedFraction: number): MeshData`. For a grid source, `resolution` must equal `shape[0] − 1`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/field_mesh.test.ts
import { generateFieldMesh, generateOrbitalMesh, sampleFieldSource } from '../src/orbital_mesh';
import { hydrogenicSource, makeFieldEvaluator, GridFieldSource } from '../src/field_source';
import { OrbitalParams } from '../src/types/orbital';

const params: OrbitalParams = { n: 3, l: 2, ml: 1, Z: 1, resolution: 32, rMax: 20, enclosedFraction: 0.9 };

function centredGrid(side: number, halfWidth: number, value: (x: number, y: number, z: number) => number,
                     quantity: 'psi' | 'density'): GridFieldSource {
    const spacing = (2 * halfWidth) / (side - 1);
    const values = new Float32Array(side ** 3);
    let index = 0;
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
        values[index++] = value(-halfWidth + i * spacing, -halfWidth + j * spacing, -halfWidth + k * spacing);
    }
    return { kind: 'grid', id: 'test-grid', shape: [side, side, side], origin: [-halfWidth, -halfWidth, -halfWidth], spacing, quantity, values };
}

describe('generateFieldMesh', () => {
    it('is what generateOrbitalMesh draws, for the same orbital', () => {
        expect(generateOrbitalMesh(params)).toEqual(generateFieldMesh(hydrogenicSource(params), 32, 0.9));
    });

    it('samples z-fastest over [-rMax, rMax]^3', () => {
        const source = hydrogenicSource(params);
        const field = sampleFieldSource(source, 8);
        const evaluate = makeFieldEvaluator(source.recipe);
        expect(field.side).toBe(9);
        expect(field.step).toBeCloseTo(5, 12);
        expect(field.origin).toBe(-20);
        const [i, j, k] = [2, 7, 5];
        expect(field.samples[(i * 9 + j) * 9 + k]).toBeCloseTo(evaluate(-20 + 2 * 5, -20 + 7 * 5, -20 + 5 * 5), 7);
    });

    it('meshes a density grid at the radius that encloses the fraction asked for', () => {
        // rho ∝ e^(-r²): the share inside radius R is erf(R) - (2R/√π)e^(-R²), which is 1/2 at R = 1.0877.
        const source = centredGrid(65, 4, (x, y, z) => Math.exp(-(x * x + y * y + z * z)) / Math.PI ** 1.5, 'density');
        const mesh = generateFieldMesh(source, 64, 0.5);
        const radii = mesh.positions.map(([x, y, z]) => Math.hypot(x, y, z));
        const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
        expect(mean).toBeGreaterThan(1.0877 * 0.98);
        expect(mean).toBeLessThan(1.0877 * 1.02);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1]));
        expect(mesh.densityMap.side).toBe(65);
        expect(mesh.densityMap.rMax).toBeCloseTo(4, 12);
    });

    it('phase-colours a psi grid by the interpolated sign at each vertex', () => {
        const source = centredGrid(33, 4, (x, y, z) => z * Math.exp(-(x * x + y * y + z * z) / 2), 'psi');
        const mesh = generateFieldMesh(source, 32, 0.9);
        mesh.positions.forEach(([, , z], index) => {
            if (Math.abs(z) > 0.2) expect(mesh.psiSigns[index]).toBe(z > 0 ? 1 : -1);
        });
    });

    it('refuses grids it cannot draw, saying why', () => {
        const good = centredGrid(9, 2, () => 1, 'density');
        expect(() => generateFieldMesh({ ...good, shape: [9, 9, 8] }, 8, 0.9)).toThrow(/centred cube/);
        expect(() => generateFieldMesh({ ...good, origin: [-1, -2, -2] }, 8, 0.9)).toThrow(/centred cube/);
        expect(() => generateFieldMesh({ ...good, values: new Float32Array(10) }, 8, 0.9)).toThrow(/expected 729 values/);
        expect(() => generateFieldMesh(good, 16, 0.9)).toThrow(/resolution must be 8/);
        expect(() => generateFieldMesh(good, 8, 1)).toThrow(/enclosedFraction/);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/field_mesh.test.ts`
Expected: FAIL, "generateFieldMesh is not a function" (TS: "has no exported member 'generateFieldMesh'").

- [ ] **Step 3: Implement**

Replace the imports at the top of `src/orbital_mesh.ts` and delete its private `radialOverrideFromSamples` (it now lives in `field_source.ts`):

```ts
import { DensityMap, MeshData, OrbitalParams } from './types/orbital';
import { marchingCubes } from './marching_cubes';
import { isoLevelForEnclosedFraction } from './radial_distribution';
import {
    AnalyticFieldSource, FieldEvaluator, FieldSource, GridFieldSource,
    hydrogenicSource, makeFieldEvaluator,
} from './field_source';
```

Keep `robustPeakDensity` and `encodeDensityMap` as they are. Replace `generateOrbitalMesh` and everything after it with:

```ts
/** ψ sampled on a regular cube, z-fastest: index = (i * side + j) * side + k. */
export interface SampledField {
    samples: Float32Array;
    side: number;
    step: number;
    /** World coordinate of grid point 0 on every axis. */
    origin: number;
}

function checkBox(resolution: number, rMax: number): void {
    if (resolution <= 0 || rMax <= 0) {
        throw new Error('Invalid parameters: resolution and rMax must be positive');
    }
    if (!Number.isInteger(resolution)) {
        throw new Error('Invalid parameters: resolution must be a whole number');
    }
}

function checkFraction(enclosedFraction: number): void {
    if (!(enclosedFraction > 0) || enclosedFraction >= 1) {
        throw new Error('Invalid parameters: enclosedFraction must be between 0 and 1');
    }
}

export function sampleEvaluator(evaluate: FieldEvaluator, rMax: number, resolution: number): SampledField {
    const side = resolution + 1;
    const step = (2 * rMax) / resolution;
    const origin = -rMax;
    const samples = new Float32Array(side * side * side);
    let index = 0;
    for (let i = 0; i < side; i++) {
        const x = origin + i * step;
        for (let j = 0; j < side; j++) {
            const y = origin + j * step;
            for (let k = 0; k < side; k++) {
                samples[index++] = evaluate(x, y, origin + k * step);
            }
        }
    }
    return { samples, side, step, origin };
}

export function sampleFieldSource(source: AnalyticFieldSource, resolution: number): SampledField {
    checkBox(resolution, source.rMax);
    return sampleEvaluator(makeFieldEvaluator(source.recipe), source.rMax, resolution);
}

/**
 * The contour and its mesh, from samples already taken.
 *
 * The contour to draw is chosen from the samples: `enclosedFraction` says how
 * much of the electron the surface should hold, and the density threshold that
 * achieves it falls out of the sampled distribution. The samples are handed
 * back as a density map, so the cut-away face is shaded without evaluating
 * the field a second time. `signAt` colours each vertex by the sign of ψ at
 * the vertex itself: taken from the nearest sample instead, vertices across a
 * nodal surface from that sample would be miscoloured, exactly where the two
 * phases meet.
 */
export function meshFromSamples(field: SampledField, enclosedFraction: number, signAt: FieldEvaluator): MeshData {
    const { samples, side, step, origin } = field;
    const isoLevel = isoLevelForEnclosedFraction(samples, enclosedFraction);
    if (!(isoLevel > 0)) {
        throw new Error('No isosurface for this orbital');
    }

    // Meshing needs float64: near the surface |psi|^2 and isoLevel are within a
    // rounding error of each other, and their difference decides the sign.
    const values = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        values[i] = samples[i] * samples[i] - isoLevel;
    }

    const mesh = marchingCubes(side - 1, values, origin, step);
    if (!mesh.positions.length || !mesh.cells.length) {
        throw new Error('No isosurface for this orbital');
    }

    const psiSigns = mesh.positions.map(([x, y, z]) => (signAt(x, y, z) >= 0 ? 1 : -1));
    const densityMap: DensityMap = { data: encodeDensityMap(samples, isoLevel), side, rMax: -origin };
    return { positions: mesh.positions, cells: mesh.cells, psiSigns, densityMap, isoLevel };
}

const GRID_SHAPE_MESSAGE =
    'Grid field sources must be a centred cube: the same number of points on every axis, origin at minus half the width';

/**
 * A grid source as samples the mesher understands. A density grid is carried
 * as √ρ so the enclosed-fraction search, which squares its input, sees ρ
 * itself; its vertices are all "positive", there being no phase to show.
 */
function gridAsSampledField(source: GridFieldSource, resolution: number): SampledField {
    const [side, ny, nz] = source.shape;
    if (ny !== side || nz !== side || side < 2 || !(source.spacing > 0)) throw new Error(GRID_SHAPE_MESSAGE);
    const halfWidth = ((side - 1) * source.spacing) / 2;
    if (source.origin.some(o => Math.abs(o + halfWidth) > 1e-6 * halfWidth)) throw new Error(GRID_SHAPE_MESSAGE);
    if (source.values.length !== side ** 3) {
        throw new Error(`Grid field source ${source.id}: expected ${side ** 3} values, got ${source.values.length}`);
    }
    if (resolution !== side - 1) {
        throw new Error(`Invalid parameters: resolution must be ${side - 1} for grid ${source.id} (its own shape)`);
    }
    const samples = source.quantity === 'density'
        ? Float32Array.from(source.values, v => Math.sqrt(Math.max(0, v)))
        : source.values;
    return { samples, side, step: source.spacing, origin: -halfWidth };
}

/** Trilinear interpolation of a sampled field, clamped to the box. */
function interpolateSample(field: SampledField, x: number, y: number, z: number): number {
    const { samples, side, step, origin } = field;
    const cell = (c: number): [number, number] => {
        const t = (c - origin) / step;
        const i = Math.min(side - 2, Math.max(0, Math.floor(t)));
        return [i, Math.min(1, Math.max(0, t - i))];
    };
    const [i, fx] = cell(x);
    const [j, fy] = cell(y);
    const [k, fz] = cell(z);
    const at = (a: number, b: number, c: number) => samples[((i + a) * side + (j + b)) * side + (k + c)];
    const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
    return lerp(
        lerp(lerp(at(0, 0, 0), at(0, 0, 1), fz), lerp(at(0, 1, 0), at(0, 1, 1), fz), fy),
        lerp(lerp(at(1, 0, 0), at(1, 0, 1), fz), lerp(at(1, 1, 0), at(1, 1, 1), fz), fy),
        fx
    );
}

/**
 * The isosurface of any field source (spec §4.1). An analytic source is
 * sampled once per point of a (resolution + 1)³ grid over its box; a grid
 * source is meshed on its own grid.
 */
export function generateFieldMesh(source: FieldSource, resolution: number, enclosedFraction: number): MeshData {
    if (source.kind === 'grid') {
        const field = gridAsSampledField(source, resolution);
        checkFraction(enclosedFraction);
        const signAt: FieldEvaluator = source.quantity === 'density'
            ? () => 1
            : (x, y, z) => interpolateSample(field, x, y, z);
        return meshFromSamples(field, enclosedFraction, signAt);
    }
    checkBox(resolution, source.rMax);
    checkFraction(enclosedFraction);
    const evaluate = makeFieldEvaluator(source.recipe);
    return meshFromSamples(sampleEvaluator(evaluate, source.rMax, resolution), enclosedFraction, evaluate);
}

/** One orbital's isosurface; unchanged behaviour, now a field source like any other. */
export function generateOrbitalMesh(params: OrbitalParams): MeshData {
    return generateFieldMesh(hydrogenicSource(params), params.resolution, params.enclosedFraction);
}
```

- [ ] **Step 4: Run to verify it passes, and nothing else moved**

Run: `npx jest tests/field_mesh.test.ts tests/orbital_mesh.test.ts tests/orbital_presets.test.ts tests/atom/composite_lobe_quality.test.ts && npx tsc --noEmit -p .`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/orbital_mesh.ts tests/field_mesh.test.ts
git commit -m "refactor(mesh): generateFieldMesh over any field source; generateOrbitalMesh wraps it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Batch meshing with shared basis samples, and the worker message

**Files:**
- Modify: `src/orbital_mesh.ts` (append `generateFieldMeshes`; add the `makeWaveFunctionEvaluator` and `FieldRenderRequest` imports)
- Modify: `src/workers/orbitalWorker.ts` (whole file below)
- Test: `tests/field_mesh.test.ts` (append)

**Interfaces:**
- Consumes: `sampleEvaluator`, `meshFromSamples`, `generateFieldMesh` (Task 3); `FieldRenderRequest` (Task 2).
- Produces: `generateFieldMeshes(request: FieldRenderRequest): MeshData[]`, one per source, in order. Worker protocol: request `{ type: 'calculateFields'; request: FieldRenderRequest }`, reply `{ type: 'fieldsSuccess'; meshes: MeshData[] }` or `{ type: 'error'; message: string }`.

- [ ] **Step 1: Write the failing test** (append to `tests/field_mesh.test.ts`)

```ts
import { generateFieldMeshes } from '../src/orbital_mesh';
import { AnalyticFieldSource, HydrogenicRecipe } from '../src/field_source';

const n2 = (l: number, ml: number): HydrogenicRecipe => ({ type: 'hydrogenic', n: 2, l, ml, Z: 1 });
const spHybrid = (sign: 1 | -1): AnalyticFieldSource => ({
    kind: 'analytic', id: `test-sp:${sign}`, rMax: 21,
    recipe: { type: 'combination', terms: [
        { coefficient: -Math.SQRT1_2, orbital: n2(0, 0) },
        { coefficient: sign * Math.SQRT1_2, orbital: n2(1, 0) },
    ] },
});

describe('generateFieldMeshes', () => {
    it('draws a combination as generateFieldMesh does, from shared basis samples', () => {
        const [batched] = generateFieldMeshes({ sources: [spHybrid(1)], colors: ['#ffffff'], resolution: 32, enclosedFraction: 0.9, label: 'test' });
        const direct = generateFieldMesh(spHybrid(1), 32, 0.9);
        expect(Math.abs(batched.isoLevel - direct.isoLevel) / direct.isoLevel).toBeLessThan(1e-4);
        expect(Math.abs(batched.positions.length - direct.positions.length)).toBeLessThanOrEqual(direct.positions.length * 0.01);
    });

    it('returns one mesh per source, in order', () => {
        const meshes = generateFieldMeshes({ sources: [spHybrid(1), spHybrid(-1)], colors: ['#ffffff', '#000000'], resolution: 32, enclosedFraction: 0.9, label: 'test' });
        const meanPositiveZ = (index: number) => {
            const zs = meshes[index].positions.filter((_, v) => meshes[index].psiSigns[v] === 1).map(([, , z]) => z);
            return zs.reduce((a, b) => a + b, 0) / zs.length;
        };
        expect(meshes).toHaveLength(2);
        expect(meanPositiveZ(0)).toBeGreaterThan(0);
        expect(meanPositiveZ(1)).toBeLessThan(0);
    });

    it('passes anything that is not a plain combination straight to generateFieldMesh', () => {
        const oneS = hydrogenicSource({ n: 1, l: 0, ml: 0, Z: 1, resolution: 24, rMax: 7.6, enclosedFraction: 0.9 });
        const polarised: AnalyticFieldSource = { kind: 'analytic', id: 'p', rMax: 7.6, recipe: { type: 'polarized1s', field: 0.03 } };
        const meshes = generateFieldMeshes({ sources: [oneS, polarised], colors: ['#fff', '#fff'], resolution: 24, enclosedFraction: 0.9, label: 'test' });
        expect(meshes[0]).toEqual(generateFieldMesh(oneS, 24, 0.9));
        expect(meshes[1]).toEqual(generateFieldMesh(polarised, 24, 0.9));
    });

    it('refuses an empty request', () => {
        expect(() => generateFieldMeshes({ sources: [], colors: [], resolution: 24, enclosedFraction: 0.9, label: 'x' })).toThrow(/no field sources/);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/field_mesh.test.ts -t generateFieldMeshes`
Expected: FAIL, "generateFieldMeshes is not a function".

- [ ] **Step 3: Implement**

Add `import { makeWaveFunctionEvaluator } from './quantum_functions';` and add `FieldRenderRequest` to the `./field_source` import in `src/orbital_mesh.ts`, then append:

```ts
/**
 * Every mesh of one render, in order. An overlay of hybrids is four
 * combinations of the same four orbitals, so each distinct hydrogenic term is
 * sampled once and every member is formed from those samples: evaluating each
 * combination point by point costs four times the exponentials, which put an
 * sp³ overlay at ~2.5 s against the 1.5 s budget (spec §3.7). Anything that is
 * not a plain analytic combination -- an SCF radial function, a polarised 1s
 * -- is drawn by generateFieldMesh as usual.
 */
export function generateFieldMeshes(request: FieldRenderRequest): MeshData[] {
    const { sources, resolution, enclosedFraction } = request;
    if (sources.length === 0) throw new Error('Nothing to draw: the request has no field sources');
    const basis = new Map<string, Float32Array>();

    return sources.map(source => {
        const recipe = source.recipe;
        if (recipe.type !== 'combination' || recipe.terms.some(term => term.orbital.radialSamples)) {
            return generateFieldMesh(source, resolution, enclosedFraction);
        }
        checkBox(resolution, source.rMax);
        checkFraction(enclosedFraction);
        // Built first: it validates the terms, and it colours the vertices.
        const evaluate = makeFieldEvaluator(recipe);

        const combined = new Float64Array((resolution + 1) ** 3);
        for (const term of recipe.terms) {
            const { n, l, ml, Z } = term.orbital;
            const key = `${source.rMax}|${n},${l},${ml},${Z}`;
            let values = basis.get(key);
            if (!values) {
                values = sampleEvaluator(makeWaveFunctionEvaluator(n, l, ml, Z), source.rMax, resolution).samples;
                basis.set(key, values);
            }
            for (let i = 0; i < combined.length; i++) combined[i] += term.coefficient * values[i];
        }

        const field: SampledField = {
            samples: Float32Array.from(combined),
            side: resolution + 1,
            step: (2 * source.rMax) / resolution,
            origin: -source.rMax,
        };
        return meshFromSamples(field, enclosedFraction, evaluate);
    });
}
```

Replace `src/workers/orbitalWorker.ts` with:

```ts
import { MeshData, OrbitalParams } from '@/types/orbital';
import { FieldRenderRequest } from '../field_source';
import { generateOrbitalMesh, generateFieldMeshes } from '../orbital_mesh';

type WorkerMessageData =
    | { type: 'calculate'; params: OrbitalParams }
    | { type: 'calculateFields'; request: FieldRenderRequest };

interface WorkerSuccessResponse {
    type: 'success';
    meshData: MeshData;
}

interface WorkerFieldsSuccessResponse {
    type: 'fieldsSuccess';
    meshes: MeshData[];
}

interface WorkerErrorResponse {
    type: 'error';
    message: string;
}

// The DOM lib types the global `self` as a Window, whose postMessage takes a
// target origin rather than a transfer list. Pulling in the WebWorker lib
// instead would collide with DOM, so describe just the surface used here.
interface WorkerScope {
    onmessage: ((event: MessageEvent<WorkerMessageData>) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
}
const worker = self as unknown as WorkerScope;

worker.onmessage = (e: MessageEvent<WorkerMessageData>) => {
    const message = e.data;
    try {
        if (message.type === 'calculate') {
            console.log('Worker: Starting calculation', message.params);
            const meshData = generateOrbitalMesh(message.params);
            console.log('Worker: Calculation complete', {
                vertexCount: meshData.positions.length,
                triangleCount: meshData.cells.length
            });
            const response: WorkerSuccessResponse = { type: 'success', meshData };
            // The density map is the largest thing crossing the boundary; hand the
            // buffer over rather than copying it.
            worker.postMessage(response, [meshData.densityMap.data.buffer]);
        } else if (message.type === 'calculateFields') {
            const meshes = generateFieldMeshes(message.request);
            const response: WorkerFieldsSuccessResponse = { type: 'fieldsSuccess', meshes };
            worker.postMessage(response, meshes.map(mesh => mesh.densityMap.data.buffer));
        }
    } catch (error) {
        console.error('Worker: Error during calculation:', error);
        const response: WorkerErrorResponse = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        };
        worker.postMessage(response);
    }
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/field_mesh.test.ts tests/orbital_mesh.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/orbital_mesh.ts src/workers/orbitalWorker.ts tests/field_mesh.test.ts
git commit -m "feat(mesh): batch field meshing with shared basis samples; worker calculateFields

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Grid quadrature and the sp, sp², sp³ hybrids

**Files:**
- Create: `src/field_integrals.ts`, `src/hybrids.ts`
- Modify: `src/orbital_presets.ts` (append `combinationSamplingRadius`), `src/validation/phase1.ts`
- Test: `tests/hybrids.test.ts`

**Interfaces:**
- Consumes: `SampledField`, `sampleFieldSource` (Task 3); `CombinationRecipe`, `HydrogenicRecipe`, `AnalyticFieldSource` (Task 2); `VALIDATION` (Task 1).
- Produces:
  - `field_integrals.ts`: `overlapIntegral(a, b): number`, `zMatrixElement(a, b): number`, `positiveLobeCentroid(field): [number, number, number]`, `positiveShare(field): number`, `angleBetweenDegrees(u, v): number`
  - `orbital_presets.ts`: `combinationSamplingRadius(n: number): number`
  - `hybrids.ts`: `type HybridKind = 'sp' | 'sp2' | 'sp3'`, `HYBRID_NAMES: Record<HybridKind, string>`, `HYBRID_DIRECTIONS: Record<HybridKind, Array<[number, number, number]>>`, `hybridCount(kind): number`, `hybridRecipe(kind, index): CombinationRecipe`, `hybridSource(kind, index): AnalyticFieldSource`, `hybridLobeAxis(kind, index, resolution?): [number, number, number]`, `hybridLobeAngleDegrees(kind, i, j, resolution?): number`
  - `phase1.ts`: the sp³ angle row

- [ ] **Step 1: Write the failing test**

```ts
// tests/hybrids.test.ts
import {
    HYBRID_DIRECTIONS, HybridKind, hybridCount, hybridRecipe, hybridSource, hybridLobeAngleDegrees,
} from '../src/hybrids';
import { sampleFieldSource, SampledField } from '../src/orbital_mesh';
import { overlapIntegral, positiveLobeCentroid, positiveShare, angleBetweenDegrees } from '../src/field_integrals';
import { ORBITAL_RESOLUTION, computeSamplingRadius, combinationSamplingRadius } from '../src/orbital_presets';
import { VALIDATION } from '../src/validation/references';

const KINDS: HybridKind[] = ['sp', 'sp2', 'sp3'];
const EXPECTED_ANGLE: Record<HybridKind, number> = { sp: 180, sp2: 120, sp3: (Math.acos(-1 / 3) * 180) / Math.PI };

// Sampled once on the app's own render grid (129³ over ±21 a0): "orthonormal
// on the sampling grid" is a statement about exactly these samples.
const sampled: Partial<Record<HybridKind, SampledField[]>> = {};
beforeAll(() => {
    for (const kind of KINDS) {
        sampled[kind] = Array.from({ length: hybridCount(kind) }, (_, i) => sampleFieldSource(hybridSource(kind, i), ORBITAL_RESOLUTION));
    }
}, 60_000);

describe('hybrid recipes', () => {
    it('sizes the box to hold every orbital of the shell', () => {
        expect(combinationSamplingRadius(2)).toBe(Math.max(computeSamplingRadius(2, 0, 1), computeSamplingRadius(2, 1, 1)));
        expect(combinationSamplingRadius(1)).toBe(computeSamplingRadius(1, 0, 1));
    });

    it('builds sp³ h1 as (-2s + 2px + 2py + 2pz) / 2', () => {
        const terms = hybridRecipe('sp3', 0).terms.map(t => [t.orbital.l, t.orbital.ml, t.coefficient]);
        expect(terms).toEqual([[0, 0, -0.5], [1, 1, expect.closeTo(0.5, 12)], [1, -1, expect.closeTo(0.5, 12)], [1, 0, expect.closeTo(0.5, 12)]]);
    });

    it.each(KINDS)('gives every %s hybrid unit weight', kind => {
        for (let i = 0; i < hybridCount(kind); i++) {
            const weight = hybridRecipe(kind, i).terms.reduce((sum, t) => sum + t.coefficient ** 2, 0);
            expect(weight).toBeCloseTo(1, 12);
        }
    });

    it('names each hybrid stably', () => {
        expect(hybridSource('sp3', 2)).toMatchObject({ kind: 'analytic', id: 'hybrid:sp3:2', rMax: combinationSamplingRadius(2) });
    });
});

describe('hybrids on the sampling grid', () => {
    it.each(KINDS)('%s hybrids are orthonormal to 1e-3', kind => {
        const fields = sampled[kind]!;
        for (let i = 0; i < fields.length; i++) {
            for (let j = 0; j < fields.length; j++) {
                expect(Math.abs(overlapIntegral(fields[i], fields[j]) - (i === j ? 1 : 0))).toBeLessThan(1e-3);
            }
        }
    });

    it.each(KINDS)('every pair of %s lobes meets at the textbook angle, within 0.5°', kind => {
        const axes = sampled[kind]!.map(positiveLobeCentroid);
        for (let i = 0; i < axes.length; i++) {
            for (let j = i + 1; j < axes.length; j++) {
                expect(Math.abs(angleBetweenDegrees(axes[i], axes[j]) - EXPECTED_ANGLE[kind])).toBeLessThan(0.5);
            }
        }
    });

    it.each(KINDS)('each %s lobe points along its stated direction', kind => {
        sampled[kind]!.forEach((field, i) => {
            expect(angleBetweenDegrees(positiveLobeCentroid(field), HYBRID_DIRECTIONS[kind][i])).toBeLessThan(0.5);
        });
    });

    // Why the 2s enters with a minus sign: this is the lobe that carries the density.
    it.each(KINDS)('the positive %s lobe holds most of the electron', kind => {
        for (const field of sampled[kind]!) expect(positiveShare(field)).toBeGreaterThan(0.8);
    });
});

describe('validation row', () => {
    it('records the sp³ angle from the same computation the tests assert', () => {
        const row = VALIDATION.find(r => r.phase === 1 && r.quantity === 'inter-lobe angle');
        expect(row).toBeDefined();
        expect(row!.app).toBe(hybridLobeAngleDegrees('sp3', 0, 1));
        expect(row!.reference).toBeCloseTo(109.4712, 4);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/hybrids.test.ts`
Expected: FAIL, "Cannot find module '../src/hybrids'".

- [ ] **Step 3: Implement**

Append to `src/orbital_presets.ts`:

```ts
/**
 * The box for a combination of shell n's orbitals: the widest of their own
 * boxes, so no member is truncated. 21 a₀ for n = 2 (the 2s sets it), 7.6 a₀
 * for n = 1. Derived from the same radial distributions as every other box,
 * never from a formula of its own (docs/HANDOFF.md).
 */
export function combinationSamplingRadius(n: number): number {
    let radius = 0;
    for (let l = 0; l < n; l++) radius = Math.max(radius, computeSamplingRadius(n, l, BASIC_ORBITALS_Z));
    return radius;
}
```

```ts
// src/field_integrals.ts
import { SampledField } from './orbital_mesh';

/**
 * Quadrature on the render grid itself. The validation claims (spec §5 Phase
 * 1) are about the ψ actually drawn, so they are measured on exactly the
 * samples the mesher sees: a plain sum times the cell volume, which for a
 * field that has decayed at the box walls is the trapezoid rule.
 */

function assertSameGrid(a: SampledField, b: SampledField): void {
    if (a.side !== b.side || a.step !== b.step || a.origin !== b.origin) {
        throw new Error('Both fields must be sampled on the same grid');
    }
}

/** ⟨a|b⟩. */
export function overlapIntegral(a: SampledField, b: SampledField): number {
    assertSameGrid(a, b);
    let sum = 0;
    for (let i = 0; i < a.samples.length; i++) sum += a.samples[i] * b.samples[i];
    return sum * a.step ** 3;
}

/** ⟨a|z|b⟩. */
export function zMatrixElement(a: SampledField, b: SampledField): number {
    assertSameGrid(a, b);
    const { side, step, origin } = a;
    let sum = 0;
    let index = 0;
    for (let i = 0; i < side; i++) {
        for (let j = 0; j < side; j++) {
            for (let k = 0; k < side; k++, index++) {
                sum += a.samples[index] * (origin + k * step) * b.samples[index];
            }
        }
    }
    return sum * step ** 3;
}

/**
 * Where the positive lobe's density sits: Σ r ψ² over ψ > 0, over Σ ψ².
 * The whole drawn lobe decides it, not one grid point -- an argmax snaps to
 * the grid and would be degrees off.
 */
export function positiveLobeCentroid(field: SampledField): [number, number, number] {
    const { samples, side, step, origin } = field;
    let wx = 0, wy = 0, wz = 0, w = 0;
    let index = 0;
    for (let i = 0; i < side; i++) {
        const x = origin + i * step;
        for (let j = 0; j < side; j++) {
            const y = origin + j * step;
            for (let k = 0; k < side; k++, index++) {
                const value = samples[index];
                if (value <= 0) continue;
                const density = value * value;
                wx += x * density;
                wy += y * density;
                wz += (origin + k * step) * density;
                w += density;
            }
        }
    }
    if (!(w > 0)) throw new Error('The field has no positive lobe');
    return [wx / w, wy / w, wz / w];
}

/** The share of Σψ² carried where ψ > 0. */
export function positiveShare(field: SampledField): number {
    let positive = 0, total = 0;
    for (const value of field.samples) {
        const density = value * value;
        total += density;
        if (value > 0) positive += density;
    }
    return positive / total;
}

export function angleBetweenDegrees(u: readonly number[], v: readonly number[]): number {
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cos = dot / (Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2]));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
```

```ts
// src/hybrids.ts
import { AnalyticFieldSource, CombinationRecipe, HydrogenicRecipe } from './field_source';
import { sampleFieldSource } from './orbital_mesh';
import { positiveLobeCentroid, angleBetweenDegrees } from './field_integrals';
import { BASIC_ORBITALS_Z, ORBITAL_RESOLUTION, combinationSamplingRadius } from './orbital_presets';

/**
 * sp, sp² and sp³ hybrids of hydrogen's n = 2 shell:
 *
 *   hᵢ = −(1/√(k+1)) ψ₂ₛ + √(k/(k+1)) (dᵢ · p),   k = 1, 2, 3
 *
 * ⟨hᵢ|hⱼ⟩ = 1/(k+1) + (k/(k+1)) dᵢ·dⱼ, and dᵢ·dⱼ = −1, −½, −⅓ makes that
 * zero off the diagonal. The 2s enters with a minus sign: hydrogen's R₂₀ is
 * positive only inside its node at 2 a₀, and 95 % of the 2s density lies
 * beyond it, where it is negative. With +ψ₂ₛ each hybrid's large lobe would
 * point opposite its own label.
 */

export type HybridKind = 'sp' | 'sp2' | 'sp3';

export const HYBRID_NAMES: Record<HybridKind, string> = { sp: 'sp', sp2: 'sp²', sp3: 'sp³' };

const THIRD = 1 / Math.sqrt(3);

/** Unit lobe directions. sp along z, sp² in the xy plane (p_z is left for π), sp³ tetrahedral. */
export const HYBRID_DIRECTIONS: Record<HybridKind, Array<[number, number, number]>> = {
    sp: [[0, 0, 1], [0, 0, -1]],
    sp2: [[1, 0, 0], [-0.5, Math.sqrt(3) / 2, 0], [-0.5, -Math.sqrt(3) / 2, 0]],
    sp3: [[THIRD, THIRD, THIRD], [THIRD, -THIRD, -THIRD], [-THIRD, THIRD, -THIRD], [-THIRD, -THIRD, THIRD]],
};

export function hybridCount(kind: HybridKind): number {
    return HYBRID_DIRECTIONS[kind].length;
}

const n2 = (l: number, ml: number): HydrogenicRecipe => ({ type: 'hydrogenic', n: 2, l, ml, Z: BASIC_ORBITALS_Z });

/** In makeWaveFunctionEvaluator's real harmonics mₗ = +1 is p_x, −1 is p_y, 0 is p_z. */
export function hybridRecipe(kind: HybridKind, index: number): CombinationRecipe {
    const directions = HYBRID_DIRECTIONS[kind];
    if (!Number.isInteger(index) || index < 0 || index >= directions.length) {
        throw new Error(`${HYBRID_NAMES[kind]} has ${directions.length} hybrids; there is no hybrid ${index + 1}`);
    }
    const k = directions.length - 1;
    const s = 1 / Math.sqrt(k + 1);
    const p = Math.sqrt(k / (k + 1));
    const [dx, dy, dz] = directions[index];
    const terms = [
        { coefficient: -s, orbital: n2(0, 0) },
        { coefficient: p * dx, orbital: n2(1, 1) },
        { coefficient: p * dy, orbital: n2(1, -1) },
        { coefficient: p * dz, orbital: n2(1, 0) },
    ].filter(term => term.coefficient !== 0);
    return { type: 'combination', terms };
}

export function hybridSource(kind: HybridKind, index: number): AnalyticFieldSource {
    return { kind: 'analytic', id: `hybrid:${kind}:${index}`, recipe: hybridRecipe(kind, index), rMax: combinationSamplingRadius(2) };
}

/** Direction of a hybrid's positive (large) lobe, measured on the render grid. */
export function hybridLobeAxis(kind: HybridKind, index: number, resolution: number = ORBITAL_RESOLUTION): [number, number, number] {
    return positiveLobeCentroid(sampleFieldSource(hybridSource(kind, index), resolution));
}

export function hybridLobeAngleDegrees(kind: HybridKind, i: number, j: number, resolution: number = ORBITAL_RESOLUTION): number {
    return angleBetweenDegrees(hybridLobeAxis(kind, i, resolution), hybridLobeAxis(kind, j, resolution));
}
```

Replace `src/validation/phase1.ts` with:

```ts
import type { ValidationRow } from './references';
import { hybridLobeAngleDegrees } from '../hybrids';

/**
 * Phase 1 rows. Each `app` is computed here by the function its physics test
 * calls, so the table and the tests cannot disagree.
 */
export const TETRAHEDRAL_ANGLE_DEGREES = (Math.acos(-1 / 3) * 180) / Math.PI;

export const PHASE_1_ROWS: ValidationRow[] = [
    {
        phase: 1,
        quantity: 'inter-lobe angle',
        system: 'sp³ hybrids (H, n = 2)',
        app: hybridLobeAngleDegrees('sp3', 0, 1),
        reference: TETRAHEDRAL_ANGLE_DEGREES,
        unit: '°',
        // ±0.5° (spec §5 Phase 1) as a share of 109.47°.
        tolerancePercent: 0.456,
        referenceSource: 'tetrahedral geometry, arccos(−1/3)',
        method: 'density-weighted centroid of each hybrid\'s positive lobe, sampled on the 129³ render grid',
    },
];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/hybrids.test.ts tests/validation/references.test.ts && npx tsc --noEmit -p .`
Expected: PASS (about 10 s); the references test now also lists `phase 1: sp³ hybrids (H, n = 2) inter-lobe angle`.

- [ ] **Step 5: Commit**

```bash
git add src/field_integrals.ts src/hybrids.ts src/orbital_presets.ts src/validation/phase1.ts tests/hybrids.test.ts
git commit -m "feat(hybrids): sp, sp², sp³ hybrids of hydrogen n = 2, validated on the render grid

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Hydrogen in a field: polarised 1s and n = 2 Stark states

**Files:**
- Create: `src/stark.ts`
- Modify: `src/validation/phase1.ts`
- Test: `tests/stark.test.ts`

**Interfaces:**
- Consumes: `fieldProblem`, `MAX_FIELD_AU`, recipe types (Task 2); `sampleFieldSource`, `generateFieldMesh` (Task 3); `overlapIntegral`, `zMatrixElement` (Task 5); `combinationSamplingRadius` (Task 5).
- Produces: constants `HYDROGEN_POLARIZABILITY = 4.5`, `HYDROGEN_HYPERPOLARIZABILITY = 10665/8`, `STARK_N2_COEFFICIENT = 3`, `VOLTS_PER_METRE_PER_AU = 5.14220675e11`, `EV_PER_HARTREE = 27.211386`, `DEBYE_PER_EA0 = 2.541746`, `VALIDATION_FIELD_AU = 0.01`, `N2_MAX_FIELD_AU = 0.0039`; `type StarkState = 'lower' | 'upper'`; `overTheBarrierField(bindingEnergy): number`; `starkFieldProblem(field): string | null`; `polarized1sSource(field): AnalyticFieldSource`; `starkStateRecipe(state): CombinationRecipe`; `starkStateSource(state): AnalyticFieldSource`; `starkShiftHartree(state, field): number`; `inducedDipole(field): number`; `nextOrderDipoleShare(field): number`; `polarizabilityFromDrawnPsi(field?, resolution?): number`; `transitionDipole2s2pz(resolution?): number`; `formatVoltsPerMetre(field): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/stark.test.ts
import {
    polarized1sSource, starkStateSource, starkShiftHartree, inducedDipole, nextOrderDipoleShare,
    polarizabilityFromDrawnPsi, transitionDipole2s2pz, formatVoltsPerMetre, overTheBarrierField,
    starkFieldProblem, N2_MAX_FIELD_AU, HYDROGEN_POLARIZABILITY,
} from '../src/stark';
import { hybridSource } from '../src/hybrids';
import { makeFieldEvaluator, MAX_FIELD_AU } from '../src/field_source';
import { generateFieldMesh, sampleFieldSource } from '../src/orbital_mesh';
import { overlapIntegral, zMatrixElement } from '../src/field_integrals';
import { ENCLOSED_FRACTIONS, ORBITAL_RESOLUTION } from '../src/orbital_presets';
import { VALIDATION } from '../src/validation/references';

jest.setTimeout(60_000);

describe('polarised 1s (first-order, H′ = +Fz)', () => {
    it('gives α = 9/2 a0³ from the drawn ψ, within 1 %', () => {
        expect(Math.abs(polarizabilityFromDrawnPsi() - 4.5) / 4.5).toBeLessThan(0.01);
    });

    it('responds linearly, which is why α is measured at a small field', () => {
        expect(Math.abs(polarizabilityFromDrawnPsi(0.001) / polarizabilityFromDrawnPsi(0.01) - 1)).toBeLessThan(1e-3);
        // At 0.05 normalising the first-order ψ alone costs 1.4 %.
        const atTop = polarizabilityFromDrawnPsi(0.05);
        expect(atTop).toBeLessThan(4.5);
        expect(atTop).toBeGreaterThan(4.5 * 0.98);
    });

    it('states the displayed dipole and its next-order correction', () => {
        expect(inducedDipole(0.03)).toBeCloseTo(0.135, 12);
        expect(nextOrderDipoleShare(0.05)).toBeCloseTo(0.1234, 4);
        expect(nextOrderDipoleShare(0.03)).toBeCloseTo(0.0444, 4);
    });

    it('keeps the slider maximum below the field that frees the 1s electron', () => {
        expect(overTheBarrierField(0.5)).toBeCloseTo(0.0625, 12);
        expect(MAX_FIELD_AU).toBeLessThan(overTheBarrierField(0.5));
    });

    it('refuses fields above 0.05 a.u.', () => {
        expect(() => polarized1sSource(0.051)).toThrow(/refused/);
        expect(polarized1sSource(0.05)).toMatchObject({ id: 'polarized1s:F0.05', recipe: { type: 'polarized1s', field: 0.05 } });
    });

    // Review Focus 4: the first-order ψ changes sign where F z (1 + r/2) = 1,
    // z ≈ 5.4 a0 at F = 0.05. No offered contour may reach that false node.
    it.each(ENCLOSED_FRACTIONS)('never draws the first-order node, at %p enclosed', fraction => {
        const source = polarized1sSource(0.05);
        const mesh = generateFieldMesh(source, 64, fraction);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1]));
        const reach = Math.max(...mesh.positions.map(([x, y, z]) => Math.hypot(x, y, z)));
        expect(reach).toBeLessThan(0.8 * source.rMax);
        const zs = mesh.positions.map(([, , z]) => z);
        expect(-Math.min(...zs)).toBeGreaterThan(Math.max(...zs));   // pulled towards −z
    });
});

describe('n = 2 Stark states', () => {
    it('|⟨2s|z|2p_z⟩| = 3 a0 within 1 %, negative in this sign convention', () => {
        const element = transitionDipole2s2pz();
        expect(element).toBeLessThan(0);
        expect(Math.abs(Math.abs(element) - 3) / 3).toBeLessThan(0.01);
    });

    it('puts the lower state's density at −z, which is why its shift is −3F', () => {
        const lower = sampleFieldSource(starkStateSource('lower'), ORBITAL_RESOLUTION);
        const centroid = zMatrixElement(lower, lower) / overlapIntegral(lower, lower);
        expect(Math.abs(centroid + 3) / 3).toBeLessThan(0.01);
        expect(starkShiftHartree('lower', 0.002)).toBeCloseTo(-0.006, 12);
        expect(starkShiftHartree('upper', 0.002)).toBeCloseTo(0.006, 12);
    });

    it('is the sp hybrid shape: sp h1 = −(upper state)', () => {
        const sp = makeFieldEvaluator(hybridSource('sp', 0).recipe);
        const upper = makeFieldEvaluator(starkStateSource('upper').recipe);
        for (const [x, y, z] of [[0.5, 0.2, 1], [-2, 1, -3], [0, 0, 6]] as const) {
            expect(sp(x, y, z)).toBeCloseTo(-upper(x, y, z), 14);
        }
    });

    it('refuses fields that would free an n = 2 electron', () => {
        expect(overTheBarrierField(1 / 8)).toBeCloseTo(1 / 256, 12);
        expect(N2_MAX_FIELD_AU).toBeLessThanOrEqual(1 / 256);
        expect(starkFieldProblem(N2_MAX_FIELD_AU)).toBeNull();
        expect(starkFieldProblem(0.01)).toMatch(/not bound/);
        expect(starkFieldProblem(-1)).toMatch(/not bound/);
    });
});

describe('units', () => {
    it('shows the field in V/m', () => {
        expect(formatVoltsPerMetre(0.03)).toBe('1.54 × 10¹⁰ V/m');
        expect(formatVoltsPerMetre(0.001)).toBe('5.14 × 10⁸ V/m');
        expect(formatVoltsPerMetre(0.0039)).toBe('2.01 × 10⁹ V/m');
        expect(formatVoltsPerMetre(0)).toBe('0 V/m');
    });
});

describe('validation rows', () => {
    const row = (quantity: string) => VALIDATION.find(r => r.phase === 1 && r.quantity === quantity)!;

    it('records α from the same computation the test asserts', () => {
        expect(row('static dipole polarisability α').app).toBe(polarizabilityFromDrawnPsi());
        expect(row('static dipole polarisability α').reference).toBe(HYDROGEN_POLARIZABILITY);
    });

    it('records |⟨2s|z|2p_z⟩| from the same computation the test asserts', () => {
        expect(row('|⟨2s|z|2p_z⟩|').app).toBe(Math.abs(transitionDipole2s2pz()));
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/stark.test.ts`
Expected: FAIL, "Cannot find module '../src/stark'".

- [ ] **Step 3: Implement**

```ts
// src/stark.ts
import { AnalyticFieldSource, CombinationRecipe, HydrogenicRecipe, fieldProblem } from './field_source';
import { sampleFieldSource } from './orbital_mesh';
import { overlapIntegral, zMatrixElement } from './field_integrals';
import { BASIC_ORBITALS_Z, ORBITAL_RESOLUTION, combinationSamplingRadius } from './orbital_presets';

/**
 * Hydrogen in a uniform field F along +z, H′ = +F z (atomic units): the field
 * pulls the electron towards −z.
 *
 * n = 1: ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ (Dalgarno–Lewis, exact to first order),
 * ⟨z⟩ = −2F⟨z²(1 + r/2)⟩₁ₛ = −9F/2, so μ = αF with α = 9/2 a₀³.
 * n = 2: the degenerate level splits to first order into (2s ± 2p_z)/√2 with
 * shifts ±3F, since ⟨2s|z|2p_z⟩ = −3 a₀ in this code's sign convention.
 */

export const HYDROGEN_POLARIZABILITY = 4.5;
/** γ for hydrogen, exact: 10665/8 a.u. μ = αF + γF³/6. */
export const HYDROGEN_HYPERPOLARIZABILITY = 10665 / 8;
export const STARK_N2_COEFFICIENT = 3;
export const VOLTS_PER_METRE_PER_AU = 5.14220675e11;
export const EV_PER_HARTREE = 27.211386;
export const DEBYE_PER_EA0 = 2.541746;
/** Where α is measured: small enough that normalising the first-order ψ costs 0.05 %. */
export const VALIDATION_FIELD_AU = 0.01;

export type StarkState = 'lower' | 'upper';

/**
 * Classically, V = −1/r + Fz peaks at −2√F on the −z side, so a state bound
 * by E escapes over the barrier once F > E²/4.
 */
export function overTheBarrierField(bindingEnergy: number): number {
    return (bindingEnergy * bindingEnergy) / 4;
}

/** n = 2's limit, E = −1/8 Ha: 1/256 ≈ 0.0039 a.u., rounded down. */
export const N2_MAX_FIELD_AU = Math.floor(overTheBarrierField(1 / 8) * 1e4) / 1e4;

export function starkFieldProblem(field: number): string | null {
    if (Number.isFinite(field) && field >= 0 && field <= N2_MAX_FIELD_AU) return null;
    return `A field of ${field} a.u. is refused at n = 2: an n = 2 electron is not bound above about ${N2_MAX_FIELD_AU} a.u. (the field lowers the barrier below its energy, F = E²/4 with E = −1/8 Ha).`;
}

export function polarized1sSource(field: number): AnalyticFieldSource {
    const problem = fieldProblem(field);
    if (problem) throw new Error(problem);
    return { kind: 'analytic', id: `polarized1s:F${field}`, recipe: { type: 'polarized1s', field }, rMax: combinationSamplingRadius(1) };
}

const n2 = (l: number, ml: number): HydrogenicRecipe => ({ type: 'hydrogenic', n: 2, l, ml, Z: BASIC_ORBITALS_Z });

/** lower = (2s + 2p_z)/√2, shifted by −3F; upper = (2s − 2p_z)/√2, by +3F. */
export function starkStateRecipe(state: StarkState): CombinationRecipe {
    const pSign = state === 'lower' ? 1 : -1;
    return { type: 'combination', terms: [
        { coefficient: Math.SQRT1_2, orbital: n2(0, 0) },
        { coefficient: pSign * Math.SQRT1_2, orbital: n2(1, 0) },
    ] };
}

export function starkStateSource(state: StarkState): AnalyticFieldSource {
    return { kind: 'analytic', id: `stark:n2:${state}`, recipe: starkStateRecipe(state), rMax: combinationSamplingRadius(2) };
}

export function starkShiftHartree(state: StarkState, field: number): number {
    return (state === 'lower' ? -1 : 1) * STARK_N2_COEFFICIENT * field;
}

/** μ = αF, e·a₀. */
export function inducedDipole(field: number): number {
    return HYDROGEN_POLARIZABILITY * field;
}

/** (γF³/6) / (αF): how much the next order would change μ. */
export function nextOrderDipoleShare(field: number): number {
    return (HYDROGEN_HYPERPOLARIZABILITY * field * field) / (6 * HYDROGEN_POLARIZABILITY);
}

/** α = −⟨ψ|z|ψ⟩ / (F ⟨ψ|ψ⟩) from the ψ actually drawn, on the render grid. */
export function polarizabilityFromDrawnPsi(field: number = VALIDATION_FIELD_AU, resolution: number = ORBITAL_RESOLUTION): number {
    if (!(field > 0)) throw new Error('α needs a non-zero field to measure a response');
    const psi = sampleFieldSource(polarized1sSource(field), resolution);
    return -zMatrixElement(psi, psi) / (field * overlapIntegral(psi, psi));
}

/** ⟨2s|z|2p_z⟩ on the render grid; −3 a₀ exactly. */
export function transitionDipole2s2pz(resolution: number = ORBITAL_RESOLUTION): number {
    const rMax = combinationSamplingRadius(2);
    const s = sampleFieldSource({ kind: 'analytic', id: 'hydrogenic:2,0,0,Z1', recipe: n2(0, 0), rMax }, resolution);
    const pz = sampleFieldSource({ kind: 'analytic', id: 'hydrogenic:2,1,0,Z1', recipe: n2(1, 0), rMax }, resolution);
    return zMatrixElement(s, pz);
}

const SUPERSCRIPT: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** "1.54 × 10¹⁰ V/m". */
export function formatVoltsPerMetre(field: number): string {
    const voltsPerMetre = field * VOLTS_PER_METRE_PER_AU;
    if (!(voltsPerMetre > 0)) return '0 V/m';
    let exponent = Math.floor(Math.log10(voltsPerMetre));
    let mantissa = (voltsPerMetre / 10 ** exponent).toFixed(2);
    if (mantissa === '10.00') {
        exponent += 1;
        mantissa = '1.00';
    }
    const power = String(exponent).split('').map(c => SUPERSCRIPT[c]).join('');
    return `${mantissa} × 10${power} V/m`;
}
```

Append to `PHASE_1_ROWS` in `src/validation/phase1.ts` (and add `import { polarizabilityFromDrawnPsi, transitionDipole2s2pz, HYDROGEN_POLARIZABILITY, VALIDATION_FIELD_AU } from '../stark';`):

```ts
    {
        phase: 1,
        quantity: 'static dipole polarisability α',
        system: 'H 1s',
        app: polarizabilityFromDrawnPsi(),
        reference: HYDROGEN_POLARIZABILITY,
        unit: 'a₀³',
        tolerancePercent: 1,
        referenceSource: 'exact (Dalgarno & Lewis 1955)',
        method: `first-order ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ sampled on the 129³ render grid; α = −⟨ψ|z|ψ⟩ / (F⟨ψ|ψ⟩) at F = ${VALIDATION_FIELD_AU} a.u.`,
    },
    {
        phase: 1,
        quantity: '|⟨2s|z|2p_z⟩|',
        system: 'H n = 2',
        app: Math.abs(transitionDipole2s2pz()),
        reference: 3,
        unit: 'a₀',
        tolerancePercent: 1,
        referenceSource: 'exact hydrogen matrix element (Bethe & Salpeter 1957)',
        method: 'quadrature of 2s · z · 2p_z on the 129³ render grid (box 21 a₀)',
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/stark.test.ts tests/validation/references.test.ts && npx tsc --noEmit -p .`
Expected: PASS. The expected measured values are α ≈ 4.4966 and ⟨2s|z|2p_z⟩ ≈ −2.99998. If α is off by more than 0.2 %, the box or sign is wrong. Recheck against the Design decisions derivation; do not widen the tolerance.

- [ ] **Step 5: Commit**

```bash
git add src/stark.ts src/validation/phase1.ts tests/stark.test.ts
git commit -m "feat(stark): polarised 1s and n = 2 Stark states, α and ⟨2s|z|2p_z⟩ validated on the render grid

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The combination selection model

**Files:**
- Create: `src/combinations.ts`
- Modify: `src/orbital_presets.ts` (append `OVERLAY_RESOLUTION`, `basicOrbitalParams`)
- Test: `tests/combinations.test.ts`

**Interfaces:**
- Consumes: hybrids (Task 5), stark (Task 6), `fieldProblem`, `FieldRenderRequest` (Task 2), `radialProfile` (`src/radial_distribution.ts`), `CURVE_COLORS` (`src/curve_colors.ts`), `RadialCurve` type (`src/components/RadialPlot.tsx`).
- Produces: `type StarkChoice = StarkState | 'both'`; `type CombinationSelection = { kind: 'none' } | { kind: 'hybrid'; hybrid: HybridKind; member: number | 'all' } | { kind: 'field'; level: 1 | 2; field: number; stark: StarkChoice }`; `NO_COMBINATION`; `DEFAULT_FIELD_AU = 0.03`; `OVERLAY_COLORS: string[]`; `hybridMemberLabel(i): string`; `selectionProblem(selection): string | null`; `fieldSourcesFor(selection): AnalyticFieldSource[]`; `fieldRequestFor(selection, enclosedFraction): FieldRenderRequest | null`; `combinationTitle(selection): string`; `combinationCurves(selection): { curves: RadialCurve[]; rMax: number } | null`; `overlayLegend(selection): Array<{ label: string; color: string }> | null`. `orbital_presets.ts`: `OVERLAY_RESOLUTION = 96`, `basicOrbitalParams(n, l, ml, enclosedFraction): OrbitalParams`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/combinations.test.ts
import {
    NO_COMBINATION, OVERLAY_COLORS, fieldRequestFor, combinationTitle, combinationCurves, overlayLegend,
    selectionProblem, CombinationSelection,
} from '../src/combinations';
import { ORBITAL_RESOLUTION, OVERLAY_RESOLUTION, combinationSamplingRadius, basicOrbitalParams, computeSamplingRadius } from '../src/orbital_presets';
import { CURVE_COLORS } from '../src/curve_colors';

const sp3All: CombinationSelection = { kind: 'hybrid', hybrid: 'sp3', member: 'all' };
const field = (level: 1 | 2, F: number, stark: 'lower' | 'upper' | 'both' = 'lower'): CombinationSelection =>
    ({ kind: 'field', level, field: F, stark });

describe('fieldRequestFor', () => {
    it('asks for nothing when no combination is chosen', () => {
        expect(fieldRequestFor(NO_COMBINATION, 0.9)).toBeNull();
    });

    it('overlays every sp³ hybrid in its own colour, at the overlay resolution', () => {
        const request = fieldRequestFor(sp3All, 0.75)!;
        expect(request.sources.map(s => s.id)).toEqual(['hybrid:sp3:0', 'hybrid:sp3:1', 'hybrid:sp3:2', 'hybrid:sp3:3']);
        expect(request.colors).toEqual(OVERLAY_COLORS.slice(0, 4));
        expect(request.resolution).toBe(OVERLAY_RESOLUTION);
        expect(request.enclosedFraction).toBe(0.75);
        expect(request.label).toBe('sp³ hybrids — all 4');
    });

    it('draws one hybrid alone at full resolution', () => {
        const request = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp2', member: 1 }, 0.9)!;
        expect(request.sources.map(s => s.id)).toEqual(['hybrid:sp2:1']);
        expect(request.resolution).toBe(ORBITAL_RESOLUTION);
    });

    it('draws the polarised 1s at the chosen field', () => {
        const request = fieldRequestFor(field(1, 0.03), 0.9)!;
        expect(request.sources[0]).toMatchObject({ recipe: { type: 'polarized1s', field: 0.03 }, rMax: combinationSamplingRadius(1) });
    });

    it('draws both n = 2 Stark states together', () => {
        expect(fieldRequestFor(field(2, 0.002, 'both'), 0.9)!.sources.map(s => s.id)).toEqual(['stark:n2:lower', 'stark:n2:upper']);
    });

    // Review Focus 3: values that did not come from the UI's own controls.
    it.each<[string, CombinationSelection]>([
        ['a field above 0.05 a.u.', field(1, 0.08)],
        ['an n = 2 field that frees the electron', field(2, 0.01)],
        ['a hybrid that does not exist', { kind: 'hybrid', hybrid: 'sp', member: 2 }],
    ])('refuses %s, with a reason', (_name, selection) => {
        expect(fieldRequestFor(selection, 0.9)).toBeNull();
        expect(selectionProblem(selection)).toMatch(/refused|no hybrid/);
    });
});

describe('titles and legends', () => {
    it.each<[CombinationSelection, string]>([
        [sp3All, 'sp³ hybrids — all 4'],
        [{ kind: 'hybrid', hybrid: 'sp', member: 1 }, 'sp hybrid h₂'],
        [field(1, 0.03), 'H 1s in a field, F = 0.030 a.u.'],
        [field(2, 0.002, 'lower'), 'n = 2 Stark state (2s + 2p_z)/√2'],
        [field(2, 0.002, 'both'), 'n = 2 Stark states'],
    ])('names %j "%s"', (selection, title) => {
        expect(combinationTitle(selection)).toBe(title);
    });

    it('keys an overlay by member, and has no key for a single source', () => {
        expect(overlayLegend(sp3All)).toEqual(OVERLAY_COLORS.slice(0, 4).map((color, i) => ({ label: `h${'₁₂₃₄'[i]}`, color })));
        expect(overlayLegend(field(2, 0.002, 'both'))!.map(item => item.label)).toEqual(['(2s + 2p_z)/√2, −3F', '(2s − 2p_z)/√2, +3F']);
        expect(overlayLegend({ kind: 'hybrid', hybrid: 'sp3', member: 0 })).toBeNull();
        expect(overlayLegend(field(1, 0.03))).toBeNull();
    });

    it('keeps overlay colours clear of the red and blue that mean the sign of ψ', () => {
        expect(OVERLAY_COLORS).toEqual([CURVE_COLORS[2], CURVE_COLORS[3], CURVE_COLORS[4], CURVE_COLORS[5]]);
    });
});

describe('combinationCurves', () => {
    it('plots 2s, 2p and each sp³ hybrid as exactly ¼·2s + ¾·2p', () => {
        const { curves, rMax } = combinationCurves(sp3All)!;
        expect(rMax).toBe(combinationSamplingRadius(2));
        expect(curves.map(c => c.label)).toEqual(['2s', '2p', 'each hybrid: ¼·2s + ¾·2p']);
        const [s, p, sum] = curves;
        sum.points.forEach((point, i) => expect(point.value).toBeCloseTo(0.25 * s.points[i].value + 0.75 * p.points[i].value, 14));
        let integral = 0;
        for (let i = 1; i < sum.points.length; i++) {
            integral += 0.5 * (sum.points[i].value + sum.points[i - 1].value) * (sum.points[i].r - sum.points[i - 1].r);
        }
        expect(integral).toBeCloseTo(1, 3);
    });

    it('says the 1s radial distribution does not change to first order', () => {
        expect(combinationCurves(field(1, 0.03))!.curves.map(c => c.label)).toEqual(['1s — unchanged to first order in F']);
    });

    it('has nothing to plot for no combination', () => {
        expect(combinationCurves(NO_COMBINATION)).toBeNull();
    });
});

describe('basicOrbitalParams', () => {
    it('is the Basic Orbitals render of one orbital', () => {
        expect(basicOrbitalParams(3, 2, 0, 0.9)).toEqual({
            n: 3, l: 2, ml: 0, Z: 1, resolution: ORBITAL_RESOLUTION, rMax: computeSamplingRadius(3, 2, 1), enclosedFraction: 0.9,
        });
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/combinations.test.ts`
Expected: FAIL, "Cannot find module '../src/combinations'".

- [ ] **Step 3: Implement**

Append to `src/orbital_presets.ts` (add `import { OrbitalParams } from './types/orbital';` at the top):

```ts
/**
 * Grid for an overlay of several combinations at once (all four sp³
 * hybrids): each member is a full mesh, and the composition view already
 * trades resolution for count the same way (compositeResolutionFor). 96³
 * keeps an sp³ overlay inside the 1.5 s budget (spec §3.7).
 */
export const OVERLAY_RESOLUTION = 96;

/** The Basic Orbitals render of one orbital. */
export function basicOrbitalParams(n: number, l: number, ml: number, enclosedFraction: number): OrbitalParams {
    return {
        n, l, ml, Z: BASIC_ORBITALS_Z,
        resolution: ORBITAL_RESOLUTION,
        rMax: computeSamplingRadius(n, l, BASIC_ORBITALS_Z),
        enclosedFraction,
    };
}
```

```ts
// src/combinations.ts
import type { RadialCurve } from './components/RadialPlot';
import { AnalyticFieldSource, FieldRenderRequest, fieldProblem } from './field_source';
import { HybridKind, HYBRID_NAMES, hybridCount, hybridSource } from './hybrids';
import { StarkState, polarized1sSource, starkFieldProblem, starkStateSource } from './stark';
import { ORBITAL_RESOLUTION, OVERLAY_RESOLUTION, BASIC_ORBITALS_Z, combinationSamplingRadius } from './orbital_presets';
import { radialProfile } from './radial_distribution';
import { CURVE_COLORS } from './curve_colors';

/** What Basic Orbitals' Combination picker has chosen. */
export type StarkChoice = StarkState | 'both';

export type CombinationSelection =
    | { kind: 'none' }
    | { kind: 'hybrid'; hybrid: HybridKind; member: number | 'all' }
    | { kind: 'field'; level: 1 | 2; field: number; stark: StarkChoice };

export const NO_COMBINATION: CombinationSelection = { kind: 'none' };

/** Where the field slider starts: visibly polarised, and first-order theory still within 5 % in μ. */
export const DEFAULT_FIELD_AU = 0.03;

/**
 * One colour per overlaid member. Red and blue are skipped: everywhere else in
 * the app they mean ψ > 0 and ψ < 0, and each member keeps that distinction as
 * a darker shade of its own colour.
 */
export const OVERLAY_COLORS: string[] = [CURVE_COLORS[2], CURVE_COLORS[3], CURVE_COLORS[4], CURVE_COLORS[5]];

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

/** "h₁" for member 0. */
export function hybridMemberLabel(index: number): string {
    return `h${String(index + 1).split('').map(d => SUBSCRIPTS[Number(d)]).join('')}`;
}

const STARK_LABEL: Record<StarkState, string> = { lower: '(2s + 2p_z)/√2', upper: '(2s − 2p_z)/√2' };

/** Why a selection cannot be drawn, or null. A selection may come from elsewhere than the controls (Phase 2's URL state). */
export function selectionProblem(selection: CombinationSelection): string | null {
    if (selection.kind === 'field') {
        return selection.level === 1 ? fieldProblem(selection.field) : starkFieldProblem(selection.field);
    }
    if (selection.kind === 'hybrid' && selection.member !== 'all') {
        const count = hybridCount(selection.hybrid);
        const member = selection.member;
        if (!Number.isInteger(member) || member < 0 || member >= count) {
            return `${HYBRID_NAMES[selection.hybrid]} has ${count} hybrids; there is no hybrid ${member + 1}.`;
        }
    }
    return null;
}

export function fieldSourcesFor(selection: CombinationSelection): AnalyticFieldSource[] {
    if (selection.kind === 'none' || selectionProblem(selection)) return [];
    if (selection.kind === 'hybrid') {
        const members = selection.member === 'all'
            ? Array.from({ length: hybridCount(selection.hybrid) }, (_, i) => i)
            : [selection.member];
        return members.map(i => hybridSource(selection.hybrid, i));
    }
    if (selection.level === 1) return [polarized1sSource(selection.field)];
    return selection.stark === 'both'
        ? [starkStateSource('lower'), starkStateSource('upper')]
        : [starkStateSource(selection.stark)];
}

export function combinationTitle(selection: CombinationSelection): string {
    switch (selection.kind) {
        case 'none': return '';
        case 'hybrid':
            return selection.member === 'all'
                ? `${HYBRID_NAMES[selection.hybrid]} hybrids — all ${hybridCount(selection.hybrid)}`
                : `${HYBRID_NAMES[selection.hybrid]} hybrid ${hybridMemberLabel(selection.member)}`;
        case 'field':
            if (selection.level === 1) return `H 1s in a field, F = ${selection.field.toFixed(3)} a.u.`;
            return selection.stark === 'both' ? 'n = 2 Stark states' : `n = 2 Stark state ${STARK_LABEL[selection.stark]}`;
    }
}

export function fieldRequestFor(selection: CombinationSelection, enclosedFraction: number): FieldRenderRequest | null {
    const sources = fieldSourcesFor(selection);
    if (sources.length === 0) return null;
    return {
        sources,
        colors: sources.map((_, i) => OVERLAY_COLORS[i % OVERLAY_COLORS.length]),
        resolution: sources.length > 1 ? OVERLAY_RESOLUTION : ORBITAL_RESOLUTION,
        enclosedFraction,
        label: combinationTitle(selection),
    };
}

/** The colour key for an overlay; null when a single source is drawn in phase colours. */
export function overlayLegend(selection: CombinationSelection): Array<{ label: string; color: string }> | null {
    const sources = fieldSourcesFor(selection);
    if (sources.length < 2) return null;
    if (selection.kind === 'field') {
        return [
            { label: `${STARK_LABEL.lower}, −3F`, color: OVERLAY_COLORS[0] },
            { label: `${STARK_LABEL.upper}, +3F`, color: OVERLAY_COLORS[1] },
        ];
    }
    return sources.map((_, i) => ({ label: hybridMemberLabel(i), color: OVERLAY_COLORS[i] }));
}

const WEIGHT_LABEL: Record<number, string> = { 1: '½·2s + ½·2p', 2: '⅓·2s + ⅔·2p', 3: '¼·2s + ¾·2p' };

/**
 * The radial plot for a combination: its ingredients and the result. The
 * spherical average of |Σ cᵢ R Y|² is Σ cᵢ² R², because the cross terms
 * integrate to zero over angles, so the weighted sum is the combination's
 * exact radial distribution, not an illustration of it.
 */
export function combinationCurves(selection: CombinationSelection): { curves: RadialCurve[]; rMax: number } | null {
    if (selection.kind === 'none' || selectionProblem(selection)) return null;
    const curveOf = (n: number, l: number, rMax: number) =>
        radialProfile(n, l, BASIC_ORBITALS_Z, rMax, 240).map(point => ({ r: point.r, value: point.probability }));

    if (selection.kind === 'field' && selection.level === 1) {
        const rMax = combinationSamplingRadius(1);
        return { rMax, curves: [{ label: '1s — unchanged to first order in F', color: CURVE_COLORS[0], points: curveOf(1, 0, rMax) }] };
    }

    const k = selection.kind === 'hybrid' ? hybridCount(selection.hybrid) - 1 : 1;
    const rMax = combinationSamplingRadius(2);
    const s = curveOf(2, 0, rMax);
    const p = curveOf(2, 1, rMax);
    const sWeight = 1 / (k + 1);
    const sum = s.map((point, i) => ({ r: point.r, value: sWeight * point.value + (1 - sWeight) * p[i].value }));
    const noun = selection.kind === 'hybrid' ? 'each hybrid' : 'each Stark state';
    return {
        rMax,
        curves: [
            { label: '2s', color: CURVE_COLORS[0], points: s },
            { label: '2p', color: CURVE_COLORS[1], points: p },
            { label: `${noun}: ${WEIGHT_LABEL[k]}`, color: CURVE_COLORS[7], points: sum },
        ],
    };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/combinations.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/combinations.ts src/orbital_presets.ts tests/combinations.test.ts
git commit -m "feat(combinations): selection model, render requests, titles, radial curves

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Redux: the field render request

**Files:**
- Modify: `src/store/orbitalSlice.ts`
- Test: `tests/orbital_slice.test.ts`

**Interfaces:**
- Consumes: `FieldRenderRequest` (Task 2); `setMode` from `src/store/atomSlice.ts`.
- Produces: `OrbitalState.currentField: FieldRenderRequest | null`; action `startFieldCalculation(request: FieldRenderRequest)`. `startOrbitalCalculation` clears `currentField`, `startFieldCalculation` clears `currentParams`, and `setMode('atom')` clears `currentField`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orbital_slice.test.ts
import reducer, { startOrbitalCalculation, startFieldCalculation } from '../src/store/orbitalSlice';
import { setMode } from '../src/store/atomSlice';
import { fieldRequestFor } from '../src/combinations';
import { basicOrbitalParams } from '../src/orbital_presets';

const request = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }, 0.9)!;

describe('orbitalSlice field requests', () => {
    it('starts with nothing requested', () => {
        expect(reducer(undefined, { type: '@@init' }).currentField).toBeNull();
    });

    it('holds exactly one of an orbital and a field', () => {
        let state = reducer(undefined, startOrbitalCalculation(basicOrbitalParams(3, 2, 0, 0.9)));
        state = reducer(state, startFieldCalculation(request));
        expect(state.currentField).toEqual(request);
        expect(state.currentParams).toBeNull();
        expect(state.isLoading).toBe(true);

        state = reducer(state, startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9)));
        expect(state.currentField).toBeNull();
        expect(state.currentParams).toMatchObject({ n: 2, l: 1 });
    });

    // Review Focus 2: a hybrid must not be drawn over atom mode.
    it('forgets the field request when atom mode is chosen', () => {
        let state = reducer(undefined, startFieldCalculation(request));
        state = reducer(state, setMode('hydrogenic'));
        expect(state.currentField).toEqual(request);
        state = reducer(state, setMode('atom'));
        expect(state.currentField).toBeNull();
        expect(state.isLoading).toBe(false);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/orbital_slice.test.ts`
Expected: FAIL, "startFieldCalculation is not a function".

- [ ] **Step 3: Implement** (edit `src/store/orbitalSlice.ts`)

```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OrbitalParams, SurfaceStyle, defaultSurfaceStyle } from '../types/orbital';
import { FieldRenderRequest } from '../field_source';
import { setMode } from './atomSlice';

interface OrbitalState {
  currentParams: OrbitalParams | null;
  /**
   * A Basic Orbitals combination (hybrids, a field) to draw instead of
   * `currentParams`. At most one of the two is set: whichever was asked for
   * last is what is on screen.
   */
  currentField: FieldRenderRequest | null;
  // ...isLoading, error, viewResetNonce, surfaceStyle, isoLevel unchanged
}
```

Add `currentField: null` to `initialState`. In `startOrbitalCalculation` add `state.currentField = null;`. Add the reducer:

```ts
    startFieldCalculation: (state, action: PayloadAction<FieldRenderRequest>) => {
      state.isLoading = true;
      state.error = null;
      state.currentField = action.payload;
      state.currentParams = null;
    },
```

Add, after `reducers`:

```ts
  // Combinations belong to Basic Orbitals. Leaving for atom mode drops the
  // request, so no effect can redraw a hybrid over an atom; coming back
  // re-requests it from App's own selection.
  extraReducers: builder => {
    builder.addCase(setMode, (state, action) => {
      if (action.payload !== 'atom' || !state.currentField) return;
      state.currentField = null;
      state.isLoading = false;
    });
  }
```

Export `startFieldCalculation` from the actions list.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/orbital_slice.test.ts src/App.test.tsx && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/orbitalSlice.ts tests/orbital_slice.test.ts
git commit -m "feat(store): field render requests beside orbital params

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Drawing field requests: overlay view and `updateFieldInScene`

**Files:**
- Create: `src/field_overlay_view.ts`
- Modify: `src/orbital_visualizer.ts` (add `updateFieldInScene` after `updateOrbitalInScene`, ~line 1092; remove the unused `params` parameter of `updateSceneWithMeshData`, line 1501, and its one call, line 1037)
- Test: `tests/field_visualizer.test.ts`

**Interfaces:**
- Consumes: `FieldRenderRequest` (Task 2); `MeshData`; `createOrbitalMaterial` (`src/orbital_material.ts`); the `calculateFields` worker protocol (Task 4).
- Produces: `NEGATIVE_PHASE_SHADE = 0.45`; `overlayVertexColors(meshes: MeshData[], colors: string[]): Float32Array`; `createFieldOverlayGroup(meshes, colors, style: SurfaceStyle, clippingPlanes: THREE.Plane[]): THREE.Group` (`userData.isFieldOverlay = true`); `updateFieldInScene(context: VisualizerContext | null, request: FieldRenderRequest, showAxes?: boolean): Promise<RenderOutcome>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/field_visualizer.test.ts
import * as THREE from 'three';

jest.mock('../src/workers/createOrbitalWorker', () => ({ createOrbitalWorker: jest.fn() }));
jest.mock('../src/orbital_controls_factory', () => ({ createOrbitalControls: jest.fn() }));

import { createOrbitalWorker } from '../src/workers/createOrbitalWorker';
import { VisualizerContext, updateFieldInScene, setSurfaceStyle } from '../src/orbital_visualizer';
import { overlayVertexColors, NEGATIVE_PHASE_SHADE } from '../src/field_overlay_view';
import { defaultSurfaceStyle, MeshData } from '../src/types/orbital';
import { FieldRenderRequest } from '../src/field_source';
import { fieldRequestFor } from '../src/combinations';

function buildContext(): VisualizerContext {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e9);
    return {
        scene: new THREE.Scene(),
        camera,
        renderer: { domElement: document.createElement('canvas') } as unknown as THREE.WebGLRenderer,
        controls: { target: new THREE.Vector3(), update: () => {} } as unknown as VisualizerContext['controls'],
        currentOrbitalGroup: null,
        currentAxesHelper: null,
        isDisposed: false,
        surfaceStyle: { ...defaultSurfaceStyle },
        clipPlane,
        clippingPlanes: [clipPlane],
        currentCaps: null,
        activeWorker: null,
        requestCounter: 0,
    };
}

function fakeMesh(offset: number, signs: number[] = [1, 1, -1]): MeshData {
    return {
        positions: [[offset, 0, 0], [offset + 1, 0, 0], [offset, 1, 0]],
        cells: [[0, 1, 2]],
        psiSigns: signs,
        densityMap: { data: new Uint8Array(1), side: 1, rMax: 21 },
        isoLevel: 1e-4,
    };
}

function fakeWorker() {
    return {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null as ((e: { data: unknown }) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
    };
}

const overlay: FieldRenderRequest = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp', member: 'all' }, 0.9)!;
const single: FieldRenderRequest = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp', member: 0 }, 0.9)!;

describe('overlayVertexColors', () => {
    it('colours each member its own colour, darker where ψ < 0', () => {
        const colors = overlayVertexColors([fakeMesh(0), fakeMesh(5, [1, -1, 1])], ['#ffd166', '#06d6a0']);
        const first = new THREE.Color('#ffd166');
        const second = new THREE.Color('#06d6a0');
        expect(Array.from(colors.slice(0, 3))).toEqual([first.r, first.g, first.b].map(c => Math.fround(c)));
        expect(Array.from(colors.slice(6, 9))).toEqual([first.r, first.g, first.b].map(c => Math.fround(c * NEGATIVE_PHASE_SHADE)));
        expect(Array.from(colors.slice(12, 15))).toEqual([second.r, second.g, second.b].map(c => Math.fround(c * NEGATIVE_PHASE_SHADE)));
    });
});

describe('updateFieldInScene', () => {
    it('asks the worker for every source in one message', () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        void updateFieldInScene(buildContext(), overlay);
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'calculateFields', request: overlay });
    });

    it('draws several sources as one merged overlay mesh, without cut-face caps', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, overlay);
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });

        expect(await pending).toEqual({ status: 'rendered', isoLevel: 1e-4 });
        const group = context.currentOrbitalGroup!;
        expect(group.userData.isFieldOverlay).toBe(true);
        const meshes = group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
        expect(meshes).toHaveLength(1);
        expect(meshes[0].geometry.getAttribute('position').count).toBe(6);
        expect(Array.from(meshes[0].geometry.getIndex()!.array)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(context.currentCaps).toBeNull();
    });

    it('draws a single source like any orbital, with its cut-face caps', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, single);
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0)] } });
        await pending;
        expect(context.currentOrbitalGroup!.userData.isFieldOverlay).toBeUndefined();
        expect(context.currentCaps).not.toBeNull();
    });

    it('drops a result a newer request has superseded', async () => {
        const first = fakeWorker();
        const second = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValueOnce(first).mockReturnValueOnce(second);
        const context = buildContext();
        const firstPending = updateFieldInScene(context, overlay);
        const secondPending = updateFieldInScene(context, single);
        first.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });
        second.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0)] } });
        expect(await firstPending).toEqual({ status: 'superseded' });
        expect((await secondPending).status).toBe('rendered');
        expect(context.currentOrbitalGroup!.userData.isFieldOverlay).toBeUndefined();
    });

    it('reports a worker error as a failure', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const pending = updateFieldInScene(buildContext(), single);
        worker.onmessage!({ data: { type: 'error', message: 'A field of 0.08 a.u. is refused' } });
        await expect(pending).rejects.toThrow(/refused/);
    });

    // Review Focus 5.
    it('restyles the overlay without recomputing', async () => {
        const worker = fakeWorker();
        (createOrbitalWorker as jest.Mock).mockReturnValue(worker);
        const context = buildContext();
        const pending = updateFieldInScene(context, overlay);
        worker.onmessage!({ data: { type: 'fieldsSuccess', meshes: [fakeMesh(0), fakeMesh(5)] } });
        await pending;
        (createOrbitalWorker as jest.Mock).mockClear();

        setSurfaceStyle(context, { mode: 'wireframe', opacity: 0.4, clipAxis: 'x', clipPosition: 0 });
        const material = (context.currentOrbitalGroup!.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(material.wireframe).toBe(true);
        expect(material.opacity).toBeCloseTo(0.4, 12);
        expect(context.clipPlane.normal.toArray()).toEqual([-1, 0, 0]);
        expect(createOrbitalWorker).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/field_visualizer.test.ts`
Expected: FAIL, "Cannot find module '../src/field_overlay_view'".

- [ ] **Step 3: Implement**

```ts
// src/field_overlay_view.ts
import * as THREE from 'three';
import { MeshData, SurfaceStyle } from './types/orbital';
import { createOrbitalMaterial } from './orbital_material';

/**
 * Several field sources at once (all four sp³ hybrids, both Stark states) as
 * one mesh. Each member takes its own colour, and the ψ < 0 parts are a
 * darker shade of it, so phase stays legible without red and blue.
 *
 * There are no cut-face caps: the stencil caps assume one capped object on
 * screen (see shell_composition_view.ts's module doc, which makes the same
 * call for the composition lobes). A cut still opens the overlay; it shows
 * the inside of the lobes rather than a shaded cross-section.
 */

export const NEGATIVE_PHASE_SHADE = 0.45;

/** Linear-space RGB per vertex, member by member, in the order `meshes` are given. */
export function overlayVertexColors(meshes: MeshData[], colors: string[]): Float32Array {
    const total = meshes.reduce((count, mesh) => count + mesh.positions.length, 0);
    const out = new Float32Array(total * 3);
    let vertex = 0;
    meshes.forEach((mesh, i) => {
        // THREE.Color converts the sRGB hex into the linear working space vertex colours are read in.
        const color = new THREE.Color(colors[i % colors.length]);
        for (const sign of mesh.psiSigns) {
            const shade = sign > 0 ? 1 : NEGATIVE_PHASE_SHADE;
            out[vertex * 3] = color.r * shade;
            out[vertex * 3 + 1] = color.g * shade;
            out[vertex * 3 + 2] = color.b * shade;
            vertex++;
        }
    });
    return out;
}

export function createFieldOverlayGroup(
    meshes: MeshData[],
    colors: string[],
    style: SurfaceStyle,
    clippingPlanes: THREE.Plane[]
): THREE.Group {
    const positions: number[] = [];
    const indices: number[] = [];
    let offset = 0;
    for (const mesh of meshes) {
        for (const [x, y, z] of mesh.positions) positions.push(x, y, z);
        for (const [a, b, c] of mesh.cells) indices.push(a + offset, b + offset, c + offset);
        offset += mesh.positions.length;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(overlayVertexColors(meshes, colors), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const group = new THREE.Group();
    group.userData.isFieldOverlay = true;
    group.add(new THREE.Mesh(geometry, createOrbitalMaterial(style, clippingPlanes)));
    return group;
}
```

In `src/orbital_visualizer.ts`:

1. Imports: add `import { FieldRenderRequest } from './field_source';` and `import { createFieldOverlayGroup } from './field_overlay_view';`.
2. Change `function updateSceneWithMeshData(context: VisualizerContext, meshData: MeshData, params: OrbitalParams, crossFadeFromShellView: boolean = false)` to drop `params` (it is never read). The call in `updateOrbitalInScene` becomes `updateSceneWithMeshData(context, e.data.meshData, crossFadeFromShellView);`.
3. Beside `WorkerMessage` add:

```ts
interface WorkerFieldsSuccessMessage {
    type: 'fieldsSuccess';
    meshes: MeshData[];
}

type FieldWorkerMessage = WorkerFieldsSuccessMessage | WorkerErrorMessage;
```

4. After `updateOrbitalInScene`, add:

```ts
/** Replaces whatever is on screen with an overlay of several field meshes. */
function showFieldOverlay(context: VisualizerContext, meshes: MeshData[], colors: string[]): void {
    clearCurrentOrbital(context, context.scene);
    context.isShellView = false;
    context.isCompositionView = false;
    const group = createFieldOverlayGroup(meshes, colors, context.surfaceStyle, context.clippingPlanes);
    context.scene.add(group);
    context.currentOrbitalGroup = group;
    context.currentCaps = null;
}

/**
 * Draws a Basic Orbitals combination (spec §5 Phase 1): one source exactly as
 * an orbital (phase colours, capped cut face), several as a merged overlay.
 * The same worker, request counter and framing discipline as
 * updateOrbitalInScene -- only the newest request may own the scene.
 */
export async function updateFieldInScene(
    context: VisualizerContext | null,
    request: FieldRenderRequest,
    showAxes: boolean = true
): Promise<RenderOutcome> {
    if (!context) return { status: 'superseded' };

    context.activeWorker?.terminate();
    const requestId = ++context.requestCounter;
    cancelTransition(context);
    const startedAt = performance.now();

    const boxRMax = Math.max(...request.sources.map(source => source.rMax));

    return new Promise((resolve, reject) => {
        const worker = createOrbitalWorker();
        context.activeWorker = worker;

        const reframe = context.framedBox !== boxRMax;
        context.clipExtent = boxRMax;
        updateClipPlane(context.clipPlane, context.surfaceStyle.clipAxis, context.surfaceStyle.clipPosition, boxRMax);
        refreshCaps(context);

        const cleanup = () => {
            worker.terminate();
            if (context.activeWorker === worker) context.activeWorker = null;
        };
        const superseded = () => requestId !== context.requestCounter;

        worker.onmessage = (e: MessageEvent<FieldWorkerMessage>) => {
            if (superseded()) {
                cleanup();
                resolve({ status: 'superseded' });
                return;
            }
            try {
                if (e.data.type === 'fieldsSuccess') {
                    const meshes = e.data.meshes;
                    if (meshes.length === 1) {
                        updateSceneWithMeshData(context, meshes[0]);
                    } else {
                        showFieldOverlay(context, meshes, request.colors);
                    }
                    const surfaceRadius = Math.max(...meshes.map(meshRadius)) || boxRMax;
                    context.clipExtent = surfaceRadius;
                    updateClipPlane(context.clipPlane, context.surfaceStyle.clipAxis, context.surfaceStyle.clipPosition, surfaceRadius);
                    refreshCaps(context);
                    if (reframe) {
                        frameOrbital(context, (surfaceRadius * ORBITAL_FRAMING_MARGIN) / Math.sqrt(3));
                        context.framedBox = boxRMax;
                    }
                    if (showAxes) addAxesHelper(context, surfaceRadius * AXES_LENGTH_FACTOR);
                    else removeAxesHelper(context);
                    console.log(`Visualizer: ${request.label} drawn in ${Math.round(performance.now() - startedAt)} ms`);
                    resolve({ status: 'rendered', isoLevel: meshes[0].isoLevel });
                } else {
                    reject(new Error(e.data.message));
                }
            } catch (error) {
                console.error('Visualizer: Error drawing field meshes:', error);
                reject(error);
            } finally {
                cleanup();
            }
        };

        worker.onerror = (error) => {
            cleanup();
            if (superseded()) {
                resolve({ status: 'superseded' });
                return;
            }
            reject(error);
        };

        worker.postMessage({ type: 'calculateFields', request });
    });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/field_visualizer.test.ts tests/atom/visualizer_dispatch.test.ts tests/atom/level_transition_animation.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc clean. Nothing is reachable from the UI yet; live verification is in Task 11.

- [ ] **Step 5: Commit**

```bash
git add src/field_overlay_view.ts src/orbital_visualizer.ts tests/field_visualizer.test.ts
git commit -m "feat(render): draw field requests, overlaying several sources in their own colours

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The Combination controls

**Files:**
- Create: `src/components/CombinationControls.tsx`
- Modify: `src/components/Controls.tsx` (props interface ~line 25–74; heading line 227–229; n/l/mₗ selects 231–270; Update button 468–477), `src/style.css` (append)
- Test: `tests/combination_controls.test.tsx`, `src/components/Controls.test.tsx` (append)

**Interfaces:**
- Consumes: everything exported by `src/combinations.ts`, `src/stark.ts`, `src/hybrids.ts`, `MAX_FIELD_AU` (Tasks 5–7).
- Produces: `CombinationControls` with props `{ selection: CombinationSelection; onChange: (selection: CombinationSelection) => void }`; exported `HYBRID_CAPTION`, `FIELD_CAPTION`. `Controls` gains optional props `combination?: CombinationSelection` (default `NO_COMBINATION`) and `onCombinationChange?: (selection: CombinationSelection) => void`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/combination_controls.test.tsx
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CombinationControls from '../src/components/CombinationControls';
import { NO_COMBINATION, CombinationSelection, OVERLAY_COLORS } from '../src/combinations';

function renderWith(selection: CombinationSelection) {
    const onChange = jest.fn();
    render(<CombinationControls selection={selection} onChange={onChange} />);
    return onChange;
}

function choose(option: string | RegExp) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText(option));
}

const fieldAt = (level: 1 | 2, field: number, stark: 'lower' | 'upper' | 'both' = 'lower'): CombinationSelection =>
    ({ kind: 'field', level, field, stark });

describe('CombinationControls', () => {
    it('offers None, sp, sp², sp³ and Electric field', () => {
        renderWith(NO_COMBINATION);
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
        expect(within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent))
            .toEqual(['None (single orbital)', 'sp', 'sp²', 'sp³', 'Electric field']);
    });

    it('starts a hybrid set with all of them shown', () => {
        const onChange = renderWith(NO_COMBINATION);
        choose('sp³');
        expect(onChange).toHaveBeenCalledWith({ kind: 'hybrid', hybrid: 'sp3', member: 'all' });
    });

    it('starts the field at 0.03 a.u. for n = 1', () => {
        const onChange = renderWith(NO_COMBINATION);
        choose('Electric field');
        expect(onChange).toHaveBeenCalledWith({ kind: 'field', level: 1, field: 0.03, stark: 'lower' });
    });

    it('lets one hybrid be picked, with swatches matching the overlay', () => {
        const onChange = renderWith({ kind: 'hybrid', hybrid: 'sp3', member: 'all' });
        expect(screen.getAllByRole('button', { name: /^hybrid \d$/ })).toHaveLength(4);
        const swatch = screen.getByRole('button', { name: 'hybrid 2' }).querySelector('.combination-swatch') as HTMLElement;
        expect(swatch.style.background).toBe(OVERLAY_COLORS[1].replace(/^#(..)(..)(..)$/, (_m, r, g, b) =>
            `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`));
        fireEvent.click(screen.getByRole('button', { name: 'hybrid 2' }));
        expect(onChange).toHaveBeenCalledWith({ kind: 'hybrid', hybrid: 'sp3', member: 1 });
    });

    it('captions hybrids as a basis choice', () => {
        renderWith({ kind: 'hybrid', hybrid: 'sp2', member: 'all' });
        expect(screen.getByText(/a basis choice for one atom — hybrids describe bonding directions, not a free atom's ground state/i)).toBeInTheDocument();
    });

    it('shows the field in a.u. and V/m, the dipole with its method, and the validity', () => {
        renderWith(fieldAt(1, 0.03));
        expect(screen.getByText(/F = 0\.030 a\.u\. \(1\.54 × 10¹⁰ V\/m\)/)).toBeInTheDocument();
        expect(screen.getByText(/μ = αF = 0\.135 e·a₀ \(0\.343 D\)/)).toBeInTheDocument();
        expect(screen.getByText(/first-order perturbation theory/i)).toBeInTheDocument();
        expect(screen.getByText(/F ≪ 1 a\.u\.; ionisation by tunnelling is ignored/)).toBeInTheDocument();
        expect(screen.getByText(/about 4 %/)).toBeInTheDocument();
    });

    it('slides from 0 to 0.05 a.u. and commits the value', () => {
        const onChange = renderWith(fieldAt(1, 0.03));
        const slider = screen.getByRole('slider', { name: /field f/i });
        expect(slider).toHaveAttribute('max', '0.05');
        fireEvent.change(slider, { target: { value: '0.04' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ field: expect.closeTo(0.04, 6) }));
    });

    it('labels the n = 2 shifts ±3F, and caps the field where n = 2 stays bound', () => {
        renderWith(fieldAt(2, 0.0039));
        expect(screen.getByText(/\(2s \+ 2p_z\)\/√2: ΔE = −3F = −0\.0117 Ha \(−0\.32 eV\)/)).toBeInTheDocument();
        expect(screen.getByText(/\(2s − 2p_z\)\/√2: ΔE = \+3F = \+0\.0117 Ha \(\+0\.32 eV\)/)).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: /field f/i })).toHaveAttribute('max', '0.0039');
    });

    it('brings the field down into range when switching to n = 2', () => {
        const onChange = renderWith(fieldAt(1, 0.03));
        fireEvent.click(screen.getByRole('button', { name: /first excited level/i }));
        expect(onChange).toHaveBeenCalledWith({ kind: 'field', level: 2, field: 0.0039, stark: 'lower' });
    });

    // Review Focus 3.
    it.each([[fieldAt(1, 0.08), /refused/], [fieldAt(2, 0.01), /not bound/]] as const)(
        'says why %j is not drawn', (selection, message) => {
            renderWith(selection);
            expect(screen.getByRole('alert')).toHaveTextContent(message);
        });
});
```

Append to `src/components/Controls.test.tsx`:

```tsx
describe('Combination picker', () => {
  it('sits with n/l/mL in Basic Orbitals, and not in atom mode', () => {
    const { unmount } = render(<Controls {...baseProps} />);
    expect(screen.getByRole('combobox', { name: /combination/i })).toBeInTheDocument();
    unmount();
    render(<Controls {...baseProps} mode="atom" atomLevel="atom" />);
    expect(screen.queryByRole('combobox', { name: /combination/i })).not.toBeInTheDocument();
  });

  it('disables n/l/mL and hides Update Orbital while a combination is drawn', () => {
    render(<Controls {...baseProps} combination={{ kind: 'hybrid', hybrid: 'sp3', member: 'all' }} />);
    expect(screen.getByRole('combobox', { name: /Principal \(n\)/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: /update orbital/i })).not.toBeInTheDocument();
    expect(screen.getByText('sp³ hybrids — all 4')).toBeInTheDocument();
  });

  it('reports the choice', () => {
    const onCombinationChange = jest.fn();
    render(<Controls {...baseProps} onCombinationChange={onCombinationChange} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('sp'));
    expect(onCombinationChange).toHaveBeenCalledWith({ kind: 'hybrid', hybrid: 'sp', member: 'all' });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/combination_controls.test.tsx src/components/Controls.test.tsx`
Expected: FAIL, "Cannot find module '../src/components/CombinationControls'", and the Controls tests fail on the missing Combination combobox.

- [ ] **Step 3: Implement**

```tsx
// src/components/CombinationControls.tsx
import React, { useEffect, useState } from 'react';
import {
  Alert, FormControl, FormHelperText, FormLabel, InputLabel, MenuItem, Select, SelectChangeEvent,
  Slider, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  CombinationSelection, NO_COMBINATION, DEFAULT_FIELD_AU, OVERLAY_COLORS, StarkChoice,
  hybridMemberLabel, selectionProblem,
} from '../combinations';
import { HybridKind, HYBRID_NAMES, hybridCount } from '../hybrids';
import { MAX_FIELD_AU } from '../field_source';
import {
  N2_MAX_FIELD_AU, DEBYE_PER_EA0, EV_PER_HARTREE, formatVoltsPerMetre, inducedDipole,
  nextOrderDipoleShare, starkShiftHartree,
} from '../stark';

export const HYBRID_CAPTION =
  "A basis choice for one atom — hybrids describe bonding directions, not a free atom's ground state.";
export const FIELD_CAPTION =
  'Valid for F ≪ 1 a.u.; ionisation by tunnelling is ignored. Fields above 0.05 a.u. are refused (the n = 1 electron goes over the barrier at 0.0625 a.u.).';
const N2_FIELD_CAPTION =
  `Above ${N2_MAX_FIELD_AU} a.u. an n = 2 electron is not bound: the field lowers the barrier below its energy (F = E²/4, E = −1/8 Ha), so stronger fields are refused here. First-order (degenerate) perturbation theory: the field picks these two combinations out of the four n = 2 states. They are the sp hybrid shapes, and they do not change with F; only their energies do.`;

type Choice = 'none' | HybridKind | 'field';

const CHOICES: Array<{ value: Choice; label: string }> = [
  { value: 'none', label: 'None (single orbital)' },
  { value: 'sp', label: HYBRID_NAMES.sp },
  { value: 'sp2', label: HYBRID_NAMES.sp2 },
  { value: 'sp3', label: HYBRID_NAMES.sp3 },
  { value: 'field', label: 'Electric field' },
];

function choiceOf(selection: CombinationSelection): Choice {
  if (selection.kind === 'hybrid') return selection.hybrid;
  return selection.kind === 'field' ? 'field' : 'none';
}

function selectionFor(choice: Choice, current: CombinationSelection): CombinationSelection {
  if (choice === 'none') return NO_COMBINATION;
  if (choice === 'field') {
    return current.kind === 'field' ? current : { kind: 'field', level: 1, field: DEFAULT_FIELD_AU, stark: 'lower' };
  }
  return { kind: 'hybrid', hybrid: choice, member: 'all' };
}

/** "−0.0117", "+0.0117", "0.0000": with a real minus sign, and none on zero. */
function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${value < 0 ? '−' : '+'}${text}`;
}

interface CombinationControlsProps {
  selection: CombinationSelection;
  onChange: (selection: CombinationSelection) => void;
}

/**
 * Basic Orbitals' Combination picker (spec §5 Phase 1). Every choice here is
 * complete on its own, so it renders at once -- there is no Update step. The
 * slider commits on release: each commit is a fresh worker render, and
 * dragging would otherwise start one per pixel.
 */
const CombinationControls: React.FC<CombinationControlsProps> = ({ selection, onChange }) => {
  const committedField = selection.kind === 'field' ? selection.field : DEFAULT_FIELD_AU;
  const [draftField, setDraftField] = useState(committedField);
  useEffect(() => { setDraftField(committedField); }, [committedField]);
  const problem = selectionProblem(selection);

  return (
    <>
      <FormControl fullWidth margin="normal" size="small">
        <InputLabel id="combination-select-label">Combination</InputLabel>
        <Select
          labelId="combination-select-label"
          id="combination-select"
          value={choiceOf(selection)}
          label="Combination"
          onChange={(e: SelectChangeEvent<string>) => onChange(selectionFor(e.target.value as Choice, selection))}
        >
          {CHOICES.map(choice => <MenuItem key={choice.value} value={choice.value}>{choice.label}</MenuItem>)}
        </Select>
        {selection.kind !== 'none' && (
          <FormHelperText>
            {selection.kind === 'hybrid'
              ? "Built from hydrogen's exact 2s and 2p (Z = 1)."
              : 'Hydrogen (Z = 1) in a uniform field along +z, which pulls the electron towards −z.'}
          </FormHelperText>
        )}
      </FormControl>

      {selection.kind === 'hybrid' && (
        <FormControl component="fieldset" margin="normal" fullWidth>
          <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Show</FormLabel>
          <ToggleButtonGroup
            value={selection.member === 'all' ? 'all' : String(selection.member)}
            exclusive
            size="small"
            fullWidth
            aria-label="hybrids shown"
            onChange={(event: React.MouseEvent<HTMLElement>, value: string | null) => {
              if (value !== null) onChange({ ...selection, member: value === 'all' ? 'all' : Number(value) });
            }}
          >
            <ToggleButton value="all" aria-label="all hybrids">All</ToggleButton>
            {Array.from({ length: hybridCount(selection.hybrid) }, (_, i) => (
              <ToggleButton key={i} value={String(i)} aria-label={`hybrid ${i + 1}`}>
                <span className="combination-swatch" style={{ background: OVERLAY_COLORS[i] }} />
                {hybridMemberLabel(i)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <FormHelperText className="combination-caption" sx={{ mx: 0 }}>{HYBRID_CAPTION}</FormHelperText>
        </FormControl>
      )}

      {selection.kind === 'field' && (
        <FormControl component="fieldset" margin="normal" fullWidth>
          <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Level</FormLabel>
          <ToggleButtonGroup
            value={String(selection.level)}
            exclusive
            size="small"
            fullWidth
            aria-label="field level"
            onChange={(event: React.MouseEvent<HTMLElement>, value: string | null) => {
              if (value === null) return;
              const level = value === '2' ? 2 : 1;
              onChange({ ...selection, level, field: level === 2 ? Math.min(selection.field, N2_MAX_FIELD_AU) : selection.field });
            }}
          >
            <ToggleButton value="1" aria-label="ground state n = 1">n = 1</ToggleButton>
            <ToggleButton value="2" aria-label="first excited level n = 2">n = 2</ToggleButton>
          </ToggleButtonGroup>

          <FormLabel id="field-strength-label" sx={{ mt: 1.5, fontSize: '0.75rem' }}>
            Field F = {draftField.toFixed(selection.level === 1 ? 3 : 4)} a.u. ({formatVoltsPerMetre(draftField)})
          </FormLabel>
          <Slider
            aria-labelledby="field-strength-label"
            value={Math.min(draftField, selection.level === 1 ? MAX_FIELD_AU : N2_MAX_FIELD_AU)}
            min={0}
            max={selection.level === 1 ? MAX_FIELD_AU : N2_MAX_FIELD_AU}
            step={selection.level === 1 ? 0.001 : 0.0001}
            size="small"
            valueLabelDisplay="off"
            sx={{ mx: '12px', width: 'auto' }}
            onChange={(event: Event, value: number | number[]) => setDraftField(Array.isArray(value) ? value[0] : value)}
            onChangeCommitted={(event: React.SyntheticEvent | Event, value: number | number[]) =>
              onChange({ ...selection, field: Array.isArray(value) ? value[0] : value })}
          />

          {selection.level === 1 ? (
            <>
              <Typography variant="body2" className="combination-readout">
                Induced dipole μ = αF = {inducedDipole(draftField).toFixed(3)} e·a₀ ({(inducedDipole(draftField) * DEBYE_PER_EA0).toFixed(3)} D)
              </Typography>
              <FormHelperText sx={{ mx: 0 }}>
                α = 9/2 a₀³, exact for hydrogen. Drawn: ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ, first-order perturbation theory (Dalgarno–Lewis).
              </FormHelperText>
              <FormHelperText className="combination-caption" sx={{ mx: 0 }}>
                {FIELD_CAPTION}
                {nextOrderDipoleShare(draftField) >= 0.01
                  ? ` At this field the next-order (hyperpolarisability) term would change μ by about ${Math.round(nextOrderDipoleShare(draftField) * 100)} %.`
                  : ''}
              </FormHelperText>
            </>
          ) : (
            <>
              <ToggleButtonGroup
                value={selection.stark}
                exclusive
                size="small"
                fullWidth
                aria-label="Stark state"
                sx={{ mt: 1 }}
                onChange={(event: React.MouseEvent<HTMLElement>, value: StarkChoice | null) => {
                  if (value !== null) onChange({ ...selection, stark: value });
                }}
              >
                <ToggleButton value="lower" aria-label="lower Stark state">Lower</ToggleButton>
                <ToggleButton value="upper" aria-label="upper Stark state">Upper</ToggleButton>
                <ToggleButton value="both" aria-label="both Stark states">Both</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="body2" className="combination-readout">
                (2s + 2p_z)/√2: ΔE = −3F = {signed(starkShiftHartree('lower', draftField), 4)} Ha ({signed(starkShiftHartree('lower', draftField) * EV_PER_HARTREE, 2)} eV)
              </Typography>
              <Typography variant="body2" className="combination-readout">
                (2s − 2p_z)/√2: ΔE = +3F = {signed(starkShiftHartree('upper', draftField), 4)} Ha ({signed(starkShiftHartree('upper', draftField) * EV_PER_HARTREE, 2)} eV)
              </Typography>
              <FormHelperText className="combination-caption" sx={{ mx: 0 }}>{N2_FIELD_CAPTION}</FormHelperText>
            </>
          )}
          {problem && <Alert severity="error" sx={{ mt: 1 }}>{problem}</Alert>}
        </FormControl>
      )}
    </>
  );
};

export default CombinationControls;
```

In `src/components/Controls.tsx`:

- Imports: `import CombinationControls from './CombinationControls';` and `import { CombinationSelection, NO_COMBINATION, combinationTitle } from '../combinations';`.
- Props interface, after `onMlChange`:

```ts
  /** Basic Orbitals' hybrid / electric-field choice (spec §5 Phase 1). Defaults to none, which is exactly the old panel. */
  combination?: CombinationSelection;
  onCombinationChange?: (selection: CombinationSelection) => void;
```

- Destructure `combination = NO_COMBINATION, onCombinationChange,` and add `const combinationActive = combination.kind !== 'none';` after `isSliceOnlyView`.
- Heading: `{combinationActive ? combinationTitle(combination) : orbitalName(initialN, initialL, initialMl)}`.
- Add `disabled={combinationActive}` to the n Select, and `disabled={combinationActive || lOptions.length === 0}` / `disabled={combinationActive || mlOptions.length === 0}` to l and mₗ.
- Directly after the mₗ `FormControl`, still inside the `!isAtomMode` fragment:

```tsx
          {/* Next to n/l/mₗ (spec §5 Phase 1). While a combination is drawn the
              three selects stay in view, disabled, so the way back is obvious. */}
          <CombinationControls selection={combination} onChange={selection => onCombinationChange?.(selection)} />
```

- Update Orbital: `{!isAtomMode && !combinationActive && ( ... )}`.

Append to `src/style.css`:

```css
.combination-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  flex: none;
}
.combination-readout {
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/combination_controls.test.tsx src/components/Controls.test.tsx && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Live check (controls only; App wiring is Task 11)**

At http://localhost:5391, 1440x900: click **Basic Orbitals** in the right `.view-panel`. A **Combination** select must appear directly under *Magnetic (m_l)*, reading "None (single orbital)". The n/l/mₗ selects and **Update Orbital** are unchanged. Switch back to **Atom**: no Combination select. At 390x844 with touch emulation: **View** tab → Basic Orbitals → the tab becomes *Orbital & view*, and Combination is under mₗ without horizontal scrolling. (Choosing an option does nothing yet; Task 11 wires it.)

- [ ] **Step 6: Commit**

```bash
git add src/components/CombinationControls.tsx src/components/Controls.tsx src/components/Controls.test.tsx src/style.css tests/combination_controls.test.tsx
git commit -m "feat(ui): Combination picker for hybrids and the electric field

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Wire it through the app

**Files:**
- Modify: `src/App.tsx`, `src/components/OrbitalViewer.tsx`
- Test: `src/App.test.tsx` (append; add `within` to the testing-library import)

**Interfaces:**
- Consumes: `startFieldCalculation`, `currentField` (Task 8); `updateFieldInScene` (Task 9); `CombinationSelection`, `NO_COMBINATION`, `fieldRequestFor`, `combinationCurves`, `overlayLegend` (Task 7); `basicOrbitalParams` (Task 7); `Controls` props (Task 10).
- Produces: the finished feature.

- [ ] **Step 1: Write the failing tests** (append to `src/App.test.tsx`, inside `describe('App', ...)`, using its `renderWithProvider`)

```tsx
    describe('Basic Orbitals combinations', () => {
        const chooseCombination = (option: string | RegExp) => {
            fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText(option));
        };

        beforeEach(() => installMatchMedia(false));

        it('draws a chosen combination at once, with its key and its radial components', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
            chooseCombination('sp³');

            expect(store.getState().orbital.currentField?.sources.map(s => s.id))
                .toEqual(['hybrid:sp3:0', 'hybrid:sp3:1', 'hybrid:sp3:2', 'hybrid:sp3:3']);
            expect(store.getState().orbital.currentParams).toBeNull();
            expect(screen.getByLabelText('combination colour key')).toHaveTextContent('h₁');
            expect(screen.queryByLabelText('surface colour key')).not.toBeInTheDocument();
            expect(screen.getByText('each hybrid: ¼·2s + ¾·2p')).toBeInTheDocument();
        });

        it('redraws when the enclosed fraction changes, with no Update step', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
            chooseCombination('Electric field');
            fireEvent.mouseDown(screen.getByRole('combobox', { name: /electron enclosed/i }));
            fireEvent.click(within(screen.getByRole('listbox')).getByText('75%'));
            expect(store.getState().orbital.currentField?.enclosedFraction).toBe(0.75);
            expect(store.getState().orbital.currentField?.sources[0].recipe).toEqual({ type: 'polarized1s', field: 0.03 });
        });

        // Review Focus 1.
        it('None redraws the orbital in the panel', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
            chooseCombination('sp');
            chooseCombination(/None/);
            expect(store.getState().orbital.currentField).toBeNull();
            expect(store.getState().orbital.currentParams).toMatchObject({ n: 3, l: 2, ml: 0, Z: 1 });
        });

        // Review Focus 2.
        it('a combination survives a round trip through atom mode, and is not drawn there', () => {
            const { store } = renderWithProvider(<App />);
            fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
            chooseCombination('sp²');
            fireEvent.click(screen.getByRole('button', { name: /atom mode/i }));
            expect(store.getState().orbital.currentField).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
            expect(store.getState().orbital.currentField?.sources.map(s => s.id))
                .toEqual(['hybrid:sp2:0', 'hybrid:sp2:1', 'hybrid:sp2:2']);
            expect(store.getState().orbital.currentParams).toBeNull();
        });
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/App.test.tsx -t "Basic Orbitals combinations"`
Expected: FAIL. `currentField` stays null because App passes no `onCombinationChange`.

- [ ] **Step 3: Implement**

`src/App.tsx`:

1. Imports: add `startFieldCalculation` to the `./store/orbitalSlice` import; add `import { CombinationSelection, NO_COMBINATION, fieldRequestFor, combinationCurves, overlayLegend } from './combinations';`; add `basicOrbitalParams` to the `./orbital_presets` import.
2. State, after `enclosedFraction`:

```ts
    // Basic Orbitals' combination (hybrids, a field). Local like n/l/mₗ, but
    // reactive: each choice is complete, so it renders without an Update step.
    const [combination, setCombination] = useState<CombinationSelection>(NO_COMBINATION);
    const renderedField = useAppSelector(state => state.orbital.currentField);
```

3. Mode-switch effect (currently lines 275–288): change its first line to `if (isAtomMode || combination.kind !== 'none') return;` and replace the dispatched object with `basicOrbitalParams(n, l, ml, enclosedFraction)`. `combination` is read, not watched, like the rest; the effect below redraws a combination on the same mode change.
4. After that effect:

```ts
    // A combination draws as soon as it is chosen, and again when the
    // enclosed fraction changes. Going back to None redraws the n/l/mₗ still in
    // the panel: the canvas was showing the combination, not that orbital.
    const previousCombinationRef = useRef(combination);
    useEffect(() => {
        const previous = previousCombinationRef.current;
        previousCombinationRef.current = combination;
        if (isAtomMode) return;
        if (combination.kind === 'none') {
            if (previous.kind !== 'none') dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, enclosedFraction)));
            return;
        }
        const request = fieldRequestFor(combination, enclosedFraction);
        if (request) dispatch(startFieldCalculation(request));
        // n/l/mₗ are read for the None case only; changing them while a
        // combination is drawn must not replace it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAtomMode, combination, enclosedFraction, dispatch]);
```

5. Busy label, the non-atom branch:

```ts
        : (showBusy
            ? (renderedField
                ? `Computing ${renderedField.label}…`
                : renderedParams ? `Computing ${orbitalName(renderedParams.n, renderedParams.l, renderedParams.ml)}…` : null)
            : null);
```

6. Legends:

```ts
    const combinationLegend = !isAtomMode && renderedField ? overlayLegend(combination) : null;
    const showPhaseLegend = (!isAtomMode || atomLevel === 'orbital') && !combinationLegend;
```

and after the phase-legend JSX:

```tsx
                {combinationLegend && (
                    <div className="phase-legend" aria-label="combination colour key">
                        {combinationLegend.map(item => (
                            <span key={item.label} className="phase-legend-item">
                                <span className="phase-legend-swatch" style={{ background: item.color }} />{item.label}
                            </span>
                        ))}
                        <span className="phase-legend-item">darker: ψ &lt; 0</span>
                    </div>
                )}
```

7. `<Controls ...>`: add `combination={combination}` and `onCombinationChange={setCombination}`.
8. `renderRadialPlot`, at the top of the `!isAtomMode` branch:

```tsx
            // A combination's plot is its ingredients and the result (see
            // combinationCurves): the weighted sum is its exact radial distribution.
            const combinationPlot = renderedField ? combinationCurves(combination) : null;
            if (combinationPlot) {
                return (
                    <RadialPlot
                        n={2}
                        l={0}
                        Z={BASIC_ORBITALS_Z}
                        rMax={combinationPlot.rMax}
                        width={width}
                        collapsible={collapsible}
                        curves={combinationPlot.curves}
                    />
                );
            }
```

`src/components/OrbitalViewer.tsx`:

1. Add `updateFieldInScene` to the `../orbital_visualizer` import, and `const fieldRequest = useAppSelector(state => state.orbital.currentField);` beside `stateParams`.
2. After the `stateParams` effect:

```ts
    // Basic Orbitals combinations (spec §5 Phase 1). Exactly one of
    // `stateParams` and `fieldRequest` is set (orbitalSlice), so the two
    // effects never both draw; either way the newest request owns the scene.
    useEffect(() => {
        if (!visualizerContextRef.current || !fieldRequest || atomMode === 'atom' || showShellView) return;
        updateFieldInScene(visualizerContextRef.current, fieldRequest)
            .then(outcome => {
                if (outcome.status === 'superseded') return;
                onOrbitalRendered?.(outcome.isoLevel);
            })
            .catch(error => {
                console.error('OrbitalViewer: Error drawing combination', error);
                onOrbitalFailed?.(error instanceof Error && error.message ? error.message : 'Could not draw this combination.');
            });
    }, [fieldRequest, atomMode, showShellView, onOrbitalRendered, onOrbitalFailed]);
```

3. The scale-readout effect's dependency list becomes `[stateParams, fieldRequest]`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/App.test.tsx src/components/Controls.test.tsx tests/combination_controls.test.tsx && npx tsc --noEmit -p .`
Expected: PASS; tsc clean.

- [ ] **Step 5: Live verification: desktop, 1440x900**

The dev server is at http://localhost:5391. Use the browser tool at a 1440x900 viewport, with the console open.

1. Click **Basic Orbitals** (right panel, *Mode*). 3d_z² draws in red/blue.
2. **Combination → sp³.** Expect: four lobes along the tetrahedral directions in yellow, green, purple and orange, each with a darker small back lobe. Heading "sp³ hybrids — all 4". n/l/mₗ greyed; no Update Orbital. Caption "A basis choice for one atom — …". Bottom-centre key "h₁ h₂ h₃ h₄ · darker: ψ < 0" in place of the ψ > 0 / ψ < 0 key. The plot shows three curves (2s, 2p, "each hybrid: ¼·2s + ¾·2p"). Console: `Visualizer: sp³ hybrids — all 4 drawn in N ms` with N < 1500. Record N.
3. Click **h₁**: one lobe in red (large, pointing up-front-right, towards +x+y+z) with a small blue back lobe, cut-face caps working (Cut away → X → Depth 50 % shows a shaded cross-section), and the phase key back. Set the cut back to Off.
4. **sp²**: three lobes in the horizontal plane (z is up), 120° apart. **sp**: two lobes, one up and one down.
5. **Electric field**: n = 1 at F = 0.030. The 1s is slightly egg-shaped, fuller below. Label "F = 0.030 a.u. (1.54 × 10¹⁰ V/m)", "μ = αF = 0.135 e·a₀ (0.343 D)", caption with "about 4 %". Drag the slider to 0.050 and release. The label follows during the drag, and the surface redraws once on release, more lopsided. V/m reads 2.57 × 10¹⁰ and the caption "about 12 %".
6. **n = 2**: the slider max becomes 0.0039, and F snaps to 0.0039 if it was higher. **Lower**: a big blue lobe below with a red cap above. **Upper**: the mirror image. **Both**: two overlay colours, key "(2s + 2p_z)/√2, −3F · (2s − 2p_z)/√2, +3F". Readouts "ΔE = −3F = −0.0117 Ha (−0.32 eV)" and "+0.0117 Ha (+0.32 eV)".
7. Opacity 40 % and Wireframe on the Both overlay restyle it at once, with no busy indicator. Put them back.
8. **Atom** then **Basic Orbitals** again: the Stark overlay comes back; atom mode never showed it.
9. **Combination → None**: 3d_z² returns with the phase key; n/l/mₗ enabled; Update Orbital back.
10. Medium width (1100x800): the right panel starts folded; open it with *View settings ▸*; all of the above fit without horizontal scroll.

- [ ] **Step 6: Live verification: phone, 390x844 with touch emulation (and 844x390)**

1. **View** tab → **Basic Orbitals**. Tabs become *Orbital & view* / *Plot*.
2. In *Orbital & view*, **Combination → sp³**. The select menu opens full width and is reachable. The member buttons (All, h₁…h₄) fit one row. Captions wrap inside the sheet with no horizontal scroll.
3. Close the sheet. The four lobes are centred in the free canvas, not under the sheet, and the colour key sits top-right (the narrow `.phase-legend` rule) without covering the lobes.
4. **Electric field**: the slider drags by touch and the V/m label updates. **n = 2 → Both**: both readout lines visible.
5. *Plot* tab: the three curves and legend, readable.
6. Rotate to 844x390: sheet and key do not overlap; the canvas still shows the drawing.
7. Measure: sp³-all render time from the console (touch emulation does not throttle CPU; with 4× CPU throttling in DevTools it must stay under 4 s). Record it.

Any defect found here is fixed in this task, with a test where one can express it, before committing.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/OrbitalViewer.tsx
git commit -m "feat(app): hybrids and the Stark effect in Basic Orbitals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Documentation and final verification

**Files:**
- Modify: `README.md` (Basic Orbitals feature list ~line 76–91; limitation "No hybrids, no molecules" ~line 359–361; `src/` layout table ~line 409–440), `docs/HANDOFF.md` (new section after "UX review round")

**Interfaces:**
- Consumes: the finished feature and the numbers recorded in Task 11.

- [ ] **Step 1: Write the docs**

README, Basic Orbitals list, add:

```markdown
- **Combinations** — sp, sp² and sp³ hybrids of hydrogen's 2s and 2p (one at a
  time in phase colours, or all at once, one colour each), and hydrogen in an
  electric field: the 1s polarised to first order (μ = αF, α = 9/2 a₀³) with
  the field in a.u. and V/m, and the n = 2 Stark states (2s ± 2p_z)/√2 with
  their ±3F shifts. The radial plot shows what went in: 2s, 2p and their
  weighted sum, which is the combination's exact radial distribution.
```

Replace the "No hybrids, no molecules" limitation with:

```markdown
**Hybrids are a basis choice, not a state.** They describe bonding
directions; a free hydrogen or carbon atom is not in one. The 2s enters with
a minus sign, because hydrogen's 2s is negative beyond its node at 2 a₀ where
95 % of it lies, and this is the sign that points each large lobe along its
axis. **The field view is first-order perturbation theory:** valid for
F ≪ 1 a.u., tunnelling ignored, refused above 0.05 a.u. (n = 1) and above
0.0039 a.u. (n = 2, where the electron would no longer be bound). **No
molecules yet** — that is Phase 5 onward.
```

Add `field_source.ts`, `hybrids.ts`, `stark.ts`, `combinations.ts`, `field_integrals.ts`, `field_overlay_view.ts` and `validation/` to the layout table, one line each, using the responsibilities from this plan's File Structure.

HANDOFF, new section `## Phase 1 — hybrids and the Stark effect (2026-09-25)`, recording:

- The −ψ₂ₛ sign convention and why.
- Lobe axis = positive-lobe centroid, and why not an argmax.
- Overlays: one merged mesh, no caps (stencil assumes one capped object), 96³, shared basis samples. Include the measured desktop and throttled render times from Task 11.
- n = 2 field limit 0.0039 a.u. (over-the-barrier), which the spec did not state; added under §3.5.
- α validated at F = 0.01, not 0.05, because normalising the first-order ψ costs 1.4 % at 0.05.
- `src/validation/references.ts` computes phase-1 rows at import (~1 s). Phase 7 must lazy-load it, and later phases append rows the same way (`app` from the tested function, never typed in).

- [ ] **Step 2: Full verification**

Run each in the foreground; the suite takes about a minute:

```bash
npx jest
npx tsc --noEmit -p .
npm run build
```

Expected: all green, including every pre-existing test; tsc clean; build clean. Then reload http://localhost:5391 and repeat Task 11 Step 5 items 2, 5 and 6 once more at 1440x900, checking the console has no errors.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/HANDOFF.md
git commit -m "docs: Phase 1 hybrids and Stark effect — features, limits, decisions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (§5 Phase 1, §4.1, §3):**

- Combination picker next to n/l/mₗ with sp, sp², sp³, Electric field → Tasks 10, 11.
- Each hybrid selectable or all overlaid in distinct colours → Tasks 7 (request, colours), 9 (overlay), 10 (member buttons), 11 (legend).
- n = 1 slider 0–0.05 a.u. with V/m → Tasks 6 (`formatVoltsPerMetre`), 10.
- Polarised ψ = ψ₁ₛ − Fz(1 + r/2)ψ₁ₛ → Task 2 (evaluator), 6 (source).
- μ = αF shown, α = 9/2 → Tasks 6, 10.
- n = 2 (2s ± 2p_z)/√2 with ±3F labelled; "also the sp hybrid shape" → Tasks 6 (states, sign test, sp = −upper), 10 (labels).
- Validation: orthonormal < 10⁻³ (Task 5), sp³ 109.47° ± 0.5° (Task 5), α 4.5 ± 1 % from the drawn ψ (Task 6), |⟨2s|z|2p_z⟩| = 3 ± 1 % (Task 6). All four in `VALIDATION` with computed `app` values (Tasks 1, 5, 6).
- Honesty captions and refusal above 0.05 → Tasks 2 (evaluator refuses), 7 (request refuses), 10 (captions, Alert).
- §4.1: `field_source.ts` types verbatim, union with a `never` check (Task 2); `generateFieldMesh(source, resolution, enclosedFraction)` with `generateOrbitalMesh` as a wrapper, existing tests unchanged (Task 3); `quantity: 'density'` meshes ρ itself without squaring (Task 3 carries √ρ into a squaring search, which is the same thing). The single "density" colour is a renderer concern for the first phase that produces a density grid (Phase 5); Phase 1 draws no density grid.
- §3.7 budget → shared basis samples (Task 4), overlay resolution (Task 7), measured live (Task 11).
- §3.8 layout → Controls stays in `.view-panel` / the phone tab; the key reuses `.phase-legend` (Task 11).
- Coordinator addition: `ValidationRow`, `VALIDATION`, phase-0 NIST rows and the tolerance test → Task 1.

**Placeholder scan:** no TBD/TODO; every code step has its code; the only "later" is Phase 5's density colour, which is outside this phase by the spec's own sequencing.

**Type consistency:** `FieldRenderRequest` (Task 2) is used unchanged by Tasks 4, 7, 8, 9, 11. `SampledField` (Task 3) is used by Tasks 5 and 6. `HybridKind`/`HYBRID_NAMES`/`hybridCount` (Task 5) and `StarkState`/`N2_MAX_FIELD_AU` (Task 6) are used by Tasks 7 and 10. `CombinationSelection` fields `hybrid`, `member`, `level`, `field`, `stark` are consistent across Tasks 7, 10, 11 and the tests. `updateSceneWithMeshData(context, meshData, crossFade?)` changes in Task 9 at its only call site.

**Review Focus:** the five items each have a named test in their owning task: Task 11 ×2, Task 8, Task 7 + Task 10, Task 6, Task 9.
