# Multi-Electron Atoms — Three-Level Viewer Implementation Plan

> **STATUS: all 16 tasks complete as of 2026-08-30.** This document is kept as
> the record of how the engine was built and why each task was shaped the way it
> was. It is **not** the current backlog — for present state, outstanding work
> and the decisions taken since, see [docs/HANDOFF.md](../../HANDOFF.md) and the
> addenda at the end of
> [the spec](../specs/2026-08-29-multi-electron-atoms.md).
>
> Several tasks were amended during execution by controller rulings recorded in
> the handoff; where this plan and the handoff disagree, **the handoff is
> current**.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the viewer from one-electron hydrogen-like orbitals to real neutral atoms, navigable at three levels — atom → shell → orbital — backed by a numerical self-consistent-field radial solver.

**Architecture:** A new `src/atom/` subsystem solves the radial Schrödinger equation on a logarithmic grid by Numerov integration, iterates a Hartree + LDA-exchange potential to self-consistency, and exposes numerical R_nl(r) plus radial distributions. Because the central-field approximation makes atomic density spherically symmetric, levels 1 and 2 render a sphere whose cut face reads a **1D radial texture** — no 3D sampling grid, no voxel resolution limit. Level 3 reuses the existing marching-cubes pipeline with the analytic radial factor swapped for the numerical one.

**Tech Stack:** TypeScript, React 19, Redux Toolkit, three.js 0.176, Vite, Jest + ts-jest. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-multi-electron-atoms.md`

## Global Constraints

- **Atomic units throughout.** ħ = mₑ = e = a₀ = 1. Energies in Hartree, lengths in Bohr radii. Never introduce SI.
- **No new runtime dependencies.** Everything is hand-written TypeScript. Dev dependencies may be added only with explicit approval.
- **Existing behaviour is preserved.** The hydrogen-like mode keeps working exactly as it does now, including n ≤ 9 and l ≤ 8. All 1065 existing tests must still pass at every commit.
- **Atom mode needs only l ∈ {0,1,2,3} and n ∈ 1…7.** Do not build angular channels beyond f.
- **Comment style matches the codebase**: prose explaining *why*, not *what*. Read `src/radial_distribution.ts` for the register. No decorative comments.
- **British spelling in comments and UI copy** ("normalisation", "colour"), matching existing files.
- **TDD.** Test first, watch it fail, implement, watch it pass, commit. One commit per task minimum.
- **Naming:** the radial distribution is `D(r) = 4πr²ρ(r) = Σᵢ occᵢ uᵢ(r)²`. Call it `radialDistribution` / `D`, never "density" — `density` is reserved for `ρ(r)`.

---

## File Structure

**New — `src/atom/` (the physics engine, no rendering, no React):**

| File | Responsibility |
| --- | --- |
| `radial_grid.ts` | Logarithmic grid `r_j = rMin·e^(j·dx)`, log-grid Simpson integration, interpolation |
| `numerov.ts` | Numerov integration of `y'' = g·y` on a uniform grid. Pure, no physics |
| `radial_solver.ts` | Bound-state eigenvalue search for one (n, l) in a given potential |
| `configurations.ts` | NIST ground-state electron configurations for Z = 1…118, and shell/subshell structure |
| `hartree.ts` | Hartree potential from radial Poisson; LDA exchange potential and energy |
| `scf.ts` | The self-consistency loop; produces a converged `AtomSolution` |
| `atom_profile.ts` | Derives everything the UI needs from an `AtomSolution`: total/shell/subshell D(r), contour radii, numerical R_nl accessor |

**New — rendering and UI:**

| File | Responsibility |
| --- | --- |
| `src/atom/shell_view.ts` | three.js sphere + 1D-radial-texture cut-face shader for levels 1 and 2 |
| `src/workers/atomWorker.ts` | Runs SCF off the main thread |
| `src/components/LevelNav.tsx` | Breadcrumb + back navigation across the three levels |
| `src/components/SubshellPanel.tsx` | Subshell chips and the orbital-energy diagram at level 2 |
| `src/store/atomSlice.ts` | Element, SCF result, current level, selections |

**Modified:**

| File | Change |
| --- | --- |
| `src/quantum_functions.ts` | `makeWaveFunctionEvaluator` gains an optional injected radial function |
| `src/orbital_mesh.ts` | `generateOrbitalMesh` accepts an optional radial override |
| `src/components/RadialPlot.tsx` | Multi-curve support, peak markers, hover linkage |
| `src/components/Controls.tsx` | Mode switch (atom / hydrogen-like), element picker drives atom mode |
| `src/orbital_visualizer.ts` | Dispatch between orbital mesh path and shell-view path |
| `src/App.tsx` | Wire the level state and the new panels |

---

## Task 1: Logarithmic radial grid

**Files:**
- Create: `src/atom/radial_grid.ts`
- Test: `tests/atom/radial_grid.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface RadialGrid {
      readonly r: Float64Array;   // r[j] = rMin * exp(j * dx)
      readonly dx: number;        // uniform spacing in t = ln r
      readonly size: number;
      readonly rMin: number;
      readonly rMax: number;
  }
  export function makeRadialGrid(rMin: number, rMax: number, size: number): RadialGrid;
  export function gridForAtom(Z: number): RadialGrid;
  export function integrateOnGrid(grid: RadialGrid, fOfR: Float64Array): number;
  export function cumulativeIntegral(grid: RadialGrid, fOfR: Float64Array): Float64Array;
  export function interpolateOnGrid(grid: RadialGrid, values: Float64Array, r: number): number;
  ```

**Why a log grid:** a heavy atom's 1s peaks inside 0.05 a₀ while its valence shell reaches 50 a₀. A uniform grid fine enough for the former needs millions of points to reach the latter.

**Key detail — integration.** On the log grid, `dr = r·dt`, so `∫f(r)dr = ∫f(r(t))·r(t)dt`, a uniform-spacing Simpson integral of `f[j]*r[j]`. `cumulativeIntegral` returns the running integral from 0 up to each grid point (trapezoid is fine for the running form; it feeds the Hartree potential).

- [ ] **Step 1: Write the failing tests**

```ts
import { makeRadialGrid, gridForAtom, integrateOnGrid, cumulativeIntegral, interpolateOnGrid } from '../../src/atom/radial_grid';

describe('radial grid', () => {
    it('spaces points geometrically', () => {
        const grid = makeRadialGrid(1e-4, 40, 501);
        expect(grid.r[0]).toBeCloseTo(1e-4, 12);
        expect(grid.r[grid.size - 1]).toBeCloseTo(40, 8);
        const ratio = grid.r[1] / grid.r[0];
        expect(grid.r[301] / grid.r[300]).toBeCloseTo(ratio, 12);
    });

    it('integrates exp(-r) to 1 over a wide range', () => {
        const grid = makeRadialGrid(1e-6, 60, 2001);
        const f = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) f[j] = Math.exp(-grid.r[j]);
        // integral of exp(-r) from rMin to rMax ~ 1 (rMin is negligible)
        expect(integrateOnGrid(grid, f)).toBeCloseTo(1, 6);
    });

    it('integrates the hydrogen 1s radial distribution to 1', () => {
        const grid = gridForAtom(1);
        const f = new Float64Array(grid.size);
        // D(r) = 4 r^2 exp(-2r) for 1s of hydrogen
        for (let j = 0; j < grid.size; j++) {
            const r = grid.r[j];
            f[j] = 4 * r * r * Math.exp(-2 * r);
        }
        expect(integrateOnGrid(grid, f)).toBeCloseTo(1, 8);
    });

    it('cumulative integral ends at the total', () => {
        const grid = gridForAtom(1);
        const f = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) {
            const r = grid.r[j];
            f[j] = 4 * r * r * Math.exp(-2 * r);
        }
        const cumulative = cumulativeIntegral(grid, f);
        expect(cumulative[0]).toBeCloseTo(0, 10);
        expect(cumulative[grid.size - 1]).toBeCloseTo(1, 6);
    });

    it('interpolates a known function between grid points', () => {
        const grid = makeRadialGrid(1e-4, 20, 1001);
        const values = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) values[j] = Math.exp(-grid.r[j]);
        expect(interpolateOnGrid(grid, values, 1.234)).toBeCloseTo(Math.exp(-1.234), 6);
    });

    it('interpolation clamps outside the grid', () => {
        const grid = makeRadialGrid(1e-4, 20, 1001);
        const values = new Float64Array(grid.size);
        values.fill(3);
        expect(interpolateOnGrid(grid, values, 1e6)).toBe(3);
        expect(interpolateOnGrid(grid, values, 0)).toBe(3);
    });

    it('scales the inner cutoff with nuclear charge', () => {
        expect(gridForAtom(92).rMin).toBeLessThan(gridForAtom(1).rMin);
    });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest tests/atom/radial_grid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * The radial grid every atomic calculation runs on.
 *
 * Logarithmic, because an atom spans two and a half orders of magnitude in
 * radius: uranium's 1s peaks inside 0.02 a0 while its valence shell reaches
 * past 40. A uniform grid fine enough for the former would need millions of
 * points to reach the latter, and almost all of them would be wasted in the
 * empty outer region.
 *
 * Points are r_j = rMin * e^(j*dx), so t = ln r is uniformly spaced. Every
 * integral below is therefore a uniform-spacing quadrature in t, with the
 * Jacobian dr = r dt folded into the integrand.
 */
