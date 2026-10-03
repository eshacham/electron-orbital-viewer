import { solveAtom, solveAtomOnGrid, solveSpecies } from '../../src/atom/scf';
import { UnboundAnionError } from '../../src/atom/scf_shared';
import { gridForAtom, integrateOnGrid } from '../../src/atom/radial_grid';
import { diracHydrogenicEnergy } from '../../src/atom/relativity';
import { AtomSpecies, neutralGround, speciesConfiguration } from '../../src/atom/species';
import srlda from './fixtures/nist_srlda.json';
import rlda from './fixtures/nist_rlda.json';

jest.setTimeout(600000);

// The default set is built around neon (one non-relativistic, one scalar and
// one spin-orbit solve, each memoised) plus helium, carbon and one- to
// three-electron species, ~12 s in one worker. Argon and heavier, sodium,
// chlorine and the warm-versus-cold comparisons (~2 min) run with
// ATOM_SLOW_TESTS=1.
const SLOW = process.env.ATOM_SLOW_TESTS === '1';
const itSlow = SLOW ? it : it.skip;

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

const excited = (Z: number, from: [number, number], to: [number, number]): AtomSpecies =>
    ({ Z, charge: 0, excitation: { from: { n: from[0], l: from[1] }, to: { n: to[0], l: to[1] } } });

/** The same species solved from the screened guess on its own grid, bypassing solveSpecies's seed. */
function coldSolve(species: AtomSpecies, relativity: 'scalar' | 'spinOrbit') {
    const configuration = speciesConfiguration(species);
    const grid = solveSpecies(species).grid;
    return solveAtomOnGrid(species.Z, grid, { configuration, relativity });
}

