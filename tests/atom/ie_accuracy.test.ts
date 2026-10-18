/**
 * Ruling P15 (R-accuracy): the extended NIST first-ionisation table (every
 * Z the app offers, not only H-Ar) and the accuracy helpers that turn a
 * calculated value and its NIST reference into a signed percent and a
 * limitation note.
 */
import { NIST_FIRST_IONISATION_EV } from '../../src/atom/ionisation_references';
import { signedDifferencePercent, formatSignedPercent, ieLimitationNote, IE_LIMITATION_NOTE } from '../../src/atom/ie_accuracy';
import { neutralGround } from '../../src/atom/species';

// The original H-Ar table (Task 6, spec §3.2), full precision: Phase 3's 10
// % validation reads these, so the extension must not perturb them.
const ORIGINAL_H_TO_AR: Readonly<Record<number, number>> = {
    1: 13.598434599702, 2: 24.587389011, 3: 5.391714996, 4: 9.322699, 5: 8.298019, 6: 11.2602880,
    7: 14.53413, 8: 13.618055, 9: 17.42282, 10: 21.564541, 11: 5.13907696, 12: 7.646236,
    13: 5.985769, 14: 8.15168, 15: 10.486686, 16: 10.3600167, 17: 12.967633, 18: 15.7596119,
};

describe('NIST_FIRST_IONISATION_EV extended to Z = 103', () => {
    it('has an entry for every Z in 1..103 and none above', () => {
        for (let Z = 1; Z <= 103; Z++) expect(NIST_FIRST_IONISATION_EV[Z]).not.toBeUndefined();
        expect(Object.keys(NIST_FIRST_IONISATION_EV).map(Number).sort((a, b) => a - b))
            .toEqual(Array.from({ length: 103 }, (_, i) => i + 1));
    });

    it('keeps the H-Ar values byte-identical to the original table', () => {
        for (const [Z, value] of Object.entries(ORIGINAL_H_TO_AR)) {
            expect(NIST_FIRST_IONISATION_EV[Number(Z)]).toBe(value);
        }
    });

    it('spot-checks the heavy elements this task investigated', () => {
        expect(NIST_FIRST_IONISATION_EV[91]).toBe(5.89);     // Pa
        expect(NIST_FIRST_IONISATION_EV[26]).toBe(7.902);    // Fe
        expect(NIST_FIRST_IONISATION_EV[90]).toBe(6.307);    // Th
        expect(NIST_FIRST_IONISATION_EV[92]).toBe(6.194);    // U
    });
});

describe('signedDifferencePercent', () => {
    it('is (calc - meas) / meas * 100', () => {
        expect(signedDifferencePercent(7.38, 5.89)).toBeCloseTo(25.297, 2);
        expect(signedDifferencePercent(5.89, 5.89)).toBe(0);
    });
});

describe('formatSignedPercent', () => {
    it('signs a positive difference with +', () => {
        expect(formatSignedPercent(25.3)).toBe('+25.3 %');
    });

    it('signs a negative difference with the U+2212 minus sign', () => {
        expect(formatSignedPercent(-0.4)).toBe('−0.4 %');
    });

    it('never shows a signed near-zero', () => {
        expect(formatSignedPercent(-0.04)).toBe('0.0 %');
        expect(formatSignedPercent(0)).toBe('0.0 %');
    });
});

describe('ieLimitationNote', () => {
    it('notes a large error even for a main-group element', () => {
        expect(ieLimitationNote(neutralGround(91), 25.3)).toBe(IE_LIMITATION_NOTE);
        expect(ieLimitationNote(neutralGround(11), 12)).toBe(IE_LIMITATION_NOTE);
    });

    it('notes an open d/f subshell even when the error is small', () => {
        expect(ieLimitationNote(neutralGround(26), 2.1)).toBe(IE_LIMITATION_NOTE);
    });

    it('is null for a small error on a main-group element', () => {
        expect(ieLimitationNote(neutralGround(11), 3.0)).toBeNull();
    });

    it('is null with no percent and no open d/f subshell', () => {
        expect(ieLimitationNote(neutralGround(11), null)).toBeNull();
    });
});