export interface RadialGrid {
    readonly r: Float64Array;
    /** Uniform spacing in t = ln r. */
    readonly dx: number;
    readonly size: number;
    readonly rMin: number;
    readonly rMax: number;
}

export function makeRadialGrid(rMin: number, rMax: number, size: number): RadialGrid {
    if (!(rMin > 0) || !(rMax > rMin)) throw new Error('Radial grid needs 0 < rMin < rMax.');
    if (!Number.isInteger(size) || size < 3) throw new Error('Radial grid needs at least 3 points.');

    const dx = Math.log(rMax / rMin) / (size - 1);
    const r = new Float64Array(size);
    for (let j = 0; j < size; j++) r[j] = rMin * Math.exp(j * dx);
    return { r, dx, size, rMin, rMax };
}

/**
 * A grid sized for a neutral atom of charge Z.
 *
 * The inner cutoff scales as 1/Z because that is how the innermost shell
 * scales; the outer edge grows slowly with Z because adding electrons fills
 * higher shells faster than the nucleus contracts them. An odd point count
 * keeps Simpson's rule exact over the whole range.
 */
export function gridForAtom(Z: number): RadialGrid {
    const rMin = 1e-6 / Z;
    const rMax = 50 + 1.5 * Math.cbrt(Z) * 10;
    return makeRadialGrid(rMin, rMax, 2001);
}

/** Simpson's rule in t, with the dr = r dt Jacobian folded in. */
export function integrateOnGrid(grid: RadialGrid, fOfR: Float64Array): number {
    const { r, dx, size } = grid;
    let sum = fOfR[0] * r[0] + fOfR[size - 1] * r[size - 1];
    for (let j = 1; j < size - 1; j++) {
        sum += (j % 2 === 1 ? 4 : 2) * fOfR[j] * r[j];
    }
    return (sum * dx) / 3;
}

/**
 * The running integral from the origin out to each grid point.
 *
 * Trapezoid rather than Simpson: this feeds the Hartree potential, which needs
 * a value at every point rather than at every second one.
 */
export function cumulativeIntegral(grid: RadialGrid, fOfR: Float64Array): Float64Array {
    const { r, dx, size } = grid;
    const out = new Float64Array(size);
    for (let j = 1; j < size; j++) {
        out[j] = out[j - 1] + 0.5 * dx * (fOfR[j] * r[j] + fOfR[j - 1] * r[j - 1]);
    }
    return out;
}

