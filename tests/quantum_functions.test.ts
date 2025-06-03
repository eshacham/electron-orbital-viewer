// tests/quantum_functions.test.ts
import {
    factorial,
    pochhammer,
    binomialCoefficient,
    laguerrePolynomial,
    radialWaveFunction,
    associatedLegendrePolynomial,
    realSphericalHarmonic,
    atomicOrbitalProbabilityDensity,
    generateOrbitalData,
    __clearAllCaches__ // Import the cache clearing function
} from '../src/quantum_functions'; // .js extension is no longer needed for TS imports

// Jest provides global functions like `describe`, `it` (or `test`), `expect`

describe('Quantum Functions Module', () => {
    const EPSILON: number = 1e-9;
    const Z_H: number = 1;

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
            expect(() => factorial(-5)).toThrow(Error); // Can also check for specific error message
        });
    });

    describe('pochhammer function', () => {
        it('should return 1 for n = 0', () => {
            expect(pochhammer(5, 0)).toBe(1);
            expect(pochhammer(0, 0)).toBe(1);
        });

        it('should calculate pochhammer correctly for positive x and n', () => {
            expect(pochhammer(3, 1)).toBe(3);
            expect(pochhammer(2, 3)).toBe(2 * 3 * 4); // 24
            expect(pochhammer(1, 5)).toBe(1 * 2 * 3 * 4 * 5); // 120
        });

        it('should handle negative x values correctly', () => {
            expect(pochhammer(-2, 3)).toBe(-2 * -1 * 0); // 0
            expect(pochhammer(-5, 2)).toBe(-5 * -4); // 20
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
            expect(binomialCoefficient(4, 2)).toBe(6);
            expect(binomialCoefficient(5, 2)).toBe(10);
            expect(binomialCoefficient(7, 3)).toBe(35);
        });

        it('should use the optimization C(n, k) = C(n, n-k)', () => {
            expect(binomialCoefficient(7, 4)).toBe(35);
            expect(binomialCoefficient(10, 8)).toBe(binomialCoefficient(10, 2)); // 45
        });
    });

    describe('laguerrePolynomial function', () => {
        it('should return 1 for L_0^(alpha)(x)', () => {
            expect(laguerrePolynomial(0, 0, 5)).toBe(1);
            expect(laguerrePolynomial(0, 10, 0)).toBe(1);
            expect(laguerrePolynomial(0, -2, 100)).toBe(1);
        });

        it('should calculate L_1^(alpha)(x) correctly', () => {
            expect(laguerrePolynomial(1, 0, 0)).toBe(1);
            expect(laguerrePolynomial(1, 0, 1)).toBe(0);
            expect(laguerrePolynomial(1, 0, 5)).toBe(-4);

            expect(laguerrePolynomial(1, 1, 0)).toBe(2);
            expect(laguerrePolynomial(1, 1, 2)).toBe(0);
            expect(laguerrePolynomial(1, 1, -3)).toBe(5);
        });

        it('should calculate L_2^(alpha)(x) correctly', () => {
            expect(laguerrePolynomial(2, 0, 0)).toBe(1);
            expect(laguerrePolynomial(2, 0, 1)).toBeCloseTo((1 - 4 + 2) / 2, 9); // -0.5
            expect(laguerrePolynomial(2, 0, 2)).toBeCloseTo((4 - 8 + 2) / 2, 9); // -1

            expect(laguerrePolynomial(2, 1, 0)).toBe(3);
            expect(laguerrePolynomial(2, 1, 1)).toBeCloseTo((1 - 6 + 6) / 2, 9); // 0.5
            expect(laguerrePolynomial(2, 1, 3)).toBeCloseTo((9 - 18 + 6) / 2, 9); // -1.5
        });

        it('should calculate L_n^(alpha)(0) correctly (which is C(n + alpha, n))', () => {
            expect(laguerrePolynomial(3, 2, 0)).toBe(binomialCoefficient(3 + 2, 3)); // 10
            expect(laguerrePolynomial(2, 0, 0)).toBe(binomialCoefficient(2 + 0, 2)); // 1
            expect(laguerrePolynomial(1, 1, 0)).toBe(binomialCoefficient(1 + 1, 1)); // 2
        });

        it('should throw an error for negative n', () => {
            expect(() => laguerrePolynomial(-1, 0, 0)).toThrow('Laguerre polynomial degree (n) cannot be negative.');
        });
    });

    describe('radialWaveFunction function', () => {
        const Z_H: number = 1; // Hydrogen Atom

        it('should calculate R_10(r) (1s orbital) correctly', () => {
            expect(radialWaveFunction(1, 0, 0, Z_H)).toBeCloseTo(2, 9);
            expect(radialWaveFunction(1, 0, 1, Z_H)).toBeCloseTo(2 * Math.exp(-1), 9);
            expect(radialWaveFunction(1, 0, 2, Z_H)).toBeCloseTo(2 * Math.exp(-2), 9);
        });

        it('should calculate R_20(r) (2s orbital) correctly', () => {
            expect(radialWaveFunction(2, 0, 0, Z_H)).toBeCloseTo(1 / (2 * Math.sqrt(2)) * 2, 9);
            expect(radialWaveFunction(2, 0, 2, Z_H)).toBeCloseTo(0, 9); // Node
            expect(radialWaveFunction(2, 0, 1, Z_H)).toBeCloseTo((1 / (2 * Math.sqrt(2))) * (2 - 1) * Math.exp(-0.5), 9);
        });

        it('should calculate R_21(r) (2p orbital) correctly', () => {
            expect(radialWaveFunction(2, 1, 0, Z_H)).toBeCloseTo(0, 9);
            expect(radialWaveFunction(2, 1, 1, Z_H)).toBeCloseTo((1 / (2 * Math.sqrt(6))) * 1 * Math.exp(-0.5), 9);
            expect(radialWaveFunction(2, 1, 2, Z_H)).toBeCloseTo((1 / (2 * Math.sqrt(6))) * 2 * Math.exp(-1), 9);
        });

        it('should calculate R_10(r) for He+ (Z=2) correctly', () => {
            const Z_He_plus: number = 2;
            expect(radialWaveFunction(1, 0, 0, Z_He_plus)).toBeCloseTo(2 * Math.pow(Z_He_plus, 1.5), 9);
            expect(radialWaveFunction(1, 0, 0.5, Z_He_plus)).toBeCloseTo(2 * Math.pow(Z_He_plus, 1.5) * Math.exp(-Z_He_plus * 0.5), 9);
        });

        it('should throw an error for invalid n', () => {
            expect(() => radialWaveFunction(0, 0, 1)).toThrow("Principal quantum number (n) must be a positive integer.");
            expect(() => radialWaveFunction(1.5, 0, 1)).toThrow("Principal quantum number (n) must be a positive integer.");
        });

        it('should throw an error for invalid l', () => {
            expect(() => radialWaveFunction(1, 1, 1)).toThrow("Azimuthal quantum number (l) must be an integer between 0 and n-1.");
            expect(() => radialWaveFunction(2, -1, 1)).toThrow("Azimuthal quantum number (l) must be an integer between 0 and n-1.");
        });

        it('should throw an error for negative r', () => {
            expect(() => radialWaveFunction(1, 0, -1)).toThrow("Distance (r) cannot be negative.");
        });

        it('should throw an error for invalid Z', () => {
            expect(() => radialWaveFunction(1, 0, 1, 0)).toThrow("Nuclear charge (Z) must be a positive integer.");
        });
    });

    describe('associatedLegendrePolynomial function', () => {
        const EPSILON: number = 1e-9;

        it('should return 0 when m > l', () => {
            expect(associatedLegendrePolynomial(0, 1, 0.5)).toBeCloseTo(0, EPSILON);
            expect(associatedLegendrePolynomial(1, 2, 0.5)).toBeCloseTo(0, EPSILON);
        });

        it('should return 1 for P_0^0(x)', () => {
            expect(associatedLegendrePolynomial(0, 0, 0)).toBeCloseTo(1, EPSILON);
            expect(associatedLegendrePolynomial(0, 0, 0.5)).toBeCloseTo(1, EPSILON);
        });

        it('should calculate P_1^0(x) correctly', () => {
            expect(associatedLegendrePolynomial(1, 0, 0.5)).toBeCloseTo(0.5, EPSILON);
        });

        it('should calculate P_1^1(x) correctly', () => {
            expect(associatedLegendrePolynomial(1, 1, 0)).toBeCloseTo(1, EPSILON);
            expect(associatedLegendrePolynomial(1, 1, 0.6)).toBeCloseTo(Math.sqrt(1 - 0.6 * 0.6), EPSILON);
            expect(associatedLegendrePolynomial(1, 1, 1)).toBeCloseTo(0, EPSILON);
        });

        it('should calculate P_2^0(x) correctly', () => {
            expect(associatedLegendrePolynomial(2, 0, 0)).toBeCloseTo(0.5 * (3 * 0 * 0 - 1), EPSILON); // -0.5
            expect(associatedLegendrePolynomial(2, 0, 1)).toBeCloseTo(1, EPSILON);
        });

        it('should calculate P_2^1(x) correctly', () => {
            expect(associatedLegendrePolynomial(2, 1, 0.5)).toBeCloseTo(3 * 0.5 * Math.sqrt(1 - 0.25), EPSILON);
        });

        it('should calculate P_2^2(x) correctly', () => {
            expect(associatedLegendrePolynomial(2, 2, 0)).toBeCloseTo(3, EPSILON);
            expect(associatedLegendrePolynomial(2, 2, 0.5)).toBeCloseTo(3 * (1 - 0.25), EPSILON);
        });

        it('should throw an error for negative l', () => {
            expect(() => associatedLegendrePolynomial(-1, 0, 0)).toThrow('Associated Legendre Polynomial \'l\' parameter must be a non-negative integer.');
        });

        it('should throw an error for m < 0', () => {
            expect(() => associatedLegendrePolynomial(1, -1, 0)).toThrow('Associated Legendre Polynomial \'m\' parameter must be a non-negative integer.');
        });

        // The function now clamps x, so this specific error won't be thrown.
        // Instead, it will calculate with the clamped value.
        // We can test the clamping behavior if desired, or remove this test.
        // it('should throw an error for x out of range [-1, 1]', () => {
        //     expect(() => associatedLegendrePolynomial(1, 0, 1.1)).toThrow("Associated Legendre Polynomial 'x' parameter must be between -1 and 1 (inclusive).");
        // });
        it('should clamp x if slightly out of range [-1, 1] and compute', () => {
            // P_1^0(x) = x
            expect(associatedLegendrePolynomial(1, 0, 1.0000000001)).toBeCloseTo(1, EPSILON);
            expect(associatedLegendrePolynomial(1, 0, -1.0000000001)).toBeCloseTo(-1, EPSILON);
        });
    });

    describe('realSphericalHarmonic function', () => {
        const EPSILON: number = 1e-9;

        it('should calculate Y_00 (s-orbital) correctly', () => {
            const expected: number = 1 / Math.sqrt(4 * Math.PI);
            expect(realSphericalHarmonic(0, 0, 0, 0)).toBeCloseTo(expected, EPSILON);
            expect(realSphericalHarmonic(0, 0, Math.PI / 2, Math.PI)).toBeCloseTo(expected, EPSILON);
        });

        it('should calculate Y_10 (p_z orbital) correctly', () => {
            const factor: number = Math.sqrt(3 / (4 * Math.PI));
            expect(realSphericalHarmonic(1, 0, 0, 0)).toBeCloseTo(factor * Math.cos(0), EPSILON);
            expect(realSphericalHarmonic(1, 0, Math.PI / 2, 0)).toBeCloseTo(0, EPSILON); // cos(PI/2) = 0
        });

        it('should calculate Y_11 (p_x orbital) correctly', () => {
            const factor: number = Math.sqrt(3 / (4 * Math.PI)) * Math.sqrt(2); // Real form has sqrt(2)
            expect(realSphericalHarmonic(1, 1, Math.PI / 2, 0)).toBeCloseTo(factor * Math.sin(Math.PI / 2) * Math.cos(0), EPSILON);
            expect(realSphericalHarmonic(1, 1, Math.PI / 2, Math.PI / 2)).toBeCloseTo(0, EPSILON); // cos(phi) = 0
        });

        it('should calculate Y_1-1 (p_y orbital) correctly', () => {
            const factor: number = Math.sqrt(3 / (4 * Math.PI)) * Math.sqrt(2); // Real form has sqrt(2)
            expect(realSphericalHarmonic(1, -1, Math.PI / 2, Math.PI / 2)).toBeCloseTo(factor * Math.sin(Math.PI / 2) * Math.sin(Math.PI / 2), EPSILON);
            expect(realSphericalHarmonic(1, -1, Math.PI / 2, 0)).toBeCloseTo(0, EPSILON); // sin(phi) = 0
        });

        it('should calculate Y_20 (d_z^2 orbital) correctly', () => {
            const factor: number = Math.sqrt(5 / (16 * Math.PI));
            expect(realSphericalHarmonic(2, 0, 0, 0)).toBeCloseTo(factor * (3 * Math.pow(Math.cos(0), 2) - 1), EPSILON);
            expect(realSphericalHarmonic(2, 0, Math.PI / 2, 0)).toBeCloseTo(factor * (3 * Math.pow(Math.cos(Math.PI/2), 2) - 1), EPSILON); // -factor
        });

        // Add more d-orbital tests if desired, similar to above

        it('should throw an error for negative l', () => {
            expect(() => realSphericalHarmonic(-1, 0, 0, 0)).toThrow("Spherical Harmonic 'l' parameter must be a non-negative integer.");
        });

        it('should throw an error for ml out of range', () => {
            expect(() => realSphericalHarmonic(1, 2, 0, 0)).toThrow("Spherical Harmonic 'ml' parameter must be an integer between -l and l (inclusive).");
        });

        // The function now clamps theta, so this specific error won't be thrown.
        // it('should throw an error for theta out of range', () => {
        //     expect(() => realSphericalHarmonic(0, 0, -0.1, 0)).toThrow("Spherical Harmonic 'theta' parameter must be between 0 and PI radians.");
        // });
        it('should clamp theta if slightly out of range [0, PI] and compute', () => {
            const expected = 1 / Math.sqrt(4 * Math.PI);
            expect(realSphericalHarmonic(0, 0, -0.0000000001, 0)).toBeCloseTo(expected, EPSILON);
            expect(realSphericalHarmonic(0, 0, Math.PI + 0.0000000001, 0)).toBeCloseTo(expected, EPSILON);
        });
    });

    describe('atomicOrbitalProbabilityDensity function', () => {
        const EPSILON: number = 1e-9;
        const Z_H: number = 1;

        it('should calculate 1s orbital probability density correctly at origin', () => {
            const expected: number = 1 / Math.PI;
            const { probabilityDensity } = atomicOrbitalProbabilityDensity(1, 0, 0, 0, 0, 0, Z_H);
            expect(probabilityDensity).toBeCloseTo(expected, EPSILON);
        });

        it('should calculate 1s orbital probability density correctly at a distance', () => {
            const expected: number = 1 / (Math.PI * Math.exp(2));
            const { probabilityDensity } = atomicOrbitalProbabilityDensity(1, 0, 0, 1, Math.PI / 2, Math.PI / 2, Z_H);
            expect(probabilityDensity).toBeCloseTo(expected, EPSILON);
        });

        it('should calculate 2s orbital probability density correctly at its radial node', () => {
            const { probabilityDensity } = atomicOrbitalProbabilityDensity(2, 0, 0, 2, 0, 0, Z_H);
            expect(probabilityDensity).toBeCloseTo(0, EPSILON); // Node
        });

        it('should calculate 2p_z orbital probability density correctly at its angular node', () => {
            const { probabilityDensity } = atomicOrbitalProbabilityDensity(2, 1, 0, 1, Math.PI / 2, 0, Z_H);
            expect(probabilityDensity).toBeCloseTo(0, EPSILON); // Node
        });

        it('should calculate 2p_x orbital probability density correctly at its angular node', () => {
            const { probabilityDensity } = atomicOrbitalProbabilityDensity(2, 1, 1, 1, Math.PI / 2, Math.PI / 2, Z_H);
            expect(probabilityDensity).toBeCloseTo(0, EPSILON); // Node
        });

        it('should calculate 2p_y orbital probability density correctly at its angular node', () => {
            const { probabilityDensity } = atomicOrbitalProbabilityDensity(2, 1, -1, 1, Math.PI / 2, 0, Z_H);
            expect(probabilityDensity).toBeCloseTo(0, EPSILON); // Node
        });

        it('should calculate 2p_z orbital probability density correctly at a point', () => {
            const expected: number = 1 / (8 * Math.PI * Math.exp(2));
            const { probabilityDensity } = atomicOrbitalProbabilityDensity(2, 1, 0, 1, 0, 0, Z_H);
            expect(probabilityDensity).toBeCloseTo(expected, EPSILON);
        });

        it('should throw an error if r is negative', () => {
            expect(() => atomicOrbitalProbabilityDensity(1, 0, 0, -0.1, 0, 0, Z_H)).toThrow(
                "Distance (r) cannot be negative for atomic orbital probability density."
            );
        });
    });

    describe('generateOrbitalData function', () => {
        it('should generate the correct number of data points and dimensions', () => {
            const resolution: number = 10;
            const result = generateOrbitalData(1, 0, 0, Z_H, resolution, 10);
            expect(result.grid.length).toBe(resolution * resolution * resolution);
            expect(result.dims).toEqual([resolution, resolution, resolution]);
        });

        it('should return points with valid density values for 1s orbital', () => {
            const resolution: number = 11;
            const rMax: number = 5;
            const result = generateOrbitalData(1, 0, 0, Z_H, resolution, rMax);

            const { grid, dims, minVal, maxVal } = result;
            const step: number = (rMax - minVal) / (resolution - 1);

            const centerIndex = Math.floor(dims[0] / 2) * dims[1] * dims[2] + Math.floor(dims[1] / 2) * dims[2] + Math.floor(dims[2] / 2);
            expect(grid[centerIndex]).toBeDefined();
            expect(grid[centerIndex]).toBeGreaterThan(0);
        });

        it('should throw an error for invalid resolution', () => {
            expect(() => generateOrbitalData(1, 0, 0, Z_H, 0, 10)).toThrow("Resolution must be a positive integer.");
        });

        it('should throw an error for invalid rMax', () => {
            expect(() => generateOrbitalData(1, 0, 0, Z_H, 50, 0)).toThrow("rMax must be a positive number.");
        });
    });
});
