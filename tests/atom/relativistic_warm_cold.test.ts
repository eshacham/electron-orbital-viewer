/**
 * Ruling C2's check for Task 7: solveSpecies warm-starts a relativistic
 * solve from the same species' converged non-relativistic potential
 * (scf.ts). Task 6 measured that against a cold (screened) start for 11
 * samples -- Au, Au+, Pb2+ and the excitations Cs 6s -> 5d, Cs 6s -> 6d,
 * Au 6s -> 6p, Hg 6s -> 6p, U 7s -> 6d in scalar mode; Au, Cs 6s -> 6p and
 * Na 3s -> 3d with spin-orbit -- one of which (Cs 6s -> 5d) is pinned in
 * scf_relativistic.test.ts. This file extends that measurement to a few
 * heavy ions and excitations outside Task 6's set, as the ruling asks,
 * including an anion (C11's Pb-) to confirm the two starts agree on its
 * verdict too, not only on a number.
 *
 * Measured here (ATOM_SLOW_TESTS=1, ~4 min): every converging pair agrees
 * to <1e-7 relative in total energy, matching Task 6's own measurements (its
 * largest was 6.3e-8); Pb- throws the same UnboundAnionError from both
 * starts. Had any pair disagreed, ruling C2 requires falling back to the
 * screened start -- there is nothing to change here because none did.
 */
import { solveAtomOnGrid, solveSpecies } from '../../src/atom/scf';
import { UnboundAnionError } from '../../src/atom/scf_shared';
import { RelativityMode } from '../../src/atom/relativity';
import { AtomSpecies, speciesConfiguration } from '../../src/atom/species';

jest.setTimeout(600000);
const itSlow = process.env.ATOM_SLOW_TESTS === '1' ? it : it.skip;

/** The same species solved from the screened guess on its own grid, bypassing solveSpecies's seed (as scf_relativistic.test.ts's coldSolve does). */
function coldSolve(species: AtomSpecies, relativity: RelativityMode) {
    const configuration = speciesConfiguration(species);
    const grid = solveSpecies(species).grid;
    return solveAtomOnGrid(species.Z, grid, { configuration, relativity });
}

const excited = (Z: number, charge: number, from: [number, number], to: [number, number]): AtomSpecies =>
    ({ Z, charge, excitation: { from: { n: from[0], l: from[1] }, to: { n: to[0], l: to[1] } } });

const SAMPLES: Array<[string, AtomSpecies, RelativityMode]> = [
    ['Rn 6s -> 6d', excited(86, 0, [6, 0], [6, 2]), 'scalar'],
    ['Lr 7s -> 6d', excited(103, 0, [7, 0], [6, 2]), 'scalar'],
    ['U2+ 5f -> 6d', excited(92, 2, [5, 3], [6, 2]), 'scalar'],
    ['Rn', { Z: 86, charge: 0, excitation: null }, 'spinOrbit'],
    ['Lr', { Z: 103, charge: 0, excitation: null }, 'spinOrbit'],
];

describe('warm vs cold start, heavy samples outside Task 6\'s set (ruling C2)', () => {
    itSlow.each(SAMPLES)('%s (%s) lands where a cold start does', (_label, species, mode) => {
        const warm = solveSpecies(species, mode);
        const cold = coldSolve(species, mode);
        expect(warm.converged && cold.converged).toBe(true);
        expect(Math.abs((warm.totalEnergy - cold.totalEnergy) / cold.totalEnergy)).toBeLessThan(1e-7);
        expect(warm.iterations).toBeLessThanOrEqual(cold.iterations);
    });

    // C11's Pb- is the sweep's hardest anion case: relativity binds 6p
    // slightly less than the Schrödinger equation does, so where the
    // non-relativistic ion is bound the scalar one need not be. Both starts
    // must report the same verdict, not just agree when they both converge.
    itSlow('Pb- reports the same unbound verdict from both starts', () => {
        const species: AtomSpecies = { Z: 82, charge: -1, excitation: null };
        expect(() => solveSpecies(species, 'scalar')).toThrow(UnboundAnionError);
        expect(() => coldSolve(species, 'scalar')).toThrow(UnboundAnionError);
    });
});