/** Linear interpolation in t = ln r, clamped to the grid's range. */
export function interpolateOnGrid(grid: RadialGrid, values: Float64Array, r: number): number {
    const { rMin, dx, size } = grid;
    if (!(r > rMin)) return values[0];
    const position = Math.log(r / rMin) / dx;
    if (position >= size - 1) return values[size - 1];
    const j = Math.floor(position);
    const t = position - j;
    return values[j] * (1 - t) + values[j + 1] * t;
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npx jest tests/atom/radial_grid.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atom/radial_grid.ts tests/atom/radial_grid.test.ts
git commit -m "feat(atom): logarithmic radial grid with log-grid quadrature"
```

---

## Task 2: Numerov integrator

**Files:**
- Create: `src/atom/numerov.ts`
- Test: `tests/atom/numerov.test.ts`

**Interfaces:**
- Consumes: nothing (pure numerics, no physics).
- Produces:
  ```ts
  export function numerovForward(g: Float64Array, h: number, y: Float64Array, from: number, to: number): void;
  export function numerovBackward(g: Float64Array, h: number, y: Float64Array, from: number, to: number): void;
  export function countNodes(y: Float64Array, from: number, to: number): number;
  ```

**The recurrence.** For `y'' = g·y` on uniform spacing h, writing `f_j = 1 − h²g_j/12`:

```
y_{j+1} = [ (12 − 10·f_j)·y_j − f_{j−1}·y_{j−1} ] / f_{j+1}
```

Both functions mutate `y` in place and require the two seed values already set (`y[from]` and `y[from∓1]` for forward/backward respectively). `to` is inclusive.

- [ ] **Step 1: Write the failing tests**

```ts
import { numerovForward, numerovBackward, countNodes } from '../../src/atom/numerov';

describe('numerov', () => {
    // y'' = -k^2 y  has solution sin(k x); g = -k^2
    it('reproduces sin(x) forward', () => {
        const size = 1001;
        const h = 0.01;
        const g = new Float64Array(size).fill(-1);
        const y = new Float64Array(size);
        y[0] = Math.sin(0);
        y[1] = Math.sin(h);
        numerovForward(g, h, y, 1, size - 1);
        for (const j of [100, 500, 1000]) {
            expect(y[j]).toBeCloseTo(Math.sin(j * h), 9);
        }
    });

    it('reproduces exp(-x) backward', () => {
        const size = 501;
        const h = 0.01;
        const g = new Float64Array(size).fill(1);   // y'' = y
        const y = new Float64Array(size);
        const last = size - 1;
        y[last] = Math.exp(-last * h);
        y[last - 1] = Math.exp(-(last - 1) * h);
        numerovBackward(g, h, y, last - 1, 0);
        for (const j of [400, 200, 0]) {
            expect(y[j]).toBeCloseTo(Math.exp(-j * h), 9);
        }
    });

    it('counts nodes of sin over two periods', () => {
        const size = 1001;
        const y = new Float64Array(size);
        for (let j = 0; j < size; j++) y[j] = Math.sin((4 * Math.PI * j) / (size - 1));
        // interior zeros of sin(4 pi s) for s in (0,1): s = 1/4, 1/2, 3/4 -> 3
        expect(countNodes(y, 0, size - 1)).toBe(3);
    });

    it('ignores exact zeros at the ends when counting nodes', () => {
        const y = Float64Array.from([0, 1, 2, 1, 0]);
        expect(countNodes(y, 0, 4)).toBe(0);
    });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest tests/atom/numerov.test.ts` — FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Numerov integration of y'' = g(x) y on a uniformly spaced grid.
 *
 * The radial Schrodinger equation has no first-derivative term once it is
 * written on a logarithmic grid (see radial_solver), which is exactly the form
 * Numerov wants. It is O(h^4) for the cost of a three-term recurrence, which is
 * why atomic structure codes have used it for sixty years.
 *
 * Both directions mutate `y` in place and expect the two seed values adjacent
 * to `from` to be set already. `to` is inclusive.
 */

function numerovFactors(g: Float64Array, h: number): Float64Array {
    const twelfth = (h * h) / 12;
    const f = new Float64Array(g.length);
    for (let j = 0; j < g.length; j++) f[j] = 1 - twelfth * g[j];
    return f;
}

export function numerovForward(
    g: Float64Array, h: number, y: Float64Array, from: number, to: number
): void {
    const f = numerovFactors(g, h);
    for (let j = from; j < to; j++) {
        y[j + 1] = ((12 - 10 * f[j]) * y[j] - f[j - 1] * y[j - 1]) / f[j + 1];
    }
}

export function numerovBackward(
    g: Float64Array, h: number, y: Float64Array, from: number, to: number
): void {
    const f = numerovFactors(g, h);
    for (let j = from; j > to; j--) {
        y[j - 1] = ((12 - 10 * f[j]) * y[j] - f[j + 1] * y[j + 1]) / f[j - 1];
    }
}

/**
 * Sign changes over [from, to], which for a radial function u(r) is its number
 * of nodes. This is what identifies which state an energy has converged onto:
 * the state (n, l) has exactly n - l - 1 of them.
 */
export function countNodes(y: Float64Array, from: number, to: number): number {
    let nodes = 0;
    let previous = 0;
    for (let j = from; j <= to; j++) {
        const value = y[j];
        if (value === 0) continue;
        const sign = value > 0 ? 1 : -1;
        if (previous !== 0 && sign !== previous) nodes++;
        previous = sign;
    }
    return nodes;
}
```

- [ ] **Step 4: Run and verify pass** — `npx jest tests/atom/numerov.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/atom/numerov.ts tests/atom/numerov.test.ts
git commit -m "feat(atom): Numerov integrator and node counting"
```

---

## Task 3: Radial eigenvalue solver

**This is the highest-risk task in the plan.** It is also the one with a perfect oracle: the analytic `radialWaveFunction` already in `src/quantum_functions.ts`. For a pure Coulomb potential `V = −Z/r` the solver must reproduce both `E = −Z²/2n²` and the analytic R_nl.

**Files:**
- Create: `src/atom/radial_solver.ts`
- Test: `tests/atom/radial_solver.test.ts`

**Interfaces:**
- Consumes: `RadialGrid`, `integrateOnGrid` from Task 1; `numerovForward`, `numerovBackward`, `countNodes` from Task 2.
- Produces:
  ```ts
  export interface RadialState {
      n: number;
      l: number;
      /** Eigenvalue in Hartree. Negative for a bound state. */
      energy: number;
      /** u(r) = r*R(r), normalised so that the integral of u^2 dr is 1. */
      u: Float64Array;
      /** R(r) = u(r)/r, the radial wave function itself. */
      R: Float64Array;
  }
  export function solveRadialState(
      grid: RadialGrid, n: number, l: number, potential: Float64Array
  ): RadialState;
  ```

**The transformed equation.** With `u(r) = r·R(r)` the radial equation is
`u'' = [l(l+1)/r² + 2(V − ε)]u`. Substituting `y(t) = u(r)/√r` with `t = ln r`
eliminates the first-derivative term the log grid would otherwise introduce:

```
y''(t) = g(t)·y(t),     g(t) = (l + ½)² + 2r²(V(r) − ε)
```

**Algorithm:**
1. Seed outward from the origin with the `r → 0` behaviour `u ~ r^(l+1)`, i.e.
   `y ~ r^(l+½)`. Set `y[0] = 1`, `y[1] = exp((l+½)·dx)`.
2. Seed inward from the outer edge with a hard wall: `y[size−1] = 0`,
   `y[size−2] = 1e-10`. The exponentially growing inward solution dominates, so
   the seed's exact value does not matter.
3. **Phase A — bracket by node count.** Bisect ε on `[eLow, eHigh]`. Integrate
   outward to the outer classical turning point and count nodes. More nodes than
   `n−l−1` means ε is too high. This converges onto the eigenvalue itself, since
   the node count steps up exactly there.
4. **Phase B — refine by derivative matching.** Inside the bracket from phase A,
   integrate outward to the matching index and inward back to it, rescale the
   inward solution so the two agree at the match point, and bisect on the sign of
   the logarithmic-derivative mismatch. Fall back to phase A's midpoint if no
   sign change is bracketed.
5. Normalise: `∫u²dr = 1`. With `u = y√r` and `dr = r dt`, this is
   `∫y²r²dt`. Fix the global sign so that `R(r) > 0` as `r → 0`, matching the
   convention of the analytic solution.

- [ ] **Step 1: Write the failing tests**

```ts
import { gridForAtom, makeRadialGrid, integrateOnGrid, interpolateOnGrid } from '../../src/atom/radial_grid';
import { solveRadialState } from '../../src/atom/radial_solver';
import { radialWaveFunction } from '../../src/quantum_functions';

/** V(r) = -Z/r on the grid: the one potential with an exact answer. */
function coulomb(grid: { r: Float64Array; size: number }, Z: number): Float64Array {
    const v = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) v[j] = -Z / grid.r[j];
    return v;
}

describe('radial solver against the analytic hydrogen-like solution', () => {
    const cases: Array<[number, number, number]> = [
        [1, 0, 1], [2, 0, 1], [2, 1, 1], [3, 0, 1], [3, 1, 1], [3, 2, 1],
        [4, 0, 1], [4, 3, 1], [1, 0, 6], [3, 2, 6], [2, 1, 26],
    ];

    it.each(cases)('reproduces E = -Z^2/2n^2 for n=%i l=%i Z=%i', (n, l, Z) => {
        const grid = gridForAtom(Z);
        const state = solveRadialState(grid, n, l, coulomb(grid, Z));
        const exact = -(Z * Z) / (2 * n * n);
        expect(state.energy).toBeCloseTo(exact, 6);
        expect(Math.abs((state.energy - exact) / exact)).toBeLessThan(1e-6);
    });

    it.each(cases)('reproduces R_nl(r) for n=%i l=%i Z=%i', (n, l, Z) => {
        const grid = gridForAtom(Z);
        const state = solveRadialState(grid, n, l, coulomb(grid, Z));
        // Compare where the function actually has magnitude, in units of the
        // orbital's own scale.
        for (const fraction of [0.2, 0.5, 1.0, 1.5, 2.5]) {
            const r = (fraction * n * n) / Z;
            const expected = radialWaveFunction(n, l, r, Z);
            const actual = interpolateOnGrid(grid, state.R, r);
            expect(actual).toBeCloseTo(expected, 5);
        }
    });

    it('normalises u so that the integral of u^2 is 1', () => {
        const grid = gridForAtom(1);
        const state = solveRadialState(grid, 3, 1, coulomb(grid, 1));
        const uSquared = new Float64Array(grid.size);
        for (let j = 0; j < grid.size; j++) uSquared[j] = state.u[j] * state.u[j];
        expect(integrateOnGrid(grid, uSquared)).toBeCloseTo(1, 6);
    });

    it('produces n - l - 1 radial nodes', () => {
        const grid = gridForAtom(1);
        for (const [n, l] of [[1, 0], [2, 0], [3, 0], [3, 1], [4, 1]] as Array<[number, number]>) {
            const state = solveRadialState(grid, n, l, coulomb(grid, 1));
            let nodes = 0;
            let previous = 0;
            // Ignore the outermost tail, where the hard wall and rounding noise live.
            for (let j = 0; j < grid.size - 50; j++) {
                const value = state.u[j];
                if (Math.abs(value) < 1e-12) continue;
                const sign = value > 0 ? 1 : -1;
                if (previous !== 0 && sign !== previous) nodes++;
                previous = sign;
            }
            expect(nodes).toBe(n - l - 1);
        }
    });

    it('takes R positive near the origin, matching the analytic convention', () => {
        const grid = gridForAtom(1);
        for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 2]] as Array<[number, number]>) {
            const state = solveRadialState(grid, n, l, coulomb(grid, 1));
            const near = state.R.findIndex(value => Math.abs(value) > 1e-8);
            expect(state.R[near]).toBeGreaterThan(0);
        }
    });

    it('rejects impossible quantum numbers', () => {
        const grid = gridForAtom(1);
        expect(() => solveRadialState(grid, 1, 1, coulomb(grid, 1))).toThrow();
        expect(() => solveRadialState(grid, 0, 0, coulomb(grid, 1))).toThrow();
    });
});
```

- [ ] **Step 2: Run and verify failure** — FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { RadialGrid, integrateOnGrid } from './radial_grid';
import { numerovForward, numerovBackward, countNodes } from './numerov';

export interface RadialState {
    n: number;
    l: number;
    energy: number;
    u: Float64Array;
    R: Float64Array;
}

/** Bracket for the eigenvalue search; no bound state lies outside it. */
const MAX_BISECTIONS = 200;
const ENERGY_TOLERANCE = 1e-13;

/**
 * g(t) for y'' = g y, the log-grid form of the radial equation.
 *
 * Writing u = r R and then y = u / sqrt(r) with t = ln r removes the
 * first-derivative term that the change of variable would otherwise introduce,
 * leaving exactly the form Numerov integrates.
 */
function buildG(grid: RadialGrid, l: number, potential: Float64Array, energy: number): Float64Array {
    const centrifugal = (l + 0.5) * (l + 0.5);
    const g = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        const r = grid.r[j];
        g[j] = centrifugal + 2 * r * r * (potential[j] - energy);
    }
    return g;
}

/** Outermost point where the motion is still classically allowed (g < 0). */
function matchIndex(g: Float64Array): number {
    for (let j = g.length - 2; j > 1; j--) {
        if (g[j] < 0) return j;
    }
    return Math.floor(g.length / 2);
}

function seedOutward(y: Float64Array, l: number, dx: number): void {
    y.fill(0);
    y[0] = 1;
    y[1] = Math.exp((l + 0.5) * dx);
}

function integrateOutward(grid: RadialGrid, g: Float64Array, l: number, to: number): Float64Array {
    const y = new Float64Array(grid.size);
    seedOutward(y, l, grid.dx);
    numerovForward(g, grid.dx, y, 1, to);
    return y;
}

function integrateInward(grid: RadialGrid, g: Float64Array, to: number): Float64Array {
    const y = new Float64Array(grid.size);
    const last = grid.size - 1;
    // A hard wall at the outer edge. The grid reaches far enough into the
    // classically forbidden region that the true solution is negligible there,
    // and the inward-growing solution swamps any error in the seed within a few
    // steps.
    y[last] = 0;
    y[last - 1] = 1e-10;
    numerovBackward(g, grid.dx, y, last - 1, to);
    return y;
}

export function solveRadialState(
    grid: RadialGrid, n: number, l: number, potential: Float64Array
): RadialState {
    if (!Number.isInteger(n) || n < 1) throw new Error('Principal quantum number (n) must be a positive integer.');
    if (!Number.isInteger(l) || l < 0 || l > n - 1) throw new Error('Azimuthal quantum number (l) must be an integer between 0 and n-1.');

    const targetNodes = n - l - 1;

    let eLow = -Infinity;
    for (let j = 0; j < grid.size; j++) {
        const value = potential[j] + ((l + 0.5) * (l + 0.5)) / (2 * grid.r[j] * grid.r[j]);
        if (Number.isFinite(value)) eLow = eLow === -Infinity ? value : Math.min(eLow, value);
    }
    if (!Number.isFinite(eLow) || eLow >= 0) eLow = -1e4;
    let eHigh = -1e-12;

    // Phase A: bracket the eigenvalue by node count. More nodes than the state
    // should have means the trial energy is above it.
    for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
        const energy = 0.5 * (eLow + eHigh);
        const g = buildG(grid, l, potential, energy);
        const match = matchIndex(g);
        const y = integrateOutward(grid, g, l, match);
        if (countNodes(y, 0, match) > targetNodes) eHigh = energy;
        else eLow = energy;
        if (eHigh - eLow < Math.abs(eHigh) * 1e-11 + ENERGY_TOLERANCE) break;
    }

    // Phase B: refine on the logarithmic-derivative mismatch at the match point.
    const mismatch = (energy: number): number => {
        const g = buildG(grid, l, potential, energy);
        const match = matchIndex(g);
        const outward = integrateOutward(grid, g, l, match + 1);
        const inward = integrateInward(grid, g, match - 1);
        if (outward[match] === 0 || inward[match] === 0) return 0;
        const scale = outward[match] / inward[match];
        const outwardSlope = (outward[match + 1] - outward[match - 1]) / (2 * grid.dx);
        const inwardSlope = (scale * (inward[match + 1] - inward[match - 1])) / (2 * grid.dx);
        return (outwardSlope - inwardSlope) / outward[match];
    };

    let energy = 0.5 * (eLow + eHigh);
    let low = eLow;
    let high = eHigh;
    const fLow = mismatch(low);
    const fHigh = mismatch(high);
    if (Number.isFinite(fLow) && Number.isFinite(fHigh) && fLow * fHigh < 0) {
        for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
            const middle = 0.5 * (low + high);
            const value = mismatch(middle);
            if (!Number.isFinite(value)) break;
            if (value * fLow > 0) low = middle;
            else high = middle;
            energy = 0.5 * (low + high);
            if (high - low < Math.abs(high) * 1e-14 + ENERGY_TOLERANCE) break;
        }
    }

    // Final wave function: outward up to the match point, inward beyond it,
    // scaled to agree where they meet.
    const g = buildG(grid, l, potential, energy);
    const match = matchIndex(g);
    const outward = integrateOutward(grid, g, l, match + 1);
    const inward = integrateInward(grid, g, match - 1);
    const scale = inward[match] !== 0 ? outward[match] / inward[match] : 1;

    const y = new Float64Array(grid.size);
    for (let j = 0; j <= match; j++) y[j] = outward[j];
    for (let j = match + 1; j < grid.size; j++) y[j] = scale * inward[j];

    // u = y * sqrt(r), normalised so that the integral of u^2 dr is 1.
    const u = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) u[j] = y[j] * Math.sqrt(grid.r[j]);

    const uSquared = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) uSquared[j] = u[j] * u[j];
    const norm = Math.sqrt(integrateOnGrid(grid, uSquared));
    if (!(norm > 0)) throw new Error(`Radial solver did not converge for n=${n}, l=${l}.`);

    // Sign convention: R > 0 as r -> 0, matching the analytic solution.
    const firstSignificant = u.findIndex(value => Math.abs(value) > 1e-12 * norm);
    const sign = firstSignificant >= 0 && u[firstSignificant] < 0 ? -1 : 1;

    const R = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        u[j] = (sign * u[j]) / norm;
        R[j] = u[j] / grid.r[j];
    }

    return { n, l, energy, u, R };
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npx jest tests/atom/radial_solver.test.ts`
Expected: all PASS. **If the R_nl comparison fails only at the smallest radius, widen that sample point rather than loosening the tolerance — the inner region is where the log grid is densest and should be most accurate.** If energies are right but R is scaled wrong, the bug is in normalisation, not the eigenvalue search.

- [ ] **Step 5: Commit**

```bash
git add src/atom/radial_solver.ts tests/atom/radial_solver.test.ts
git commit -m "feat(atom): radial eigenvalue solver validated against analytic hydrogen"
```

---

## Task 4: Electron configurations

**Files:**
- Create: `src/atom/configurations.ts`
- Test: `tests/atom/configurations.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface SubshellOccupancy {
      n: number;
      l: number;          // 0..3
      electrons: number;  // 1 .. 2(2l+1)
  }
  export interface ShellOccupancy {
      n: number;
      electrons: number;
      subshells: SubshellOccupancy[];
  }
  export function configurationFor(Z: number): SubshellOccupancy[];
  export function shellsFor(Z: number): ShellOccupancy[];
  export function configurationLabel(Z: number): string;   // e.g. "1s² 2s² 2p²"
  export function subshellLabel(n: number, l: number): string;  // e.g. "2p"
  ```

Configurations are a **hardcoded table**, not derived from Madelung ordering. Roughly twenty elements break the aufbau rule (Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag, La, Ce, Gd, Pt, Au, Ac, Th, Pa, U, Np, Cm, Lr), which makes the table both shorter and correct compared with a rule plus an exceptions list.

Encode compactly as a string per element, e.g. `'1s2 2s2 2p6 3s2 3p6 4s1 3d5'` for chromium, parsed once at module load. Order subshells by (n, l) after parsing so downstream code never has to think about filling order.

- [ ] **Step 1: Write the failing tests**

```ts
import { configurationFor, shellsFor, configurationLabel, subshellLabel } from '../../src/atom/configurations';
import { MAX_ATOMIC_NUMBER } from '../../src/elements';

