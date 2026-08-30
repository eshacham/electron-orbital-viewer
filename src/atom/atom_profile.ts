/**
 * Atom profiles: the bridge from a converged `AtomSolution` to everything the
 * UI draws.
 *
 * `solveAtom` hands back one radial state per occupied subshell and a single
 * total D(r); the drill-down UI (whole atom -> shell -> subshell) needs those
 * same electrons re-sliced three different ways, plus a handful of derived
 * scalars (contour radii, shell peak positions) that would otherwise be
 * recomputed ad hoc by every consumer. This module computes them once.
 *
 * Naming follows scf.ts: **`D(r)`** is the radial distribution
 * (4*pi*r^2*rho(r), integrates to an electron count); `density` would mean
 * rho(r) alone and is not used here — every curve in this module is a D(r).
 */
import { RadialGrid, cumulativeIntegral, interpolateOnGrid } from './radial_grid';
import { RadialState } from './radial_solver';
import { AtomSolution } from './scf';
import { subshellLabel } from './configurations';

export interface RadialCurve {
    label: string;
    /** D(r) sampled on the solution's grid. */
    values: Float64Array;
}

export interface AtomProfile {
    Z: number;
    grid: RadialGrid;
    total: RadialCurve;
    /**
     * `total.values` divided by a smoothed running maximum of itself (see
     * `shellEmphasis` below) -- what the level-1 cut face actually colours,
     * because the raw curve alone crushes a heavy atom's shells together
     * (shell_view.ts's module doc has the measured numbers).
     */
    totalEmphasis: Float32Array;
    shells: Array<{
        n: number;
        electrons: number;
        curve: RadialCurve;
        contourRadius: number;
        /** This shell's own curve divided by its running maximum -- the level-2 cut face's counterpart to `totalEmphasis`. */
        emphasis: Float32Array;
    }>;
    subshells: Array<{ n: number; l: number; electrons: number; energy: number; curve: RadialCurve }>;
    /** Radius enclosing `fraction` of all electrons. */
    contourRadius: number;
    /** Radius of the outermost occupied shell's own D(r) peak. */
    valencePeakRadius: number;
    /**
     * How large to actually draw the whole atom: `contourRadius`, widened
     * where necessary so the valence shell's peak sits inside the sphere
     * with clearance.
     *
     * `contourRadius` stays exactly what it says it is — the radius
     * enclosing `fraction` of the electrons — and every claim made about
     * that number is still true of it. This is a separate, presentational
     * quantity, because the two questions are different: "where is 90% of
     * the charge" is dominated by the core, while "how big is this atom"
     * is a question about its outermost shell. Answering the first when
     * asked the second cut the valence shell off screen for most of the
     * periodic table (see buildAtomProfile).
     */
    displayRadius: number;
    /**
     * Radii of the total D(r)'s resolved local maxima.
     *
     * **Display annotation only — ruling R26.** Shell and subshell identity
     * is authoritative from the configuration (`shells`/`subshells` above,
     * ultimately `shellsFor`/`atom.states`); `shellPeaks` must never drive
     * navigation, and never be zipped positionally against `shells` or
     * `subshells`. Neighbouring shells' D(r) genuinely merge into one
     * maximum from around Z≈26 onward — real physics (shells overlap more
     * as they compress inward with increasing Z), not a bug — so
     * `shellPeaks.length` is *not* the shell count: e.g. iron (Z=26, 4
     * occupied shells) resolves only 3 peaks, and heavier atoms merge
     * further still. A consumer that assumes `shellPeaks.length ===
     * shells.length` will misalign from iron onward.
     */
    shellPeaks: number[];
    /**
     * Which shell (by position in `shells`, ascending n) dominates the
     * total D(r) at each grid point — the atom-level cut face's ring colour
     * (Addendum 2), display annotation only in the same sense as
     * `shellPeaks`: it never drives navigation, only which palette entry
     * (`curve_colors.ts`) a radius is tinted with.
     */
    shellIndexAtR: Uint8Array;
}

// Letters for the first seven principal shells, in the old X-ray notation
// ("K shell", "L shell", ...) the brief's example label uses. Nothing in this
// app reaches n > 7 (see configurations.ts), so the table need not go further.
const PRINCIPAL_SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

