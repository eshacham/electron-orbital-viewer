import { linkCorrectionSpoken, linkCorrectionText } from '../src/link_corrections';

// Final fix wave, M5 (ruled): the notice is a live region, so it has a plain spoken copy like the app's other live text.
describe('linkCorrectionSpoken', () => {
    it('leaves a notice with no typeset symbol as it is written', () => {
        const corrections = [{ field: 'Z', asked: '200', used: 'hydrogen (Z = 1)' }];
        expect(linkCorrectionSpoken(corrections)).toBe(linkCorrectionText(corrections));
    });

    it('says mₗ as "m l", the true minus as "minus", and a₀ as "bohr"', () => {
        const corrections = [
            { field: 'mₗ', asked: '-7', used: 'the 2p subshell' },
            { field: 'R', asked: '99 a₀', used: 'R = 20.00 a₀' },
        ];
        expect(linkCorrectionText(corrections)).toBe('This link asked for mₗ = −7; showing the 2p subshell; asked for R = 99 a₀; showing R = 20.00 a₀.');
        expect(linkCorrectionSpoken(corrections)).toBe('This link asked for m l = minus 7; showing the 2p subshell; asked for R = 99 bohr; showing R = 20.00 bohr.');
    });

    it('speaks a minus in the corrected value too, and Unicode subscript digits as plain digits', () => {
        expect(linkCorrectionSpoken([{ field: 'mₗ', asked: '9', used: 'mₗ = −1' }])).toBe('This link asked for m l = 9; showing m l = minus 1.');
        expect(linkCorrectionSpoken([{ field: 'Z', asked: '200', used: 'H₂ (Z = 1)' }])).toContain('H2');
    });
});
