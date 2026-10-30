// tests/format/text.test.ts -- final polish F3: where a held (no-break) fact value may wrap.
import { breakableParts, nb } from '../../src/format/text';

describe('breakableParts', () => {
    it('cuts an energy between its eV and its bracketed Ha', () => {
        expect(breakableParts(nb('−2976.40 eV (−109.38074 Ha)'))).toEqual(['−2976.40\u00A0eV', '(−109.38074\u00A0Ha)']);
    });

    it('returns one part for a value with no "(" and no "·"', () => {
        expect(breakableParts(nb('11.77 eV'))).toEqual(['11.77\u00A0eV']);
        expect(breakableParts('2 electrons in the outer shell')).toEqual(['2 electrons in the outer shell']);
    });

    it('cuts after each "·", keeping the "·" with the part before it', () => {
        expect(breakableParts(nb('a b · c d · e'))).toEqual(['a\u00A0b\u00A0·', 'c\u00A0d\u00A0·', 'e']);
    });

    it('does not cut a "·" that has plain spaces around it (it wraps there already)', () => {
        expect(breakableParts('1.86 D computed · 1.855 D experiment')).toEqual(['1.86 D computed · 1.855 D experiment']);
    });

    it('returns the empty string as one empty part', () => {
        expect(breakableParts('')).toEqual(['']);
    });

    it('cuts after the "," that follows a held figure\'s ")", so a trailing note may wrap', () => {
        expect(breakableParts(nb('−13.63 eV (−0.501 Ha)') + ', upper estimate'))
            .toEqual(['−13.63\u00A0eV', '(−0.501\u00A0Ha),', 'upper estimate']);
        expect(breakableParts(nb('−13.63 eV (−0.501 Ha), upper estimate')))
            .toEqual(['−13.63\u00A0eV', '(−0.501\u00A0Ha),', 'upper\u00A0estimate']);
    });

    it('leaves prose with a plain "), " alone', () => {
        expect(breakableParts('7.902 eV (calculated +1.8 %), measured')).toEqual(['7.902 eV (calculated +1.8 %), measured']);
    });

    it('joined with spaces it reads as the text with only those breaks made plain', () => {
        const text = nb('−2976.40 eV (−109.38074 Ha)');
        expect(breakableParts(text).join(' ')).toBe(text.replace('\u00A0(', ' ('));
    });
});
