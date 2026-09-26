# Phase 4 — Relativity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a *Relativity* switch to atom mode (Off / Scalar / With spin–orbit, scalar by default from Cs onward) backed by a scalar-relativistic Koelling–Harmon solver and a radial Dirac solver, both validated against NIST's ScRLDA and RLDA tables, with j-split subshells, a dashed non-relativistic comparison curve and a "what changed" readout in the UI.

**Architecture:** One new coupled first-order radial solver (`relativistic_solver.ts`) integrates the large and small components (G, F) with RK4 on the existing log grid and reuses the radial solver's node-count bracketing and matching-point shooting; it returns the existing `RadialState` with an optional small component `Q` and, for Dirac states, `j`/`kappa`. The SCF gains a `relativity` option that picks the solver, adds `Q²` to the density and applies the MacDonald–Vosko relativistic exchange correction NIST used. The worker returns both the relativistic profile and the non-relativistic comparison curves; the store, caches, labels and plot learn the mode and the j-levels.

**Tech Stack:** TypeScript, React 19, MUI 7, Redux Toolkit, three.js 0.176, Vite, Jest + ts-jest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-beyond-isolated-atoms.md` (§3 principles and §4 shared architecture are binding; §5 "Phase 4 — Relativity" is the requirement). Background: `docs/superpowers/specs/2026-08-29-multi-electron-atoms.md`, `docs/superpowers/plans/2026-08-29-multi-electron-atoms.md`, `docs/HANDOFF.md` ("Known limits of the model").

## Global Constraints

- **Atomic units throughout** (ħ = mₑ = e = a₀ = 1, Hartree). Speed of light `c = 137.035999` a.u. (spec value). NIST used 137.0359895; the 4·10⁻⁹ relative difference is eight orders of magnitude below every tolerance here — do not "fix" it.
- **Every number states its method** (spec §3.1): every relativistic energy, radius and percentage on screen carries its level of theory in text or a `title` tooltip.
- **Validated before shipped** (spec §3.2): NIST ScRLDA/RLDA total energies and eigenvalues within **1 %** for Ne, Ar, Kr, Xe, Au, Hg, Rn, U; the rows are appended to Phase 1's `src/validation/references.ts` with `app` values produced by the real computation (Task 7), never hand-typed.
- **Failures are shown, not hidden** (spec §3.5): an unconverged relativistic SCF surfaces through the existing `solveFailed` path with the mode named.
- **The existing renderer is the renderer** (spec §3.6): no new mesh path; j-levels feed the existing composition view and level-3 pipeline with their own radial functions.
- **Heavy work in the worker** (spec §3.7): both solves (relativistic and the non-relativistic comparison) run in `atomWorker.ts`; the relativistic SCF starts from the converged non-relativistic potential.
- **Layout contract** (spec §3.8): the Relativity control and the readout live in `Controls` — desktop right `.view-panel`, phone View tab of `PhoneSheet` (see `src/App.tsx`). No floating panels.
- **`relativity: 'off'` is today's app, byte for byte.** Every existing test passes unmodified except the two that pin wire formats (`tests/atom/use_atom_solver.test.tsx`'s exact `postMessage` payload, Task 9), which gain `relativity: 'off'`. Cache keys for `'off'` keep their current string form.
- **Slow tests stay gated** behind `ATOM_SLOW_TESTS=1` (HANDOFF process note). The default suite must stay near its current ~57 s.
- **Run every command in the foreground.** A backgrounded command in a subagent is never woken. The slow NIST test takes several minutes; that is normal.
- **Phase 3 reconciliation.** Phase 3 (ions, excited states) lands before this and may have changed `solveAtom`'s signature (configuration or charge), the worker message and the cache keys. Where a signature named here differs, keep Phase 3's parameters and add `relativity` alongside them (as a field of Phase 3's options object if it introduced one, otherwise as the trailing parameter); append `:${relativity}` to Phase 3's cache keys. The tests below exercise the neutral atom, which Phase 3 keeps as its default.
- **Comment style:** prose explaining *why*, British spelling ("normalisation", "colour"), matching `src/atom/*.ts`. `D(r)` is the radial distribution, `density` is ρ(r) (HANDOFF naming rule).
- **Spec discrepancy, recorded not silently resolved:** spec §5 says "Light atoms (Z ≤ 18) unchanged within 0.1 % when relativity is on". Measured while writing this plan (prototype of the exact solver below): argon's total energy moves **0.30 %** and its 3s eigenvalue **0.82 %** when relativity is switched on — real physics, consistent with HANDOFF's own Ne 2s figure of 0.25 %. The plan therefore asserts the two statements that are true and carry the spec's intent: (a) for Z ≤ 18 the relativistic results agree with NIST's relativistic columns within **0.1 %**, and (b) for Z ≤ 10 the total energy moves by less than **0.1 %** from the non-relativistic value. The owner should confirm this reading (see the hand-off message).

## Review Focus

1. **Switching relativity while a subshell or orbital is selected** — especially into or out of *With spin–orbit*, where a `(n, l)` selection no longer names any subshell (it is now `6p½`/`6p³⁄₂`) and vice versa. Expected: the view steps back to the shell level with nothing isolated, never a blank canvas or a stale selection. Pinned in Task 9 (`atom_slice` test "setRelativity drops a selection the new mode cannot name").
2. **Rapid mode/element changes while a solve is in flight.** Expected: the profile on screen always carries the mode the switch shows; a stale reply for the other mode is dropped and a cached profile for the other mode is never served. Pinned in Task 9 (`use_atom_solver` test "keys requests and cache hits by relativity").
3. **Open subshells split fractionally between j-levels** (U 5f³ → 9/7 + 12/7 electrons; C 2p² → 2/3 + 4/3). Expected: chips read "1.29 of 6 e⁻", occupancy fractions of composition lobes stay ≤ 1 and equal the non-relativistic fraction. Pinned in Task 10 (`subshell_panel` and `shell_composition` tests).
4. **A one-electron atom with relativity forced on** (hydrogen with Scalar or With spin–orbit). Expected: the exact Dirac energy, not an SCF with LDA self-interaction. Pinned in Task 6 (`scf_relativistic` test "hydrogen bypasses the SCF").
5. **Superheavy atoms** (Z up to 118, Z/c = 0.86, γ₁ₛ = 0.51). Expected: both relativistic modes converge without NaN from γ or the relativistic mass M. Pinned in Task 4 (Z = 118 hydrogenic cases) and Task 7 (slow convergence sweep including 103 and 118).

---

## File Structure

**New — physics (`src/atom/`, no React, no rendering):**

| File | Responsibility |
| --- | --- |
| `relativity.ts` | `RelativityMode`, `SPEED_OF_LIGHT`, default-by-Z rule, κ/j algebra, 2j+1 occupation split, exact Dirac hydrogenic energies, j labels, method statements, URL codec |
| `coupled_rk4.ts` | RK4 step for a 2×2 linear first-order system on the uniform t = ln r grid, and 4-point midpoint interpolation. Pure numerics, the counterpart of `numerov.ts` |
| `relativistic_solver.ts` | Bound-state eigenvalue search for the Koelling–Harmon and radial Dirac equations, same bracketing/matching structure as `radial_solver.ts` |
| `relativistic_comparison.ts` | ⟨r⟩ of a state and the valence-s contraction between a non-relativistic and a relativistic solution |

**New — validation:**

| File | Responsibility |
| --- | --- |
| `tests/atom/fixtures/nist_srlda.json`, `nist_rlda.json` | Transcribed NIST reference values |
| `src/validation/relativity_results.json` | App values written by the slow NIST test (generated, committed) |
| `src/validation/relativity_rows.ts` | Maps the results into Phase 1's `ValidationRow[]` |

**Modified:**

| File | Change |
| --- | --- |
| `src/atom/radial_solver.ts:13-23` | `RadialState` gains optional `Q`, `j`, `kappa` |
| `src/atom/hartree.ts:64-89` | MacDonald–Vosko relativistic exchange factors, opt-in flag on the exchange functions |
| `src/atom/scf.ts` | `relativity` option, solver dispatch, Q² in D, relativistic exchange, seeded start, cache by mode |
| `src/atom/atom_profile.ts:115-121, 345-410, 468-474` | Q² in subshell curves, j in labels and entries |
| `src/atom/configurations.ts:182-185` | `subshellLabel(n, l, j?)` |
| `src/atom/shell_composition.ts` | j carried through components and isolation |
| `src/atom/profile_cache.ts`, `shell_mesh_cache.ts` | keys include relativity (and isolated j) |
| `src/atom/useAtomSolver.ts` | sends and caches by relativity |
| `src/workers/atomWorker.ts` | mode in the message; j, comparison curves and valence-s contraction in the payload |
| `src/store/atomSlice.ts` | `relativityOverride`, `setRelativity`, `effectiveRelativity`, j in selections |
| `src/validation/references.ts` (Phase 1) | appends `RELATIVITY_VALIDATION_ROWS` |
| `src/components/Controls.tsx` | Relativity toggle, helper text, "what changed" readout |
| `src/components/RadialPlot.tsx` | dashed curves and their legend key |
| `src/components/SubshellPanel.tsx`, `LevelNav.tsx` | j labels, j in navigation, method text |
| `src/components/OrbitalViewer.tsx:227-311` | composition lookup and cache key with j and relativity |
| `src/App.tsx` | wiring: mode, handlers with j, comparison curves, busy label |
| `src/style.css` | dashed legend key, relativity readout |
| `docs/HANDOFF.md`, `README.md` | known-limits sections rewritten with the measured numbers |

---

### Task 1: NIST relativistic reference fixtures

**Files:**
- Create: `tests/atom/fixtures/nist_srlda.json`
- Create: `tests/atom/fixtures/nist_rlda.json`
- Test: `tests/atom/nist_fixtures.test.ts`

**Interfaces:**
- Consumes: `configurationFor(Z)` from `src/atom/configurations.ts`.
- Produces: two JSON files with this schema, imported by Tasks 6 and 7:
  ```ts
  interface NistFixture {
      source: string;
      column: 'ScRLDA' | 'RLDA';
      transcribedOn: string;              // ISO date
      method: {
          correlation: 'VWN';
          relativisticExchangeCorrection: true;   // MacDonald–Vosko, per NIST's Procedure page
          speedOfLight: 137.0359895;
          jOccupation: 'proportional-to-2j+1';
      };
      atoms: Array<{
          Z: number; symbol: string; configuration: string;
          Etot: number;
          // ScRLDA: "1s", "2p", ... ; RLDA: "1s" for s, "2p-" (j = l − ½) and "2p+" (j = l + ½) otherwise
          eigenvalues: Record<string, number>;
      }>;
  }
  ```

**What is being transcribed, and from where.** NIST SRD 141, "Atomic reference data for electronic structure calculations" (Kotochigova, Levine, Shirley, Stiles, Clark; Phys. Rev. A 55, 191 (1997)): <https://www.nist.gov/pml/atomic-reference-data-electronic-structure-calculations>. The per-element tables are reached from the "Data" index <https://www.nist.gov/pml/atomic-reference-data-electronic-structure-calculations/atomic-reference-data-electronic-7>; the per-element URLs are **not** numbered by Z (`…-7-79` is europium), so navigate from the index. Each element page has one table per species with columns LDA, LSD, RLDA, ScRLDA; use the **neutral atom** table only. Copy `Etot` and every orbital eigenvalue row, all six decimals, for Ne, Ar, Kr, Xe, Au, Hg, Rn, U. In the RLDA column an l > 0 row reads "a / b": the first number is j = l − ½ (key `"2p-"`), the second j = l + ½ (key `"2p+"`) — NIST's Notation page says so and its data files label them `nlM`/`nlP`.

**Method notes, already checked on NIST's Procedure page** (<…/atomic-reference-data-electronic-3>): VWN correlation in all four approximations; RLDA **and** ScRLDA use "relativistic corrections to the energy-density functional proposed by MacDonald and Vosko"; in RLDA, open subshells are spherically averaged over j as well — "2 electrons in a p shell → 4/3 in p3/2 and 2/3 in p1/2", i.e. proportional to 2j+1; c from 1986 CODATA (137.0359895). The nuclear model is not stated on the web pages; treat it as a point nucleus (this plan's solver) and, if the paper says otherwise, note it in the fixture's `source` field and in the Task 7 report — a finite nucleus moves U 1s by ~0.01 %, far inside 1 %.

**Worked example of the format** (europium, read from NIST while writing this plan and reproduced by a prototype of Task 4's solver to 2·10⁻⁶ in Etot — use it to check you are reading the right columns; Eu is *not* one of the eight required atoms): Eu RLDA `Etot = -10826.732435`, `"2p-": -275.422638`, `"2p+": -251.870890`; ScRLDA `Etot = -10818.775287`, `"2p": -259.186835`, `"6s": -0.137961`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/nist_fixtures.test.ts
import srlda from './fixtures/nist_srlda.json';
import rlda from './fixtures/nist_rlda.json';
import { configurationFor } from '../../src/atom/configurations';

/**
 * Transcription checks. The fixtures are typed in by hand from NIST's web
 * tables, so this guards the typing, not the physics: every occupied orbital
 * present exactly once, j-split rows in the right order, and the two columns
 * consistent with each other where physics says they must be.
 */
interface NistAtom { Z: number; symbol: string; configuration: string; Etot: number; eigenvalues: Record<string, number> }
interface NistFixture {
    source: string;
    column: 'ScRLDA' | 'RLDA';
    transcribedOn: string;
    method: { correlation: string; relativisticExchangeCorrection: boolean; speedOfLight: number; jOccupation: string };
    atoms: NistAtom[];
}

const REQUIRED_Z = [10, 18, 36, 54, 79, 80, 86, 92];
const LETTERS = 'spdf';
const SCALAR = srlda as NistFixture;
const DIRAC = rlda as NistFixture;

function occupied(Z: number): Array<{ label: string; l: number }> {
    return configurationFor(Z).map(s => ({ label: `${s.n}${LETTERS[s.l]}`, l: s.l }));
}

function expectedKeys(Z: number, column: 'ScRLDA' | 'RLDA'): string[] {
    return occupied(Z)
        .flatMap(({ label, l }) => (column === 'RLDA' && l > 0 ? [`${label}-`, `${label}+`] : [label]))
        .sort();
}

describe.each([['ScRLDA', SCALAR], ['RLDA', DIRAC]] as const)('NIST %s fixture', (column, fixture) => {
    it('is the column it claims, with NIST\'s method recorded', () => {
        expect(fixture.column).toBe(column);
        expect(fixture.method.correlation).toBe('VWN');
        expect(fixture.method.relativisticExchangeCorrection).toBe(true);
        expect(fixture.method.jOccupation).toBe('proportional-to-2j+1');
        expect(fixture.source).toMatch(/nist\.gov/);
    });

    it('covers exactly the eight required atoms', () => {
        expect(fixture.atoms.map(a => a.Z).sort((a, b) => a - b)).toEqual(REQUIRED_Z);
    });

    it.each(REQUIRED_Z)('Z=%i lists every occupied orbital exactly once, all bound', Z => {
        const atom = fixture.atoms.find(a => a.Z === Z)!;
        expect(atom.Etot).toBeLessThan(0);
        expect(Object.keys(atom.eigenvalues).sort()).toEqual(expectedKeys(Z, column));
        for (const value of Object.values(atom.eigenvalues)) expect(value).toBeLessThan(0);
    });
});