function shellName(n: number): string {
    return `${PRINCIPAL_SHELL_LETTERS[n - 1] ?? `n=${n}`} shell`;
}

/**
 * A single subshell's contribution to D(r): D_nl(r) = occ * u(r)^2.
 *
 * This mirrors buildD in scf.ts exactly (D itself is just the sum of these
 * over every state), which is what makes "subshells sum to their shell" and
 * "shells sum to the total" hold as identities rather than approximations.
 */
function subshellCurveOf(state: RadialState & { electrons: number }): Float64Array {
    const values = new Float64Array(state.u.length);
    for (let j = 0; j < values.length; j++) {
        values[j] = state.electrons * state.u[j] * state.u[j];
    }
    return values;
}

/**
 * The radius enclosing `fraction` of the electrons described by `curve`.
 *
 * cumulativeIntegral already folds in the r dt -> dr Jacobian (see
 * radial_grid.ts), so cumulative[j] is directly the electron count enclosed
 * within grid.r[j]; no extra r^2 or volume factor is needed since D(r) is
 * itself already the per-dr electron density. The target radius is then
 * found by walking outward and interpolating linearly in r between the
 * bracketing grid points, rather than snapping to the nearest grid point,
 * so contourRadius varies smoothly as `fraction` varies continuously.
 */
export function radiusEnclosing(grid: RadialGrid, curve: Float64Array, fraction: number): number {
    const cumulative = cumulativeIntegral(grid, curve);
    const total = cumulative[grid.size - 1];
    if (!(total > 0)) return grid.r[0];

    const target = fraction * total;
    for (let j = 1; j < grid.size; j++) {
        if (cumulative[j] >= target) {
            const span = cumulative[j] - cumulative[j - 1];
            const t = span > 0 ? (target - cumulative[j - 1]) / span : 0;
            return grid.r[j - 1] + t * (grid.r[j] - grid.r[j - 1]);
        }
    }
    return grid.r[grid.size - 1];
}

// A peak only counts if it clears this fraction of the global maximum.
// Shells differ in height by orders of magnitude (uranium's 1s peak is
// ~1000x its 7s peak — see ruling R16), so the threshold must sit well below
// the faintest real outer-shell peak while still rejecting the sub-ULP
// wiggle that floating-point arithmetic leaves in D(r)'s exponentially
// decaying tail. 1e-4 was checked empirically against solveAtom(10) (neon,
// 2 peaks) and solveAtom(18) (argon, 3 peaks): both come out clean, and
// solveAtom(92) (uranium)'s faintest resolved peak clears it by orders of
// magnitude with room to spare.
const SHELL_PEAK_RELATIVE_THRESHOLD = 1e-4;

/**
 * Local maxima of the total D(r), thresholded relative to the global
 * maximum rather than by an absolute value (per the brief) so the same
 * threshold works unchanged from hydrogen up to the heaviest atoms.
 *
 * Individual subshells within one principal shell (2s and 2p, say) overlap
 * too heavily to show as separate maxima in the *summed* D(r) — that
 * merging is real physics, not something this function needs to special-case
 * — so "one peak per resolved shell" falls out of scanning the total curve
 * directly.
 */
function findShellPeaks(grid: RadialGrid, D: Float64Array): number[] {
    let globalMax = 0;
    for (let j = 0; j < D.length; j++) {
        if (D[j] > globalMax) globalMax = D[j];
    }
    if (!(globalMax > 0)) return [];

    const threshold = SHELL_PEAK_RELATIVE_THRESHOLD * globalMax;
    const peaks: number[] = [];
    // D[j] >= D[j-1] (not >) takes the left edge of a flat top rather than
    // reporting every point of a plateau as its own peak.
    for (let j = 1; j < D.length - 1; j++) {
        if (D[j] >= D[j - 1] && D[j] > D[j + 1] && D[j] > threshold) {
            peaks.push(grid.r[j]);
        }
    }
    return peaks;
}

