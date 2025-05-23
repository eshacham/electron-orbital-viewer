// tests/quantum_functions.test.js
import { factorial, pochhammer } from '../src/quantum_functions.js';

// Jest provides global functions like `describe`, `it` (or `test`), `expect`
// no need for custom assert functions.

describe('Quantum Functions Module', () => {

    describe('factorial function', () => {
        // Before each test in this suite, clear the cache to ensure isolation
        // This is good practice for functions using memoization in tests
        beforeEach(() => {
            // If you exposed __clearCaches__ for testing:
            // __clearCaches__();
            // Otherwise, we implicitly rely on each test input being unique enough
            // or the cache not causing issues across simple value tests.
            // For these simple functions, it's less critical, but good to remember.
        });

        it('should return 1 for 0!', () => {
            expect(factorial(0)).toBe(1);
        });

        it('should return 1 for 1!', () => {
            expect(factorial(1)).toBe(1);
        });

        it('should calculate factorial for positive integers correctly', () => {
            expect(factorial(5)).toBe(120);
            expect(factorial(7)).toBe(5040);
            expect(factorial(10)).toBe(3628800);
        });

        it('should throw an error for negative numbers', () => {
            expect(() => factorial(-1)).toThrow('Factorial is not defined for negative numbers.');
            expect(() => factorial(-5)).toThrow(Error); // Can just check for any Error type
        });
    });

    describe('pochhammer function', () => {
        beforeEach(() => {
            // Similar cache clearing considerations as above
        });

        it('should return 1 for n = 0', () => {
            expect(pochhammer(5, 0)).toBe(1);
            expect(pochhammer(0, 0)).toBe(1); // Test with x=0, n=0
        });

        it('should calculate pochhammer correctly for positive x and n', () => {
            expect(pochhammer(3, 1)).toBe(3);
            expect(pochhammer(2, 3)).toBe(2 * 3 * 4); // (2)_3 = 2 * (2+1) * (2+2) = 2 * 3 * 4 = 24
            expect(pochhammer(1, 5)).toBe(1 * 2 * 3 * 4 * 5); // (1)_5 = 120
        });

        it('should handle negative x values correctly', () => {
            expect(pochhammer(-2, 3)).toBe(-2 * -1 * 0); // ( -2 )_3 = -2 * (-2+1) * (-2+2) = -2 * -1 * 0 = 0
            expect(pochhammer(-5, 2)).toBe(-5 * -4); // ( -5 )_2 = -5 * (-5+1) = -5 * -4 = 20
        });

        it('should return 0 when x is 0 and n > 0', () => {
            expect(pochhammer(0, 4)).toBe(0);
        });

        it('should throw an error for negative n', () => {
            expect(() => pochhammer(10, -1)).toThrow('Pochhammer symbol is not defined for negative n.');
            expect(() => pochhammer(0, -5)).toThrow(Error);
        });
    });
});