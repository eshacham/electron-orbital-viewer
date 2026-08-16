import {
    ELEMENTS,
    elementFor,
    elementLabel,
    MIN_ATOMIC_NUMBER,
    MAX_ATOMIC_NUMBER,
} from '../src/elements';

describe('elements', () => {
    it('covers Z = 1 to 118 with no gaps', () => {
        expect(MIN_ATOMIC_NUMBER).toBe(1);
        expect(MAX_ATOMIC_NUMBER).toBe(118);
        ELEMENTS.forEach((element, index) => {
            expect(element.atomicNumber).toBe(index + 1);
        });
    });

    it('has a unique symbol and name for every element', () => {
        expect(new Set(ELEMENTS.map(e => e.symbol)).size).toBe(ELEMENTS.length);
        expect(new Set(ELEMENTS.map(e => e.name)).size).toBe(ELEMENTS.length);
    });

    it('uses well-formed symbols', () => {
        for (const element of ELEMENTS) {
            expect(element.symbol).toMatch(/^[A-Z][a-z]?$/);
            expect(element.name).toMatch(/^[A-Z][a-z]+$/);
        }
    });

    it.each([
        [1, 'H', 'Hydrogen'],
        [2, 'He', 'Helium'],
        [6, 'C', 'Carbon'],
        [26, 'Fe', 'Iron'],
        [79, 'Au', 'Gold'],
        [92, 'U', 'Uranium'],
        [118, 'Og', 'Oganesson'],
    ])('knows Z=%i is %s (%s)', (atomicNumber, symbol, name) => {
        const element = elementFor(atomicNumber)!;
        expect(element.symbol).toBe(symbol);
        expect(element.name).toBe(name);
    });

    it('returns nothing outside the table', () => {
        expect(elementFor(0)).toBeNull();
        expect(elementFor(119)).toBeNull();
        expect(elementFor(-1)).toBeNull();
    });

    it('labels an element with its number, symbol and name', () => {
        expect(elementLabel(6)).toBe('6 — C (Carbon)');
    });

    it('falls back to the bare number for an unknown Z', () => {
        expect(elementLabel(200)).toBe('200');
    });
});