/**
 * Half-width, in grid points, of the window `shellEmphasis` looks either
 * side of a point for its local maximum.
 *
 * Tuned by measurement against argon and uranium (the acceptance test this
 * exists for), not chosen by eye. Two distances bound it from either side:
 * uranium's shallowest real dip -- the trough at r=0.084, only 15% below its
 * *taller* neighbouring shell -- sits 43 grid points from that neighbour, so
 * anything narrower leaves the comparison short and the dip reads as flat;
 * the closest spacing between two genuinely distinct peaks (74 grid points,
 * also uranium) has to stay outside the window, or a real peak gets
 * compared against a taller neighbour and mistaken for that neighbour's
 * slope. 40 sits inside that gap with room on both sides for every element
 * this app solves, not only the two the test checks -- see the module
 * report for the full before/after table.
 */
export const SHELL_EMPHASIS_WINDOW = 40;

/**
 * D(r) divided by a smoothed running maximum of itself.
 *
 * The absolute scale of D spans about three orders of magnitude between a
 * heavy atom's K shell and its valence, so any single global normalisation
 * either saturates the core or crushes the outer shells to black. What makes
 * a shell legible is not how dense it is outright but that it is denser than
 * the radii either side of it, which is exactly what this ratio measures:
 * a genuine peak sits at (or very near) its own local maximum, so its
 * emphasis approaches 1 regardless of whether it is the K shell or the
 * valence shell; a trough between two peaks sits well below whichever
 * neighbour is taller, however large or small both happen to be in
 * absolute terms.
 *
 * The running maximum is a plain sliding window, not a monotonic-deque --
 * `windowInDx` is a few dozen points against a ~2000-point grid, so the
 * naive O(size * windowInDx) scan costs a few hundred thousand comparisons,
 * immeasurable next to the SCF solve that produced `D` in the first place.
 */
export function shellEmphasis(grid: RadialGrid, D: Float64Array, windowInDx: number): Float32Array {
    const { size } = grid;
    const half = Math.max(0, Math.round(windowInDx));

    const envelope = new Float64Array(size);
    for (let j = 0; j < size; j++) {
        const lo = Math.max(0, j - half);
        const hi = Math.min(size - 1, j + half);
        let max = 0;
        for (let k = lo; k <= hi; k++) {
            if (D[k] > max) max = D[k];
        }
        envelope[j] = max;
    }

    const emphasis = new Float32Array(size);
    for (let j = 0; j < size; j++) {
        // The window always includes j itself, so envelope[j] >= D[j] and
        // this ratio never exceeds 1 -- no separate clamp needed.
        emphasis[j] = envelope[j] > 0 ? D[j] / envelope[j] : 0;
    }
    return emphasis;
}

/**
 * Which shell (by position in `shells`, ascending n — matching the plot's
 * own per-n colour indexing, see App.tsx's atomCurves) has the largest
 * D_n(r) at each grid point.
 *
 * Shells interpenetrate (spec §2), so this is not a hard boundary between
 * them — it is which shell *dominates* the total at that radius, which is
 * what actually determines the hue a viewer sees once the total's own
 * peaks and troughs (`shellEmphasis`) set the luminance (Addendum 2's ring
 * colouring). Near a shell's own peak the total is overwhelmingly that
 * shell's contribution, so this lines up with the rings the emphasis ramp
 * already draws.
 */
function dominantShellIndex(grid: RadialGrid, shells: Array<{ curve: RadialCurve }>): Uint8Array {
    const result = new Uint8Array(grid.size);
    if (shells.length === 0) return result;

    for (let j = 0; j < grid.size; j++) {
        let bestIndex = 0;
        let bestValue = shells[0].curve.values[j];
        for (let i = 1; i < shells.length; i++) {
            const value = shells[i].curve.values[j];
            if (value > bestValue) {
                bestValue = value;
                bestIndex = i;
            }
        }
        result[j] = bestIndex;
    }
    return result;
}

/**
 * Groups already-built subshell curves into shells (by principal quantum
 * number n), summing their D(r) curves and electron counts.
 *
 * `atom.states` (and therefore `subshells`, built from it) is ordered by
 * (n, l) per the AtomSolution contract, so consecutive subshells with equal n
 * can simply be accumulated into the shell currently open — the same
 * grouping trick shellsFor uses in configurations.ts, applied here to curves
 * instead of subshell records.
 */
