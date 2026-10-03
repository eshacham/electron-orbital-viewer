/**
 * "What changed" (spec §5 Phase 4): how far relativity pulls the valence s
 * shell in, as the change in its mean radius <r> between a non-relativistic
 * and a relativistic solve of the same species with the same functional
 * otherwise. The valence s is the one to report because it is where the
 * effect is largest and best known -- gold's 6s contraction is the textbook
 * reason gold is yellow.
 *
 * The baseline is the same species' own non-relativistic solve (ruling C5),
 * never the neutral atom's: for an ion or an excited atom, comparing against
 * the neutral would mix ionisation or promotion into a number that claims to
 * be relativity alone.
 */
import { RadialGrid, integrateOnGrid } from './radial_grid';
import { RadialState } from './radial_solver';
import { AtomSolution } from './scf';
import { subshellLabel } from './configurations';

export interface ValenceSContraction {
    n: number;
    /** "6s", or "6s½" with spin–orbit. */
    label: string;
    nonRelativisticMeanRadius: number;
    relativisticMeanRadius: number;
    /** 100 (<r>_NR - <r>_rel) / <r>_NR; positive means the shell contracted. */
    contractionPercent: number;
}

/** <r> = ∫ (u² + Q²) r dr for a normalised state; the small component Q is part of the density. */
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

/**
 * Null when there is no s to compare (no s electron at all) or the two
 * solves' outermost s differ in n -- they cannot for one species, whose
 * configuration both solves share, but a mismatched pair must not be read
 * as a contraction of one shell.
 */
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