describe('electron configurations', () => {
    it('covers every element', () => {
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) {
            expect(configurationFor(Z).length).toBeGreaterThan(0);
        }
    });

    it('assigns exactly Z electrons to every neutral atom', () => {
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) {
            const total = configurationFor(Z).reduce((sum, s) => sum + s.electrons, 0);
            expect(total).toBe(Z);
        }
    });

    it('never overfills a subshell', () => {
        for (let Z = 1; Z <= MAX_ATOMIC_NUMBER; Z++) {
            for (const subshell of configurationFor(Z)) {
                expect(subshell.electrons).toBeGreaterThan(0);
                expect(subshell.electrons).toBeLessThanOrEqual(2 * (2 * subshell.l + 1));
                expect(subshell.l).toBeLessThan(subshell.n);
                expect(subshell.l).toBeLessThanOrEqual(3);
                expect(subshell.n).toBeLessThanOrEqual(7);
            }
        }
    });

    it('knows carbon', () => {
        expect(configurationLabel(6)).toBe('1s² 2s² 2p²');
    });

    it('knows the aufbau exceptions', () => {
        expect(configurationLabel(24)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁵ 4s¹');   // chromium
        expect(configurationLabel(29)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s¹');  // copper
    });

    it('knows oganesson ends at 7p6', () => {
        const configuration = configurationFor(118);
        const last = configuration[configuration.length - 1];
        expect(last).toEqual({ n: 7, l: 1, electrons: 6 });
    });

    it('groups subshells into shells', () => {
        const shells = shellsFor(6);
        expect(shells).toHaveLength(2);
        expect(shells[0]).toEqual({ n: 1, electrons: 2, subshells: [{ n: 1, l: 0, electrons: 2 }] });
        expect(shells[1].n).toBe(2);
        expect(shells[1].electrons).toBe(4);
        expect(shells[1].subshells).toHaveLength(2);
    });

    it('labels subshells', () => {
        expect(subshellLabel(2, 1)).toBe('2p');
        expect(subshellLabel(4, 3)).toBe('4f');
    });

    it('orders subshells by n then l regardless of filling order', () => {
        const chromium = configurationFor(24);
        const keys = chromium.map(s => s.n * 10 + s.l);
        expect(keys).toEqual([...keys].sort((a, b) => a - b));
    });
});
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement.** Write the 118-entry table. Source the configurations from NIST/IUPAC ground states. Parse `'1s2 2s2 2p6'` into `SubshellOccupancy[]`, sort by (n, l), and memoise. `configurationLabel` renders with Unicode superscripts (`⁰¹²³⁴⁵⁶⁷⁸⁹`). Reuse `shellLetter` from `src/orbital_names.ts` for the letter rather than duplicating it.