describe('relativistic SCF', () => {
    it('leaves the non-relativistic solve exactly as it was', () => {
        expect(solveAtom(10)).toBe(solveAtom(10, 'off'));
        expect(solveAtom(10)).toBe(solveSpecies(neutralGround(10), 'off'));
        expect(solveAtom(10).relativity).toBe('off');
    });

    it('caches each mode separately', () => {
        const scalar = solveAtom(10, 'scalar');
        expect(scalar).toBe(solveAtom(10, 'scalar'));
        expect(scalar).toBe(solveSpecies(neutralGround(10), 'scalar'));
        expect(scalar).not.toBe(solveAtom(10, 'off'));
        expect(scalar).not.toBe(solveAtom(10, 'spinOrbit'));
        expect(scalar.relativity).toBe('scalar');
        expect(scalar.converged).toBe(true);
    });

    it('splits neon\'s 2p into 2p½ (2 e⁻) and 2p³⁄₂ (4 e⁻) with spin–orbit, j - ½ first', () => {
        const atom = solveAtom(10, 'spinOrbit');
        expect(atom.states.map(s => [s.n, s.l, s.j, s.electrons])).toEqual([
            [1, 0, 0.5, 2], [2, 0, 0.5, 2], [2, 1, 0.5, 2], [2, 1, 1.5, 4],
        ]);
        expect(atom.states.every(s => s.Q !== undefined && s.kappa !== undefined)).toBe(true);
        // The configuration stays (n, l): j is a property of the solved states only.
        expect(atom.configuration).toEqual(solveAtom(10).configuration);
        // Scalar states carry Q but no j: one state per subshell, as off.
        expect(solveAtom(10, 'scalar').states.map(s => [s.n, s.l, s.j, s.Q !== undefined])).toEqual([
            [1, 0, undefined, true], [2, 0, undefined, true], [2, 1, undefined, true],
        ]);
    });

    it('conserves the electron count with the small component included', () => {
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            const atom = solveAtom(10, mode);
            expect(integrateOnGrid(atom.grid, atom.D)).toBeCloseTo(10, 4);
        }
    });

    // Spec §5 Phase 4: light atoms agree with NIST's relativistic columns within 0.1 %.
    // Measured for Ne: Etot -128.336 (both columns), 2p½/2p³⁄₂ -0.500020/-0.496212.
    it('Z=10 agrees with NIST ScRLDA and RLDA within 0.1 %', () => {
        expectWithin(solveAtom(10, 'scalar'), (srlda as Fixture).atoms.find(a => a.Z === 10)!, 1e-3);
        expectWithin(solveAtom(10, 'spinOrbit'), (rlda as Fixture).atoms.find(a => a.Z === 10)!, 1e-3);
    });
    itSlow('Z=18 agrees with NIST ScRLDA and RLDA within 0.1 %', () => {
        expectWithin(solveAtom(18, 'scalar'), (srlda as Fixture).atoms.find(a => a.Z === 18)!, 1e-3);
        expectWithin(solveAtom(18, 'spinOrbit'), (rlda as Fixture).atoms.find(a => a.Z === 18)!, 1e-3);
    });

    const movesLessThanTenthOfAPercent = (Z: number) => {
        // Measured: C 0.022 %, Ne 0.080 %. (Ar moves 0.30 % -- see Global Constraints.)
        const off = solveAtom(Z).totalEnergy;
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            expect(Math.abs((solveAtom(Z, mode).totalEnergy - off) / off)).toBeLessThan(1e-3);
        }
    };
    it.each([2, 6, 10])('Z=%i: switching relativity on moves the total energy by less than 0.1 %', movesLessThanTenthOfAPercent);

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
            expect(atom.relativity).toBe(mode);
            expect(Math.abs((atom.totalEnergy - diracHydrogenicEnergy(1, -1, 1)) / atom.totalEnergy)).toBeLessThan(1e-6);
        }
        expect(solveAtom(1).totalEnergy).toBeCloseTo(-0.5, 9);
    });

    // Ruling C3: a one-electron species in a relativistic mode is the sum of
    // occupancy times eigenvalue over its j-levels -- for excited He+ 2p with
    // spin-orbit, a third of an electron in 2p½ and two thirds in 2p³⁄₂.
    it('excited one-electron ions sum their j-levels, against the Dirac oracle', () => {
        const he2p: AtomSpecies = { Z: 2, charge: 1, excitation: { from: { n: 1, l: 0 }, to: { n: 2, l: 1 } } };
        const atom = solveSpecies(he2p, 'spinOrbit');
        expect(atom.states.map(s => [s.n, s.l, s.j])).toEqual([[2, 1, 0.5], [2, 1, 1.5]]);
        expect(atom.states.map(s => s.electrons)).toEqual([1 / 3, 2 / 3]);
        const exact = diracHydrogenicEnergy(2, 1, 2) / 3 + (2 * diracHydrogenicEnergy(2, -2, 2)) / 3;
        expect(Math.abs((atom.totalEnergy - exact) / exact)).toBeLessThan(1e-6);
        expect(atom.charge).toBe(1);
        expect(atom.configuration).toEqual([{ n: 2, l: 1, electrons: 1 }]);
        // Off stays Phase 3's analytic -Z^2/(2n^2), to the bit.
        expect(solveSpecies(he2p).totalEnergy).toBe(-0.5);
    });

    // Ruling C13: the excitation is chosen in (n, l); only then is the
    // promoted electron shared between j-levels by 2j+1.
    it('splits an excited electron by 2j+1 after promotion (Li 2s -> 2p: ⅓ in 2p½, ⅔ in 2p³⁄₂)', () => {
        const atom = solveSpecies(excited(3, [2, 0], [2, 1]), 'spinOrbit');
        expect(atom.converged).toBe(true);
        expect(atom.states.map(s => [s.n, s.l, s.j, s.electrons])).toEqual([[1, 0, 0.5, 2], [2, 1, 0.5, 1 / 3], [2, 1, 1.5, 2 / 3]]);
    });
    itSlow('splits an excited electron by 2j+1 after promotion (Na 3s -> 3p)', () => {
        const atom = solveSpecies(excited(11, [3, 0], [3, 1]), 'spinOrbit');
        expect(atom.converged).toBe(true);
        const p3 = atom.states.filter(s => s.n === 3 && s.l === 1);
        expect(p3.map(s => [s.j, s.electrons])).toEqual([[0.5, 1 / 3], [1.5, 2 / 3]]);
        expect(atom.states.some(s => s.n === 3 && s.l === 0)).toBe(false);
    });

    it('keys ions by species and mode', () => {
        const li: AtomSpecies = { Z: 3, charge: 1, excitation: null };
        const scalar = solveSpecies(li, 'scalar');
        expect(scalar).toBe(solveSpecies(li, 'scalar'));
        expect(scalar).not.toBe(solveSpecies(li));
        expect(scalar).not.toBe(solveSpecies(li, 'spinOrbit'));
        expect(scalar.charge).toBe(1);
        expect(scalar.relativity).toBe('scalar');
        expect(scalar.converged).toBe(true);
    });

    // Ruling C12: the anion guard keeps the non-relativistic bound-state
    // pre-check, so its verdict is the same in every mode.
    it('reports an unbound anion in a relativistic mode too (H⁻)', () => {
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            expect(() => solveSpecies({ Z: 1, charge: -1, excitation: null }, mode)).toThrow(UnboundAnionError);
        }
    });
    // Forced (ruling C12's gap): the non-relativistic pre-check passes but the
    // relativistic solver finds no p state. Real cases are rare -- relativity
    // binds every state of a bare nucleus more -- so the solver is made to
    // fail for l = 1 in a fresh module registry. For an anion that is the
    // unbound verdict, naming the j-level under Dirac; for a neutral atom it
    // stays the solver's own error.
    it('reports the unbound verdict when only the relativistic solve fails to bind', () => {
        jest.isolateModules(() => {
            jest.doMock('../../src/atom/relativistic_solver', () => {
                const actual = jest.requireActual<typeof import('../../src/atom/relativistic_solver')>('../../src/atom/relativistic_solver');
                const noRoot = () => { throw new Error('the potential does not bind it'); };
                return {
                    ...actual,
                    solveScalarRelativisticState: (...args: Parameters<typeof actual.solveScalarRelativisticState>) =>
                        (args[2] === 1 ? noRoot() : actual.solveScalarRelativisticState(...args)),
                    solveDiracState: (...args: Parameters<typeof actual.solveDiracState>) =>
                        ([1, -2].includes(args[2]) ? noRoot() : actual.solveDiracState(...args)),
                };
            });
            const scf = require('../../src/atom/scf') as typeof import('../../src/atom/scf');
            const shared = require('../../src/atom/scf_shared') as typeof import('../../src/atom/scf_shared');
            const fluoride = [{ n: 1, l: 0, electrons: 2 }, { n: 2, l: 0, electrons: 2 }, { n: 2, l: 1, electrons: 6 }];
            const grid = gridForAtom(9, 2);
            const caught = (Z: number, relativity: 'scalar' | 'spinOrbit') => {
                try { scf.solveAtomOnGrid(Z, grid, { configuration: fluoride, relativity }); } catch (error) { return error as Error; }
                throw new Error('expected the solve to throw');
            };

            const scalar = caught(9, 'scalar') as InstanceType<typeof shared.UnboundAnionError>;
            expect(scalar).toBeInstanceOf(shared.UnboundAnionError);
            expect([scalar.n, scalar.l, scalar.j]).toEqual([2, 1, undefined]);
            expect(scalar.message).toContain('its 2p electron');

            const dirac = caught(9, 'spinOrbit') as InstanceType<typeof shared.UnboundAnionError>;
            expect(dirac).toBeInstanceOf(shared.UnboundAnionError);
            expect([dirac.n, dirac.l, dirac.j]).toEqual([2, 1, 0.5]);
            expect(dirac.message).toContain('its 2p½ electron');

            // Ne with the same ten electrons is no anion: the failure is the solver's.
            const neutral = caught(10, 'scalar');
            expect(neutral).not.toBeInstanceOf(shared.UnboundAnionError);
            expect(neutral.message).toBe('the potential does not bind it');
        });
        jest.dontMock('../../src/atom/relativistic_solver');
    });
    itSlow('reports an unbound anion in a relativistic mode too (Cl⁻)', () => {
        for (const mode of ['scalar', 'spinOrbit'] as const) {
            expect(() => solveSpecies({ Z: 17, charge: -1, excitation: null }, mode)).toThrow(UnboundAnionError);
        }
    });

    it('starting from the converged non-relativistic potential reaches the same answer, sooner', () => {
        const grid = gridForAtom(10, 2);
        const seed = solveAtom(10).potential;
        const cold = solveAtomOnGrid(10, grid, { relativity: 'scalar' });
        const warm = solveAtomOnGrid(10, grid, { relativity: 'scalar', startingPotential: seed });
        expect(Math.abs((warm.totalEnergy - cold.totalEnergy) / cold.totalEnergy)).toBeLessThan(1e-7);
        expect(warm.iterations).toBeLessThanOrEqual(cold.iterations);
        // solveSpecies is that warm start (ruling C2), not a second cold one.
        expect(solveAtom(10, 'scalar').totalEnergy).toBe(warm.totalEnergy);
        expect(() => solveAtomOnGrid(10, grid, { relativity: 'scalar', startingPotential: new Float64Array(3) })).toThrow(/grid/);
    });

    // Ruling C2's check for a heavy excitation: started from its own converged
    // non-relativistic potential it reaches the cold start's solution (measured
    // r*|delta V| 1.1e-7, 103 -> 37 iterations).
    itSlow('a heavy excitation (Cs 6s -> 5d) lands where a cold start does', () => {
        const species = excited(55, [6, 0], [5, 2]);
        const warm = solveSpecies(species, 'scalar');
        const cold = coldSolve(species, 'scalar');
        expect(warm.converged && cold.converged).toBe(true);
        expect(Math.abs((warm.totalEnergy - cold.totalEnergy) / cold.totalEnergy)).toBeLessThan(1e-7);
        expect(warm.iterations).toBeLessThan(cold.iterations);
    });

    // No converged answer to start next to: the relativistic loop starts from
    // the screened guess, exactly as a cold solve does.
    itSlow('falls back to the screened start when the non-relativistic solve did not converge (K 4s -> 4d)', () => {
        const species = excited(19, [4, 0], [4, 2]);
        expect(solveSpecies(species).converged).toBe(false);
        expect(solveSpecies(species, 'scalar').totalEnergy).toBe(coldSolve(species, 'scalar').totalEnergy);
    });
});
