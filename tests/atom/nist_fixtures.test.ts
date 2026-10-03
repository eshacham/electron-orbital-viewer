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
