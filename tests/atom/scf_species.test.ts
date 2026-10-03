import { solveAtom, solveAtomOnGrid, solveSpecies } from '../../src/atom/scf';
import { UnboundAnionError, screenedStartingPotential } from '../../src/atom/scf_shared';
import { gridForAtom } from '../../src/atom/radial_grid';
import { ionConfigurationFor } from '../../src/atom/ion_configurations';
import { buildAtomProfile } from '../../src/atom/atom_profile';
import { neutralGround, AtomSpecies } from '../../src/atom/species';
import { configurationLabelOf } from '../../src/atom/configurations';

jest.setTimeout(120000);
// Fe2+, Br/Br- and I/I- add ~20 s; gated like scf.test.ts.
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const itSlow = SLOW ? it : it.skip;

const ion = (Z: number, charge: number): AtomSpecies => ({ Z, charge, excitation: null });
const radii = (s: AtomSpecies) => {
    const profile = buildAtomProfile(solveSpecies(s), 0.9);
    return { contour: profile.contourRadius, display: profile.displayRadius };
};

describe('solveSpecies', () => {
    it('solveAtom(Z) is the neutral ground state, one cached object', () => {
        expect(solveSpecies(neutralGround(10))).toBe(solveAtom(10));
        expect(solveAtom(10).charge).toBe(0);
    });

    it('solves Na+ with ten electrons, and draws it smaller than Na (spec: Na+ < Na)', () => {
        const sodiumIon = solveSpecies(ion(11, 1));
        expect(sodiumIon.converged).toBe(true);
        expect(sodiumIon.charge).toBe(1);
        expect(sodiumIon.states.reduce((sum, s) => sum + s.electrons, 0)).toBe(10);
        const neutral = radii(neutralGround(11));
        const cation = radii(ion(11, 1));
        expect(cation.contour).toBeLessThan(neutral.contour);     // measured 1.275 < 1.939
        expect(cation.display).toBeLessThan(neutral.display);
    });

    it('solves one-electron species exactly, excited ones included', () => {
        expect(solveSpecies(ion(2, 1)).totalEnergy).toBeCloseTo(-2, 9);
        const li2 = solveAtomOnGrid(3, gridForAtom(3, 1), { configuration: [{ n: 1, l: 0, electrons: 1 }] });
        expect(li2.totalEnergy).toBeCloseTo(-4.5, 9);
        const h2p = solveSpecies({ Z: 1, charge: 0, excitation: { from: { n: 1, l: 0 }, to: { n: 2, l: 1 } } });
        expect(h2p.totalEnergy).toBeCloseTo(-0.125, 9);
        expect(h2p.states[0].energy).toBeCloseTo(-0.125, 6);
    });

    it('moves the electron for an excited state: Na 3s -> 3p converges with 3p occupied', () => {
        const excited = solveSpecies({ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } });
        expect(excited.converged).toBe(true);
        expect(configurationLabelOf(excited.configuration)).toBe('1s² 2s² 2p⁶ 3p¹');
        expect(excited.totalEnergy).toBeGreaterThan(solveAtom(11).totalEnergy);
    });

    it('reports H- and Cl- as unbound in LDA instead of returning a picture', () => {
        for (const [Z, n, l, label] of [[1, 1, 0, '1s'], [17, 3, 1, '3p']] as const) {
            let caught: unknown;
            try { solveSpecies(ion(Z, -1)); } catch (error) { caught = error; }
            expect(caught).toBeInstanceOf(UnboundAnionError);
            expect((caught as UnboundAnionError).message).toMatch(/^LDA does not bind this anion/);
            expect((caught as UnboundAnionError).message).toContain(`its ${label} electron`);
            expect([(caught as UnboundAnionError).n, (caught as UnboundAnionError).l]).toEqual([n, l]);
        }
    });

    // Final review I2 / Phase 4: an optional starting potential, additive --
    // omitted, the loop starts from the screened guess exactly as before.
    it('starts from a supplied potential: same answer, and only on its own grid', () => {
        const grid = gridForAtom(11);
        const cold = solveAtomOnGrid(11, grid, { configuration: ionConfigurationFor(11, 1) });
        const warm = solveAtomOnGrid(11, grid, { configuration: ionConfigurationFor(11, 1), startingPotential: solveAtom(11).potential });
        expect(warm.converged).toBe(true);
        expect(Math.abs((warm.totalEnergy - cold.totalEnergy) / cold.totalEnergy)).toBeLessThan(1e-7);
        expect(() => solveAtomOnGrid(11, grid, { startingPotential: new Float64Array(3) })).toThrow(/grid/);
    });

    it('defaults to the screened start, bit for bit (neutral atoms unchanged)', () => {
        const grid = gridForAtom(6);
        const omitted = solveAtomOnGrid(6, grid);
        const explicit = solveAtomOnGrid(6, grid, { startingPotential: screenedStartingPotential(grid, 6) });
        expect(explicit.iterations).toBe(omitted.iterations);
        expect(explicit.totalEnergy).toBe(omitted.totalEnergy);
        expect(Array.from(explicit.potential)).toEqual(Array.from(omitted.potential));
    });

    it('refuses a configuration with no electrons', () => {
        expect(() => solveAtomOnGrid(1, gridForAtom(1), { configuration: [] })).toThrow(/no electrons/);
    });

    itSlow('solves Fe2+ as [Ar] 3d6', () => {
        const fe2 = solveSpecies(ion(26, 2));
        expect(fe2.converged).toBe(true);
        expect(configurationLabelOf(fe2.configuration)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶');
    });

    itSlow('orders radii Br < Br- and I < I- where LDA binds them (spec: X < X- where bound)', () => {
        for (const Z of [35, 53]) {
            const neutral = radii(neutralGround(Z));
            const anion = radii(ion(Z, -1));
            expect(anion.contour).toBeGreaterThan(neutral.contour);   // measured Br 1.858 < Br- 2.073, I 1.804 < I- 1.997
            expect(anion.display).toBeGreaterThan(neutral.display);
        }
    });
});