function groupIntoShells(
    grid: RadialGrid,
    subshells: AtomProfile['subshells'],
    fraction: number
): AtomProfile['shells'] {
    const shells: AtomProfile['shells'] = [];
    for (const subshell of subshells) {
        let shell = shells[shells.length - 1];
        if (!shell || shell.n !== subshell.n) {
            shell = {
                n: subshell.n,
                electrons: 0,
                curve: { label: shellName(subshell.n), values: new Float64Array(grid.size) },
                contourRadius: 0,
                // Placeholder -- filled in below once the curve is fully summed.
                emphasis: new Float32Array(0),
            };
            shells.push(shell);
        }
        shell.electrons += subshell.electrons;
        for (let j = 0; j < grid.size; j++) shell.curve.values[j] += subshell.curve.values[j];
    }
    for (const shell of shells) {
        shell.contourRadius = radiusEnclosing(grid, shell.curve.values, fraction);
        shell.emphasis = shellEmphasis(grid, shell.curve.values, SHELL_EMPHASIS_WINDOW);
    }
    return shells;
}

/**
 * Clearance beyond the valence shell's own D(r) peak that the whole-atom
 * view's sphere must reach (see `displayRadius`). Enough to put the valence
 * ring inside the sphere with room around it, rather than exactly on its
 * rim.
 */
const VALENCE_CLEARANCE = 1.25;

/** Radius at which a curve is largest — the shell's own peak. */
function peakRadius(grid: RadialGrid, values: Float64Array): number {
    let best = 0;
    for (let j = 1; j < grid.size; j++) if (values[j] > values[best]) best = j;
    return grid.r[best];
}

/**
 * Turns a converged AtomSolution into every curve and derived radius the UI
 * needs: the whole-atom D(r), the per-shell and per-subshell D(r) (which sum
 * back up to the total and to their shell respectively, by construction —
 * see subshellCurveOf), a contour radius per shell and for the atom as a
 * whole, and the resolved shell peak positions used by the drill-down UI.
 */
export function buildAtomProfile(atom: AtomSolution, fraction: number): AtomProfile {
    const { grid, Z, states, D } = atom;

    const subshells: AtomProfile['subshells'] = states.map(state => ({
        n: state.n,
        l: state.l,
        electrons: state.electrons,
        energy: state.energy,
        curve: { label: subshellLabel(state.n, state.l), values: subshellCurveOf(state) },
    }));

    const shells = groupIntoShells(grid, subshells, fraction);

    const contourRadius = radiusEnclosing(grid, D, fraction);
    // The outermost shell's own peak. Needed separately from
    // `contourRadius` because an enclosed-*count* contour is dominated by
    // the compact core once there are many electrons: at the default 90%,
    // 34 of the first 56 elements have their valence shell's peak outside
    // it, sodium's by a factor of 1.67. The whole-atom sphere is drawn at
    // the contour, and the cut face is stencilled to the sphere, so for
    // most of the periodic table the valence shell was simply not on
    // screen -- which makes "one lonely s electron outside a closed core"
    // (Addendum 2 §3) impossible to show. Measured, not guessed; see the
    // acceptance test in atom_profile.test.ts.
    const valencePeakRadius = shells.length > 0
        ? peakRadius(grid, shells[shells.length - 1].curve.values)
        : contourRadius;

    return {
        Z,
        grid,
        total: { label: 'total', values: D },
        totalEmphasis: shellEmphasis(grid, D, SHELL_EMPHASIS_WINDOW),
        shells,
        subshells,
        contourRadius,
        valencePeakRadius,
        displayRadius: Math.max(contourRadius, valencePeakRadius * VALENCE_CLEARANCE),
        shellPeaks: findShellPeaks(grid, D),
        shellIndexAtR: dominantShellIndex(grid, shells),
    };
}

