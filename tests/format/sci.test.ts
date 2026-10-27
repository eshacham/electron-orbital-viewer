import { formatSci, minus, typedPointGroup, orbitalParts } from '../../src/format/sci';

describe('formatSci', () => {
    it('switches to × 10ⁿ notation below 0.1', () => {
        expect(formatSci(0.0266)).toBe('2.66 × 10⁻²');
    });

    it('keeps plain decimal notation in the normal range', () => {
        expect(formatSci(5.52)).toBe('5.52');
    });

    it('uses a true minus sign for a negative plain value', () => {
        expect(formatSci(-5.52)).toBe('−5.52');
    });

    it('uses a true minus sign in both the mantissa and the exponent', () => {
        expect(formatSci(-0.0266)).toBe('−2.66 × 10⁻²');
    });

    it('switches to × 10ⁿ notation above the requested digits', () => {
        // 1234 has 4 digits before the decimal point, past the default 3 sig figs.
        expect(formatSci(1234)).toBe('1.23 × 10³');
    });

    it('honours a custom digit count', () => {
        expect(formatSci(0.0266, 2)).toBe('2.7 × 10⁻²');
    });
});

describe('minus', () => {
    it('turns a hyphen-minus right before a digit into U+2212', () => {
        expect(minus('-5')).toBe('−5');
        expect(minus('-0.02')).toBe('−0.02');
    });

    it('leaves a hyphen that is not followed by a digit alone', () => {
        expect(minus('sp-hybrid')).toBe('sp-hybrid');
    });

    it('converts every qualifying hyphen in the string', () => {
        expect(minus('-5 to -3')).toBe('−5 to −3');
    });

    // Ruling T3-minus: a hyphen is a sign only at the start of the string, after whitespace,
    // '(' or '=', with a digit after it — never between two digits, so a numeral range is left
    // alone rather than misread as a single negative number or a subtraction.
    it('never converts a hyphen between two digits (a range, not a sign)', () => {
        expect(minus('2-5')).toBe('2-5');
        expect(minus('100-200 K')).toBe('100-200 K');
    });

    it('converts a hyphen after whitespace, "(" or "="', () => {
        expect(minus('x = -0.5')).toBe('x = −0.5');
        expect(minus('(-3)')).toBe('(−3)');
        expect(minus('-0.199 Ha')).toBe('−0.199 Ha');
    });
});

describe('typedPointGroup', () => {
    it.each([
        ['C2v', 'C₂ᵥ'],
        ['D6h', 'D₆ₕ'],
        ['Dooh', 'D∞h'],
        ['Coov', 'C∞v'],
        ['Cs', 'Cₛ'],
    ])('types %s as %s', (pg, expected) => {
        expect(typedPointGroup(pg)).toBe(expected);
    });
});

describe('orbitalParts', () => {
    it("splits d_z² into base '3d' and sub 'z²'", () => {
        expect(orbitalParts(3, 2, 0)).toEqual({ base: '3d', sub: 'z²' });
    });

    it("splits p_x into base '2p' and sub 'x'", () => {
        expect(orbitalParts(2, 1, 1)).toEqual({ base: '2p', sub: 'x' });
    });

    it('has no sub past f, where orbitalName keeps the mₗ form instead', () => {
        expect(orbitalParts(7, 4, 2).sub).toBeNull();
        expect(orbitalParts(7, 4, 2).base).toBe('7g (mₗ = +2)');
    });

    it('has no sub for an s orbital either, since there is nothing to subscript', () => {
        expect(orbitalParts(1, 0, 0)).toEqual({ base: '1s', sub: null });
    });
});
