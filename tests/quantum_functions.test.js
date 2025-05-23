// tests/quantum_functions.test.js
import {
    factorial,
    pochhammer,
    binomialCoefficient,
    laguerrePolynomial,
    radialWaveFunction,
    __clearAllCaches__ // Import the cache clearing function
} from '../src/quantum_functions.js';

// Jest provides global functions like `describe`, `it` (or `test`), `expect`

describe('Quantum Functions Module', () => {

    // Clear all caches before each test suite or test run to ensure isolation
    beforeEach(() => {
        __clearAllCaches__();
    });

    describe('factorial function', () => {
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
            expect(() => factorial(-5)).toThrow(Error);
        });
    });

    describe('pochhammer function', () => {
        it('should return 1 for n = 0', () => {
            expect(pochhammer(5, 0)).toBe(1);
            expect(pochhammer(0, 0)).toBe(1);
        });

        it('should calculate pochhammer correctly for positive x and n', () => {
            expect(pochhammer(3, 1)).toBe(3);
            expect(pochhammer(2, 3)).toBe(2 * 3 * 4); // (2)_3 = 2 * (2+1) * (2+2) = 24
            expect(pochhammer(1, 5)).toBe(1 * 2 * 3 * 4 * 5); // (1)_5 = 120
        });

        it('should handle negative x values correctly', () => {
            expect(pochhammer(-2, 3)).toBe(-2 * -1 * 0); // ( -2 )_3 = -2 * (-2+1) * (-2+2) = 0
            expect(pochhammer(-5, 2)).toBe(-5 * -4); // ( -5 )_2 = 20
        });

        it('should return 0 when x is 0 and n > 0', () => {
            expect(pochhammer(0, 4)).toBe(0);
        });

        it('should throw an error for negative n', () => {
            expect(() => pochhammer(10, -1)).toThrow('Pochhammer symbol is not defined for negative n.');
            expect(() => pochhammer(0, -5)).toThrow(Error);
        });
    });

    describe('binomialCoefficient function', () => {
        it('should return 1 for C(n, 0) and C(n, n)', () => {
            expect(binomialCoefficient(5, 0)).toBe(1);
            expect(binomialCoefficient(5, 5)).toBe(1);
            expect(binomialCoefficient(1, 0)).toBe(1);
            expect(binomialCoefficient(1, 1)).toBe(1);
        });

        it('should return 0 when k is out of bounds', () => {
            expect(binomialCoefficient(5, -1)).toBe(0);
            expect(binomialCoefficient(5, 6)).toBe(0);
        });

        it('should calculate binomial coefficients correctly for positive values', () => {
            expect(binomialCoefficient(4, 2)).toBe(6); // 4! / (2! * 2!) = 24 / (2 * 2) = 6
            expect(binomialCoefficient(5, 2)).toBe(10); // 5! / (2! * 3!) = 120 / (2 * 6) = 10
            expect(binomialCoefficient(7, 3)).toBe(35); // 7! / (3! * 4!) = 5040 / (6 * 24) = 35
        });

        it('should use the optimization C(n, k) = C(n, n-k)', () => {
            // Internally, K will be adjusted to 3, so it should be same as C(7,3)
            expect(binomialCoefficient(7, 4)).toBe(35);
            expect(binomialCoefficient(10, 8)).toBe(binomialCoefficient(10, 2)); // 10*9/2 = 45
        });
    });

    describe('laguerrePolynomial function', () => {
        // Test values for Laguerre Polynomials can be found in tables or computed by symbolic math software.
        // L_0^(alpha)(x) = 1
        // L_1^(alpha)(x) = alpha + 1 - x
        // L_2^(alpha)(x) = ( (alpha+2)(alpha+1) - 2x(alpha+2) + x^2 ) / 2
        // L_n^(alpha)(0) = C(n + alpha, n)

        it('should return 1 for L_0^(alpha)(x)', () => {
            expect(laguerrePolynomial(0, 0, 5)).toBe(1);
            expect(laguerrePolynomial(0, 10, 0)).toBe(1);
            expect(laguerrePolynomial(0, -2, 100)).toBe(1); // alpha can be negative in general Laguerre
        });

        it('should calculate L_1^(alpha)(x) correctly', () => {
            // L_1^(0)(x) = 1 - x
            expect(laguerrePolynomial(1, 0, 0)).toBe(1); // 1 - 0
            expect(laguerrePolynomial(1, 0, 1)).toBe(0); // 1 - 1
            expect(laguerrePolynomial(1, 0, 5)).toBe(-4); // 1 - 5

            // L_1^(1)(x) = 2 - x
            expect(laguerrePolynomial(1, 1, 0)).toBe(2);
            expect(laguerrePolynomial(1, 1, 2)).toBe(0);
            expect(laguerrePolynomial(1, 1, -3)).toBe(5);
        });

        it('should calculate L_2^(alpha)(x) correctly', () => {
            // L_2^(0)(x) = (x^2 - 4x + 2) / 2
            expect(laguerrePolynomial(2, 0, 0)).toBe(1); // (0 - 0 + 2)/2 = 1
            expect(laguerrePolynomial(2, 0, 1)).toBe( (1 - 4 + 2) / 2 ); // -0.5
            expect(laguerrePolynomial(2, 0, 2)).toBe( (4 - 8 + 2) / 2 ); // -1

            // L_2^(1)(x) = (x^2 - 6x + 6) / 2
            expect(laguerrePolynomial(2, 1, 0)).toBe(3); // (0 - 0 + 6)/2 = 3
            expect(laguerrePolynomial(2, 1, 1)).toBe( (1 - 6 + 6) / 2 ); // 0.5
            expect(laguerrePolynomial(2, 1, 3)).toBe( (9 - 18 + 6) / 2 ); // -1.5
        });

        it('should calculate L_n^(alpha)(0) correctly (which is C(n + alpha, n))', () => {
            expect(laguerrePolynomial(3, 2, 0)).toBe(binomialCoefficient(3 + 2, 3)); // C(5, 3) = 10
            expect(laguerrePolynomial(2, 0, 0)).toBe(binomialCoefficient(2 + 0, 2)); // C(2, 2) = 1
            expect(laguerrePolynomial(1, 1, 0)).toBe(binomialCoefficient(1 + 1, 1)); // C(2, 1) = 2
        });

        it('should throw an error for negative n', () => {
            expect(() => laguerrePolynomial(-1, 0, 0)).toThrow('Laguerre polynomial degree (n) cannot be negative.');
        });
    });

    describe('radialWaveFunction function', () => {
        // Use a small tolerance for floating point comparisons
        const EPSILON = 1e-9; // or a specific number of decimal places for toBeCloseTo

        // Test Cases for Hydrogen Atom (Z=1)

        it('should calculate R_10(r) (1s orbital) correctly', () => {
            // R_10(r) = 2 * exp(-r)
            // Test at r=0
            expect(radialWaveFunction(1, 0, 0, 1)).toBeCloseTo(2, 9);
            // Test at r=1 (1 Bohr radius)
            expect(radialWaveFunction(1, 0, 1, 1)).toBeCloseTo(2 * Math.exp(-1), 9); // ~0.735758882
            // Test at r=2
            expect(radialWaveFunction(1, 0, 2, 1)).toBeCloseTo(2 * Math.exp(-2), 9); // ~0.270670566
        });

        it('should calculate R_20(r) (2s orbital) correctly', () => {
            // R_20(r) = (1 / (2*sqrt(2))) * (2 - r) * exp(-r/2)
            // Test at r=0
            expect(radialWaveFunction(2, 0, 0, 1)).toBeCloseTo(1 / (2 * Math.sqrt(2)) * 2, 9); // ~0.707106781
            // Test at r=2 (node)
            expect(radialWaveFunction(2, 0, 2, 1)).toBeCloseTo(0, 9); // (2 - 2) term makes it 0
            // Test at r=1
            expect(radialWaveFunction(2, 0, 1, 1)).toBeCloseTo( (1 / (2 * Math.sqrt(2))) * (2 - 1) * Math.exp(-0.5), 9); // ~0.303265329
        });

        it('should calculate R_21(r) (2p orbital) correctly', () => {
            // R_21(r) = (1 / (2*sqrt(6))) * r * exp(-r/2)
            // Test at r=0
            expect(radialWaveFunction(2, 1, 0, 1)).toBeCloseTo(0, 9); // r term makes it 0
            // Test at r=1
            expect(radialWaveFunction(2, 1, 1, 1)).toBeCloseTo((1 / (2 * Math.sqrt(6))) * 1 * Math.exp(-0.5), 9); // ~0.088388347
            // Test at r=2
            expect(radialWaveFunction(2, 1, 2, 1)).toBeCloseTo((1 / (2 * Math.sqrt(6))) * 2 * Math.exp(-1), 9); // ~0.100918073
        });

        // Test with a different Z (e.g., Helium ion He+, Z=2) - though we'll focus on Hydrogen initially
        it('should calculate R_10(r) for He+ (Z=2) correctly', () => {
            // R_10(r, Z=2) = 2 * (2Z/1)^1.5 * exp(-2r) = 2 * 2^1.5 * exp(-2r)
            // R_10(r) = 2 * (2Z/na0)^1.5 * exp(-Zr/na0) (with n=1, a0=1)
            // R_10(r) = 2 * (2Z)^1.5 * exp(-Zr)  (simplified)
            // For Z=2, r=0: 2 * (4)^1.5 = 2 * 8 = 16
            expect(radialWaveFunction(1, 0, 0, 2)).toBeCloseTo(4 * Math.sqrt(2), 9); // Should be 2 * ( (2Z)^3 * (0)! / (2*1 * 1!) )^0.5 = 2 * (8Z^3/2)^0.5 = 2 * sqrt(4Z^3) = 4 * Z^1.5
                                                                                      // For Z=2 => 4 * 2^1.5 = 4 * 2 * sqrt(2) = 8 * sqrt(2)
                                                                                      // My mental calculation was wrong.
                                                                                      // Formula is 2 * (Z/1)^1.5 * exp(-Zr/1). No. It's:
                                                                                      // R_10(r, Z) = sqrt( (2Z)^3 * 0! / (2 * 1!) ) * exp(-Zr/1) = sqrt(8Z^3 / 2) * exp(-Zr) = sqrt(4Z^3) * exp(-Zr) = 2 * Z^1.5 * exp(-Zr)
                                                                                      // So for Z=2, r=0: 2 * 2^1.5 * exp(0) = 2 * 2 * sqrt(2) = 4 * sqrt(2) = 5.656854249
            expect(radialWaveFunction(1, 0, 0, 2)).toBeCloseTo(2 * Math.pow(2, 1.5), 9); // Corrected expected value: 2 * Z^1.5

            // Test at r=0.5 for He+
            expect(radialWaveFunction(1, 0, 0.5, 2)).toBeCloseTo(2 * Math.pow(2, 1.5) * Math.exp(-2 * 0.5), 9);
        });

        // Edge Cases / Invalid Inputs
        it('should throw an error for invalid n', () => {
            expect(() => radialWaveFunction(0, 0, 1)).toThrow("Principal quantum number (n) must be a positive integer.");
            expect(() => radialWaveFunction(1.5, 0, 1)).toThrow("Principal quantum number (n) must be a positive integer.");
            expect(() => radialWaveFunction(-1, 0, 1)).toThrow("Principal quantum number (n) must be a positive integer.");
        });

        it('should throw an error for invalid l', () => {
            expect(() => radialWaveFunction(1, 1, 1)).toThrow("Azimuthal quantum number (l) must be an integer between 0 and n-1."); // l > n-1
            expect(() => radialWaveFunction(2, -1, 1)).toThrow("Azimuthal quantum number (l) must be an integer between 0 and n-1."); // l < 0
            expect(() => radialWaveFunction(2, 0.5, 1)).toThrow("Azimuthal quantum number (l) must be an integer between 0 and n-1."); // l not integer
        });

        it('should throw an error for negative r', () => {
            expect(() => radialWaveFunction(1, 0, -1)).toThrow("Distance (r) cannot be negative.");
        });

        it('should throw an error for invalid Z', () => {
            expect(() => radialWaveFunction(1, 0, 1, 0)).toThrow("Nuclear charge (Z) must be a positive integer.");
            expect(() => radialWaveFunction(1, 0, 1, 1.5)).toThrow("Nuclear charge (Z) must be a positive integer.");
            expect(() => radialWaveFunction(1, 0, 1, -1)).toThrow("Nuclear charge (Z) must be a positive integer.");
        });
    });
});