describe('the two columns agree where physics says they must', () => {
    it.each(REQUIRED_Z)('Z=%i: j = l − ½ lies below j = l + ½, and the scalar level lies between them', Z => {
        const s = SCALAR.atoms.find(a => a.Z === Z)!;
        const d = DIRAC.atoms.find(a => a.Z === Z)!;
        for (const { label, l } of occupied(Z)) {
            if (l === 0) {
                // s levels have no spin-orbit partner; the two treatments differ
                // only through the density, by well under a percent.
                expect(Math.abs((s.eigenvalues[label] - d.eigenvalues[label]) / d.eigenvalues[label])).toBeLessThan(0.01);
                continue;
            }
            const lower = d.eigenvalues[`${label}-`];
            const upper = d.eigenvalues[`${label}+`];
            expect(lower).toBeLessThan(upper);
            expect(s.eigenvalues[label]).toBeGreaterThan(lower);
            expect(s.eigenvalues[label]).toBeLessThan(upper);
        }
    });

    it('light atoms sit within half a percent of the non-relativistic NIST LDA totals', () => {
        // LDA totals from tests/atom/scf.test.ts's NIST_LDA table.
        const lda: Record<number, number> = { 10: -128.233481, 18: -525.946195 };
        for (const fixture of [SCALAR, DIRAC]) {
            for (const Z of [10, 18]) {
                const atom = fixture.atoms.find(a => a.Z === Z)!;
                expect(Math.abs((atom.Etot - lda[Z]) / lda[Z])).toBeLessThan(0.005);
            }
        }
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/atom/nist_fixtures.test.ts`
Expected: FAIL — `Cannot find module './fixtures/nist_srlda.json'`.

- [ ] **Step 3: Transcribe the fixtures**

Create both files with this skeleton, then fill `atoms` from the NIST pages as described above (eight entries each, ascending Z; `configuration` exactly as NIST prints it, e.g. `"[Xe] 4f14 5d10 6s1"`):

```json
{
  "source": "NIST SRD 141, Atomic Reference Data for Electronic Structure Calculations (Kotochigova, Levine, Shirley, Stiles, Clark, Phys. Rev. A 55, 191 (1997); erratum 56, 5191), https://www.nist.gov/pml/atomic-reference-data-electronic-structure-calculations — neutral-atom tables, ScRLDA column",
  "column": "ScRLDA",
  "transcribedOn": "2026-09-25",
  "method": {
    "correlation": "VWN",
    "relativisticExchangeCorrection": true,
    "speedOfLight": 137.0359895,
    "jOccupation": "proportional-to-2j+1"
  },
  "atoms": [
    { "Z": 10, "symbol": "Ne", "configuration": "1s2 2s2 2p6", "Etot": 0, "eigenvalues": { "1s": 0, "2s": 0, "2p": 0 } }
  ]
}
```

`nist_rlda.json` is identical in shape with `"column": "RLDA"`, the source text ending "RLDA column", and eigenvalue keys `"2p-"`/`"2p+"` for every l > 0 orbital. Replace every `0` with the transcribed value. If NIST's configuration for any of the eight differs from `configurationFor(Z)` (it should not — all eight are listed identically in `configurations.ts`), stop and report it: the validation would compare different atoms.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/atom/nist_fixtures.test.ts`
Expected: PASS. A failure in the "between them" test almost always means two cells were swapped while typing.

- [ ] **Step 5: Commit**

```bash
git add tests/atom/fixtures/nist_srlda.json tests/atom/fixtures/nist_rlda.json tests/atom/nist_fixtures.test.ts
git commit -m "test(atom): transcribe NIST ScRLDA and RLDA reference values for eight atoms

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Relativity vocabulary (`relativity.ts`)

**Files:**
- Create: `src/atom/relativity.ts`
- Test: `tests/atom/relativity.test.ts`

**Interfaces:**
- Consumes: type `SubshellOccupancy` from `src/atom/configurations.ts`.
- Produces:
  ```ts
  export const SPEED_OF_LIGHT = 137.035999;
  export type RelativityMode = 'off' | 'scalar' | 'spinOrbit';
  export const RELATIVITY_MODES: readonly RelativityMode[];
  export const RELATIVISTIC_DEFAULT_FROM_Z = 55;
  export const RELATIVISTIC_EXCHANGE_CORRECTION = true;
  export function defaultRelativityFor(Z: number): RelativityMode;
  export function kappaFor(l: number, j: number): number;
  export function lForKappa(kappa: number): number;
  export function jForKappa(kappa: number): number;
  export interface JLevelOccupancy { n: number; l: number; j: number; kappa: number; electrons: number }
  export function splitByJ(subshell: SubshellOccupancy): JLevelOccupancy[];
  export function diracHydrogenicEnergy(n: number, kappa: number, Z: number): number;
  export function jLabel(j: number): string;
  export function relativityLabel(mode: RelativityMode): string;
  export function methodStatement(mode: RelativityMode): string;
  export function encodeRelativityParam(mode: RelativityMode | null): string | null;
  export function decodeRelativityParam(value: string | null | undefined): RelativityMode | null;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/relativity.test.ts
import {
    SPEED_OF_LIGHT, defaultRelativityFor, kappaFor, lForKappa, jForKappa, splitByJ,
    diracHydrogenicEnergy, jLabel, relativityLabel, methodStatement,
    encodeRelativityParam, decodeRelativityParam,
} from '../../src/atom/relativity';

describe('relativity vocabulary', () => {
    it('uses the spec\'s speed of light', () => {
        expect(SPEED_OF_LIGHT).toBe(137.035999);
    });

    it('defaults to scalar from caesium onward and off before it', () => {
        expect(defaultRelativityFor(54)).toBe('off');
        expect(defaultRelativityFor(55)).toBe('scalar');
        expect(defaultRelativityFor(118)).toBe('scalar');
        expect(defaultRelativityFor(1)).toBe('off');
    });

    it('maps (l, j) to κ with the Dirac sign convention and back', () => {
        expect(kappaFor(0, 0.5)).toBe(-1);
        expect(kappaFor(1, 0.5)).toBe(1);
        expect(kappaFor(1, 1.5)).toBe(-2);
        expect(kappaFor(3, 2.5)).toBe(3);
        expect(kappaFor(3, 3.5)).toBe(-4);
        for (const kappa of [-4, -3, -2, -1, 1, 2, 3]) {
            expect(kappaFor(lForKappa(kappa), jForKappa(kappa))).toBe(kappa);
        }
        expect(() => kappaFor(0, -0.5)).toThrow();
        expect(() => kappaFor(1, 2.5)).toThrow();
    });

    it('splits a subshell between its j-levels in proportion to 2j+1, lower j first', () => {
        expect(splitByJ({ n: 6, l: 0, electrons: 1 })).toEqual([{ n: 6, l: 0, j: 0.5, kappa: -1, electrons: 1 }]);
        const p = splitByJ({ n: 2, l: 1, electrons: 2 });
        expect(p.map(s => s.j)).toEqual([0.5, 1.5]);
        expect(p[0].electrons).toBeCloseTo(2 / 3, 12);   // NIST's own example
        expect(p[1].electrons).toBeCloseTo(4 / 3, 12);
        const f = splitByJ({ n: 5, l: 3, electrons: 3 });   // uranium 5f3
        expect(f[0].electrons).toBeCloseTo(9 / 7, 12);
        expect(f[1].electrons).toBeCloseTo(12 / 7, 12);
        // A full subshell fills both j-levels to capacity.
        const full = splitByJ({ n: 5, l: 2, electrons: 10 });
        expect(full.map(s => s.electrons)).toEqual([4, 6]);
    });

    it('gives the exact Dirac hydrogenic energy, reducing to -Z²/2n² for small Z/c', () => {
        // E(1s) = c²(γ - 1), γ = sqrt(1 - (Z/c)²)
        const Z = 80;
        const gamma = Math.sqrt(1 - (Z / SPEED_OF_LIGHT) ** 2);
        expect(diracHydrogenicEnergy(1, -1, Z)).toBeCloseTo(SPEED_OF_LIGHT ** 2 * (gamma - 1), 8);
        expect(diracHydrogenicEnergy(1, -1, 1)).toBeCloseTo(-0.5000066566, 9);
        // 2s½ and 2p½ are exactly degenerate in a Coulomb field; 2p³⁄₂ lies above.
        expect(diracHydrogenicEnergy(2, -1, Z)).toBeCloseTo(diracHydrogenicEnergy(2, 1, Z), 9);
        expect(diracHydrogenicEnergy(2, -2, Z)).toBeGreaterThan(diracHydrogenicEnergy(2, 1, Z));
    });

    it('labels j-levels as the spec writes them', () => {
        expect(jLabel(0.5)).toBe('½');
        expect(jLabel(1.5)).toBe('³⁄₂');
        expect(jLabel(2.5)).toBe('⁵⁄₂');
        expect(jLabel(3.5)).toBe('⁷⁄₂');
        expect(() => jLabel(4.5)).toThrow();
    });

    it('names each mode and states its method', () => {
        expect(relativityLabel('off')).toBe('Off');
        expect(relativityLabel('scalar')).toBe('Scalar');
        expect(relativityLabel('spinOrbit')).toBe('With spin–orbit');
        // 'off' must stay exactly LevelNav's existing statement.
        expect(methodStatement('off')).toBe('central-field SCF, LDA exchange with VWN correlation, spherically averaged');
        expect(methodStatement('scalar')).toMatch(/Koelling–Harmon/);
        expect(methodStatement('scalar')).toMatch(/MacDonald–Vosko/);
        expect(methodStatement('spinOrbit')).toMatch(/Dirac/);
        expect(methodStatement('spinOrbit')).toMatch(/2j\+1/);
    });

    it('round-trips through a URL parameter and ignores anything unknown', () => {
        expect(encodeRelativityParam('spinOrbit')).toBe('so');
        expect(encodeRelativityParam(null)).toBeNull();
        for (const mode of ['off', 'scalar', 'spinOrbit'] as const) {
            expect(decodeRelativityParam(encodeRelativityParam(mode))).toBe(mode);
        }
        expect(decodeRelativityParam('dirac')).toBeNull();
        expect(decodeRelativityParam(undefined)).toBeNull();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/atom/relativity.test.ts`
Expected: FAIL — `Cannot find module '../../src/atom/relativity'`.

- [ ] **Step 3: Implement**

```ts
// src/atom/relativity.ts
/**
 * The vocabulary of Phase 4: which relativistic treatment is in force, the
 * Dirac quantum number κ and its j-levels, and the words the UI uses for
 * them. No numerics here beyond the closed-form Dirac hydrogen energy, which
 * is the relativistic solver's exact oracle the way the analytic R_nl is the
 * non-relativistic one's.
 */
import type { SubshellOccupancy } from './configurations';

/** c in atomic units (spec value). NIST used 137.0359895; the difference is 4e-9 relative. */
export const SPEED_OF_LIGHT = 137.035999;

/**
 * 'off' is the Schrödinger equation (today's app); 'scalar' is Koelling–Harmon
 * (mass-velocity and Darwin terms, spin-orbit dropped); 'spinOrbit' is the
 * radial Dirac equation, which splits each l > 0 subshell into j = l ± 1/2.
 */
export type RelativityMode = 'off' | 'scalar' | 'spinOrbit';
export const RELATIVITY_MODES: readonly RelativityMode[] = ['off', 'scalar', 'spinOrbit'];

/** Spec §5 Phase 4: scalar by default from Cs onward, where relativistic error passes a few percent. */
export const RELATIVISTIC_DEFAULT_FROM_Z = 55;

/**
 * Whether a relativistic mode also applies the MacDonald–Vosko correction to
 * LDA exchange. NIST's Procedure page states both RLDA and ScRLDA do, and
 * those are the tables this is validated against, so matching them is the
 * only way the validation means anything. The fixtures record the same fact
 * (method.relativisticExchangeCorrection) and a test holds the two together.
 */
export const RELATIVISTIC_EXCHANGE_CORRECTION = true;

export function defaultRelativityFor(Z: number): RelativityMode {
    return Z >= RELATIVISTIC_DEFAULT_FROM_Z ? 'scalar' : 'off';
}

/** κ = -(l+1) for j = l + 1/2, κ = l for j = l - 1/2 (the usual Dirac convention). */
export function kappaFor(l: number, j: number): number {
    if (!Number.isInteger(l) || l < 0) throw new Error(`l must be a non-negative integer, got ${l}.`);
    if (j === l + 0.5) return -(l + 1);
    if (l > 0 && j === l - 0.5) return l;
    throw new Error(`j=${j} is not l ± 1/2 for l=${l}.`);
}

export function lForKappa(kappa: number): number {
    return kappa < 0 ? -kappa - 1 : kappa;
}

export function jForKappa(kappa: number): number {
    return Math.abs(kappa) - 0.5;
}

export interface JLevelOccupancy {
    n: number;
    l: number;
    j: number;
    kappa: number;
    /** Fractional for an open subshell: shared in proportion to 2j+1 (spherical averaging, as NIST's RLDA). */
    electrons: number;
}

/**
 * One subshell's electrons shared between its j-levels in proportion to
 * 2j + 1, lower j first (NIST's table order). This is the relativistic
 * extension of the spherical averaging the whole model rests on: every
 * m_j state of the subshell is equally occupied, so the density stays
 * spherical. NIST's own example: p² → 2/3 in p½, 4/3 in p³⁄₂.
 */
export function splitByJ(subshell: SubshellOccupancy): JLevelOccupancy[] {
    const { n, l, electrons } = subshell;
    if (l === 0) return [{ n, l, j: 0.5, kappa: -1, electrons }];
    const lower = 2 * l;          // 2j + 1 at j = l - 1/2
    const upper = 2 * l + 2;      // 2j + 1 at j = l + 1/2
    const total = lower + upper;
    return [
        { n, l, j: l - 0.5, kappa: l, electrons: (electrons * lower) / total },
        { n, l, j: l + 0.5, kappa: -(l + 1), electrons: (electrons * upper) / total },
    ];
}

/**
 * Exact bound-state energy of one electron in -Z/r, rest mass removed:
 * E = c² [ (1 + (Zα/(n - |κ| + γ))²)^(-1/2) - 1 ], γ = sqrt(κ² - (Zα)²).
 */
export function diracHydrogenicEnergy(n: number, kappa: number, Z: number): number {
    const zc = Z / SPEED_OF_LIGHT;
    const gamma = Math.sqrt(kappa * kappa - zc * zc);
    const radialQuantumNumber = n - Math.abs(kappa);
    const c2 = SPEED_OF_LIGHT * SPEED_OF_LIGHT;
    return c2 * (1 / Math.sqrt(1 + (zc / (radialQuantumNumber + gamma)) ** 2) - 1);
}

const J_LABELS: Record<string, string> = { '0.5': '½', '1.5': '³⁄₂', '2.5': '⁵⁄₂', '3.5': '⁷⁄₂' };

/** "6p" + jLabel(1.5) reads "6p³⁄₂", the spec's own notation. Only s-f occur, so j ≤ 7/2. */
export function jLabel(j: number): string {
    const label = J_LABELS[String(j)];
    if (!label) throw new Error(`No label for j=${j}; only j = 1/2 ... 7/2 occur in s-f subshells.`);
    return label;
}

export function relativityLabel(mode: RelativityMode): string {
    switch (mode) {
        case 'off': return 'Off';
        case 'scalar': return 'Scalar';
        case 'spinOrbit': return 'With spin–orbit';
    }
}

/** The one-line method statement every displayed number in atom mode answers to (spec §3.1). */
export function methodStatement(mode: RelativityMode): string {
    switch (mode) {
        case 'off':
            return 'central-field SCF, LDA exchange with VWN correlation, spherically averaged';
        case 'scalar':
            return 'central-field SCF, scalar-relativistic (Koelling–Harmon: mass-velocity and Darwin terms, no spin–orbit), '
                + 'LDA exchange with the MacDonald–Vosko relativistic correction and VWN correlation, spherically averaged';
        case 'spinOrbit':
            return 'central-field SCF, radial Dirac equation (spin–orbit included; j = l ± ½ levels occupied in proportion to 2j+1), '
                + 'LDA exchange with the MacDonald–Vosko relativistic correction and VWN correlation, spherically averaged';
    }
}

const URL_VALUES: Record<RelativityMode, string> = { off: 'off', scalar: 'scalar', spinOrbit: 'so' };

/** For Phase 2's URL state (spec §4.3): null means "follow the element's default", so no key is written. */
export function encodeRelativityParam(mode: RelativityMode | null): string | null {
    return mode === null ? null : URL_VALUES[mode];
}

/** Unknown or missing values are ignored, never thrown on (spec §4.3). */
export function decodeRelativityParam(value: string | null | undefined): RelativityMode | null {
    const match = RELATIVITY_MODES.find(mode => URL_VALUES[mode] === value);
    return match ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/atom/relativity.test.ts`
Expected: PASS.

- [ ] **Step 5: Hold the exchange flag to the fixtures**

Append to `tests/atom/nist_fixtures.test.ts`:

```ts
import { RELATIVISTIC_EXCHANGE_CORRECTION } from '../../src/atom/relativity';

it('the app applies the relativistic exchange correction exactly when NIST did', () => {
    expect(RELATIVISTIC_EXCHANGE_CORRECTION).toBe(SCALAR.method.relativisticExchangeCorrection);
    expect(RELATIVISTIC_EXCHANGE_CORRECTION).toBe(DIRAC.method.relativisticExchangeCorrection);
});
```

Run: `npx jest tests/atom/nist_fixtures.test.ts tests/atom/relativity.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/atom/relativity.ts tests/atom/relativity.test.ts tests/atom/nist_fixtures.test.ts
git commit -m "feat(atom): relativity vocabulary — modes, kappa/j algebra, 2j+1 split, Dirac hydrogen oracle

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Coupled first-order integrator (`coupled_rk4.ts`)

**Why not Numerov.** Numerov needs `y'' = g·y` with no first-derivative term. Eliminating the small component from the Koelling–Harmon system leaves a Darwin term `(M'/M)(G' − G/r)`; removing it by substitution puts M″, hence the *second derivative of the numerically built SCF potential*, into g — noisy at shell boundaries. The Dirac equation has no κ-independent second-order form at all. The standard alternative is to integrate the coupled system for (G, F) directly. On the log grid t = ln r, `gridForAtom`'s spacing is dx = 0.0080 (H) to 0.0118 (Og); classical RK4 is O(dx⁴) ≈ 10⁻⁸ globally. Measured with a prototype of Task 4 on exactly these grids: Dirac hydrogenic eigenvalues within 2·10⁻⁹ relative at Z = 80 and 1.6·10⁻⁷ at Z = 1 (the latter a grid-extent effect shared with the Numerov solver). RK4 needs the potential at half-steps; a 4-point Lagrange interpolation in t is O(dx⁴) and keeps the scheme at fourth order.

**Files:**
- Create: `src/atom/coupled_rk4.ts`
- Test: `tests/atom/coupled_rk4.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  /** Fills out = [a, b, c, d] for d/dt (G, F) = [[a, b], [c, d]] (G, F) at radius r where the potential is v. */
  export type CoefficientFn = (r: number, v: number, out: Float64Array) => void;
  export function midpointValues(values: Float64Array): Float64Array;   // length values.length - 1
  export function rk4Step(
      fill: CoefficientFn, h: number,
      r0: number, v0: number, rMid: number, vMid: number, r1: number, v1: number,
      G: number, F: number, out: Float64Array,                            // out = [G1, F1]
  ): void;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/coupled_rk4.test.ts
import { CoefficientFn, midpointValues, rk4Step } from '../../src/atom/coupled_rk4';

/** Integrates from t = 0 to t = 1 in `steps` steps, with v(t) supplied at grid points and midpoints. */
function integrate(fill: CoefficientFn, steps: number, vOf: (t: number) => number, G0: number, F0: number): [number, number] {
    const h = 1 / steps;
    const out = new Float64Array(2);
    let G = G0;
    let F = F0;
    for (let i = 0; i < steps; i++) {
        const t0 = i * h;
        rk4Step(fill, h, t0, vOf(t0), t0 + h / 2, vOf(t0 + h / 2), t0 + h, vOf(t0 + h), G, F, out);
        G = out[0];
        F = out[1];
    }
    return [G, F];
}

describe('rk4Step', () => {
    // G' = F, F' = -G from (1, 0): G = cos t, F = -sin t.
    const rotation: CoefficientFn = (_r, _v, out) => { out[0] = 0; out[1] = 1; out[2] = -1; out[3] = 0; };

    it('is fourth order: halving the step cuts the error about sixteenfold', () => {
        const error = (steps: number) => Math.abs(integrate(rotation, steps, () => 0, 1, 0)[0] - Math.cos(1));
        const ratio = error(10) / error(20);
        expect(ratio).toBeGreaterThan(12);
        expect(ratio).toBeLessThan(20);
        expect(error(100)).toBeLessThan(1e-9);
    });

    it('uses the supplied midpoint potential, not an endpoint one', () => {
        // G' = v G with v = t: G = exp(t²/2). Feeding v through the potential
        // slot is what distinguishes a correct midpoint evaluation from one
        // that reuses v0 -- the latter is only first-order accurate here.
        const growth: CoefficientFn = (_r, v, out) => { out[0] = v; out[1] = 0; out[2] = 0; out[3] = 0; };
        const [G] = integrate(growth, 50, t => t, 1, 0);
        expect(Math.abs(G - Math.exp(0.5))).toBeLessThan(1e-8);
    });

    it('integrates backwards with a negative step', () => {
        const out = new Float64Array(2);
        let G = Math.cos(1);
        let F = -Math.sin(1);
        const h = -0.01;
        for (let i = 0; i < 100; i++) {
            rk4Step(rotation, h, 0, 0, 0, 0, 0, 0, G, F, out);
            G = out[0];
            F = out[1];
        }
        expect(G).toBeCloseTo(1, 9);
        expect(F).toBeCloseTo(0, 9);
    });
});

describe('midpointValues', () => {
    it('is exact for a cubic in the interior and a quadratic at both ends', () => {
        const cubic = (x: number) => 2 * x ** 3 - x ** 2 + 3 * x - 5;
        const quadratic = (x: number) => 3 * x ** 2 - 2 * x + 1;
        const size = 12;
        const cubicValues = Float64Array.from({ length: size }, (_, j) => cubic(j));
        const quadraticValues = Float64Array.from({ length: size }, (_, j) => quadratic(j));
        const cubicMid = midpointValues(cubicValues);
        const quadraticMid = midpointValues(quadraticValues);
        expect(cubicMid).toHaveLength(size - 1);
        for (let j = 1; j < size - 2; j++) expect(cubicMid[j]).toBeCloseTo(cubic(j + 0.5), 10);
        for (const j of [0, size - 2]) expect(quadraticMid[j]).toBeCloseTo(quadratic(j + 0.5), 10);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/atom/coupled_rk4.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/atom/coupled_rk4.ts
/**
 * Classical fourth-order Runge–Kutta for a 2x2 linear first-order system on a
 * uniformly spaced variable -- here t = ln r, the spacing of the radial grid.
 *
 * This is the relativistic counterpart of numerov.ts: pure numerics, no
 * physics, no grid knowledge. The relativistic radial equations are a
 * coupled pair for the large and small components (G, F) with no
 * Numerov-compatible second-order form (see relativistic_solver.ts), so they
 * are integrated as the pair. The system's coefficients depend on the
 * potential, which lives only on grid points; RK4's half-step needs it in
 * between, supplied by `midpointValues` at the same fourth order.
 */

/** Fills out = [a, b, c, d] for d/dt (G, F) = [[a, b], [c, d]] (G, F) at radius r where the potential is v. */
export type CoefficientFn = (r: number, v: number, out: Float64Array) => void;

// Scratch for the coefficients: rk4Step runs ~10^8 times over a heavy-atom
// SCF, so allocating per call would dominate its cost.
const k = new Float64Array(4);

export function rk4Step(
    fill: CoefficientFn, h: number,
    r0: number, v0: number, rMid: number, vMid: number, r1: number, v1: number,
    G: number, F: number, out: Float64Array,
): void {
    fill(r0, v0, k);
    const g1 = k[0] * G + k[1] * F;
    const f1 = k[2] * G + k[3] * F;

    fill(rMid, vMid, k);
    const Ga = G + 0.5 * h * g1;
    const Fa = F + 0.5 * h * f1;
    const g2 = k[0] * Ga + k[1] * Fa;
    const f2 = k[2] * Ga + k[3] * Fa;
    const Gb = G + 0.5 * h * g2;
    const Fb = F + 0.5 * h * f2;
    const g3 = k[0] * Gb + k[1] * Fb;
    const f3 = k[2] * Gb + k[3] * Fb;

    fill(r1, v1, k);
    const Gc = G + h * g3;
    const Fc = F + h * f3;
    const g4 = k[0] * Gc + k[1] * Fc;
    const f4 = k[2] * Gc + k[3] * Fc;

    out[0] = G + (h * (g1 + 2 * g2 + 2 * g3 + g4)) / 6;
    out[1] = F + (h * (f1 + 2 * f2 + 2 * f3 + f4)) / 6;
}

/**
 * values at the half-way points j + 1/2, j = 0..size-2, by 4-point Lagrange
 * interpolation in the (uniform) index -- exact for cubics, so the same
 * order as RK4 itself. The first and last intervals have only one
 * neighbour on the outside and use the 3-point (quadratic) form instead.
 */
export function midpointValues(values: Float64Array): Float64Array {
    const size = values.length;
    if (size < 3) throw new Error('midpointValues needs at least 3 points.');
    const mid = new Float64Array(size - 1);
    mid[0] = (3 * values[0] + 6 * values[1] - values[2]) / 8;
    for (let j = 1; j < size - 2; j++) {
        mid[j] = (-values[j - 1] + 9 * values[j] + 9 * values[j + 1] - values[j + 2]) / 16;
    }
    mid[size - 2] = (-values[size - 3] + 6 * values[size - 2] + 3 * values[size - 1]) / 8;
    return mid;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/atom/coupled_rk4.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atom/coupled_rk4.ts tests/atom/coupled_rk4.test.ts
git commit -m "feat(atom): fourth-order RK4 step and midpoint interpolation for coupled radial systems

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Koelling–Harmon and radial Dirac eigenvalue solver

**The equations** (Hartree units, rest mass removed, G = r·g large component, F = r·f small component, M(r) = 1 + (ε − V)/2c²; written in t = ln r so every coefficient stays bounded at the origin):

| | dG/dt | dF/dt |
| --- | --- | --- |
| Dirac, κ | −κ G + 2cMr F | [r(V − ε)/c] G + κ F |
| Koelling–Harmon, l | G + 2cMr F | [l(l+1)/(2Mcr) + r(V − ε)/c] G − F |

Eliminating F from the Dirac pair gives G″ = [κ(κ+1)/r² + 2M(V − ε)] G + (M′/M)(G′ + κG/r); Koelling–Harmon drops the spin–orbit piece (M′/M)(κ+1)G/r, leaving mass-velocity (M ≠ 1) and Darwin (M′/M)(G′ − G/r). For l = 0 the two systems are identical (κ = −1), which is a test. Near the nucleus V ≈ −Z/r and both behave as r^γ with γ = √(κ² − (Z/c)²) (Dirac) or √(l(l+1) + 1 − (Z/c)²) (KH), with F/G = (γ + κ)c/Z (KH: κ → −1). The density is G² + F², normalised ∫(G² + F²) dr = 1; state (n, l) has n − l − 1 nodes in G. Measured with a prototype of exactly this code: the KH p/d eigenvalue sits between the Dirac j-levels, 0.069 (Z=80 2p) and 0.014 (Z=80 3d) of the splitting from their 2j+1-weighted average.

**Files:**
- Create: `src/atom/relativistic_solver.ts`
- Modify: `src/atom/radial_solver.ts:13-23` (`RadialState`)
- Test: `tests/atom/relativistic_solver.test.ts`

**Interfaces:**
- Consumes: `RadialGrid`, `integrateOnGrid`, `cumulativeIntegral` (`radial_grid.ts`); `countNodes` (`numerov.ts`); `CoefficientFn`, `midpointValues`, `rk4Step` (Task 3); `SPEED_OF_LIGHT`, `diracHydrogenicEnergy`, `jForKappa`, `lForKappa` (Task 2).
- Produces:
  ```ts
  // radial_solver.ts
  export interface RadialState {
      n: number; l: number; energy: number;
      u: Float64Array;            // large component G = r·g for relativistic states
      R: Float64Array;            // u / r
      Q?: Float64Array;           // small component F = r·f; present only for relativistic states
      j?: number;                 // present only for Dirac states
      kappa?: number;             // present only for Dirac states
  }
  // relativistic_solver.ts
  export type CoupledChannel = { kind: 'scalar'; l: number } | { kind: 'dirac'; kappa: number };
  export function solveScalarRelativisticState(grid: RadialGrid, n: number, l: number, potential: Float64Array, Z: number): RadialState;
  export function solveDiracState(grid: RadialGrid, n: number, kappa: number, potential: Float64Array, Z: number): RadialState;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/relativistic_solver.test.ts
import { gridForAtom, makeRadialGrid, integrateOnGrid } from '../../src/atom/radial_grid';
import { solveDiracState, solveScalarRelativisticState } from '../../src/atom/relativistic_solver';
import { diracHydrogenicEnergy, SPEED_OF_LIGHT } from '../../src/atom/relativity';

function coulomb(grid: { r: Float64Array; size: number }, Z: number): Float64Array {
    const v = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) v[j] = -Z / grid.r[j];
    return v;
}

function relativeError(actual: number, exact: number): number {
    return Math.abs((actual - exact) / exact);
}

describe('Dirac solver against the exact Dirac hydrogen spectrum', () => {
    // [n, kappa, Z] -- s, p½, p³⁄₂, d, f at light, heavy and superheavy Z.
    const cases: Array<[number, number, number]> = [
        [1, -1, 1], [2, 1, 1], [2, -2, 1], [3, -3, 1],
        [1, -1, 80], [2, -1, 80], [2, 1, 80], [2, -2, 80], [3, 2, 80], [3, -3, 80], [4, 3, 80], [4, -4, 80],
        [2, 1, 26], [6, -1, 79], [1, -1, 92], [1, -1, 118], [2, 1, 118],
    ];

    it.each(cases)('n=%i κ=%i Z=%i matches to 1e-6', (n, kappa, Z) => {
        const grid = gridForAtom(Z, n);
        const state = solveDiracState(grid, n, kappa, coulomb(grid, Z), Z);
        expect(relativeError(state.energy, diracHydrogenicEnergy(n, kappa, Z))).toBeLessThan(1e-6);
    });

    it('reproduces the 2s½ / 2p½ degeneracy of the Coulomb field', () => {
        const grid = gridForAtom(80, 2);
        const s = solveDiracState(grid, 2, -1, coulomb(grid, 80), 80).energy;
        const p = solveDiracState(grid, 2, 1, coulomb(grid, 80), 80).energy;
        expect(relativeError(p, s)).toBeLessThan(1e-8);
    });

    it('reports j and κ, and has n - l - 1 nodes in the large component', () => {
        const grid = gridForAtom(1, 4);
        for (const [n, kappa] of [[2, 1], [3, -1], [3, 2], [4, -3], [4, 3]] as Array<[number, number]>) {
            const state = solveDiracState(grid, n, kappa, coulomb(grid, 1), 1);
            const l = kappa < 0 ? -kappa - 1 : kappa;
            expect(state.kappa).toBe(kappa);
            expect(state.j).toBe(Math.abs(kappa) - 0.5);
            let nodes = 0;
            let previous = 0;
            for (let j = 0; j < grid.size - 50; j++) {
                if (Math.abs(state.u[j]) < 1e-12) continue;
                const sign = state.u[j] > 0 ? 1 : -1;
                if (previous !== 0 && sign !== previous) nodes++;
                previous = sign;
            }
            expect(nodes).toBe(n - l - 1);
        }
    });

    it('normalises G² + F² to one, with a small component that grows with Z', () => {
        const smallFraction = (Z: number, n: number, kappa: number) => {
            const grid = gridForAtom(Z, n);
            const state = solveDiracState(grid, n, kappa, coulomb(grid, Z), Z);
            const total = new Float64Array(grid.size);
            const small = new Float64Array(grid.size);
            for (let j = 0; j < grid.size; j++) {
                small[j] = state.Q![j] * state.Q![j];
                total[j] = state.u[j] * state.u[j] + small[j];
            }
            expect(integrateOnGrid(grid, total)).toBeCloseTo(1, 8);
            return integrateOnGrid(grid, small);
        };
        expect(smallFraction(1, 1, -1)).toBeLessThan(1e-4);     // measured 3e-6
        expect(smallFraction(118, 2, 1)).toBeGreaterThan(0.03); // measured 0.066
    });

    it('starts as r^γ at the nucleus, γ = sqrt(κ² - (Z/c)²)', () => {
        const Z = 79;
        const grid = gridForAtom(Z, 6);
        const state = solveDiracState(grid, 6, -1, coulomb(grid, Z), Z);
        const slope = Math.log(state.u[10] / state.u[5]) / (5 * grid.dx);
        expect(slope).toBeCloseTo(Math.sqrt(1 - (Z / SPEED_OF_LIGHT) ** 2), 3);
        expect(state.R[5]).toBeGreaterThan(0);
    });

    it('refuses a grid too small to hold the state', () => {
        const grid = makeRadialGrid(1e-6, 40, 2001);
        expect(() => solveDiracState(grid, 7, -1, coulomb(grid, 1), 1)).toThrow(/too small/);
    });
});

describe('Koelling–Harmon (scalar-relativistic) solver', () => {
    it('is exactly the Dirac κ = -1 problem for s states', () => {
        for (const n of [1, 2]) {
            const grid = gridForAtom(80, n);
            const v = coulomb(grid, 80);
            const scalar = solveScalarRelativisticState(grid, n, 0, v, 80).energy;
            const dirac = solveDiracState(grid, n, -1, v, 80).energy;
            expect(relativeError(scalar, dirac)).toBeLessThan(1e-12);
        }
    });

    it.each([[2, 1], [3, 2]])('puts n=%i l=%i between its j-levels, near their 2j+1 average', (n, l) => {
        const Z = 80;
        const grid = gridForAtom(Z, n);
        const scalar = solveScalarRelativisticState(grid, n, l, coulomb(grid, Z), Z);
        const lower = diracHydrogenicEnergy(n, l, Z);            // j = l - 1/2
        const upper = diracHydrogenicEnergy(n, -(l + 1), Z);     // j = l + 1/2
        const average = (2 * l * lower + (2 * l + 2) * upper) / (4 * l + 2);
        expect(scalar.energy).toBeGreaterThan(lower);
        expect(scalar.energy).toBeLessThan(upper);
        // Measured 0.069 (2p) and 0.014 (3d) of the splitting.
        expect(Math.abs(scalar.energy - average)).toBeLessThan(0.1 * (upper - lower));
        expect(scalar.j).toBeUndefined();
        expect(scalar.Q).toBeDefined();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/atom/relativistic_solver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Extend `RadialState`**

In `src/atom/radial_solver.ts` replace the interface at lines 13–23 with:

```ts
export interface RadialState {
    n: number;
    l: number;
    /** Eigenvalue in Hartree (rest mass excluded for relativistic states). Negative for a bound state. */
    energy: number;
    /**
     * u(r) = r*R(r). For a relativistic state this is the large component G,
     * and it is G^2 + Q^2 -- not u^2 alone -- that integrates to 1 and that
     * the density is built from.
     */
    u: Float64Array;
    /** R(r) = u(r)/r, the radial function the level-3 renderer draws. */
    R: Float64Array;
    /** Small component F = r*f, present only for relativistic states. */
    Q?: Float64Array;
    /** Total angular momentum j = l ± 1/2, present only for Dirac (spin-orbit) states. */
    j?: number;
    /** Dirac quantum number, present only for Dirac states: -(l+1) for j = l + 1/2, l for j = l - 1/2. */
    kappa?: number;
}
```

- [ ] **Step 4: Implement the solver**

```ts
// src/atom/relativistic_solver.ts
/**
 * The relativistic radial eigenvalue solver: one bound state of one
 * potential, for either the scalar-relativistic Koelling–Harmon equation
 * (channel { kind: 'scalar', l }) or the radial Dirac equation
 * (channel { kind: 'dirac', kappa }).
 *
 * Structure deliberately mirrors radial_solver.ts -- node-count bracketing
 * (phase A), then bisection on the mismatch at the classical turning point
 * (phase B), the same overflow rescaling and the same containment guard --
 * because every one of those choices was paid for there (see its comments).
 * What differs is the equation: a coupled first-order pair for the large and
 * small components (G, F), integrated with RK4 in t = ln r (coupled_rk4.ts)
 * rather than a single second-order equation by Numerov. The Dirac hydrogen
 * spectrum (relativity.ts's diracHydrogenicEnergy) is the exact oracle.
 */
import { RadialGrid, integrateOnGrid, cumulativeIntegral } from './radial_grid';
import { RadialState } from './radial_solver';
import { countNodes } from './numerov';
import { CoefficientFn, midpointValues, rk4Step } from './coupled_rk4';
import { SPEED_OF_LIGHT, diracHydrogenicEnergy, jForKappa, lForKappa } from './relativity';

export type CoupledChannel = { kind: 'scalar'; l: number } | { kind: 'dirac'; kappa: number };

const C = SPEED_OF_LIGHT;
const C2 = C * C;
const MAX_BISECTIONS = 200;
const ENERGY_TOLERANCE = 1e-13;
const RESCALE_THRESHOLD = 1e100;
const RESCALE_FACTOR = 1e-100;
const DECAY_GROWTH_FACTOR = 1e6;
// Phase A's lower energy bound: below the bare-nucleus Dirac 1s, which no
// state of a screened atom can reach. radial_solver's bound (the minimum of
// V + centrifugal) is -Z/rMin ~ -1e6 Z^2 on this grid, where the relativistic
// mass M = 1 + (E - V)/2c^2 goes negative and the Koelling–Harmon
// coefficient l(l+1)/(2Mcr) blows up.
const LOWER_BOUND_MARGIN = 1.2;

function channelL(channel: CoupledChannel): number {
    return channel.kind === 'scalar' ? channel.l : lForKappa(channel.kappa);
}

/** d/dt (G, F) = [[a, b], [c, d]] (G, F), t = ln r. Every entry stays finite as r -> 0. */
function coefficientsFor(channel: CoupledChannel, energy: number): CoefficientFn {
    if (channel.kind === 'scalar') {
        const centrifugal = channel.l * (channel.l + 1);
        return (r, v, out) => {
            const M = 1 + (energy - v) / (2 * C2);
            out[0] = 1;
            out[1] = 2 * C * M * r;
            out[2] = centrifugal / (2 * M * C * r) + (r * (v - energy)) / C;
            out[3] = -1;
        };
    }
    const kappa = channel.kappa;
    return (r, v, out) => {
        const M = 1 + (energy - v) / (2 * C2);
        out[0] = -kappa;
        out[1] = 2 * C * M * r;
        out[2] = (r * (v - energy)) / C;
        out[3] = kappa;
    };
}

/** Leading power r^gamma at a point nucleus, and F/G there. */
function originBehaviour(channel: CoupledChannel, Z: number): { gamma: number; ratio: number } {
    const zc = Z / C;
    if (channel.kind === 'scalar') {
        const gamma = Math.sqrt(channel.l * (channel.l + 1) + 1 - zc * zc);
        return { gamma, ratio: (gamma - 1) / zc };
    }
    const gamma = Math.sqrt(channel.kappa * channel.kappa - zc * zc);
    return { gamma, ratio: (gamma + channel.kappa) / zc };
}

/** Outermost classically allowed point, judged by the non-relativistic effective potential. */
function matchIndex(grid: RadialGrid, potential: Float64Array, energy: number, l: number): number {
    const centrifugal = l * (l + 1);
    for (let j = grid.size - 2; j > 1; j--) {
        if (centrifugal / (2 * grid.r[j] * grid.r[j]) + potential[j] - energy < 0) return j;
    }
    return Math.floor(grid.size / 2);
}

interface Components { G: Float64Array; F: Float64Array }

function integrateOutward(
    grid: RadialGrid, fill: CoefficientFn, potential: Float64Array, mid: Float64Array,
    channel: CoupledChannel, Z: number, to: number,
): Components {
    const { r, dx, size } = grid;
    const G = new Float64Array(size);
    const F = new Float64Array(size);
    const { gamma, ratio } = originBehaviour(channel, Z);
    G[0] = Math.pow(r[0], gamma);
    F[0] = G[0] * ratio;
    const halfStep = Math.exp(0.5 * dx);
    const next = new Float64Array(2);
    for (let j = 0; j < to; j++) {
        rk4Step(fill, dx, r[j], potential[j], r[j] * halfStep, mid[j], r[j + 1], potential[j + 1], G[j], F[j], next);
        G[j + 1] = next[0];
        F[j + 1] = next[1];
        if (Math.abs(G[j + 1]) > RESCALE_THRESHOLD) {
            for (let k = 0; k <= j + 1; k++) { G[k] *= RESCALE_FACTOR; F[k] *= RESCALE_FACTOR; }
        }
    }
    return { G, F };
}

/**
 * Inward from the grid's edge, seeded on the decaying solution G ~ e^(-λr),
 * λ = sqrt(-2E(1 + E/2c^2)) -- the relativistic decay rate -- with F chosen
 * so dG/dt = -λ r G holds there. Same reasoning as radial_solver's WKB seed.
 */
function integrateInward(
    grid: RadialGrid, fill: CoefficientFn, potential: Float64Array, mid: Float64Array,
    energy: number, to: number,
): Components {
    const { r, dx, size } = grid;
    const G = new Float64Array(size);
    const F = new Float64Array(size);
    const last = size - 1;
    const lambda = Math.sqrt(Math.max(-2 * energy * (1 + energy / (2 * C2)), 1e-12));
    const edge = new Float64Array(4);
    fill(r[last], potential[last], edge);
    G[last] = 1e-10;
    F[last] = ((-lambda * r[last] - edge[0]) / edge[1]) * G[last];
    const halfStep = Math.exp(0.5 * dx);
    const next = new Float64Array(2);
    for (let j = last; j > to; j--) {
        rk4Step(fill, -dx, r[j], potential[j], r[j] / halfStep, mid[j - 1], r[j - 1], potential[j - 1], G[j], F[j], next);
        G[j - 1] = next[0];
        F[j - 1] = next[1];
        if (Math.abs(G[j - 1]) > RESCALE_THRESHOLD) {
            for (let k = j - 1; k <= last; k++) { G[k] *= RESCALE_FACTOR; F[k] *= RESCALE_FACTOR; }
        }
    }
    return { G, F };
}

/**
 * Node count of G for phase A, integrated past the turning point until the
 * amplitude has grown DECAY_GROWTH_FACTOR beyond its classically allowed
 * peak, then stopped (radial_solver's countNodesForBracketing explains both
 * halves of that). Stepped one point at a time so the rescale can also
 * rescale `peak` -- without that, a deep state on a wide grid rescales its
 * own peak region to zero and the count degenerates (found in the prototype:
 * europium's 1s, 2s and 3s all converged onto one energy).
 */
function countNodesForBracketing(
    grid: RadialGrid, fill: CoefficientFn, potential: Float64Array, mid: Float64Array,
    channel: CoupledChannel, Z: number, match: number,
): number {
    const { r, dx, size } = grid;
    const G = new Float64Array(size);
    const { gamma, ratio } = originBehaviour(channel, Z);
    let g = Math.pow(r[0], gamma);
    let f = g * ratio;
    G[0] = g;
    let peak = Math.abs(g);
    let stop = size - 1;
    const halfStep = Math.exp(0.5 * dx);
    const next = new Float64Array(2);
    for (let j = 0; j < size - 1; j++) {
        rk4Step(fill, dx, r[j], potential[j], r[j] * halfStep, mid[j], r[j + 1], potential[j + 1], g, f, next);
        g = next[0];
        f = next[1];
        G[j + 1] = g;
        if (Math.abs(g) > RESCALE_THRESHOLD) {
            for (let k = 0; k <= j + 1; k++) G[k] *= RESCALE_FACTOR;
            g *= RESCALE_FACTOR;
            f *= RESCALE_FACTOR;
            peak *= RESCALE_FACTOR;
        }
        if (j + 1 <= match) {
            if (Math.abs(g) > peak) peak = Math.abs(g);
        } else if (Math.abs(g) > DECAY_GROWTH_FACTOR * peak) {
            stop = j + 1;
            break;
        }
    }
    return countNodes(G, 0, stop);
}

function solveCoupledState(grid: RadialGrid, n: number, channel: CoupledChannel, potential: Float64Array, Z: number): RadialState {
    const l = channelL(channel);
    if (!Number.isInteger(n) || n < 1) throw new Error('Principal quantum number (n) must be a positive integer.');
    if (!Number.isInteger(l) || l < 0 || l > n - 1) throw new Error('Azimuthal quantum number (l) must be an integer between 0 and n-1.');
    if (channel.kind === 'dirac' && (!Number.isInteger(channel.kappa) || channel.kappa === 0)) {
        throw new Error('κ must be a non-zero integer.');
    }
    if (!(Z > 0)) throw new Error('The relativistic solver needs a nuclear charge Z > 0 for its origin boundary condition.');

    const targetNodes = n - l - 1;
    const mid = midpointValues(potential);

    let eLow = LOWER_BOUND_MARGIN * diracHydrogenicEnergy(1, -1, Z);
    let eHigh = -1e-12;

    // Phase A: bracket by node count (see radial_solver for why the loose width).
    for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
        const energy = 0.5 * (eLow + eHigh);
        const match = matchIndex(grid, potential, energy, l);
        const nodes = countNodesForBracketing(grid, coefficientsFor(channel, energy), potential, mid, channel, Z, match);
        if (nodes > targetNodes) eHigh = energy;
        else eLow = energy;
        if (eHigh - eLow < Math.abs(eHigh) * 1e-3) break;
    }

    // Phase B: bisection on the small-component mismatch once G is matched.
    // Equal G and equal F at one point is equal G and equal G' (dG/dt is
    // linear in G and F), i.e. the Dirac analogue of matching log-derivatives.
    const mismatch = (energy: number): number => {
        const fill = coefficientsFor(channel, energy);
        const match = matchIndex(grid, potential, energy, l);
        const outward = integrateOutward(grid, fill, potential, mid, channel, Z, match);
        const inward = integrateInward(grid, fill, potential, mid, energy, match);
        if (outward.G[match] === 0 || inward.G[match] === 0) return 0;
        const scale = outward.G[match] / inward.G[match];
        return (outward.F[match] - scale * inward.F[match]) / outward.G[match];
    };

    let low = eLow;
    let high = eHigh;
    let fLow = mismatch(low);
    let fHigh = mismatch(high);
    const centre = 0.5 * (low + high);
    let halfWidth = Math.max(0.5 * (high - low), Math.abs(centre) * 1e-6);
    for (let expansion = 0; expansion < 60; expansion++) {
        if (Number.isFinite(fLow) && Number.isFinite(fHigh) && fLow * fHigh < 0) break;
        halfWidth *= 2;
        low = Math.min(centre - halfWidth, eLow);
        high = Math.max(centre + halfWidth, eHigh);
        if (high >= 0) high = -Number.EPSILON;
        fLow = mismatch(low);
        fHigh = mismatch(high);
    }

    let energy = 0.5 * (low + high);
    if (Number.isFinite(fLow) && Number.isFinite(fHigh) && fLow * fHigh < 0) {
        for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
            const middle = 0.5 * (low + high);
            const value = mismatch(middle);
            if (!Number.isFinite(value)) break;
            if (value * fLow > 0) { low = middle; fLow = value; } else high = middle;
            energy = 0.5 * (low + high);
            if (high - low < Math.abs(high) * 1e-14 + ENERGY_TOLERANCE) break;
        }
    }

    const fill = coefficientsFor(channel, energy);
    const match = matchIndex(grid, potential, energy, l);
    const outward = integrateOutward(grid, fill, potential, mid, channel, Z, match);
    const inward = integrateInward(grid, fill, potential, mid, energy, match);
    const scale = inward.G[match] !== 0 ? outward.G[match] / inward.G[match] : 1;

    const G = new Float64Array(grid.size);
    const F = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        if (j <= match) { G[j] = outward.G[j]; F[j] = outward.F[j]; }
        else { G[j] = scale * inward.G[j]; F[j] = scale * inward.F[j]; }
    }

    const densityShape = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) densityShape[j] = G[j] * G[j] + F[j] * F[j];
    const norm = Math.sqrt(integrateOnGrid(grid, densityShape));
    if (!(norm > 0) || !Number.isFinite(norm)) {
        throw new Error(`Relativistic radial solver did not converge for n=${n}, l=${l}.`);
    }

    // Containment guard, as radial_solver (ruling R21), on G^2 + F^2.
    const cumulative = cumulativeIntegral(grid, densityShape);
    const total = cumulative[grid.size - 1];
    const tailStart = Math.floor(grid.size * 0.99);
    const tailFraction = total > 0 ? (total - cumulative[tailStart]) / total : 1;
    if (tailFraction > 1e-2) {
        throw new Error(
            `Radial grid (rMax=${grid.rMax}) is too small to hold n=${n}, l=${l}: `
            + `${(tailFraction * 100).toFixed(1)}% of the electron's probability lies in the outermost 1% of the grid.`
        );
    }

    const firstSignificant = G.findIndex(value => Math.abs(value) > 1e-12 * norm);
    const sign = firstSignificant >= 0 && G[firstSignificant] < 0 ? -1 : 1;
    const R = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        G[j] = (sign * G[j]) / norm;
        F[j] = (sign * F[j]) / norm;
        R[j] = G[j] / grid.r[j];
    }

    const state: RadialState = { n, l, energy, u: G, R, Q: F };
    if (channel.kind === 'dirac') {
        state.kappa = channel.kappa;
        state.j = jForKappa(channel.kappa);
    }
    return state;
}

export function solveScalarRelativisticState(
    grid: RadialGrid, n: number, l: number, potential: Float64Array, Z: number,
): RadialState {
    return solveCoupledState(grid, n, { kind: 'scalar', l }, potential, Z);
}

export function solveDiracState(
    grid: RadialGrid, n: number, kappa: number, potential: Float64Array, Z: number,
): RadialState {
    return solveCoupledState(grid, n, { kind: 'dirac', kappa }, potential, Z);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/atom/relativistic_solver.test.ts tests/atom/radial_solver.test.ts`
Expected: PASS (the second file proves the `RadialState` change broke nothing).

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — Expected: no errors.

```bash
git add src/atom/relativistic_solver.ts src/atom/radial_solver.ts tests/atom/relativistic_solver.test.ts
git commit -m "feat(atom): Koelling-Harmon and radial Dirac eigenvalue solver, validated on Dirac hydrogen

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: MacDonald–Vosko relativistic exchange

With β = (3π²ρ)^{1/3}/c and η = √(1 + β²): ε_x^R = ε_x·Φ(β), Φ = 1 − (3/2)[(βη − asinh β)/β²]²; V_x^R = V_x·Ψ(β), Ψ = −½ + (3/2)·asinh β/(βη). Φ loses all precision to cancellation for small β, so below β = 10⁻² it uses the series (βη − asinh β)/β² = (2/3)β − β³/5. Checked numerically while writing this plan: V_x^R = d(ρ ε_x^R)/dρ to 10⁻¹⁰ from ρ = 10⁻² to 10⁶; Φ(1) = 0.5741223409978391, Ψ(1) = 0.43483786021034565.

**Files:**
- Modify: `src/atom/hartree.ts:62-89`
- Test: `tests/atom/relativistic_exchange.test.ts`

**Interfaces:**
- Consumes: `SPEED_OF_LIGHT` (Task 2).
- Produces:
  ```ts
  export function relativisticBeta(rho: number): number;
  export function macDonaldVoskoEnergyFactor(beta: number): number;
  export function macDonaldVoskoPotentialFactor(beta: number): number;
  export function exchangePotential(density: Float64Array, relativistic?: boolean): Float64Array;   // default false
  export function exchangeEnergy(grid: RadialGrid, D: Float64Array, density: Float64Array, relativistic?: boolean): number;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/relativistic_exchange.test.ts
import {
    relativisticBeta, macDonaldVoskoEnergyFactor, macDonaldVoskoPotentialFactor,
    exchangePotential, exchangeEnergy,
} from '../../src/atom/hartree';
import { makeRadialGrid } from '../../src/atom/radial_grid';

const EXCHANGE_COEFFICIENT = Math.cbrt(3 / Math.PI);

/** ρ ε_x^R(ρ), the exchange energy per unit volume. */
function energyDensity(rho: number): number {
    return -0.75 * EXCHANGE_COEFFICIENT * Math.cbrt(rho) * rho * macDonaldVoskoEnergyFactor(relativisticBeta(rho));
}

describe('MacDonald–Vosko relativistic exchange', () => {
    it('reduces to non-relativistic exchange as β -> 0, with the right leading corrections', () => {
        expect(macDonaldVoskoEnergyFactor(0)).toBe(1);
        expect(macDonaldVoskoPotentialFactor(0)).toBe(1);
        const b = 1e-3;
        expect(macDonaldVoskoEnergyFactor(b)).toBeCloseTo(1 - (2 / 3) * b * b, 12);
        expect(macDonaldVoskoPotentialFactor(b)).toBeCloseTo(1 - b * b, 12);
    });

    it('matches independently computed values at β = 1', () => {
        expect(macDonaldVoskoEnergyFactor(1)).toBeCloseTo(0.5741223409978391, 12);
        expect(macDonaldVoskoPotentialFactor(1)).toBeCloseTo(0.43483786021034565, 12);
    });

    it('is continuous across the series switch-over at β = 1e-2', () => {
        expect(macDonaldVoskoEnergyFactor(0.00999)).toBeCloseTo(0.9999334705837514, 11);
        expect(macDonaldVoskoEnergyFactor(0.01001)).toBeCloseTo(macDonaldVoskoEnergyFactor(0.00999), 5);
    });

    it.each([1e-2, 1, 1e3, 1e5, 1e6])('potential is the functional derivative of the energy at ρ = %p', rho => {
        const h = rho * 1e-5;
        const derivative = (energyDensity(rho + h) - energyDensity(rho - h)) / (2 * h);
        const potential = exchangePotential(Float64Array.of(rho), true)[0];
        expect(Math.abs((derivative - potential) / potential)).toBeLessThan(1e-8);
    });

    it('leaves the non-relativistic path untouched by default', () => {
        const density = Float64Array.of(0.1, 10, 1e4);
        const plain = exchangePotential(density);
        for (let j = 0; j < density.length; j++) {
            expect(plain[j]).toBe(-EXCHANGE_COEFFICIENT * Math.cbrt(density[j]));
        }
        const grid = makeRadialGrid(1e-3, 10, 3);
        const D = Float64Array.of(1, 2, 3);
        expect(exchangeEnergy(grid, D, density)).toBe(exchangeEnergy(grid, D, density, false));
        expect(exchangeEnergy(grid, D, density, true)).toBeGreaterThan(exchangeEnergy(grid, D, density));
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/atom/relativistic_exchange.test.ts`
Expected: FAIL — `relativisticBeta is not a function` (not exported).

- [ ] **Step 3: Implement**

In `src/atom/hartree.ts`, add `import { SPEED_OF_LIGHT } from './relativity';` below the existing import, then replace `exchangePotential`, `exchangeEnergyDensity` and `exchangeEnergy` (lines 62–89) with:

```ts
const EXCHANGE_COEFFICIENT = Math.pow(3 / Math.PI, 1 / 3);

/** β = p_F / (m c): the Fermi momentum of the local electron gas in units of mc. */
export function relativisticBeta(rho: number): number {
    return Math.cbrt(3 * Math.PI * Math.PI * Math.max(rho, 0)) / SPEED_OF_LIGHT;
}

/**
 * MacDonald–Vosko: ε_x^R = ε_x Φ(β), Φ = 1 - (3/2) [(βη - asinh β)/β²]².
 * Below β = 1e-2 the bracket is a difference of two nearly equal numbers,
 * so its series (2/3)β - β³/5 is used instead (error O(β⁵)).
 */
export function macDonaldVoskoEnergyFactor(beta: number): number {
    if (beta === 0) return 1;
    let bracket: number;
    if (beta < 1e-2) {
        bracket = (2 / 3) * beta - (beta * beta * beta) / 5;
    } else {
        const eta = Math.sqrt(1 + beta * beta);
        bracket = (beta * eta - Math.asinh(beta)) / (beta * beta);
    }
    return 1 - 1.5 * bracket * bracket;
}

/** MacDonald–Vosko: V_x^R = V_x Ψ(β), Ψ = -1/2 + (3/2) asinh β / (βη). No cancellation, so no series. */
export function macDonaldVoskoPotentialFactor(beta: number): number {
    if (beta === 0) return 1;
    const eta = Math.sqrt(1 + beta * beta);
    return -0.5 + (1.5 * Math.asinh(beta)) / (beta * eta);
}

/**
 * Dirac/Slater local-density exchange potential, V_x(r) = -(3ρ/π)^(1/3),
 * optionally with the MacDonald–Vosko relativistic correction -- which is
 * what NIST's RLDA and ScRLDA tables use, and so what the relativistic modes
 * must use for those tables to validate them (relativity.ts's
 * RELATIVISTIC_EXCHANGE_CORRECTION).
 */
export function exchangePotential(density: Float64Array, relativistic = false): Float64Array {
    const v = new Float64Array(density.length);
    for (let j = 0; j < density.length; j++) {
        const rho = Math.max(density[j], 0);
        const plain = -EXCHANGE_COEFFICIENT * Math.cbrt(rho);
        v[j] = relativistic ? plain * macDonaldVoskoPotentialFactor(relativisticBeta(rho)) : plain;
    }
    return v;
}

/** Exchange energy per electron, ε_x(ρ) = -(3/4)(3/π)^(1/3) ρ^(1/3), optionally corrected as above. */
function exchangeEnergyDensity(density: Float64Array, relativistic: boolean): Float64Array {
    const eps = new Float64Array(density.length);
    for (let j = 0; j < density.length; j++) {
        const rho = Math.max(density[j], 0);
        const plain = -0.75 * EXCHANGE_COEFFICIENT * Math.cbrt(rho);
        eps[j] = relativistic ? plain * macDonaldVoskoEnergyFactor(relativisticBeta(rho)) : plain;
    }
    return eps;
}

/** E_x = ∫ D(r) ε_x(ρ(r)) dr. */
export function exchangeEnergy(grid: RadialGrid, D: Float64Array, density: Float64Array, relativistic = false): number {
    const eps = exchangeEnergyDensity(density, relativistic);
    const integrand = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) integrand[j] = D[j] * eps[j];
    return integrateOnGrid(grid, integrand);
}
```

(`EXCHANGE_COEFFICIENT` already exists at line 62 — keep a single declaration.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/atom/relativistic_exchange.test.ts tests/atom/hartree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atom/hartree.ts tests/atom/relativistic_exchange.test.ts
git commit -m "feat(atom): MacDonald-Vosko relativistic exchange, as NIST's RLDA and ScRLDA use

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Relativistic SCF

**Files:**
- Modify: `src/atom/scf.ts` (interface at 26–38, `meanFieldPotential` 106–115, `buildD` 117–124, `totalEnergyOf` 145–167, `solveOneElectronAtom` 180–199, cache 209, `solveAtom` 224–233, `solveAtomOnGrid` 247–309)
- Test: `tests/atom/scf_relativistic.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5; `tests/atom/fixtures/*.json` (Task 1).
- Produces:
  ```ts
  export interface AtomSolution { /* existing fields */ relativity: RelativityMode }
  export interface SolveOptions { relativity?: RelativityMode; startingPotential?: Float64Array }
  export function solveAtom(Z: number, relativity?: RelativityMode): AtomSolution;          // default 'off'
  export function solveAtomOnGrid(Z: number, grid: RadialGrid, options?: SolveOptions): AtomSolution;
  ```
  `states` are ordered by (n, l) and, in `'spinOrbit'`, j − ½ before j + ½; every relativistic state carries `Q`; `D = Σ occ (u² + Q²)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/atom/scf_relativistic.test.ts
import { solveAtom, solveAtomOnGrid } from '../../src/atom/scf';
import { gridForAtom, integrateOnGrid } from '../../src/atom/radial_grid';
import { diracHydrogenicEnergy } from '../../src/atom/relativity';
import srlda from './fixtures/nist_srlda.json';
import rlda from './fixtures/nist_rlda.json';

jest.setTimeout(120000);

type Fixture = { atoms: Array<{ Z: number; Etot: number; eigenvalues: Record<string, number> }> };
const LETTERS = 'spdf';

function stateFor(atom: ReturnType<typeof solveAtom>, key: string) {
    const n = Number(key[0]);
    const l = LETTERS.indexOf(key[1]);
    const suffix = key.slice(2);
    const j = suffix === '-' ? l - 0.5 : suffix === '+' ? l + 0.5 : l === 0 && atom.relativity === 'spinOrbit' ? 0.5 : undefined;
    return atom.states.find(s => s.n === n && s.l === l && s.j === j)!;
}

function expectWithin(atom: ReturnType<typeof solveAtom>, reference: Fixture['atoms'][number], tolerance: number) {
    expect(Math.abs((atom.totalEnergy - reference.Etot) / reference.Etot)).toBeLessThan(tolerance);
    for (const [key, value] of Object.entries(reference.eigenvalues)) {
        const state = stateFor(atom, key);
        expect(state).toBeDefined();
        expect(Math.abs((state.energy - value) / value)).toBeLessThan(tolerance);
    }
}

describe('relativistic SCF', () => {
    it('leaves the non-relativistic solve exactly as it was', () => {
        expect(solveAtom(10)).toBe(solveAtom(10, 'off'));
        expect(solveAtom(10).relativity).toBe('off');
    });

    it('caches each mode separately', () => {
        const scalar = solveAtom(10, 'scalar');
        expect(scalar).toBe(solveAtom(10, 'scalar'));
        expect(scalar).not.toBe(solveAtom(10, 'off'));
        expect(scalar.relativity).toBe('scalar');
        expect(scalar.converged).toBe(true);
    });

    it('splits neon\'s 2p into 2p½ (2 e⁻) and 2p³⁄₂ (4 e⁻) with spin–orbit, j - ½ first', () => {
        const atom = solveAtom(10, 'spinOrbit');
        expect(atom.states.map(s => [s.n, s.l, s.j, s.electrons])).toEqual([
            [1, 0, 0.5, 2], [2, 0, 0.5, 2], [2, 1, 0.5, 2], [2, 1, 1.5, 4],
        ]);
        expect(atom.states.every(s => s.Q !== undefined && s.kappa !== undefined)).toBe(true);
    });

    it('conserves the electron count with the small component included', () => {
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            const atom = solveAtom(10, mode);
            expect(integrateOnGrid(atom.grid, atom.D)).toBeCloseTo(10, 4);
        }
    });

    // Spec §5 Phase 4, as re-read in Global Constraints: light atoms agree with
    // NIST's relativistic columns within 0.1 %.
    it.each([10, 18])('Z=%i agrees with NIST ScRLDA and RLDA within 0.1 %', Z => {
        expectWithin(solveAtom(Z, 'scalar'), (srlda as Fixture).atoms.find(a => a.Z === Z)!, 1e-3);
        expectWithin(solveAtom(Z, 'spinOrbit'), (rlda as Fixture).atoms.find(a => a.Z === Z)!, 1e-3);
    });

    it.each([2, 6, 10])('Z=%i: switching relativity on moves the total energy by less than 0.1 %', Z => {
        // Measured: C 0.022 %, Ne 0.080 %. (Ar moves 0.30 % -- see Global Constraints.)
        const off = solveAtom(Z).totalEnergy;
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            expect(Math.abs((solveAtom(Z, mode).totalEnergy - off) / off)).toBeLessThan(1e-3);
        }
    });

    it('scalar and spin–orbit totals agree closely for a light atom', () => {
        // Measured for carbon: -37.434114 vs -37.434115.
        const scalar = solveAtom(6, 'scalar').totalEnergy;
        const dirac = solveAtom(6, 'spinOrbit').totalEnergy;
        expect(Math.abs((scalar - dirac) / dirac)).toBeLessThan(1e-5);
    });

    it('hydrogen bypasses the SCF and returns the exact Dirac energy', () => {
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            const atom = solveAtom(1, mode);
            expect(atom.iterations).toBe(1);
            expect(Math.abs((atom.totalEnergy - diracHydrogenicEnergy(1, -1, 1)) / atom.totalEnergy)).toBeLessThan(1e-6);
        }
        expect(solveAtom(1).totalEnergy).toBeCloseTo(-0.5, 9);
    });

    it('starting from the converged non-relativistic potential reaches the same answer, sooner', () => {
        const grid = gridForAtom(10, 2);
        const seed = solveAtomOnGrid(10, grid).potential;
        const cold = solveAtomOnGrid(10, grid, { relativity: 'scalar' });
        const warm = solveAtomOnGrid(10, grid, { relativity: 'scalar', startingPotential: seed });
        expect(Math.abs((warm.totalEnergy - cold.totalEnergy) / cold.totalEnergy)).toBeLessThan(1e-7);
        expect(warm.iterations).toBeLessThanOrEqual(cold.iterations);
        expect(() => solveAtomOnGrid(10, grid, { startingPotential: new Float64Array(3) })).toThrow(/grid/);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/atom/scf_relativistic.test.ts`
Expected: FAIL — `atom.relativity` undefined / type errors on the second argument.

- [ ] **Step 3: Implement**

Edit `src/atom/scf.ts`:

1. Imports — add:
```ts
import { solveScalarRelativisticState, solveDiracState } from './relativistic_solver';
import { RelativityMode, RELATIVISTIC_EXCHANGE_CORRECTION, splitByJ } from './relativity';
```

2. `AtomSolution` gains, after `converged`:
```ts
    /** Which radial equation produced `states` ('off' = Schrödinger). */
    relativity: RelativityMode;
```

3. Add after `totalElectronsOf`:
```ts
export interface SolveOptions {
    relativity?: RelativityMode;
    /** Start the loop from this potential instead of the screened guess; must be on the same grid. */
    startingPotential?: Float64Array;
}

interface OrbitalSpec { n: number; l: number; electrons: number; kappa?: number }

/** With spin-orbit, each l > 0 subshell becomes two j-levels sharing its electrons by 2j+1 (relativity.ts). */
function orbitalSpecsFor(configuration: SubshellOccupancy[], relativity: RelativityMode): OrbitalSpec[] {
    if (relativity !== 'spinOrbit') return configuration.map(({ n, l, electrons }) => ({ n, l, electrons }));
    return configuration.flatMap(subshell =>
        splitByJ(subshell).map(({ n, l, kappa, electrons }) => ({ n, l, kappa, electrons })));
}

function solveOrbital(grid: RadialGrid, Z: number, spec: OrbitalSpec, potential: Float64Array, relativity: RelativityMode): RadialState {
    if (relativity === 'off') return solveRadialState(grid, spec.n, spec.l, potential);
    if (relativity === 'scalar') return solveScalarRelativisticState(grid, spec.n, spec.l, potential, Z);
    return solveDiracState(grid, spec.n, spec.kappa ?? -(spec.l + 1), potential, Z);
}

function solveOrbitals(
    grid: RadialGrid, Z: number, specs: OrbitalSpec[], potential: Float64Array, relativity: RelativityMode,
): Array<RadialState & { electrons: number }> {
    return specs.map(spec => ({ ...solveOrbital(grid, Z, spec, potential, relativity), electrons: spec.electrons }));
}
```

4. `meanFieldPotential(grid, Z, D, relativistic: boolean)` — pass it through: `const vExchange = exchangePotential(density, relativistic);`.

5. `buildD` — include the small component:
```ts
function buildD(grid: RadialGrid, states: Array<RadialState & { electrons: number }>): Float64Array {
    const D = new Float64Array(grid.size);
    for (const state of states) {
        const Q = state.Q;
        for (let j = 0; j < grid.size; j++) {
            const small = Q ? Q[j] * Q[j] : 0;
            D[j] += state.electrons * (state.u[j] * state.u[j] + small);
        }
    }
    return D;
}
```

6. `totalEnergyOf(grid, states, D, density, relativistic: boolean)` — use `exchangePotential(density, relativistic)` and `exchangeEnergy(grid, D, density, relativistic)`. The formula itself is unchanged: with the rest mass removed from the eigenvalues, Σ occ·ε still counts kinetic + potential once and the interaction twice.

7. One-electron bypass:
```ts
function solveOneElectronAtom(Z: number, grid: RadialGrid, configuration: SubshellOccupancy[], relativity: RelativityMode): AtomSolution {
    const potential = bareCoulombPotential(grid, Z);
    const states = solveOrbitals(grid, Z, orbitalSpecsFor(configuration, relativity), potential, relativity);
    const D = buildD(grid, states);
    const density = densityFromD(grid, D);
    // Non-relativistic keeps the analytic -Z^2/2 it always returned; the
    // relativistic modes return the solver's own eigenvalue, which is the
    // Dirac energy to 1e-6 (relativistic_solver.test.ts) -- LDA would add a
    // self-interaction error to either.
    const totalEnergy = relativity === 'off'
        ? -(Z * Z) / 2
        : states.reduce((sum, state) => sum + state.electrons * state.energy, 0);
    return { Z, grid, states, D, density, potential, totalEnergy, iterations: 1, converged: true, relativity };
}
```

8. Cache and `solveAtom`:
```ts
// Keyed by Z and mode: each is still a pure function of its key (ruling R28).
const solveAtomCache = new Map<string, AtomSolution>();

export function solveAtom(Z: number, relativity: RelativityMode = 'off'): AtomSolution {
    const key = `${Z}:${relativity}`;
    const cached = solveAtomCache.get(key);
    if (cached) return cached;

    const configuration = configurationFor(Z);
    const highestN = highestPrincipalQuantumNumber(configuration);
    const grid = gridForAtom(Z, highestN);
    // A relativistic solve starts from the converged non-relativistic
    // potential: the worker needs that solve anyway (the dashed comparison
    // curve), and starting next to the answer saves most of the iterations.
    const startingPotential = relativity === 'off' ? undefined : solveAtom(Z, 'off').potential;
    const solution = solveAtomOnGrid(Z, grid, { relativity, startingPotential });
    solveAtomCache.set(key, solution);
    return solution;
}
```

9. `solveAtomOnGrid(Z, grid, options: SolveOptions = {})`:
```ts
export function solveAtomOnGrid(Z: number, grid: RadialGrid, options: SolveOptions = {}): AtomSolution {
    const relativity = options.relativity ?? 'off';
    const relativistic = relativity !== 'off' && RELATIVISTIC_EXCHANGE_CORRECTION;
    const configuration = configurationFor(Z);

    if (totalElectronsOf(configuration) === 1) {
        return solveOneElectronAtom(Z, grid, configuration, relativity);
    }

    if (options.startingPotential && options.startingPotential.length !== grid.size) {
        throw new Error(`startingPotential has ${options.startingPotential.length} points; the grid has ${grid.size}.`);
    }
    const specs = orbitalSpecsFor(configuration, relativity);
    let potential = options.startingPotential
        ? Float64Array.from(options.startingPotential)
        : screenedStartingPotential(grid, Z);
    // ... unchanged loop body, with these three lines changed:
    //     states = solveOrbitals(grid, Z, specs, potential, relativity);
    //     const newPotential = meanFieldPotential(grid, Z, D, relativistic);
    // ... and after the loop:
    const density = densityFromD(grid, D);
    const totalEnergy = totalEnergyOf(grid, states, D, density, relativistic);
    return { Z, grid, states, D, density, potential, totalEnergy, iterations, converged, relativity };
}
```

Keep every existing comment in the loop body; replace only the lines named.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/atom/scf_relativistic.test.ts tests/atom/scf.test.ts`
Expected: PASS. Measured with the prototype: Ne 2p½/2p³⁄₂ = −0.500020/−0.496212, Ar total −527.516 (scalar). If a light-atom eigenvalue misses NIST by more than 0.1 %, do not loosen the tolerance: report the measured table (the ScRLDA column is where scalar-relativistic formulations differ, and that is a finding for the owner).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — Expected: errors only where `AtomSolution` objects are built by hand without `relativity` (e.g. tests). Add `relativity: 'off'` to each such literal, re-run until clean.

```bash
git add src/atom/scf.ts tests/atom/scf_relativistic.test.ts
git commit -m "feat(atom): scalar-relativistic and Dirac SCF with MacDonald-Vosko exchange and small-component density

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: NIST validation (slow) and validation rows

**Files:**
- Create: `tests/atom/relativistic_nist.test.ts`
- Create: `src/validation/relativity_results.json`
- Create: `src/validation/relativity_rows.ts`
- Modify: `src/validation/references.ts` (Phase 1 — append to `VALIDATION`)
- Test: `tests/validation/relativity_rows.test.ts`

**Interfaces:**
- Consumes: `solveAtom(Z, relativity)` (Task 6); fixtures (Task 1); Phase 1's `interface ValidationRow { phase: number; quantity: string; system: string; app: number; reference: number; unit: string; tolerancePercent: number; referenceSource: string; method: string }` and `VALIDATION: ValidationRow[]` in `src/validation/references.ts`; `jLabel`, `methodStatement` (Task 2).
- Produces:
  ```ts
  export interface RelativityResultEntry { Z: number; symbol: string; column: 'ScRLDA' | 'RLDA'; quantity: string; app: number; reference: number }
  export const NIST_SOURCE: string;
  export function orbitalQuantityLabel(key: string): string;   // "2p-" -> "2p½"
  export const RELATIVITY_VALIDATION_ROWS: ValidationRow[];
  ```

**How `app` values stay honest.** The slow test computes every value, asserts it, and — only when run with `WRITE_VALIDATION=1` — writes them to `src/validation/relativity_results.json`, which is committed. The rows module reads that file; nothing is typed by hand. A second slow assertion re-solves and requires the committed values to match the fresh ones to 10⁻⁶, so the file cannot go stale unnoticed after a solver change.

- [ ] **Step 1: Bootstrap the results file and write the failing rows test**

Create `src/validation/relativity_results.json`:
```json
{ "generator": "tests/atom/relativistic_nist.test.ts with ATOM_SLOW_TESTS=1 WRITE_VALIDATION=1", "generatedOn": null, "entries": [] }
```

```ts
// tests/validation/relativity_rows.test.ts
import srlda from '../atom/fixtures/nist_srlda.json';
import rlda from '../atom/fixtures/nist_rlda.json';
import { RELATIVITY_VALIDATION_ROWS, orbitalQuantityLabel, NIST_SOURCE } from '../../src/validation/relativity_rows';
import { VALIDATION } from '../../src/validation/references';
import { methodStatement } from '../../src/atom/relativity';

type Fixture = { atoms: Array<{ Z: number; symbol: string; Etot: number; eigenvalues: Record<string, number> }> };

function expectedCount(fixture: Fixture): number {
    return fixture.atoms.reduce((sum, atom) => sum + 1 + Object.keys(atom.eigenvalues).length, 0);
}

describe('Phase 4 validation rows', () => {
    it('has one row per NIST quantity in both columns', () => {
        expect(RELATIVITY_VALIDATION_ROWS).toHaveLength(expectedCount(srlda as Fixture) + expectedCount(rlda as Fixture));
    });

    it('copies every reference value from the fixtures, not from anywhere else', () => {
        for (const [fixture, method] of [[srlda, methodStatement('scalar')], [rlda, methodStatement('spinOrbit')]] as const) {
            for (const atom of (fixture as Fixture).atoms) {
                const rows = RELATIVITY_VALIDATION_ROWS.filter(row => row.system === atom.symbol && row.method === method);
                expect(rows.find(row => row.quantity === 'total energy')!.reference).toBe(atom.Etot);
                for (const [key, value] of Object.entries(atom.eigenvalues)) {
                    const row = rows.find(r => r.quantity === `${orbitalQuantityLabel(key)} orbital eigenvalue`);
                    expect(row!.reference).toBe(value);
                }
            }
        }
    });

    it('states phase, unit, source and the spec\'s tolerances', () => {
        for (const row of RELATIVITY_VALIDATION_ROWS) {
            expect(row.phase).toBe(4);
            expect(row.unit).toBe('Ha');
            expect(row.referenceSource).toBe(NIST_SOURCE);
            expect(row.tolerancePercent).toBe(['Ne', 'Ar'].includes(row.system) ? 0.1 : 1);
            expect(Math.abs((row.app - row.reference) / row.reference) * 100).toBeLessThanOrEqual(row.tolerancePercent);
        }
    });

    it('labels j-split orbitals the way the UI does', () => {
        expect(orbitalQuantityLabel('6s')).toBe('6s');
        expect(orbitalQuantityLabel('2p-')).toBe('2p½');
        expect(orbitalQuantityLabel('5f+')).toBe('5f⁷⁄₂');
    });

    it('is part of the shared VALIDATION table', () => {
        for (const row of RELATIVITY_VALIDATION_ROWS) expect(VALIDATION).toContain(row);
    });
});
```

- [ ] **Step 2: Write the slow validation test**

```ts
// tests/atom/relativistic_nist.test.ts
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { solveAtom } from '../../src/atom/scf';
import srlda from './fixtures/nist_srlda.json';
import rlda from './fixtures/nist_rlda.json';
import recorded from '../../src/validation/relativity_results.json';
import type { RelativityResultEntry } from '../../src/validation/relativity_rows';

// Eight heavy atoms, three solves each: several minutes. Gated like scf.test.ts.
jest.setTimeout(1800000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const WRITE = process.env.WRITE_VALIDATION === '1';
if (WRITE && !SLOW) throw new Error('WRITE_VALIDATION=1 needs ATOM_SLOW_TESTS=1: the results file must cover every atom.');
const describeSlow = SLOW ? describe : describe.skip;

type Fixture = { atoms: Array<{ Z: number; symbol: string; Etot: number; eigenvalues: Record<string, number> }> };
const LETTERS = 'spdf';
const entries: RelativityResultEntry[] = [];

function appValue(atom: ReturnType<typeof solveAtom>, key: string): number {
    if (key === 'Etot') return atom.totalEnergy;
    const n = Number(key[0]);
    const l = LETTERS.indexOf(key[1]);
    const suffix = key.slice(2);
    const j = suffix === '-' ? l - 0.5 : suffix === '+' ? l + 0.5 : atom.relativity === 'spinOrbit' ? 0.5 : undefined;
    const state = atom.states.find(s => s.n === n && s.l === l && s.j === j);
    if (!state) throw new Error(`No state ${key} in Z=${atom.Z} (${atom.relativity}).`);
    return state.energy;
}

describeSlow('NIST relativistic validation (spec §5 Phase 4: within 1 %)', () => {
    const columns = [['ScRLDA', 'scalar', srlda], ['RLDA', 'spinOrbit', rlda]] as const;

    for (const [column, mode, fixture] of columns) {
        for (const reference of (fixture as Fixture).atoms) {
            it(`${reference.symbol} ${column}`, () => {
                const atom = solveAtom(reference.Z, mode);
                expect(atom.converged).toBe(true);
                const tolerance = reference.Z <= 18 ? 1e-3 : 1e-2;
                const quantities: Array<[string, number]> = [['Etot', reference.Etot], ...Object.entries(reference.eigenvalues)];
                for (const [quantity, value] of quantities) {
                    const app = appValue(atom, quantity);
                    entries.push({ Z: reference.Z, symbol: reference.symbol, column, quantity, app, reference: value });
                    expect(Math.abs((app - value) / value)).toBeLessThan(tolerance);
                }
            });
        }
    }

    it.each([55, 79, 80, 86, 92, 103, 118])('Z=%i converges in both relativistic modes', Z => {
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            const atom = solveAtom(Z, mode);
            expect(atom.converged).toBe(true);
            expect(Number.isFinite(atom.totalEnergy)).toBe(true);
        }
    });

    it('reports cost: a seeded relativistic gold solve costs at most 3x the non-relativistic one', () => {
        // Au was solved above; time a fresh element instead so both are cold.
        const Z = 78;
        const start = performance.now();
        solveAtom(Z, 'off');
        const nonRelativistic = performance.now() - start;
        const middle = performance.now();
        solveAtom(Z, 'scalar');
        const relativistic = performance.now() - middle;
        // eslint-disable-next-line no-console
        console.log(`Pt: off ${nonRelativistic.toFixed(0)} ms, scalar (seeded) ${relativistic.toFixed(0)} ms`);
        expect(relativistic).toBeLessThan(3 * nonRelativistic);
    });

    (WRITE ? it.skip : it)('the committed results file matches a fresh computation', () => {
        const committed = recorded.entries as RelativityResultEntry[];
        expect(committed.length).toBeGreaterThan(0);
        for (const entry of committed) {
            const atom = solveAtom(entry.Z, entry.column === 'ScRLDA' ? 'scalar' : 'spinOrbit');
            expect(Math.abs((appValue(atom, entry.quantity) - entry.app) / entry.app)).toBeLessThan(1e-6);
        }
    });

    afterAll(() => {
        if (!WRITE) return;
        const path = resolve(__dirname, '../../src/validation/relativity_results.json');
        const body = {
            generator: 'tests/atom/relativistic_nist.test.ts with ATOM_SLOW_TESTS=1 WRITE_VALIDATION=1',
            generatedOn: new Date().toISOString().slice(0, 10),
            entries,
        };
        writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
    });
});
```

- [ ] **Step 3: Implement the rows module and append to the shared table**

```ts
// src/validation/relativity_rows.ts
/**
 * Phase 4's rows of the shared validation table (spec §3.2): the app's
 * relativistic total energies and eigenvalues next to NIST's ScRLDA and
 * RLDA values. Every `app` number is read from relativity_results.json,
 * which only tests/atom/relativistic_nist.test.ts writes (after asserting
 * each value), so nothing here is typed by hand.
 */
import results from './relativity_results.json';
import type { ValidationRow } from './references';
import { jLabel, methodStatement } from '../atom/relativity';

export interface RelativityResultEntry {
    Z: number;
    symbol: string;
    column: 'ScRLDA' | 'RLDA';
    /** 'Etot', or a NIST orbital key: '6s', '2p' (ScRLDA), '2p-' / '2p+' (RLDA, j = l ∓ 1/2). */
    quantity: string;
    app: number;
    reference: number;
}

export const NIST_SOURCE = 'NIST SRD 141, Atomic Reference Data for Electronic Structure Calculations '
    + '(Kotochigova, Levine, Shirley, Stiles, Clark, Phys. Rev. A 55, 191 (1997))';

const LETTERS = 'spdf';

/** '2p-' -> '2p½', '4f+' -> '4f⁷⁄₂', '6s' -> '6s'. */
export function orbitalQuantityLabel(key: string): string {
    const suffix = key.slice(2);
    if (suffix === '') return key;
    const l = LETTERS.indexOf(key[1]);
    return `${key.slice(0, 2)}${jLabel(suffix === '-' ? l - 0.5 : l + 0.5)}`;
}

function rowFor(entry: RelativityResultEntry): ValidationRow {
    return {
        phase: 4,
        quantity: entry.quantity === 'Etot' ? 'total energy' : `${orbitalQuantityLabel(entry.quantity)} orbital eigenvalue`,
        system: entry.symbol,
        app: entry.app,
        reference: entry.reference,
        unit: 'Ha',
        // Spec: 1 % for the heavy atoms; 0.1 % for Z <= 18 (see the plan's Global Constraints).
        tolerancePercent: entry.Z <= 18 ? 0.1 : 1,
        referenceSource: NIST_SOURCE,
        method: methodStatement(entry.column === 'ScRLDA' ? 'scalar' : 'spinOrbit'),
    };
}

export const RELATIVITY_VALIDATION_ROWS: ValidationRow[] = (results.entries as RelativityResultEntry[]).map(rowFor);
```

In Phase 1's `src/validation/references.ts`, add `import { RELATIVITY_VALIDATION_ROWS } from './relativity_rows';` and append `...RELATIVITY_VALIDATION_ROWS,` as the last element of the `VALIDATION` array literal (the rows module imports only the `ValidationRow` *type* back, so there is no runtime cycle).

- [ ] **Step 4: Generate the results (foreground; several minutes)**

Run: `ATOM_SLOW_TESTS=1 WRITE_VALIDATION=1 npx jest tests/atom/relativistic_nist.test.ts`
Expected: PASS, and `src/validation/relativity_results.json` now holds one entry per fixture quantity. The timing line is printed. If any heavy-atom quantity misses 1 %, stop: record the measured table (quantity, app, NIST, %) in your report and do not commit a loosened tolerance.

- [ ] **Step 5: Run the fast and the staleness checks**

Run: `npx jest tests/validation/relativity_rows.test.ts tests/validation/references.test.ts`
Expected: PASS.
Run: `ATOM_SLOW_TESTS=1 npx jest tests/atom/relativistic_nist.test.ts -t "committed results"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/atom/relativistic_nist.test.ts tests/validation/relativity_rows.test.ts src/validation/relativity_rows.ts src/validation/relativity_results.json src/validation/references.ts
git commit -m "test(atom): validate relativistic modes against NIST ScRLDA/RLDA and publish the rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Profile, comparison and worker payload

**Files:**
- Create: `src/atom/relativistic_comparison.ts`
- Modify: `src/atom/atom_profile.ts:115-121` (`subshellCurveOf`), `345-410` (`buildAtomProfile` subshell entries), `468-474` (`radialFunctionFor`)
- Modify: `src/atom/configurations.ts:182-185` (`subshellLabel`)
- Modify: `src/workers/atomWorker.ts` (interfaces 17–143, builder 153–206, transfer list 209–219, message 222–286)
- Test: `tests/atom/relativistic_comparison.test.ts`, `tests/atom/atom_worker_contract.test.ts` (extend), `tests/atom/atom_profile.test.ts` (extend)

**Interfaces:**
- Consumes: `solveAtom(Z, relativity)`, `AtomSolution.relativity` (Task 6); `jLabel` (Task 2).
- Produces:
  ```ts
  // configurations.ts
  export function subshellLabel(n: number, l: number, j?: number): string;     // (6,1,1.5) -> "6p³⁄₂"
  // atom_profile.ts
  AtomProfile['subshells'][number] gains  j?: number
  export function radialFunctionFor(atom: AtomSolution, n: number, l: number, j?: number): (r: number) => number;
  // relativistic_comparison.ts
  export interface ValenceSContraction { n: number; label: string; nonRelativisticMeanRadius: number; relativisticMeanRadius: number; contractionPercent: number }
  export function meanRadius(grid: RadialGrid, state: RadialState): number;
  export function valenceSContraction(nonRelativistic: AtomSolution, relativistic: AtomSolution): ValenceSContraction | null;
  // atomWorker.ts
  export interface SerialisedSubshell { /* existing */ j?: number }
  export interface SerialisedComparison {
      shells: Array<{ n: number; curve: Float64Array }>;
      subshells: Array<{ n: number; l: number; electrons: number; curve: Float64Array }>;
  }
  export interface SerialisedAtomProfile { /* existing */ relativity?: RelativityMode; nonRelativistic?: SerialisedComparison | null; valenceS?: ValenceSContraction | null }
  export function buildSerialisedAtomProfile(atom: AtomSolution, enclosedFraction: number, nonRelativistic?: AtomSolution | null): SerialisedAtomProfile;
  // worker message: { type: 'solve'; Z; enclosedFraction; relativity?: RelativityMode; requestId }
  ```
  An absent `relativity` on a profile means `'off'` (keeps every existing hand-built test profile valid).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/atom/relativistic_comparison.test.ts
import { solveAtom } from '../../src/atom/scf';
import { meanRadius, valenceSContraction } from '../../src/atom/relativistic_comparison';

jest.setTimeout(120000);
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const itSlow = SLOW ? it : it.skip;

describe('valence-s contraction', () => {
    it('is zero against itself and names the outermost s', () => {
        const atom = solveAtom(10);
        const change = valenceSContraction(atom, atom)!;
        expect(change.label).toBe('2s');
        expect(change.contractionPercent).toBe(0);
        expect(change.relativisticMeanRadius).toBe(meanRadius(atom.grid, atom.states[1]));
    });

    it('is small and positive for potassium\'s 4s', () => {
        const change = valenceSContraction(solveAtom(19), solveAtom(19, 'scalar'))!;
        expect(change.n).toBe(4);
        expect(change.contractionPercent).toBeGreaterThan(0);
        expect(change.contractionPercent).toBeLessThan(5);
    });

    it('labels the j-level with spin–orbit', () => {
        expect(valenceSContraction(solveAtom(10), solveAtom(10, 'spinOrbit'))!.label).toBe('2s½');
    });

    // Relativistic 6s contraction of gold is the textbook ~17-20 % (Pyykkö, Chem. Rev. 88, 563 (1988)).
    itSlow('contracts gold\'s 6s by tens of percent', () => {
        const change = valenceSContraction(solveAtom(79), solveAtom(79, 'scalar'))!;
        expect(change.label).toBe('6s');
        expect(change.contractionPercent).toBeGreaterThan(10);
        expect(change.contractionPercent).toBeLessThan(25);
    });
});
```

Append to `tests/atom/atom_worker_contract.test.ts`:

```ts
describe('relativistic payload', () => {
    let profile: SerialisedAtomProfile;
    beforeAll(() => {
        profile = buildSerialisedAtomProfile(solveAtom(10, 'spinOrbit'), 0.9, solveAtom(10));
    });

    it('carries the mode, j per subshell, comparison curves and the valence-s change', () => {
        expect(profile.relativity).toBe('spinOrbit');
        expect(profile.subshells.map(s => [s.n, s.l, s.j])).toEqual([[1, 0, 0.5], [2, 0, 0.5], [2, 1, 0.5], [2, 1, 1.5]]);
        expect(profile.nonRelativistic!.shells.map(s => s.n)).toEqual([1, 2]);
        expect(profile.nonRelativistic!.subshells.map(s => [s.n, s.l, s.electrons])).toEqual([[1, 0, 2], [2, 0, 2], [2, 1, 6]]);
        expect(profile.valenceS!.label).toBe('2s½');
        expect(profile.nonRelativistic!.shells[0].curve.length).toBe(profile.size);
    });

    it('stays plain and survives structuredClone', () => {
        const clone = structuredClone(profile);
        expect(clone.nonRelativistic!.subshells[2].curve).toEqual(profile.nonRelativistic!.subshells[2].curve);
        expect(clone.valenceS).toEqual(profile.valenceS);
    });

    it('omits comparison data for a non-relativistic solve', () => {
        const plain = buildSerialisedAtomProfile(solveAtom(10), 0.9);
        expect(plain.relativity).toBe('off');
        expect(plain.nonRelativistic).toBeNull();
        expect(plain.valenceS).toBeNull();
    });
});
```

Append to `tests/atom/atom_profile.test.ts`:

```ts
import { solveAtom as solveAtomForRelativity } from '../../src/atom/scf';

describe('relativistic profiles', () => {
    it('sums subshell curves, small component included, back to D', () => {
        const atom = solveAtomForRelativity(10, 'spinOrbit');
        const profile = buildAtomProfile(atom, 0.9);
        for (const j of [100, 800, 1500]) {
            const sum = profile.subshells.reduce((acc, s) => acc + s.curve.values[j], 0);
            expect(sum).toBeCloseTo(atom.D[j], 10);
        }
        expect(profile.subshells.map(s => s.curve.label)).toEqual(['1s½', '2s½', '2p½', '2p³⁄₂']);
        expect(profile.subshells[3].j).toBe(1.5);
    });
});
```

(`buildAtomProfile` is already imported in that file; if not, import it from `../../src/atom/atom_profile`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/atom/relativistic_comparison.test.ts tests/atom/atom_worker_contract.test.ts tests/atom/atom_profile.test.ts`
Expected: FAIL — missing module / `profile.relativity` undefined / labels without j.

- [ ] **Step 3: Implement labels and profile**

`src/atom/configurations.ts` — add `import { jLabel } from './relativity';` and replace `subshellLabel`:
```ts
/** e.g. (2, 1) -> "2p"; with a j-level, (6, 1, 1.5) -> "6p³⁄₂" (spec §5 Phase 4 notation). */
export function subshellLabel(n: number, l: number, j?: number): string {
    return `${n}${shellLetter(l)}${j === undefined ? '' : jLabel(j)}`;
}
```
(`relativity.ts` imports only a *type* from `configurations.ts`, so there is no runtime cycle.)

`src/atom/atom_profile.ts`:
```ts
function subshellCurveOf(state: RadialState & { electrons: number }): Float64Array {
    const values = new Float64Array(state.u.length);
    const Q = state.Q;
    for (let j = 0; j < values.length; j++) {
        // G² + F² for a relativistic state: the small component is part of the
        // electron's density, and scf.ts's buildD counts it, so it must be
        // counted here for subshells to keep summing exactly to D.
        const small = Q ? Q[j] * Q[j] : 0;
        values[j] = state.electrons * (state.u[j] * state.u[j] + small);
    }
    return values;
}
```
In `AtomProfile['subshells']` add `/** Present only with spin–orbit. */ j?: number;` and in `buildAtomProfile`'s `states.map`:
```ts
        return {
            n: state.n,
            l: state.l,
            ...(state.j !== undefined ? { j: state.j } : {}),
            electrons: state.electrons,
            energy: state.energy,
            curve: { label: subshellLabel(state.n, state.l, state.j), values },
            contourRadius: radiusEnclosing(grid, values, fraction),
        };
```
`radialFunctionFor(atom, n, l, j?)`: find with `s.n === n && s.l === l && s.j === j`; the error message names j when given.

- [ ] **Step 4: Implement the comparison module**

```ts
// src/atom/relativistic_comparison.ts
/**
 * "What changed" (spec §5 Phase 4): how far relativity pulls the valence s
 * shell in, as the change in its mean radius <r> between a non-relativistic
 * and a relativistic solve of the same atom with the same functional
 * otherwise. The valence s is the one to report because it is where the
 * effect is largest and best known -- gold's 6s contraction is the textbook
 * reason gold is yellow.
 */
import { RadialGrid, integrateOnGrid } from './radial_grid';
import { RadialState } from './radial_solver';
import { AtomSolution } from './scf';
import { subshellLabel } from './configurations';

export interface ValenceSContraction {
    n: number;
    /** "6s", or "6s½" with spin-orbit. */
    label: string;
    nonRelativisticMeanRadius: number;
    relativisticMeanRadius: number;
    /** 100 (<r>_NR - <r>_rel) / <r>_NR; positive means the shell contracted. */
    contractionPercent: number;
}

/** <r> = ∫ (u² + Q²) r dr for a normalised state. */
export function meanRadius(grid: RadialGrid, state: RadialState): number {
    const integrand = new Float64Array(grid.size);
    const Q = state.Q;
    for (let j = 0; j < grid.size; j++) {
        const small = Q ? Q[j] * Q[j] : 0;
        integrand[j] = (state.u[j] * state.u[j] + small) * grid.r[j];
    }
    return integrateOnGrid(grid, integrand);
}

/** The occupied s state with the highest n -- the valence s (palladium's is 4s: it has no 5s electron). */
function outermostS(atom: AtomSolution): (RadialState & { electrons: number }) | undefined {
    let best: (RadialState & { electrons: number }) | undefined;
    for (const state of atom.states) {
        if (state.l === 0 && (!best || state.n > best.n)) best = state;
    }
    return best;
}

export function valenceSContraction(nonRelativistic: AtomSolution, relativistic: AtomSolution): ValenceSContraction | null {
    const before = outermostS(nonRelativistic);
    const after = outermostS(relativistic);
    if (!before || !after || before.n !== after.n) return null;
    const nonRelativisticMeanRadius = meanRadius(nonRelativistic.grid, before);
    const relativisticMeanRadius = meanRadius(relativistic.grid, after);
    return {
        n: after.n,
        label: subshellLabel(after.n, 0, after.j),
        nonRelativisticMeanRadius,
        relativisticMeanRadius,
        contractionPercent: (100 * (nonRelativisticMeanRadius - relativisticMeanRadius)) / nonRelativisticMeanRadius,
    };
}
```

- [ ] **Step 5: Implement the worker payload and message**

In `src/workers/atomWorker.ts`:

1. Imports: `import { RelativityMode } from '../atom/relativity';` and `import { ValenceSContraction, valenceSContraction } from '../atom/relativistic_comparison';`.
2. `SerialisedSubshell` gains `/** j-level, present only with spin–orbit. */ j?: number;`.
3. Add:
```ts
/**
 * The non-relativistic solve of the same atom on the same grid, reduced to
 * the curves the plot overlays dashed (spec §5 Phase 4: "the radial plot
 * overlays the non-relativistic curve for comparison"). Per (n, l) even with
 * spin-orbit -- the non-relativistic atom has no j-levels.
 */
export interface SerialisedComparison {
    shells: Array<{ n: number; curve: Float64Array }>;
    subshells: Array<{ n: number; l: number; electrons: number; curve: Float64Array }>;
}
```
4. `SerialisedAtomProfile` gains:
```ts
    /** Which radial equation produced this profile; absent means 'off'. */
    relativity?: RelativityMode;
    /** Present (non-null) only for a relativistic profile. */
    nonRelativistic?: SerialisedComparison | null;
    /** The valence s shell's relativistic contraction; present only for a relativistic profile. */
    valenceS?: ValenceSContraction | null;
```
5. Builder:
```ts
export function buildSerialisedAtomProfile(
    atom: AtomSolution, enclosedFraction: number, nonRelativistic: AtomSolution | null = null,
): SerialisedAtomProfile {
    const profile: AtomProfile = buildAtomProfile(atom, enclosedFraction);
    const { grid } = atom;
    let comparison: SerialisedComparison | null = null;
    if (nonRelativistic) {
        // The dashed curve is drawn against the same radius axis, so it must
        // live on the same grid; solveAtom sizes both with gridForAtom(Z, n).
        if (nonRelativistic.grid.size !== grid.size || nonRelativistic.grid.rMin !== grid.rMin || nonRelativistic.grid.dx !== grid.dx) {
            throw new Error('The non-relativistic comparison was solved on a different grid.');
        }
        const reference = buildAtomProfile(nonRelativistic, enclosedFraction);
        comparison = {
            shells: reference.shells.map(shell => ({ n: shell.n, curve: shell.curve.values })),
            subshells: reference.subshells.map(s => ({ n: s.n, l: s.l, electrons: s.electrons, curve: s.curve.values })),
        };
    }
    return {
        // ...every existing field exactly as today, then:
        relativity: atom.relativity,
        nonRelativistic: comparison,
        valenceS: nonRelativistic ? valenceSContraction(nonRelativistic, atom) : null,
    };
}
```
and in the `subshells` map add `...(subshell.j !== undefined ? { j: subshell.j } : {}),` after `l`.
6. `transferListFor` — after the existing loops:
```ts
    for (const shell of profile.nonRelativistic?.shells ?? []) buffers.push(shell.curve.buffer);
    for (const subshell of profile.nonRelativistic?.subshells ?? []) buffers.push(subshell.curve.buffer);
```
7. Message: `WorkerMessageData` gains `relativity?: RelativityMode;`. Handler:
```ts
        const relativity = e.data.relativity ?? 'off';
        const atom = solveAtom(e.data.Z, relativity);
        const reference = relativity === 'off' ? null : solveAtom(e.data.Z, 'off');
        const profile = buildSerialisedAtomProfile(atom, e.data.enclosedFraction, reference);
```
and add `relativity` to both `console.log` objects.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest tests/atom/relativistic_comparison.test.ts tests/atom/atom_worker_contract.test.ts tests/atom/atom_profile.test.ts tests/atom/configurations.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — Expected: clean.

```bash
git add src/atom/relativistic_comparison.ts src/atom/atom_profile.ts src/atom/configurations.ts src/workers/atomWorker.ts tests/atom/relativistic_comparison.test.ts tests/atom/atom_worker_contract.test.ts tests/atom/atom_profile.test.ts
git commit -m "feat(atom): j-level labels, small-component curves and the non-relativistic comparison in the worker payload

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Store, solver hook, caches and URL

**Files:**
- Modify: `src/store/atomSlice.ts` (state 25–52, initial 53–67, occupancy checks 68–75, reducers, exports)
- Modify: `src/atom/useAtomSolver.ts` (selectors and the request effect)
- Modify: `src/atom/profile_cache.ts`, `src/atom/shell_mesh_cache.ts`
- Modify: Phase 2's `src/url_state.ts` (register the `rel` key)
- Test: `tests/atom/atom_slice.test.ts`, `tests/atom/use_atom_solver.test.tsx`, `tests/atom/shell_mesh_cache.test.ts` (extend; update one existing expectation)

**Interfaces:**
- Consumes: `RelativityMode`, `defaultRelativityFor`, `encodeRelativityParam`, `decodeRelativityParam`, `relativityLabel` (Task 2); worker message `relativity` (Task 8).
- Produces:
  ```ts
  // atomSlice.ts
  AtomState.relativityOverride: RelativityMode | null          // null = follow defaultRelativityFor(Z)
  AtomState.selectedSubshell: { n: number; l: number; j?: number } | null
  AtomState.selectedOrbital: { n: number; l: number; ml: number; j?: number } | null
  export function effectiveRelativity(state: Pick<AtomState, 'Z' | 'relativityOverride'>): RelativityMode;
  export const setRelativity: (mode: RelativityMode | null) => PayloadAction;
  export const drillToSubshell: (n: number, l: number, j?: number) => PayloadAction;
  export const drillToOrbital: (n: number, l: number, ml: number, j?: number) => PayloadAction;
  // profile_cache.ts
  export function getCachedProfile(Z: number, enclosedFraction: number, relativity?: RelativityMode): SerialisedAtomProfile | undefined;
  export function setCachedProfile(Z: number, enclosedFraction: number, profile: SerialisedAtomProfile, relativity?: RelativityMode): void;
  // shell_mesh_cache.ts
  export function shellMeshCacheKey(Z: number, n: number, resolution: number, enclosedFraction: number,
      isolatedL?: number | null, relativity?: RelativityMode, isolatedJ?: number): string;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/atom/atom_slice.test.ts` (it already has `neonLikeProfile()` and imports the reducer; add the new imports):

```ts
import { setRelativity, effectiveRelativity, drillToSubshell as drillSub, drillToOrbital as drillOrb } from '../../src/store/atomSlice';

function spinOrbitNeon(): SerialisedAtomProfile {
    const base = neonLikeProfile();
    const p = base.subshells.find(s => s.l === 1)!;
    return {
        ...base,
        relativity: 'spinOrbit',
        subshells: [
            ...base.subshells.filter(s => s.l === 0).map(s => ({ ...s, j: 0.5 })),
            { ...p, j: 0.5, electrons: 2 },
            { ...p, j: 1.5, electrons: 4 },
        ],
    };
}

describe('relativity in the atom slice', () => {
    it('follows the element\'s default until the user chooses, then keeps the choice across elements', () => {
        let state = reducer(undefined, setElement(79));
        expect(effectiveRelativity(state)).toBe('scalar');
        state = reducer(state, setElement(6));
        expect(effectiveRelativity(state)).toBe('off');
        state = reducer(state, setRelativity('spinOrbit'));
        state = reducer(state, setElement(79));
        expect(effectiveRelativity(state)).toBe('spinOrbit');
        state = reducer(state, setRelativity(null));
        expect(effectiveRelativity(state)).toBe('scalar');
    });

    it('starts a new solve when the effective mode changes, and only then', () => {
        let state = reducer(undefined, setElement(79));
        const nonce = state.solveNonce;
        state = reducer(state, setRelativity('scalar'));     // same as the default: nothing to solve
        expect(state.solveNonce).toBe(nonce);
        state = reducer(state, setRelativity('spinOrbit'));
        expect(state.solveNonce).toBe(nonce + 1);
    });

    it('setRelativity drops a selection the new mode cannot name', () => {
        let state = reducer(undefined, solveSucceeded(neonLikeProfile()));
        state = reducer(state, drillOrb(2, 1, 0));
        expect(state.level).toBe('orbital');
        state = reducer(state, setRelativity('spinOrbit'));
        expect(state.level).toBe('shell');
        expect(state.selectedShell).toBe(2);
        expect(state.selectedSubshell).toBeNull();
        expect(state.selectedOrbital).toBeNull();
    });

    it('drills into a j-level only when j matches an occupied one', () => {
        let state = reducer(undefined, solveSucceeded(spinOrbitNeon()));
        state = reducer(state, drillSub(2, 1));            // no j: names nothing in a spin–orbit profile
        expect(state.selectedSubshell).toBeNull();
        state = reducer(state, drillSub(2, 1, 1.5));
        expect(state.selectedSubshell).toEqual({ n: 2, l: 1, j: 1.5 });
        state = reducer(state, drillOrb(2, 1, -1, 1.5));
        expect(state.selectedOrbital).toEqual({ n: 2, l: 1, ml: -1, j: 1.5 });
        state = reducer(state, drillSub(2, 1, 2.5));
        expect(state.selectedSubshell).toEqual({ n: 2, l: 1, j: 1.5 });   // unchanged
    });

    it('keeps the old selection shape for non-relativistic profiles', () => {
        let state = reducer(undefined, solveSucceeded(neonLikeProfile()));
        state = reducer(state, drillSub(2, 1));
        expect(state.selectedSubshell).toStrictEqual({ n: 2, l: 1 });
    });
});
```

(Use the file's existing reducer import name in place of `reducer` if it differs.)

In `tests/atom/use_atom_solver.test.tsx`, change the existing mount expectation to:
```ts
        expect(worker.postMessage).toHaveBeenCalledWith({
            type: 'solve', Z: 1, enclosedFraction: 0.9, relativity: 'off', requestId: expect.any(Number),
        });
```
and append:
```ts
import { setRelativity } from '../../src/store/atomSlice';

it('keys requests and cache hits by relativity', () => {
    const store = buildStore();
    const worker = fakeWorker();
    renderHook(() => useAtomSolver(0.9, () => worker), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });
    act(() => { store.dispatch(setElement(79)); });
    expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ Z: 79, relativity: 'scalar' }));
    const scalarId = lastRequestId(worker);
    act(() => { store.dispatch(setRelativity('spinOrbit')); });
    expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ Z: 79, relativity: 'spinOrbit' }));

    // The superseded scalar reply lands late: dropped.
    act(() => {
        worker.onmessage!({ data: { type: 'success', profile: minimalProfile({ Z: 79, relativity: 'scalar' }), requestId: scalarId } } as MessageEvent);
    });
    expect(store.getState().atom.profile).toBeNull();

    act(() => {
        worker.onmessage!({ data: { type: 'success', profile: minimalProfile({ Z: 79, relativity: 'spinOrbit' }), requestId: lastRequestId(worker) } } as MessageEvent);
    });
    expect(store.getState().atom.profile!.relativity).toBe('spinOrbit');

    // Scalar was never cached (its reply was dropped), so switching back asks the worker again...
    const calls = worker.postMessage.mock.calls.length;
    act(() => { store.dispatch(setRelativity('scalar')); });
    expect(worker.postMessage.mock.calls.length).toBe(calls + 1);
    act(() => {
        worker.onmessage!({ data: { type: 'success', profile: minimalProfile({ Z: 79, relativity: 'scalar' }), requestId: lastRequestId(worker) } } as MessageEvent);
    });
    // ...and spin–orbit, which was cached, comes back without one.
    act(() => { store.dispatch(setRelativity('spinOrbit')); });
    expect(worker.postMessage.mock.calls.length).toBe(calls + 1);
    expect(store.getState().atom.profile!.relativity).toBe('spinOrbit');
});
```

Append to `tests/atom/shell_mesh_cache.test.ts`:
```ts
it('separates relativity modes and j-levels, and keeps the non-relativistic key unchanged', () => {
    expect(shellMeshCacheKey(26, 3, 32, 0.9, null, 'off')).toBe(shellMeshCacheKey(26, 3, 32, 0.9, null));
    expect(shellMeshCacheKey(79, 6, 32, 0.9, null, 'scalar')).not.toBe(shellMeshCacheKey(79, 6, 32, 0.9, null, 'off'));
    expect(shellMeshCacheKey(79, 6, 32, 0.9, 1, 'spinOrbit', 0.5)).not.toBe(shellMeshCacheKey(79, 6, 32, 0.9, 1, 'spinOrbit', 1.5));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/atom/atom_slice.test.ts tests/atom/use_atom_solver.test.tsx tests/atom/shell_mesh_cache.test.ts`
Expected: FAIL — `setRelativity` not exported; `relativity` missing from the posted message.

- [ ] **Step 3: Implement the slice**

In `src/store/atomSlice.ts`:
```ts
import { RelativityMode, defaultRelativityFor } from '../atom/relativity';

// AtomState:
    selectedSubshell: { n: number; l: number; j?: number } | null;
    selectedOrbital: { n: number; l: number; ml: number; j?: number } | null;
    /**
     * The user's Relativity choice, or null to follow the element's default
     * (scalar from Cs, off before -- spec §5 Phase 4). Kept across element
     * changes: someone comparing heavy atoms with spin-orbit on expects it
     * to stay on.
     */
    relativityOverride: RelativityMode | null;
// initialState:  relativityOverride: null,

export function effectiveRelativity(state: Pick<AtomState, 'Z' | 'relativityOverride'>): RelativityMode {
    return state.relativityOverride ?? defaultRelativityFor(state.Z);
}

/** j must match exactly: in a spin-orbit profile (n, l) alone names no subshell, and vice versa. */
function subshellIsOccupied(profile: SerialisedAtomProfile | null, n: number, l: number, j?: number): boolean {
    return profile !== null && profile.subshells.some(s => s.n === n && s.l === l && s.j === j);
}
```
Reducers:
```ts
        drillToSubshell: (state, action: PayloadAction<{ n: number; l: number; j?: number }>) => {
            const { n, l, j } = action.payload;
            if (!subshellIsOccupied(state.profile, n, l, j)) return;
            state.level = 'shell';
            state.selectedShell = n;
            state.selectedSubshell = j === undefined ? { n, l } : { n, l, j };
            state.selectedOrbital = null;
        },

        drillToOrbital: (state, action: PayloadAction<{ n: number; l: number; ml: number; j?: number }>) => {
            const { n, l, ml, j } = action.payload;
            if (!subshellIsOccupied(state.profile, n, l, j)) return;
            if (ml < -l || ml > l) return;
            state.level = 'orbital';
            state.selectedShell = n;
            state.selectedSubshell = j === undefined ? { n, l } : { n, l, j };
            state.selectedOrbital = j === undefined ? { n, l, ml } : { n, l, ml, j };
        },

        // Not pure navigation: a different mode is a different solve. It
        // keeps the element and the open shell -- the thing being compared --
        // but drops any subshell or orbital, because switching into or out
        // of spin-orbit changes what names a subshell ((6, 1) vs 6p½/6p³⁄₂).
        setRelativity: (state, action: PayloadAction<RelativityMode | null>) => {
            const before = effectiveRelativity(state);
            state.relativityOverride = action.payload;
            if (effectiveRelativity(state) === before) return;
            state.solveNonce += 1;
            state.error = null;
            state.selectedSubshell = null;
            state.selectedOrbital = null;
            if (state.level === 'orbital') state.level = state.selectedShell !== null ? 'shell' : 'atom';
        },
```
Exports:
```ts
export const drillToSubshell = (n: number, l: number, j?: number) =>
    atomSlice.actions.drillToSubshell(j === undefined ? { n, l } : { n, l, j });
export const drillToOrbital = (n: number, l: number, ml: number, j?: number) =>
    atomSlice.actions.drillToOrbital(j === undefined ? { n, l, ml } : { n, l, ml, j });
export const setRelativity = atomSlice.actions.setRelativity;
```

- [ ] **Step 4: Implement the caches and the hook**

`src/atom/profile_cache.ts`:
```ts
import { RelativityMode } from './relativity';

// 'off' keeps the original key so nothing about the non-relativistic cache changes.
function keyFor(Z: number, enclosedFraction: number, relativity: RelativityMode): string {
    return relativity === 'off' ? `${Z}:${enclosedFraction}` : `${Z}:${enclosedFraction}:${relativity}`;
}
export function getCachedProfile(Z: number, enclosedFraction: number, relativity: RelativityMode = 'off') { /* body unchanged, keyFor(Z, enclosedFraction, relativity) */ }
export function setCachedProfile(Z: number, enclosedFraction: number, profile: SerialisedAtomProfile, relativity: RelativityMode = 'off') { /* same */ }
```
Update the module comment: the profile is a pure function of (Z, enclosedFraction, relativity).

`src/atom/shell_mesh_cache.ts`:
```ts
export function shellMeshCacheKey(
    Z: number, n: number, resolution: number, enclosedFraction: number,
    isolatedL: number | null = null, relativity: RelativityMode = 'off', isolatedJ?: number,
): string {
    const base = `${Z}:${n}:${resolution}:${enclosedFraction}:${isolatedL ?? 'all'}`;
    // A relativistic subshell has a different R(r), so different lobes; a
    // j-level is a different subshell. 'off' keeps the original key.
    return base + (relativity === 'off' ? '' : `:${relativity}`) + (isolatedJ === undefined ? '' : `:j${isolatedJ}`);
}
```

`src/atom/useAtomSolver.ts`:
```ts
import { effectiveRelativity } from '../store/atomSlice';
import { relativityLabel } from './relativity';
// ...
    const relativity = useAppSelector(state => effectiveRelativity(state.atom));
// in the effect: getCachedProfile(Z, enclosedFraction, relativity);
//                setCachedProfile(Z, enclosedFraction, profile, relativity);
//                worker.postMessage({ type: 'solve', Z, enclosedFraction, relativity, requestId });
//   unconverged message:
                dispatch(solveFailed(relativity === 'off'
                    ? `The SCF calculation for Z=${Z} did not converge.`
                    : `The ${relativityLabel(relativity).toLowerCase()} relativistic SCF calculation for Z=${Z} did not converge.`));
// dependency list: [mode, Z, enclosedFraction, solveNonce, relativity, dispatch]
```
Extend the doc comment: the per-request key is now `[mode, Z, enclosedFraction, solveNonce, relativity]`.

- [ ] **Step 5: Register the URL key**

Open Phase 2's `src/url_state.ts` and register one more atom-mode key, `rel`, next to the existing `Z` registration and in the same form (Phase 2 registers each key with an encoder from state and a decoder into state): encode with `encodeRelativityParam(state.atom.relativityOverride)` (null → key omitted), decode with `decodeRelativityParam(value)` into a `setRelativity(...)` dispatch. Add to Phase 2's round-trip test a case `#mode=atom&Z=79&rel=so` → `relativityOverride === 'spinOrbit'`, and `#mode=atom&Z=79&rel=nonsense` → `relativityOverride === null`.

Run: `npx jest tests/url_state.test.ts` (Phase 2's test file) — Expected: PASS.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest tests/atom/atom_slice.test.ts tests/atom/use_atom_solver.test.tsx tests/atom/shell_mesh_cache.test.ts src/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/atomSlice.ts src/atom/useAtomSolver.ts src/atom/profile_cache.ts src/atom/shell_mesh_cache.ts src/url_state.ts tests/atom/atom_slice.test.ts tests/atom/use_atom_solver.test.tsx tests/atom/shell_mesh_cache.test.ts tests/url_state.test.ts
git commit -m "feat(atom): relativity in the store, solver requests, caches and URL

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: j-levels through the drill-down (panel, navigation, composition)

**Files:**
- Modify: `src/atom/shell_composition.ts`
- Modify: `src/components/SubshellPanel.tsx`
- Modify: `src/components/LevelNav.tsx` (NavigationTarget 16–20, crumbs/parent 107–142)
- Modify: `src/components/OrbitalViewer.tsx:227-280`
- Modify: `src/App.tsx` (`handleLevelNavigate` 159–166, `handleSelectSubshell`/`handleSelectOrbital` 175–185, level-3 effect 325–353, `atomCurves` 392–427)
- Test: `tests/atom/shell_composition.test.ts`, `tests/atom/subshell_panel.test.tsx`, `tests/atom/level_nav.test.tsx` (extend)

**Interfaces:**
- Consumes: `subshellLabel(n, l, j?)` (Task 8); `SerialisedSubshell.j` (Task 8); `drillToSubshell(n, l, j?)`, `drillToOrbital(n, l, ml, j?)` (Task 9); `methodStatement` (Task 2).
- Produces:
  ```ts
  // shell_composition.ts
  ShellCompositionSubshell.j?: number;  OrbitalComponent.j?: number;
  export function isolateSubshell(components: OrbitalComponent[], l: number | null, j?: number): OrbitalComponent[];
  // SubshellPanel.tsx
  export function formatElectrons(electrons: number): string;     // 2 -> "2", 9/7 -> "1.29"
  props: onSelectSubshell(n, l, j?), onSelectOrbital(n, l, ml, j?), relativity?: RelativityMode
  // LevelNav.tsx
  NavigationTarget subshell/orbital gain j?: number
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/atom/shell_composition.test.ts`:
```ts
describe('j-levels', () => {
    it('gives each j-level its own lobes and colour, with the same fill fraction as the whole subshell', () => {
        // Uranium's 5f3 split by 2j+1: 9/7 in 5f⁵⁄₂, 12/7 in 5f⁷⁄₂.
        const components = shellComposition([
            { n: 5, l: 3, j: 2.5, electrons: 9 / 7 },
            { n: 5, l: 3, j: 3.5, electrons: 12 / 7 },
        ]);
        expect(components).toHaveLength(14);
        expect(components.filter(c => c.j === 2.5).every(c => c.colorIndex === 0)).toBe(true);
        expect(components.filter(c => c.j === 3.5).every(c => c.colorIndex === 1)).toBe(true);
        for (const c of components) {
            expect(c.occupancyFraction).toBeCloseTo(3 / 14, 12);   // = 5f3 without spin–orbit
            expect(c.occupancyFraction).toBeLessThanOrEqual(1);
        }
    });

    it('isolates one j-level, keeping its colour', () => {
        const components = shellComposition([
            { n: 6, l: 1, j: 0.5, electrons: 2 },
            { n: 6, l: 1, j: 1.5, electrons: 4 },
        ]);
        const isolated = isolateSubshell(components, 1, 1.5);
        expect(isolated).toHaveLength(3);
        expect(isolated.every(c => c.j === 1.5 && c.colorIndex === 1 && c.occupancyFraction === 1)).toBe(true);
        expect(isolateSubshell(components, 1)).toHaveLength(6);
    });
});
```

Append to `tests/atom/subshell_panel.test.tsx`:
```ts
import { formatElectrons } from '../../src/components/SubshellPanel';

function leadLikeSpinOrbit(): SerialisedSubshell[] {
    const a = () => new Float64Array(4);
    return [
        { n: 6, l: 0, j: 0.5, electrons: 2, energy: -0.47, curve: a(), R: a(), samplingRadius: 5, compositeSamplingRadius: 5 },
        { n: 6, l: 1, j: 0.5, electrons: 2 / 3, energy: -0.16, curve: a(), R: a(), samplingRadius: 6, compositeSamplingRadius: 6 },
        { n: 6, l: 1, j: 1.5, electrons: 4 / 3, energy: -0.12, curve: a(), R: a(), samplingRadius: 6, compositeSamplingRadius: 6 },
    ];
}

describe('SubshellPanel with spin–orbit', () => {
    it('shows one chip per j-level, labelled 6p½ / 6p³⁄₂, with 2j+1 capacity and fractional occupancy', () => {
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        const labels = Array.from(container.querySelectorAll('.subshell-chip-label')).map(e => e.textContent);
        expect(labels).toEqual(['6s½', '6p½', '6p³⁄₂']);
        const text = container.textContent ?? '';
        expect(text).toMatch(/0\.67 of 2 e⁻/);
        expect(text).toMatch(/1\.33 of 4 e⁻/);
        expect(text).toMatch(/2 of 2 e⁻/);
    });

    it('reports j with the selection, and marks only the chosen j-level', () => {
        const onSelectSubshell = jest.fn();
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={{ n: 6, l: 1, j: 1.5 }}
                relativity="spinOrbit" onSelectSubshell={onSelectSubshell} onSelectOrbital={() => {}} />
        );
        const chips = container.querySelectorAll('.subshell-chip');
        expect(chips[1].getAttribute('aria-pressed')).toBe('false');
        expect(chips[2].getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(chips[1]);
        expect(onSelectSubshell).toHaveBeenCalledWith(6, 1, 0.5);
        // The lobes drawn for a j-level are the l basis; say so (spec §3.3).
        expect(container.textContent).toMatch(/j-level/);
    });

    it('states the method on every energy', () => {
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        for (const energy of Array.from(container.querySelectorAll('.subshell-chip-energy'))) {
            expect(energy.getAttribute('title')).toMatch(/Dirac/);
        }
    });

    it('formats electron counts', () => {
        expect(formatElectrons(2)).toBe('2');
        expect(formatElectrons(9 / 7)).toBe('1.29');
    });
});
```

Append to `tests/atom/level_nav.test.tsx`:
```ts
it('names j-levels in the breadcrumb and navigates with j', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
        <LevelNav Z={82} selectedShell={6} selectedSubshell={{ n: 6, l: 1, j: 1.5 }}
            selectedOrbital={{ n: 6, l: 1, ml: 0, j: 1.5 }} onNavigate={onNavigate} />
    );
    fireEvent.click(getByText('← Back to 6p³⁄₂'));
    expect(onNavigate).toHaveBeenCalledWith({ level: 'subshell', n: 6, l: 1, j: 1.5 });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/atom/shell_composition.test.ts tests/atom/subshell_panel.test.tsx tests/atom/level_nav.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement composition**

In `src/atom/shell_composition.ts`: add `/** j-level, present only with spin–orbit. */ j?: number;` to both `ShellCompositionSubshell` and `OrbitalComponent`, then:

```ts
export function shellComposition(subshells: ShellCompositionSubshell[]): OrbitalComponent[] {
    const components: OrbitalComponent[] = [];
    subshells.forEach((subshell, colorIndex) => {
        const { n, l, electrons, j } = subshell;
        // How full this subshell (or j-level) is, shared equally by its lobes.
        // A j-level holds 2j+1 electrons; with the 2j+1 split this fraction is
        // the same for both j-levels and equals the non-relativistic one.
        const capacity = j === undefined ? 2 * (2 * l + 1) : 2 * j + 1;
        const occupancyFraction = electrons / capacity;
        for (let ml = -l; ml <= l; ml++) {
            components.push(j === undefined
                ? { n, l, ml, occupancyFraction, colorIndex }
                : { n, l, ml, j, occupancyFraction, colorIndex });
        }
    });
    return components;
}

export function isolateSubshell(components: OrbitalComponent[], l: number | null, j?: number): OrbitalComponent[] {
    if (l === null) return components;
    return components.filter(component => component.l === l && (j === undefined || component.j === j));
}
```
(For `j === undefined` the capacity 2(2l+1) gives electrons/(2(2l+1)), identical to today's `electronsPerOrbital / 2`.) Add to the module doc: a j-level is drawn with the l-basis lobes and that j-level's own radial function — a basis choice, as the lobes already are.

- [ ] **Step 4: Implement the panel**

In `src/components/SubshellPanel.tsx`:
```ts
import { RelativityMode, methodStatement } from '../atom/relativity';

/** Whole numbers as they are; a fractional j-level share (spin–orbit on an open subshell) to two places. */
export function formatElectrons(electrons: number): string {
    return Number.isInteger(electrons) ? String(electrons) : electrons.toFixed(2);
}

const sameSubshell = (a: { n: number; l: number; j?: number } | null, b: { n: number; l: number; j?: number }) =>
    a !== null && a.n === b.n && a.l === b.l && a.j === b.j;
```
Props: `selectedSubshell: { n: number; l: number; j?: number } | null;`, `selectedOrbital?: { n: number; l: number; ml: number; j?: number } | null;`, `onSelectSubshell: (n: number, l: number, j?: number) => void;`, `onSelectOrbital: (n: number, l: number, ml: number, j?: number) => void;`, `relativity?: RelativityMode;` (default `'off'`).

Changes in the body:
- `activeSubshell = selectedSubshell && selectedSubshell.n === shellN ? shellSubshells.find(s => sameSubshell(selectedSubshell, s)) ?? null : null;`
- chip `key={`${subshell.n}-${subshell.l}-${subshell.j ?? ''}`}`, `isSelected = sameSubshell(selectedSubshell, subshell)`, `onClick={() => onSelectSubshell(subshell.n, subshell.l, subshell.j)}`, `data-j={subshell.j}`.
- label `subshellLabel(subshell.n, subshell.l, subshell.j)`.
- occupancy `{formatElectrons(subshell.electrons)} of {subshell.j === undefined ? 2 * (2 * subshell.l + 1) : 2 * subshell.j + 1} e⁻` (update the comment: capacity is 2j+1 for a j-level).
- energy span gains `title={`orbital energy (eigenvalue): ${methodStatement(relativity)}`}`.
- mₗ buttons: selected test adds `&& selectedOrbital.j === activeSubshell.j`; `onClick={() => onSelectOrbital(activeSubshell.n, activeSubshell.l, ml, activeSubshell.j)}`.
- energy diagram label `subshellLabel(sub.n, sub.l, sub.j)` and keys include `j`.
- hint text: when `activeSubshell?.j !== undefined`, append a second caption:
```tsx
{activeSubshell && activeSubshell.j !== undefined && (
    <Typography variant="caption" className="subshell-j-note" display="block">
        {`Lobes show the l = ${activeSubshell.l} shapes with this j-level's own radial size. A j-level mixes mₗ and spin, so its true shape is not one lobe — ${subshellLabel(activeSubshell.n, activeSubshell.l, activeSubshell.l - 0.5 > 0 ? activeSubshell.l - 0.5 : activeSubshell.l + 0.5)} included (a p½ level is spherical).`}
    </Typography>
)}
```
Simplify that sentence if you prefer, but it must contain "j-level" and say the lobe shape is a basis choice.

- [ ] **Step 5: Implement navigation, composition lookup and App wiring**

`src/components/LevelNav.tsx`:
- `NavigationTarget`: `{ level: 'subshell'; n: number; l: number; j?: number }` and `{ level: 'orbital'; n: number; l: number; ml: number; j?: number }`.
- Props `selectedSubshell: { n: number; l: number; j?: number } | null; selectedOrbital: { n: number; l: number; ml: number; j?: number } | null;`.
- `parent` for an orbital: label `subshellLabel(selectedOrbital.n, selectedOrbital.l, selectedOrbital.j)`, target `{ level: 'subshell', n, l, ...(selectedOrbital.j !== undefined ? { j: selectedOrbital.j } : {}) }`.
- subshell crumb: same label/target with `selectedSubshell.j`; orbital crumb label `selectedOrbital.j === undefined ? orbitalName(n, l, ml) : `${orbitalName(n, l, ml)} · ${subshellLabel(n, l, j)}``.
- hint line uses `subshellLabel(selectedOrbital.n, selectedOrbital.l, selectedOrbital.j)`.

`src/components/OrbitalViewer.tsx` (composition effect):
```ts
        const isolatedL = atomSelectedSubshell && atomSelectedSubshell.n === atomSelectedShell ? atomSelectedSubshell.l : null;
        const isolatedJ = atomSelectedSubshell && atomSelectedSubshell.n === atomSelectedShell ? atomSelectedSubshell.j : undefined;
        const components = isolateSubshell(shellComposition(shellSubshells), isolatedL, isolatedJ);
        if (components.length === 0) return;
        const cacheKey = shellMeshCacheKey(atomProfile.Z, atomSelectedShell, COMPOSITE_ORBITAL_RESOLUTION, enclosedFraction,
            isolatedL, atomProfile.relativity ?? 'off', isolatedJ);
        // ...
            const subshell = shellSubshells.find(s => s.l === component.l && s.j === component.j)!;
```

`src/App.tsx`:
```ts
    const handleLevelNavigate = useCallback((target: NavigationTarget) => {
        switch (target.level) {
            case 'atom': dispatch(goToLevel('atom')); break;
            case 'shell': dispatch(drillToShell(target.n)); break;
            case 'subshell': dispatch(drillToSubshell(target.n, target.l, target.j)); break;
            case 'orbital': dispatch(drillToOrbital(target.n, target.l, target.ml, target.j)); break;
        }
    }, [dispatch]);

    const handleSelectSubshell = useCallback((selN: number, selL: number, selJ?: number) => {
        if (atomSelectedSubshell && atomSelectedSubshell.n === selN && atomSelectedSubshell.l === selL && atomSelectedSubshell.j === selJ) {
            dispatch(clearSubshell());
            return;
        }
        dispatch(drillToSubshell(selN, selL, selJ));
    }, [dispatch, atomSelectedSubshell]);

    const handleSelectOrbital = useCallback((selN: number, selL: number, selMl: number, selJ?: number) => {
        dispatch(drillToOrbital(selN, selL, selMl, selJ));
    }, [dispatch]);
```
Level-3 effect: `const subshell = atomProfile.subshells.find(s => s.n === selN && s.l === selL && s.j === atomSelectedOrbital.j);`.
`atomCurves`, shell level: isolation filter `s.l === atomSelectedSubshell.l && s.j === atomSelectedSubshell.j`; label `subshellLabel(subshell.n, subshell.l, subshell.j)`.
Pass `relativity={atomProfile.relativity ?? 'off'}` to `<SubshellPanel>`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest tests/atom/shell_composition.test.ts tests/atom/subshell_panel.test.tsx tests/atom/level_nav.test.tsx tests/atom/visualizer_dispatch.test.ts src/App.test.tsx`
Expected: PASS. Then `npx tsc --noEmit -p .` — clean.

- [ ] **Step 7: Commit**

```bash
git add src/atom/shell_composition.ts src/components/SubshellPanel.tsx src/components/LevelNav.tsx src/components/OrbitalViewer.tsx src/App.tsx tests/atom/shell_composition.test.ts tests/atom/subshell_panel.test.tsx tests/atom/level_nav.test.tsx
git commit -m "feat(ui): j-levels (6p½ / 6p³⁄₂) through the subshell panel, navigation and composition view

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Relativity control and "what changed" readout

**Files:**
- Modify: `src/components/Controls.tsx` (props 25–68, body after the mode fieldset at 203–222)
- Modify: `src/App.tsx` (selectors near 86–96, `canvasBusyLabel` 435–445, `controls` 474–497)
- Modify: `src/style.css`
- Test: `src/components/Controls.test.tsx` (extend)

**Interfaces:**
- Consumes: `RelativityMode` (Task 2), `ValenceSContraction` (Task 8), `effectiveRelativity`, `setRelativity` (Task 9).
- Produces:
  ```ts
  // Controls props
  relativity?: RelativityMode; relativityIsDefault?: boolean;
  onRelativityChange?: (mode: RelativityMode) => void;
  relativisticChange?: ValenceSContraction | null;
  export function relativityHelp(mode: RelativityMode, isDefault: boolean): string;
  export function whatChangedText(change: ValenceSContraction): string;
  ```

- [ ] **Step 1: Write the failing test**

Append to `src/components/Controls.test.tsx`:
```ts
import { relativityHelp, whatChangedText } from './Controls';

describe('Relativity control', () => {
  const gold = { n: 6, label: '6s', nonRelativisticMeanRadius: 3.21, relativisticMeanRadius: 2.66, contractionPercent: 17.13 };

  it('offers Off / Scalar / With spin–orbit in atom mode and reports the choice', () => {
    const onRelativityChange = jest.fn();
    render(<Controls {...baseProps} mode="atom" atomLevel="atom" relativity="scalar" relativityIsDefault
      onRelativityChange={onRelativityChange} />);
    const group = screen.getByRole('group', { name: /relativity/i });
    expect(within(group).getByRole('button', { name: /relativity off/i })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /scalar relativistic/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: /with spin–orbit/i }));
    expect(onRelativityChange).toHaveBeenCalledWith('spinOrbit');
    expect(screen.getByText(/Koelling–Harmon/)).toBeInTheDocument();
    expect(screen.getByText(/default for this element/i)).toBeInTheDocument();
  });

  it('is absent in Basic Orbitals mode', () => {
    render(<Controls {...baseProps} relativity="scalar" onRelativityChange={() => {}} />);
    expect(screen.queryByRole('group', { name: /relativity/i })).toBeNull();
  });

  it('shows what changed, with its method', () => {
    render(<Controls {...baseProps} mode="atom" atomLevel="atom" relativity="scalar"
      onRelativityChange={() => {}} relativisticChange={gold} />);
    expect(screen.getByText(/6s contracts by 17\.1 %/)).toBeInTheDocument();
    expect(screen.getByText(/3\.21 → 2\.66 a₀/)).toBeInTheDocument();
  });

  it('words the helper and readout honestly at the edges', () => {
    expect(relativityHelp('off', false)).toMatch(/Schrödinger/);
    expect(relativityHelp('spinOrbit', false)).not.toMatch(/default/i);
    expect(whatChangedText({ ...gold, contractionPercent: 0.034 })).toMatch(/contracts by 0\.03 %/);
    expect(whatChangedText({ ...gold, contractionPercent: -0.5 })).toMatch(/expands by 0\.50 %/);
    expect(whatChangedText(gold)).toMatch(/non-relativistic/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/components/Controls.test.tsx`
Expected: FAIL — no "relativity" group.

- [ ] **Step 3: Implement the control**

In `src/components/Controls.tsx`, import `RelativityMode` from `'../atom/relativity'` and `ValenceSContraction` from `'../atom/relativistic_comparison'`; add the four props (documented) to `ControlsProps` and the destructuring; add:

```tsx
/** What each mode is, in one line; "Default for this element" while the user has not chosen (spec §3.1). */
export function relativityHelp(mode: RelativityMode, isDefault: boolean): string {
  const base = {
    off: 'Schrödinger equation — no relativistic effects.',
    scalar: 'Scalar-relativistic (Koelling–Harmon): mass-velocity and Darwin terms, no spin–orbit.',
    spinOrbit: 'Dirac equation: each l > 0 subshell splits into j = l − ½ and j = l + ½.',
  }[mode];
  return isDefault ? `${base} Default for this element.` : base;
}

/** The valence-s contraction, with the comparison it is measured against named. */
export function whatChangedText(change: ValenceSContraction): string {
  const size = Math.abs(change.contractionPercent);
  const verb = change.contractionPercent >= 0 ? 'contracts' : 'expands';
  return `What changed: ${change.label} ${verb} by ${size.toFixed(size < 1 ? 2 : 1)} % — `
    + `⟨r⟩ ${change.nonRelativisticMeanRadius.toFixed(2)} → ${change.relativisticMeanRadius.toFixed(2)} a₀ `
    + 'against the non-relativistic solve (same LDA functional)';
}
```

and, directly after the Mode `FormControl`:

```tsx
      {isAtomMode && onRelativityChange && relativity && (
        <FormControl component="fieldset" margin="normal" fullWidth className="relativity-controls">
          <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Relativity</FormLabel>
          <ToggleButtonGroup
            value={relativity}
            exclusive
            onChange={(event: React.MouseEvent<HTMLElement>, value: RelativityMode | null) => {
              if (value !== null) onRelativityChange(value);
            }}
            aria-label="relativity"
            size="small"
            fullWidth
          >
            <ToggleButton value="off" aria-label="relativity off">Off</ToggleButton>
            <ToggleButton value="scalar" aria-label="scalar relativistic">Scalar</ToggleButton>
            <ToggleButton value="spinOrbit" aria-label="with spin–orbit">With spin–orbit</ToggleButton>
          </ToggleButtonGroup>
          <FormHelperText className="relativity-help" sx={{ mx: 0 }}>
            {relativityHelp(relativity, relativityIsDefault ?? false)}
          </FormHelperText>
          {relativisticChange && (
            <Typography variant="body2" className="relativity-what-changed">
              {whatChangedText(relativisticChange)}
            </Typography>
          )}
        </FormControl>
      )}
```

`src/style.css` — append:
```css
/* Three labels in a 300 px panel: let "With spin–orbit" wrap rather than overflow. */
.relativity-controls .MuiToggleButton-root {
  white-space: normal;
  line-height: 1.2;
}
.relativity-what-changed {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.85);
}
```

- [ ] **Step 4: Wire it in App**

In `src/App.tsx`: import `effectiveRelativity, setRelativity` from `'./store/atomSlice'` and `RelativityMode` from `'./atom/relativity'`.

```ts
    const relativity = useAppSelector(state => effectiveRelativity(state.atom));
    const relativityIsDefault = useAppSelector(state => state.atom.relativityOverride === null);
    const handleRelativityChange = useCallback((mode: RelativityMode) => {
        dispatch(setRelativity(mode));
    }, [dispatch]);
    // Only the profile that belongs to the mode on the switch may speak for
    // it: while a new mode is solving the old profile is still on screen.
    const relativisticChange = atomProfile && (atomProfile.relativity ?? 'off') === relativity
        ? atomProfile.valenceS ?? null
        : null;
```
Pass to `<Controls>`: `relativity={relativity} relativityIsDefault={relativityIsDefault} onRelativityChange={handleRelativityChange} relativisticChange={relativisticChange}`.
Busy label: replace `` `Solving ${elementFor(atomZ)?.name ?? `Z = ${atomZ}`}…` `` with
```ts
`Solving ${elementFor(atomZ)?.name ?? `Z = ${atomZ}`}${relativity === 'off' ? '' : relativity === 'scalar' ? ' (scalar-relativistic)' : ' (with spin–orbit)'}…`
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/components/Controls.test.tsx src/App.test.tsx`
Expected: PASS. `npx tsc --noEmit -p .` — clean.

- [ ] **Step 6: Verify live — desktop 1440×900 and phone 390×844**

Ensure the dev server serves http://localhost:5391 (start `npx vite --port 5391 --strictPort` in its own terminal if nothing is listening). Using the browser tooling:
1. Desktop 1440×900: pick **Gold** from the periodic table. The right `.view-panel` shows *Relativity* with **Scalar** pressed and "Default for this element." The canvas says "Solving Gold (scalar-relativistic)…", then the readout reads "What changed: 6s contracts by …%" with a value between 10 and 25. Screenshot.
2. Click **With spin–orbit**: new solve, readout label becomes "6s½". Drill into the P shell: chips read 6s½, 6p½, 6p³⁄₂ … with "of 2"/"of 4" capacities. Screenshot.
3. Click **Off**: readout disappears; the helper no longer says "Default". Pick **Carbon**: Off stays pressed (the choice persists). Click Scalar on carbon: readout shows "2s contracts by 0.0x %".
4. Phone 390×844 with touch emulation: open the sheet's **View** tab — the control is there, all three buttons visible (wrapping is fine, overflow is not), readout readable. Screenshot.
5. Console: no errors or warnings during any of the above.

- [ ] **Step 7: Commit**

```bash
git add src/components/Controls.tsx src/components/Controls.test.tsx src/App.tsx src/style.css
git commit -m "feat(ui): Relativity switch (Off / Scalar / With spin-orbit) and the valence-s what-changed readout

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Dashed non-relativistic curves in the radial plot

**Files:**
- Modify: `src/components/RadialPlot.tsx` (`RadialCurve` 13–17, `dominantCurveLabelAt` 88–112, `multiCurvePaths` 170–190, path render 262–281, legend 310–327)
- Modify: `src/App.tsx` (new `comparisonCurves` memo after `atomCurves`, `renderRadialPlot` 499–533)
- Modify: `src/style.css`
- Test: `tests/atom/radial_plot.test.tsx` (extend)

**Interfaces:**
- Consumes: `SerialisedAtomProfile.nonRelativistic` (Task 8), `subshellLabel` (Task 8).
- Produces: `RadialCurve.dashed?: boolean` — drawn on the same vertical scale as the solid curves, not listed individually in the legend, ignored by the hover label.

- [ ] **Step 1: Write the failing test**

Append to `tests/atom/radial_plot.test.tsx`:
```ts
describe('non-relativistic comparison curves', () => {
    function withComparison(): RadialCurve[] {
        return [
            ...twoCurves(),
            { label: 'K shell non-relativistic', color: '#ff0000', dashed: true, points: [{ r: 0, value: 0 }, { r: 1, value: 20 }, { r: 2, value: 1 }] },
        ];
    }

    it('draws them dashed, in their shell\'s colour', () => {
        const { container } = render(<RadialPlot n={1} l={0} Z={79} rMax={10} curves={withComparison()} />);
        const lines = container.querySelectorAll<SVGPathElement>('.radial-plot-line');
        expect(lines).toHaveLength(3);
        expect(lines[2].style.stroke).toBe('#ff0000');
        expect(lines[2].style.strokeDasharray).toBe('4 3');
        expect(lines[0].style.strokeDasharray).toBe('');
    });

    it('puts every curve on one vertical scale, so the comparison is honest', () => {
        const { container } = render(<RadialPlot n={1} l={0} Z={79} rMax={10} curves={withComparison()} />);
        const lines = container.querySelectorAll<SVGPathElement>('.radial-plot-line');
        // The dashed curve's peak (20) is the global maximum: it reaches the top padding (y = 8).
        expect(lines[2].getAttribute('d')).toMatch(/,8\.00/);
        expect(lines[0].getAttribute('d')).not.toMatch(/,8\.00/);
    });

    it('keys the dashes once in the legend instead of listing each curve twice', () => {
        const { container } = render(<RadialPlot n={1} l={0} Z={79} rMax={10} curves={withComparison()} />);
        const items = Array.from(container.querySelectorAll('.radial-plot-legend-item')).map(e => e.textContent);
        expect(items).toEqual(['K shell', 'L shell']);
        expect(container.querySelector('.radial-plot-legend-dashed')!.textContent).toMatch(/non-relativistic/);
    });

    it('never names a dashed curve in the hover readout', () => {
        const { container } = render(
            <RadialPlot n={1} l={0} Z={79} rMax={10} curves={withComparison()} hoverRadius={1} onHoverRadius={() => {}} />
        );
        expect(container.querySelector('.radial-plot-hover-readout')!.textContent).toMatch(/K shell$/);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/atom/radial_plot.test.tsx`
Expected: FAIL — `strokeDasharray` empty; legend lists three items.

- [ ] **Step 3: Implement in RadialPlot**

- `RadialCurve` gains:
```ts
    /**
     * A comparison curve (the non-relativistic solve beside a relativistic
     * one): drawn dashed on the same scale, keyed once in the legend, never
     * named by the hover readout -- the readout says which shell is there,
     * which the solid curves answer.
     */
    dashed?: boolean;
```
- `dominantCurveLabelAt`: `for (const curve of curves) { if (curve.dashed || curve.points.length === 0) continue; ...`.
- `multiCurvePaths` returns `{ label, color, dashed: Boolean(curve.dashed), line }` (the global max loop already runs over every curve, dashed included — keep it that way).
- path: `key={curve.label}` stays (labels are unique by construction), `style={{ stroke: curve.color, strokeDasharray: curve.dashed ? '4 3' : undefined }}`.
- legend: map over `curves!.filter(curve => !curve.dashed)`, then:
```tsx
                    {curves!.some(curve => curve.dashed) && (
                        <span className="radial-plot-legend-key radial-plot-legend-dashed">
                            <span className="radial-plot-legend-dash" />
                            non-relativistic
                        </span>
                    )}
```
`src/style.css` — append:
```css
.radial-plot-legend-dash {
  display: inline-block;
  width: 14px;
  border-top: 2px dashed rgba(255, 255, 255, 0.75);
}
```

- [ ] **Step 4: Build the comparison curves in App**

After `atomCurves` in `src/App.tsx`:
```ts
    // The same curves the plot is showing, from the non-relativistic solve,
    // dashed (spec §5 Phase 4). Matched on (n) at the atom level and on
    // (n, l) at the shell level -- the non-relativistic atom has no j-levels.
    // Where the solid curves are j-levels, the dashed (n, l) curve is scaled
    // to the electrons actually shown, so an isolated 6p³⁄₂ (4 e⁻) is
    // compared with 4 electrons' worth of non-relativistic 6p, not 6.
    const comparisonCurves: RadialCurve[] = useMemo(() => {
        const reference = atomProfile?.nonRelativistic;
        if (!atomProfile || !reference) return [];
        const pointsFor = (curve: Float64Array, scale: number) =>
            atomRGrid.map((r, j) => ({ r, value: scale * curve[j] }));
        if (atomLevel === 'atom') {
            return atomProfile.shells.flatMap((shell, i) => {
                const match = reference.shells.find(s => s.n === shell.n);
                return match ? [{
                    label: `n=${shell.n} non-relativistic`,
                    color: CURVE_COLORS[i % CURVE_COLORS.length],
                    dashed: true,
                    points: pointsFor(match.curve, 1),
                }] : [];
            });
        }
        const shellSubshells = atomProfile.subshells.filter(s => s.n === atomSelectedShell);
        const shown = atomSelectedSubshell
            ? shellSubshells.filter(s => s.l === atomSelectedSubshell.l && s.j === atomSelectedSubshell.j)
            : shellSubshells;
        const curves: RadialCurve[] = [];
        for (const l of Array.from(new Set(shown.map(s => s.l)))) {
            const match = reference.subshells.find(s => s.n === atomSelectedShell && s.l === l);
            if (!match || !(match.electrons > 0)) continue;
            const shownElectrons = shown.filter(s => s.l === l).reduce((sum, s) => sum + s.electrons, 0);
            const first = shellSubshells.find(s => s.l === l)!;
            curves.push({
                label: `${subshellLabel(match.n, l)} non-relativistic`,
                color: CURVE_COLORS[shellSubshells.indexOf(first) % CURVE_COLORS.length],
                dashed: true,
                points: pointsFor(match.curve, shownElectrons / match.electrons),
            });
        }
        return curves;
    }, [atomProfile, atomLevel, atomSelectedShell, atomSelectedSubshell, atomRGrid]);
```
In `renderRadialPlot`'s atom branch: `curves={[...atomCurves, ...comparisonCurves]}`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/atom/radial_plot.test.tsx src/App.test.tsx`
Expected: PASS. `npx tsc --noEmit -p .` — clean.

- [ ] **Step 6: Verify live — desktop 1440×900 and phone 390×844**

1. Desktop: Gold, Scalar. The plot shows each shell's solid curve with a dashed twin in the same colour; the 6s/P-shell dashed curve peaks visibly further out than the solid one (the contraction the readout reports); the legend has one "non-relativistic" dash key. Hover the plot: the readout names a shell, never a "non-relativistic" curve. Screenshot.
2. Drill into the P shell with **With spin–orbit**, click 6p³⁄₂: one solid 6p³⁄₂ curve and one dashed 6p curve of comparable height (scaled to 4 e⁻). Screenshot.
3. Off: no dashed curves, no dash key.
4. Phone 390×844: sheet **Plot** tab shows the same, legible at 150 px width. Screenshot.
5. Console clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/RadialPlot.tsx src/App.tsx src/style.css tests/atom/radial_plot.test.tsx
git commit -m "feat(ui): overlay the non-relativistic D(r) dashed beside the relativistic curves

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Method statements, documentation and the full sweep

**Files:**
- Modify: `src/components/LevelNav.tsx` (METHOD_STATEMENT at 59, about text 279–303)
- Modify: `src/App.tsx` (`levelNavProps`)
- Modify: `docs/HANDOFF.md` ("Known limits of the model", "Backlog"), `README.md` (lines 297–306 and 363–365)
- Test: `tests/atom/level_nav.test.tsx` (extend)

**Interfaces:**
- Consumes: `methodStatement`, `RelativityMode` (Task 2); `effectiveRelativity` (Task 9).
- Produces: `LevelNav` prop `relativity?: RelativityMode` (default `'off'`); `export function aboutRelativitySentence(mode: RelativityMode): string`.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/atom/level_nav.test.tsx
import { aboutRelativitySentence } from '../../src/components/LevelNav';

it.each([
    ['scalar', /Koelling–Harmon/, /scalar-relativistic/],
    ['spinOrbit', /Dirac/, /j = l ± ½/],
] as const)('states the %s method in About this model', (mode, methodPattern, sentencePattern) => {
    const { getByRole, container } = render(
        <LevelNav Z={79} relativity={mode} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
    );
    fireEvent.click(getByRole('button', { name: /about this model/i }));
    expect(container.querySelector('.level-nav-method')!.textContent).toMatch(methodPattern);
    expect(container.querySelector('.level-nav-about')!.textContent).toMatch(sentencePattern);
    expect(container.querySelector('.level-nav-about')!.textContent).not.toMatch(/It is non-relativistic/);
});

it('keeps the non-relativistic wording when relativity is off', () => {
    expect(aboutRelativitySentence('off')).toMatch(/non-relativistic/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/atom/level_nav.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/components/LevelNav.tsx`: delete `METHOD_STATEMENT`, import `{ RelativityMode, methodStatement }` from `'../atom/relativity'`, add the `relativity?: RelativityMode` prop (default `'off'`), render `{methodStatement(relativity)}` in `.level-nav-method`, and add:

```tsx
/** The relativity clause of "About this model" -- the rest of the paragraph does not depend on the mode. */
export function aboutRelativitySentence(mode: RelativityMode): string {
    switch (mode) {
        case 'off':
            return 'It is non-relativistic and describes neutral, isolated atoms only — no ions, no molecules, no spin-orbit coupling.';
        case 'scalar':
            return 'Relativity is included at the scalar-relativistic level (Koelling–Harmon: the mass-velocity and Darwin terms), '
                + 'which captures how heavy atoms\' s and p shells contract, but not spin–orbit splitting. '
                + 'It describes neutral, isolated atoms only — no ions, no molecules.';
        case 'spinOrbit':
            return 'Relativity is included in full through the radial Dirac equation, so each subshell with l > 0 splits into '
                + 'j = l ± ½ levels, occupied in proportion to 2j + 1 so the atom stays spherical. '
                + 'It describes neutral, isolated atoms only — no ions, no molecules.';
    }
}
```

and in the about paragraph replace the sentence "It is non-relativistic and describes neutral, isolated atoms only — no ions, no molecules, no spin-orbit coupling." with `{aboutRelativitySentence(relativity)}`. If Phase 3 has already rewritten that sentence's ions clause, keep Phase 3's ions wording in all three variants and change only the relativity part.

In `src/App.tsx` add `relativity` (the `effectiveRelativity` value from Task 11) to `levelNavProps`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/atom/level_nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rewrite the documentation of the limits**

`docs/HANDOFF.md` — replace the "Known limits of the model" table and the "Planned v2" paragraph with the measured state: relativity modes and their defaults; the NIST ScRLDA/RLDA agreement actually measured in Task 7 (quote worst Etot and worst eigenvalue per column from `src/validation/relativity_results.json`); the light-atom finding (Ar total 0.30 %, 3s 0.82 % is real physics, spec's 0.1 % reread as agreement with NIST's relativistic columns); the known remaining approximations (point nucleus, spherical averaging over j, j-level lobes drawn in the l basis). Remove "Scalar-relativistic v2" from the backlog. Add a "What this session did" entry for Phase 4 with the judgment calls: RK4 over Numerov (Task 3's reasoning), MacDonald–Vosko on because NIST used it, `relativityOverride` persisting across elements, NR-seeded relativistic SCF.

`README.md` — rewrite the paragraph at lines 297–306 ("Non-relativistic — sub-1% through krypton, tens of percent by gold") to say relativity is available (scalar by default from Cs; spin–orbit on request), validated within 1 % against NIST ScRLDA/RLDA, and what *Off* still shows; rewrite lines 363–365 ("Non-relativistic, spinless.") to describe what spin–orbit mode does and does not show (j-level energies and radial functions are real; the lobe shapes of a j-level are the l basis).

- [ ] **Step 6: Full verification (foreground; the full suite takes about a minute)**

Run: `npx tsc --noEmit -p .` — Expected: clean.
Run: `npx jest` — Expected: all suites pass.
Run: `npm run build` — Expected: success.

- [ ] **Step 7: Live sweep — desktop 1440×900 and phone 390×844**

For each of H, C, Ar, Cs, Au, Hg, Pb, Rn, U, Og, in each of Off / Scalar / With spin–orbit:
1. The atom solves without an error banner; the busy label names the mode.
2. "About this model" states the mode's method.
3. At a p/d/f shell with spin–orbit the chips are j-levels; click one, then an mₗ button: level 3 renders, "Back" returns to the j-level, then to the shell.
4. Switching mode at level 3 lands at the shell level (Review Focus 1).
5. Switching element and mode quickly several times: the plot, chips and readout always agree with the pressed button once solving stops (Review Focus 2).
6. U with spin–orbit, O/P shells: 5f⁵⁄₂ reads "1.29 of 6 e⁻" (Review Focus 3).
7. H with Scalar: readout shows a contraction of order 10⁻³ % (Review Focus 4).
8. Og with spin–orbit converges (Review Focus 5).
Repeat 1–3 at 390×844 with touch emulation using the phone header, the Explore tab (chips), the View tab (switch, readout) and the Plot tab. Screenshot Au scalar and U spin–orbit at both sizes. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/LevelNav.tsx src/App.tsx tests/atom/level_nav.test.tsx docs/HANDOFF.md README.md
git commit -m "docs(atom): state the relativistic method in the UI and rewrite the known limits with measured numbers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (§5 Phase 4 and the task brief):**
- Relativity switch Off / Scalar / With spin–orbit, scalar default from Cs → Tasks 2 (`defaultRelativityFor`), 9 (`relativityOverride`), 11 (control).
- Koelling–Harmon (mass-velocity + Darwin, no spin–orbit), c = 137.035999 → Tasks 2, 4. Integrator choice justified against dx = 0.0080–0.0118 → Task 3. Shooting/node-count structure kept → Task 4. r^γ origin behaviour with γ = √(κ² − (Z/c)²) → Task 4 (test "starts as r^γ").
- Two-component Dirac with κ = −(l+1) / l, 2j+1 occupations, density P² + Q² → Tasks 2, 4, 6. `RadialState` gains `Q`, `j`, `kappa` → Task 4.
- j labels (6p½ / 6p³⁄₂) through configurations, LevelNav, SubshellPanel, RadialPlot curves → Tasks 8 (label, profile), 10 (panel, nav, composition, App curves).
- Dashed non-relativistic overlay → Task 12. "What changed" valence-s contraction % → Tasks 8, 11.
- NIST ScRLDA/RLDA fixtures for Ne, Ar, Kr, Xe, Au, Hg, Rn, U, Etot and eigenvalues, JSON schema → Task 1; within 1 % → Task 7; Z ≤ 18 → Task 6 (with the recorded reading); exchange method checked on NIST's page (MacDonald–Vosko for both) and matched → Tasks 1, 2, 5.
- Validation rows appended to Phase 1's `references.ts` with computed `app` values → Task 7.
- Cache keys include the mode → Task 9 (profile and mesh caches), Task 6 (`solveAtom`), Task 10 (mesh key call site). URL key → Task 9.
- Principles: method statements (Tasks 2, 10, 11, 13), qualitative labelled (Task 10 j-level lobe note), failures shown (Task 9 message), worker (Task 8), layout contract with live checks (Tasks 11, 12, 13).

**Placeholder scan:** no TBD/TODO. Two steps depend on files other phases create and therefore describe the edit rather than quote surrounding code: Phase 1's `VALIDATION` literal (Task 7, one import and one spread) and Phase 2's key registration (Task 9 Step 5, with the exact encode/decode functions and round-trip cases given). The NIST numbers themselves are transcribed in Task 1 by design.

**Type consistency:** `RelativityMode` values `'off' | 'scalar' | 'spinOrbit'` everywhere; `solveAtom(Z, relativity)`, `solveAtomOnGrid(Z, grid, { relativity, startingPotential })`; `solveScalarRelativisticState(grid, n, l, potential, Z)` / `solveDiracState(grid, n, kappa, potential, Z)`; `subshellLabel(n, l, j?)`; `drillToSubshell(n, l, j?)` / `drillToOrbital(n, l, ml, j?)`; `shellMeshCacheKey(Z, n, resolution, fraction, isolatedL, relativity, isolatedJ)`; `getCachedProfile(Z, fraction, relativity)` / `setCachedProfile(Z, fraction, profile, relativity)`; `buildSerialisedAtomProfile(atom, fraction, nonRelativistic)`; `ValenceSContraction` fields used identically in Tasks 8 and 11; `RadialCurve.dashed` in Task 12 only.

**Review Focus:** each of the five lines has a named test in its owning task (Tasks 9, 9, 10, 6, 4/7) and a live check in Task 13 Step 7.