**Verify the table before trusting it:** the "assigns exactly Z electrons" test catches most typos, but confirm the twenty exception elements against a reference. If unsure of an entry, search for it rather than guessing.

- [ ] **Step 4: Run and verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/atom/configurations.ts tests/atom/configurations.test.ts
git commit -m "feat(atom): ground-state electron configurations for Z = 1..118"
```

---

## Task 5: Hartree and exchange potentials

**Files:**
- Create: `src/atom/hartree.ts`
- Test: `tests/atom/hartree.test.ts`

**Interfaces:**
- Consumes: `RadialGrid`, `integrateOnGrid`, `cumulativeIntegral` from Task 1.
- Produces:
  ```ts
  export function hartreePotential(grid: RadialGrid, D: Float64Array): Float64Array;
  export function densityFromD(grid: RadialGrid, D: Float64Array): Float64Array;
  export function exchangePotential(density: Float64Array): Float64Array;
  export function exchangeEnergy(grid: RadialGrid, D: Float64Array, density: Float64Array): number;
  export function hartreeEnergy(grid: RadialGrid, D: Float64Array, vHartree: Float64Array): number;
  ```

**Formulas** (atomic units, `D(r) = 4πr²ρ(r) = Σᵢ occᵢ uᵢ(r)²`, so `∫D dr = N`):

```
V_H(r)  = (1/r)·∫₀^r D(r')dr'  +  ∫_r^∞ D(r')/r' dr'
ρ(r)    = D(r) / (4πr²)
V_x(r)  = −(3ρ(r)/π)^(1/3)                    Dirac/Slater exchange
ε_x(ρ)  = −(3/4)·(3/π)^(1/3)·ρ^(1/3)          exchange energy per electron
E_x     = ∫ D(r)·ε_x(ρ(r)) dr
E_H     = ½·∫ D(r)·V_H(r) dr
```

The classic check: a single 1s hydrogen electron's own Hartree potential is
`V_H(r) = 1/r − e^(−2r)(1 + 1/r)`, which is exact and worth testing against.

- [ ] **Step 1: Write the failing tests**

```ts
import { gridForAtom } from '../../src/atom/radial_grid';
import { hartreePotential, densityFromD, exchangePotential, exchangeEnergy, hartreeEnergy } from '../../src/atom/hartree';

/** D(r) for one hydrogen 1s electron. */
function hydrogen1sD(grid: { r: Float64Array; size: number }): Float64Array {
    const D = new Float64Array(grid.size);
    for (let j = 0; j < grid.size; j++) {
        const r = grid.r[j];
        D[j] = 4 * r * r * Math.exp(-2 * r);
    }
    return D;
}

describe('hartree potential', () => {
    it('matches the exact 1s self-interaction potential', () => {
        const grid = gridForAtom(1);
        const v = hartreePotential(grid, hydrogen1sD(grid));
        for (const r of [0.1, 0.5, 1, 2, 5]) {
            const exact = 1 / r - Math.exp(-2 * r) * (1 + 1 / r);
            const j = grid.r.findIndex(value => value >= r);
            expect(v[j]).toBeCloseTo(exact, 5);
        }
    });

    it('falls off as N/r far outside the charge', () => {
        const grid = gridForAtom(1);
        const v = hartreePotential(grid, hydrogen1sD(grid));
        const j = grid.r.findIndex(value => value >= 25);
        expect(v[j] * grid.r[j]).toBeCloseTo(1, 4);
    });

    it('is positive everywhere', () => {
        const grid = gridForAtom(1);
        const v = hartreePotential(grid, hydrogen1sD(grid));
        for (let j = 0; j < grid.size; j++) expect(v[j]).toBeGreaterThan(0);
    });
});

describe('exchange', () => {
    it('derives rho from D', () => {
        const grid = gridForAtom(1);
        const density = densityFromD(grid, hydrogen1sD(grid));
        for (const r of [0.5, 1, 2]) {
            const j = grid.r.findIndex(value => value >= r);
            expect(density[j]).toBeCloseTo(Math.exp(-2 * r) / Math.PI, 8);
        }
    });

    it('gives a negative exchange potential scaling as rho^(1/3)', () => {
        const density = Float64Array.from([1, 8, 27]);
        const v = exchangePotential(density);
        expect(v[0]).toBeLessThan(0);
        expect(v[1] / v[0]).toBeCloseTo(2, 10);
        expect(v[2] / v[0]).toBeCloseTo(3, 10);
    });

    it('gives a negative exchange energy', () => {
        const grid = gridForAtom(1);
        const D = hydrogen1sD(grid);
        expect(exchangeEnergy(grid, D, densityFromD(grid, D))).toBeLessThan(0);
    });

    it('gives the 1s self-repulsion energy of 5/16 Hartree', () => {
        const grid = gridForAtom(1);
        const D = hydrogen1sD(grid);
        expect(hartreeEnergy(grid, D, hartreePotential(grid, D))).toBeCloseTo(5 / 16, 5);
    });
});
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement.** The outward part of `V_H` uses `cumulativeIntegral`; the outward-from-r part is the total minus the running integral of `D/r`. Guard `densityFromD` against `r = 0` (the grid never reaches it, but the first point is tiny and `D/r²` there must stay finite). Clamp density to `≥ 0` before the cube root.

- [ ] **Step 4: Run and verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/atom/hartree.ts tests/atom/hartree.test.ts
git commit -m "feat(atom): Hartree and LDA exchange potentials"
```

---

## Task 6: The SCF loop

**Files:**
- Create: `src/atom/scf.ts`
- Test: `tests/atom/scf.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5.
- Produces:
  ```ts
  export interface AtomSolution {
      Z: number;
      grid: RadialGrid;
      /** One entry per occupied subshell, ordered by (n, l). */
      states: Array<RadialState & { electrons: number }>;
      /** Converged total radial distribution, D(r) = sum over occupied of occ*u^2. */
      D: Float64Array;
      density: Float64Array;
      potential: Float64Array;
      totalEnergy: number;
      iterations: number;
      converged: boolean;
  }
  export function solveAtom(Z: number): AtomSolution;
  ```

**Loop:**
1. Start from the bare Coulomb potential `V = −Z/r`.
2. Solve every occupied (n, l).
3. Build `D(r) = Σ occ·u²`, then `ρ`, `V_H`, `V_x`.
4. New potential `V = −Z/r + V_H + V_x`.
5. Mix: `V ← (1−β)·V_old + β·V_new`, β = 0.3.
6. Repeat until `max|ΔV·r|` < 1e-6 or 200 iterations.

**Total energy:** `E = Σ occ·ε − E_H − ∫D·V_x dr + E_x`.

**One-electron bypass:** for Z = 1 (and any one-electron case), LDA's
self-interaction error would make the answer wrong where the app already has an
exact one. Return the pure-Coulomb solution with no Hartree or exchange term,
and set `totalEnergy = −Z²/2`.

- [ ] **Step 1: Write the failing tests**

```ts
import { solveAtom } from '../../src/atom/scf';
import { integrateOnGrid } from '../../src/atom/radial_grid';

describe('SCF', () => {
    it('returns the exact answer for hydrogen', () => {
        const atom = solveAtom(1);
        expect(atom.totalEnergy).toBeCloseTo(-0.5, 9);
        expect(atom.states[0].energy).toBeCloseTo(-0.5, 6);
    });

    it('converges for a representative spread of elements', () => {
        for (const Z of [2, 6, 10, 18, 26, 36, 54, 79, 92, 118]) {
            const atom = solveAtom(Z);
            expect(atom.converged).toBe(true);
            expect(atom.totalEnergy).toBeLessThan(0);
        }
    });

    it('conserves electron count', () => {
        for (const Z of [2, 6, 18, 47, 92]) {
            const atom = solveAtom(Z);
            expect(integrateOnGrid(atom.grid, atom.D)).toBeCloseTo(Z, 4);
        }
    });

    it('binds more tightly as Z grows', () => {
        const energies = [2, 10, 18, 36].map(Z => solveAtom(Z).totalEnergy);
        for (let i = 1; i < energies.length; i++) {
            expect(energies[i]).toBeLessThan(energies[i - 1]);
        }
    });

    it('orders orbital energies 1s < 2s < 2p', () => {
        const atom = solveAtom(10);   // neon
        const find = (n: number, l: number) => atom.states.find(s => s.n === n && s.l === l)!.energy;
        expect(find(1, 0)).toBeLessThan(find(2, 0));
        expect(find(2, 0)).toBeLessThan(find(2, 1));
    });

    it('lifts the l-degeneracy that hydrogen has', () => {
        // In hydrogen 2s and 2p are exactly degenerate. In any many-electron
        // atom they are not: 2s penetrates the core and drops below 2p.
        const atom = solveAtom(10);
        const s = atom.states.find(state => state.n === 2 && state.l === 0)!.energy;
        const p = atom.states.find(state => state.n === 2 && state.l === 1)!.energy;
        expect(p - s).toBeGreaterThan(0.05);
    });

    it('contracts orbitals across a period', () => {
        // Lithium's valence shell is far larger than neon's.
        const meanRadius = (Z: number, n: number, l: number) => {
            const atom = solveAtom(Z);
            const state = atom.states.find(s => s.n === n && s.l === l)!;
            const integrand = new Float64Array(atom.grid.size);
            for (let j = 0; j < atom.grid.size; j++) {
                integrand[j] = state.u[j] * state.u[j] * atom.grid.r[j];
            }
            return integrateOnGrid(atom.grid, integrand);
        };
        expect(meanRadius(3, 2, 0)).toBeGreaterThan(meanRadius(10, 2, 0));
    });

    it('resolves shell structure: neon has two peaks, argon three', () => {
        const peaks = (Z: number) => {
            const atom = solveAtom(Z);
            let count = 0;
            for (let j = 2; j < atom.grid.size - 2; j++) {
                if (atom.D[j] > atom.D[j - 1] && atom.D[j] >= atom.D[j + 1] && atom.D[j] > 1e-3) count++;
            }
            return count;
        };
        expect(peaks(10)).toBe(2);
        expect(peaks(18)).toBe(3);
    });
});
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement.** If convergence stalls for heavy elements, reduce β rather than raising the iteration cap; if it oscillates, β = 0.2 is safer than 0.3. Do not silently return unconverged results — set the flag.

- [ ] **Step 4: Run and verify pass.** Then **record the computed total energies** for He, Ne, Ar and compare them against published LDA-exchange-only (Xα, α=2/3) atomic values. Search the web for reference values if needed. Add a benchmark test with a 2 % tolerance **only after confirming the reference numbers** — do not invent them.

- [ ] **Step 5: Commit**

```bash
git add src/atom/scf.ts tests/atom/scf.test.ts
git commit -m "feat(atom): self-consistent field loop with LDA exchange"
```

---

## Task 7: Atom profiles for the UI

**Files:**
- Create: `src/atom/atom_profile.ts`
- Test: `tests/atom/atom_profile.test.ts`

**Interfaces:**
- Consumes: `AtomSolution` from Task 6, `shellsFor` from Task 4.
- Produces:
  ```ts
  export interface RadialCurve {
      label: string;              // "total", "K shell", "2p"
      /** D(r) sampled on the solution's grid. */
      values: Float64Array;
  }
  export interface AtomProfile {
      Z: number;
      grid: RadialGrid;
      total: RadialCurve;
      shells: Array<{ n: number; electrons: number; curve: RadialCurve; contourRadius: number }>;
      subshells: Array<{ n: number; l: number; electrons: number; energy: number; curve: RadialCurve }>;
      /** Radius enclosing `fraction` of all electrons. */
      contourRadius: number;
      /** Peaks of the total D(r), one per resolved shell. */
      shellPeaks: number[];
  }
  export function buildAtomProfile(atom: AtomSolution, fraction: number): AtomProfile;
  export function radialFunctionFor(atom: AtomSolution, n: number, l: number): (r: number) => number;
  ```

`radialFunctionFor` is the bridge to level 3: it returns an interpolating
closure over the numerical `R`, with the same signature the analytic radial
factor has, so `makeWaveFunctionEvaluator` can take either.

- [ ] **Step 1: Write the failing tests** — cover: total curve integrates to Z; shell curves sum to the total; contour radius grows with fraction; `shellPeaks` has one entry per occupied n for Ne and Ar; `radialFunctionFor` reproduces `state.R` at grid points and interpolates between them; requesting an unoccupied (n, l) throws.

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run and verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/atom/atom_profile.ts tests/atom/atom_profile.test.ts
git commit -m "feat(atom): radial profiles and numerical R_nl accessor"
```

---

## Task 8: Numerical radial factor in the wave-function evaluator

**Files:**
- Modify: `src/quantum_functions.ts` (`makeWaveFunctionEvaluator`, around line 462)
- Modify: `src/orbital_mesh.ts` (`generateOrbitalMesh`)
- Modify: `src/types/orbital.ts` (`OrbitalParams`)
- Test: `tests/wave_function_evaluator.test.ts` (extend), `tests/orbital_mesh.test.ts` (extend)

**Interfaces:**
- Consumes: `radialFunctionFor` from Task 7.
- Produces:
  ```ts
  export function makeWaveFunctionEvaluator(
      n: number, l: number, ml: number, Z?: number,
      radialOverride?: (r: number) => number
  ): (x: number, y: number, z: number) => number;
  ```

**Critical constraint:** the existing four-argument call sites must behave
**identically**. The override replaces only the `radial` value inside the
returned closure; the angular part, the normalisation of the harmonic, the
Legendre recurrence and the `r === 0` handling are untouched.

- [ ] **Step 1: Write the failing tests**

```ts
it('uses an injected radial function in place of the analytic one', () => {
    const constantRadial = () => 2;
    const evaluate = makeWaveFunctionEvaluator(2, 1, 0, 1, constantRadial);
    const analytic = makeWaveFunctionEvaluator(2, 1, 0, 1);
    // Same angular dependence, radial factor replaced by a constant.
    const ratio = evaluate(0, 0, 3) / (2 * Math.SQRT1_2);
    expect(Number.isFinite(ratio)).toBe(true);
    expect(evaluate(0, 0, 3)).not.toBeCloseTo(analytic(0, 0, 3), 10);
    // Angular node still in the right place: p_z vanishes in the xy plane.
    expect(evaluate(3, 0, 0)).toBeCloseTo(0, 12);
});

it('is unchanged when no override is given', () => {
    const evaluate = makeWaveFunctionEvaluator(3, 2, 1, 6);
    for (const point of [[1, 2, 3], [0, 0, 1], [-2, 1, 0.5]] as Array<[number, number, number]>) {
        const { waveFunctionValue } = atomicOrbitalProbabilityDensity(
            3, 2, 1,
            Math.hypot(...point),
            Math.acos(point[2] / Math.hypot(...point)),
            Math.atan2(point[1], point[0]),
            6
        );
        expect(evaluate(...point)).toBeCloseTo(waveFunctionValue, 12);
    }
});
```

- [ ] **Step 2: Run and verify failure.**

- [ ] **Step 3: Implement.** In the returned closure, replace

```ts
const radial = radialNorm * Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre;
```

with a branch on the override. Hoist the branch out of the hot loop by choosing
the radial evaluator once, before the closure is returned — the inner loop runs
two million times and must not pay for a conditional it can avoid. Skip the
Laguerre coefficient setup entirely when an override is supplied.

Add `radialSource?: 'analytic' | 'numerical'` to `OrbitalParams` and thread it
through `generateOrbitalMesh`, which will need the atom solution to build the
override. Since the worker cannot receive a closure, pass the sampled `R` array
plus the grid parameters over the message boundary and rebuild the interpolator
worker-side.

- [ ] **Step 4: Run and verify pass.** Confirm the full suite still passes: `npx jest`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(atom): allow a numerical radial factor in the evaluator"
```

---

## Task 9: SCF worker

**Files:**
- Create: `src/workers/atomWorker.ts`
- Test: `tests/atom/atom_worker_contract.test.ts`

Mirror the structure of `src/workers/orbitalWorker.ts` exactly, including the
`WorkerScope` shim comment about the DOM `self` type. Message in:
`{ type: 'solve', Z, enclosedFraction }`. Message out: a **transferable**
payload — plain `Float64Array`s and numbers, no class instances — carrying the
profile curves, shell list, subshell list with energies, contour radii and the
per-subshell `R` arrays needed for level 3.

The contract test exercises the serialisation shape, not the DOM: assert that
the payload builder produces only transferable types and round-trips through
`structuredClone`.

- [ ] **Step 1–5:** test, fail, implement, pass, commit.

```bash
git commit -m "feat(atom): run SCF off the main thread"
```

---

## Task 10: Level 1 and 2 renderer

**Files:**
- Create: `src/atom/shell_view.ts`
- Test: `tests/atom/shell_view.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ShellViewOptions {
      contourRadius: number;
      /** D(r) normalised to its own peak, sampled uniformly in r from 0 to rMax. */
      radialTexture: Float32Array;
      rMax: number;
      opacity: number;
      plane: THREE.Plane;
  }
  export function createShellView(options: ShellViewOptions): THREE.Group;
  export function setShellViewHighlight(view: THREE.Object3D | null, r: number | null): void;
  export function disposeShellView(view: THREE.Object3D | null): void;
  ```

**Why this is not marching cubes.** The density is spherically symmetric, so the
isosurface is a sphere — `THREE.SphereGeometry` at `contourRadius`, no sampling
needed. The content is the cut face, and it computes `r = length(worldPosition)`
per fragment and reads a **1D** `THREE.DataTexture`. That gives full radial
resolution independent of any voxel grid, which is the whole reason a heavy
atom's K shell stays visible.

Reuse the stencil approach from `src/clip_caps.ts` verbatim — back faces
increment, front faces decrement, cap drawn where the count is non-zero,
`clearStencil` in `onAfterRender`. The difference is only the fragment shader.

**Fragment shader sketch** (GLSL3, matching the existing `layout(location = 0) out vec4 fragColor;` convention):

```glsl
uniform sampler2D radialCurve;   // 1D data in a width-N, height-1 texture
uniform float rMax;
uniform float opacity;
uniform float highlightR;        // negative when nothing is highlighted
varying vec3 vWorldPosition;

void main() {
    float r = length(vWorldPosition);
    if (r > rMax) discard;
    float t = r / rMax;
    float d = texture(radialCurve, vec2(t, 0.5)).r;   // D(r) / peak, in [0,1]

    // Shell rings: D(r) peaks are the shells. Perceptual ramp, warm at the
    // peaks and near-black in the troughs between shells.
    vec3 cold = vec3(0.02, 0.03, 0.10);
    vec3 warm = vec3(1.00, 0.85, 0.45);
    vec3 color = mix(cold, warm, pow(d, 0.45));

    // The ring the radial plot is pointing at.
    if (highlightR > 0.0 && abs(r - highlightR) < rMax * 0.004) {
        color = vec3(0.30, 0.95, 1.00);
    }
    fragColor = vec4(color, opacity);
}
```

Tests run without a GL context, so assert structure rather than pixels: the
group contains two stencil meshes and one cap; the cap material carries the
expected uniforms; `setShellViewHighlight` updates the uniform; `disposeShellView`
disposes the texture.

- [ ] **Step 1–5:** test, fail, implement, pass, commit.

```bash
git commit -m "feat(atom): spherical shell view with 1D radial cut-face shader"
```

---

## Task 11: Redux state for the three levels

**Files:**
- Create: `src/store/atomSlice.ts`
- Modify: `src/store/index.ts`
- Test: `tests/atom/atom_slice.test.ts`

**Interfaces:**
```ts
export type ViewMode = 'atom' | 'hydrogenic';
export type ViewLevel = 'atom' | 'shell' | 'orbital';
export interface AtomState {
    mode: ViewMode;
    Z: number;
    level: ViewLevel;
    selectedShell: number | null;             // n
    selectedSubshell: { n: number; l: number } | null;
    selectedOrbital: { n: number; l: number; ml: number } | null;
    profile: SerialisedAtomProfile | null;
    isSolving: boolean;
    error: string | null;
    /** Radius the pointer is currently over, shared by the plot and the cut face. */
    hoverRadius: number | null;
}
```

Actions: `setMode`, `setElement`, `solveStarted`, `solveSucceeded`,
`solveFailed`, `drillToShell(n)`, `drillToSubshell(n, l)`,
`drillToOrbital(n, l, ml)`, `levelUp()`, `setHoverRadius(r | null)`.

Invariants the tests must pin down:
- `setElement` resets level to `'atom'` and clears all selections.
- `levelUp` from `'orbital'` goes to `'shell'`, from `'shell'` to `'atom'`, from `'atom'` stays.
- `drillToShell` on an unoccupied n is rejected (state unchanged).
- Switching `mode` to `'hydrogenic'` leaves the existing orbital slice in charge and does not clear its params.

- [ ] **Step 1–5:** test, fail, implement, pass, commit.

```bash
git commit -m "feat(atom): drill-down state model"
```

---

## Task 12: Radial plot — multiple curves, peaks, hover

**Files:**
- Modify: `src/components/RadialPlot.tsx`
- Test: `tests/atom/radial_plot.test.tsx`

Extend the existing component rather than replacing it. Its current single-curve
hydrogen-like behaviour must be preserved exactly — that path is still used in
hydrogenic mode.

New props: `curves: RadialCurve[]` (each with a label and colour), `peaks:
number[]` to mark, `hoverRadius: number | null`, `onHoverRadius: (r: number |
null) => void`.

Hover: pointer x → r, call `onHoverRadius`. Render a vertical rule at
`hoverRadius` and a readout showing `r` in a₀ and which shell it falls in.

Tests use `@testing-library/react`, already set up. Assert: single-curve mode
renders one path as before; multi-curve mode renders one path per curve with
distinct labels; peak markers appear at the given radii; `pointermove` fires
`onHoverRadius` with the right r; `pointerleave` fires it with `null`.

- [ ] **Step 1–5:** test, fail, implement, pass, commit.

```bash
git commit -m "feat(atom): multi-curve radial plot with hover linkage"
```

---

## Task 13: Level navigation and subshell panel

**Files:**
- Create: `src/components/LevelNav.tsx`, `src/components/SubshellPanel.tsx`
- Test: `tests/atom/level_nav.test.tsx`, `tests/atom/subshell_panel.test.tsx`

`LevelNav` is a breadcrumb: `Carbon › L shell (n=2) › 2p › 2p_x`, each segment
clickable to go back to that level, plus the element's configuration label
(`1s² 2s² 2p²`) and a one-line statement of the method
("central-field SCF, LDA exchange, spherically averaged").

`SubshellPanel` shows, for the selected shell: one chip per subshell with its
label, occupancy and energy in Hartree; and a small orbital-energy diagram
(horizontal rules positioned by energy, one per subshell in the whole atom, with
the current shell highlighted). Clicking a chip drills to that subshell; the
mₗ choice then appears as `2l+1` buttons using `orbitalName` from
`src/orbital_names.ts`.

Copy requirement from the spec: the cut-face legend reads
**"radial distribution D(r) = 4πr²ρ(r)"**, never "density".

- [ ] **Step 1–5:** test, fail, implement, pass, commit.

```bash
git commit -m "feat(atom): level navigation and subshell panel"
```

---

## Task 14: Visualizer dispatch and pointer linkage

**Files:**
- Modify: `src/orbital_visualizer.ts`
- Test: `tests/atom/visualizer_dispatch.test.ts`

Two changes:

1. **Dispatch.** `updateSceneWithMeshData` currently always builds a marching-cubes
   mesh. Add a sibling path that builds a shell view from an `AtomProfile` when
   the level is `'atom'` or `'shell'`. Both paths share `clearCurrentOrbital`,
   the clip plane, framing and the caps lifecycle.

2. **Pointer → radius.** Add a `pointermove` listener on the renderer's canvas
   that intersects the pointer ray with `context.clipPlane` and reports
   `r = |hit|`:

```ts
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hit = new THREE.Vector3();

function radiusUnderPointer(context: VisualizerContext, event: PointerEvent): number | null {
    const canvas = context.renderer.domElement;
    const bounds = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, context.camera);
    // Only meaningful when there is a cut face to read a radius off.
    if (context.surfaceStyle.clipAxis === 'none') return null;
    return raycaster.ray.intersectPlane(context.clipPlane, hit) ? hit.length() : null;
}
```

Expose `setHoverRadius(context, r)` to drive the shell view's highlight uniform
in the other direction.

**Note the asymmetry** (spec §6): plot → 3D is point-to-circle. The shader
already handles this correctly by comparing `length(vWorldPosition)` to
`highlightR`, which traces exactly the circle of radius `√(r² − d²)` where the
sphere meets the cut plane. No extra geometry is needed.

- [ ] **Step 1–5:** test, fail, implement, pass, commit.

```bash
git commit -m "feat(atom): dispatch shell views and link pointer to radius"
```

---

## Task 15: Wire it together in the app shell

**Files:**
- Modify: `src/App.tsx`, `src/components/Controls.tsx`, `src/components/OrbitalViewer.tsx`, `src/style.css`
- Test: `src/App.test.tsx` (extend)

- Mode toggle: **Atom** (default) / **Hydrogen-like**. In hydrogen-like mode the
  panel is exactly what it is today, with the existing "one-electron ion"
  labelling intact.
- In atom mode the element picker drives `solveAtom` through the worker; n/l/mₗ
  selects collapse into the drill-down.
- `enclosedFraction`, opacity, cut axis/position, resolution and reset-view keep
  working at every level.
- Mount `LevelNav` above the controls and `SubshellPanel` inside them at level 2.
- Keep the phone layout working: the panel is a sheet on narrow screens
  (`useMediaQuery(NARROW_VIEWPORT)`), and `LevelNav` must stay reachable when the
  sheet is closed.

- [ ] **Step 1–5:** test, fail, implement, pass, commit.

```bash
git commit -m "feat(atom): three-level atom mode in the app shell"
```

---

## Task 16: Documentation, verification, deployability

**Files:**
- Modify: `README.md`
- Test: full suite, production build, live app

- [ ] **Step 1:** Rewrite the README's "What it shows", "How it works",
      "Physics conventions", "Limitations" and "Layout" sections to cover atom
      mode. Keep the existing register — plain, specific, honest. The
      Limitations section must state: central-field approximation, spherically
      averaged open shells, LDA exchange with no correlation, non-relativistic,
      neutral atoms only, and that orbital lobes are a basis choice.
- [ ] **Step 2:** `npx jest` — the full suite, including all 1065 pre-existing tests.
- [ ] **Step 3:** `npm run build` — must succeed with no TypeScript errors.
- [ ] **Step 4:** `npm run dev`, then drive the live app: pick carbon, confirm two
      rings and two peaks; drill to the L shell; confirm 2s and 2p curves; drill
      to 2p; confirm the lobes; navigate back up. Repeat for argon (three rings)
      and for uranium (does not hang). Screenshot each level.
- [ ] **Step 5:** Commit.

```bash
git commit -m "docs: cover atom mode in the README"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Tasks |
| --- | --- |
| §3 three levels | 10, 11, 13, 14, 15 |
| §4 physics engine | 1, 2, 3, 5, 6 |
| §4 one-electron bypass | 6 |
| §5 quantum-number scope | 4, 15 |
| §5 configuration table | 4 |
| §6 cross-view linkage | 12, 14 |
| §7 honesty requirements | 13, 16 |
| §9 acceptance | 3, 6, 16 |

**Type consistency:** `RadialGrid` (Task 1) is consumed unchanged by 3, 5, 6, 7.
`RadialState` (Task 3) is extended with `electrons` in `AtomSolution` (Task 6).
`RadialCurve` (Task 7) is the prop type in Task 12. `radialFunctionFor` (Task 7)
matches the `radialOverride` signature (Task 8). `D` is the name everywhere;
`density` is `ρ` everywhere.

**Known risks:**
1. **Task 3 is the linchpin.** If the solver does not match analytic hydrogen to
   6 digits, stop and fix it — nothing downstream is meaningful otherwise.
2. **SCF convergence for heavy elements** may need β tuning. Acceptable; do not
   paper over it by relaxing the convergence threshold.
3. **Benchmark numbers must be looked up, not invented.** Task 6 Step 4 is
   explicit about this.
