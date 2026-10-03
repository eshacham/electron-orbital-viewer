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

    // Gated: about 3 s under jest, past the default suite's ~2 s budget.
    // Measured: 0.112 %. Neon below keeps a positive contraction in the
    // default run.
    itSlow('is small and positive for sodium\'s 3s', () => {
        const change = valenceSContraction(solveAtom(11), solveAtom(11, 'scalar'))!;
        expect(change.n).toBe(3);
        expect(change.contractionPercent).toBeGreaterThan(0);
        expect(change.contractionPercent).toBeLessThan(5);
    });

    it('labels the j-level with spin–orbit, and the shell contracts', () => {
        const change = valenceSContraction(solveAtom(10), solveAtom(10, 'spinOrbit'))!;
        expect(change.label).toBe('2s½');
        expect(change.contractionPercent).toBeGreaterThan(0);
        expect(change.contractionPercent).toBeLessThan(1);
    });

    // Relativistic 6s contraction of gold is the textbook ~17-20 % (Pyykkö, Chem. Rev. 88, 563 (1988)).
    itSlow('contracts gold\'s 6s by tens of percent', () => {
        const change = valenceSContraction(solveAtom(79), solveAtom(79, 'scalar'))!;
        expect(change.label).toBe('6s');
        expect(change.contractionPercent).toBeGreaterThan(10);
        expect(change.contractionPercent).toBeLessThan(25);
    });
});