/**
 * How far out level 3's marching-cubes sampling box needs to reach to hold
 * one subshell's whole orbital lobe, regardless of what fraction the user
 * later asks the *displayed* surface to enclose.
 *
 * Mirrors `computeSamplingRadius` (orbital_presets.ts, the hydrogen-like
 * counterpart of this function) exactly: same 99.99% cutoff on the radial
 * distribution, same 8% clearance so the surface never touches the wall.
 * That function cannot be reused directly here, even though the reasoning
 * is identical, because it assumes Z_eff = Z -- correct for a hydrogen-like
 * ion, wrong in the opposite direction for a real, screened valence
 * electron (spec bugfix: level 3 was previously sized from the *whole
 * atom's* shared grid instead of the selected subshell's own extent, which
 * for a tightly bound inner subshell -- argon's 2p, say -- left the orbital
 * spanning a couple of voxels out of the grid's full width: too few for
 * marching cubes to resolve, so the surface came out empty).
 *
 * Capped at the shared grid's own outer radius rather than at
 * `MAX_SAMPLING_RADIUS`: that grid is already sized generously enough to
 * hold every occupied subshell's tail (see radial_grid.ts), so this radius
 * -- derived from a curve sampled on that very grid -- can never need to
 * reach further than the grid itself does.
 */
export function subshellSamplingRadius(grid: RadialGrid, curve: Float64Array): number {
    const radius = radiusEnclosing(grid, curve, 0.9999);
    const gridRMax = grid.r[grid.size - 1];
    if (!(radius > 0)) return gridRMax;
    return Math.min(radius * 1.08, gridRMax);
}

/**
 * The bridge to level 3: an interpolating closure over a solved subshell's
 * numerical R(r), with the same `(r: number) => number` signature as the
 * analytic radial factor, so `makeWaveFunctionEvaluator` (Task 8) can take
 * either one interchangeably as its radial override.
 *
 * Throws rather than returning a zero function for an unoccupied (n, l):
 * there is no numerical R to interpolate for a subshell the SCF never
 * solved, and silently returning zero would render as "orbital exists but
 * is empty" instead of the caller's actual mistake.
 */
export function radialFunctionFor(atom: AtomSolution, n: number, l: number): (r: number) => number {
    const state = atom.states.find(s => s.n === n && s.l === l);
    if (!state) {
        throw new Error(`(n=${n}, l=${l}) is not an occupied subshell of Z=${atom.Z}.`);
    }
    return (r: number) => interpolateOnGrid(atom.grid, state.R, r);
}

/**
 * Packs a log-grid curve into a `Float32Array` for the worker boundary /
 * eventual texture upload (ruling R25, superseding the resampleUniform this
 * replaces).
 *
 * Every curve above already lives on the SCF's logarithmic grid — the right
 * representation both for solving the equations *and*, it turns out, for a
 * fragment shader: `r_j = rMin * e^(j*dx)` means a lookup is just
 *
 *   float t = log(r / rMin) / dx;
 *   float texCoord = (t + 0.5) / float(size);
 *
 * exactly what `interpolateOnGrid` computes, on exactly the spacing the data
 * already lives on. The previous approach resampled onto points evenly
 * spaced in r instead, which sounds equivalent but is not: a heavy atom's
 * K-shell peak sits inside the first fraction of a percent of the range (for
 * uranium, r ≈ 0.012 against rMax = 183), so a uniform-in-r table needs
 * thousands of samples to resolve it and silently flattens it at any
 * texture size smaller than that (measured for uranium: 22% of the true
 * peak height survived at 256 samples, 64% at 512, 86% at 2048). Shipping
 * the log-grid values as-is and doing the lookup above in the shader is
 * exact at every scale instead, with no resampling step to get wrong, so
 * packing is nothing more than a float64 -> float32 narrowing cast.
 *
 * Deliberately does *not* normalise or quantise (ruling R16): a shell's D(r)
 * peak can be three orders of magnitude below the atom's innermost peak, and
 * either an 8-bit encoding or a linear normalisation here would flatten the
 * outer shells to nothing before the shader — which reads this through a
 * float texture and applies its own perceptual ramp — ever sees them. A
 * float32 narrowing keeps roughly 7 significant figures at every magnitude
 * (unlike a fixed-point or normalised encoding, precision here doesn't
 * depend on where a value sits in the dynamic range), which is far more than
 * a perceptual ramp needs.
 */
export function packRadialCurve(values: Float64Array): Float32Array {
    return Float32Array.from(values);
}
