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
