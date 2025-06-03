import { OrbitalDataPoint } from './types/orbital';

const factorialCache: Map<number, number> = new Map();
const pochhammerCache: Map<string, number> = new Map();
const laguerreCache: Map<string, number> = new Map();
const legendreCache: Map<string, number> = new Map();
const sphericalHarmonicCache: Map<string, number> = new Map();
const atomicOrbitalCache: Map<string, OrbitalDataPoint> = new Map();

// Note on units:
// Throughout these functions, the distance 'r' is assumed to be provided in atomic units,
// specifically in multiples of the Bohr radius (a0).
// This simplifies the formulas as a0 is effectively treated as 1.
// The nuclear charge 'Z' is also a dimensionless integer.

/**
 * Calculates the factorial of a non-negative integer with memoization.
 * @param n - The integer.
 * @returns The factorial of n.
 */
export function factorial(n: number): number {
    if (n < 0) {
        throw new Error("Factorial is not defined for negative numbers.");
    }
    if (n === 0 || n === 1) {
        return 1;
    }
    if (factorialCache.has(n)) {
        // Map.get can return undefined, but .has ensures it exists
        return factorialCache.get(n)!;
    }

    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    factorialCache.set(n, result);
    return result;
}

/**
 * Calculates the Pochhammer symbol (rising factorial) with memoization.
 * (x)_n = x * (x + 1) * ... * (x + n - 1)
 * (x)_0 = 1
 * @param x - The base value.
 * @param n - The number of terms.
 * @returns The Pochhammer symbol value.
 */
export function pochhammer(x: number, n: number): number {
    if (n < 0) {
        throw new Error("Pochhammer symbol is not defined for negative n.");
    }
    if (n === 0) {
        return 1;
    }
    const cacheKey = `${x},${n}`;
    if (pochhammerCache.has(cacheKey)) {
        return pochhammerCache.get(cacheKey)!;
    }

    let result = 1;
    for (let i = 0; i < n; i++) {
        result *= (x + i);
    }
    pochhammerCache.set(cacheKey, result);
    return result;
}

/**
 * Calculates the binomial coefficient "n choose k".
 * C(n, k) = n! / (k! * (n - k)!)
 * @param N - The total number of items.
 * @param K - The number of items to choose.
 * @returns The binomial coefficient.
 */
export function binomialCoefficient(N: number, K: number): number {
    if (K === 0) { // Explicitly handle K=0: C(N, 0) is always 1, even for negative N
        return 1;
    }
    if (K < 0 || K > N) {
        return 0; // Standard definition for other cases where K is out of typical range
    }
    if (K > N / 2) {
        K = N - K; // Optimization: C(n, k) = C(n, n-k)
    }

    // C(N, K) = (N * (N-1) * ... * (N-K+1)) / K!
    let res = 1;
    for (let i = 1; i <= K; i++) {
        res = res * (N - i + 1) / i;
    }
    return res;
}

/**
 * Calculates the generalized Laguerre polynomial L_n^(alpha)(x).
 * Uses the sum formula: L_n^(alpha)(x) = sum_{k=0 to n} ( (-1)^k * C(n + alpha, n - k) * (x^k / k!) )
 *
 * @param n - The degree of the polynomial.
 * @param alpha - The order of the polynomial.
 * @param x - The value at which to evaluate the polynomial.
 * @returns The value of the generalized Laguerre polynomial.
 */
export function laguerrePolynomial(n: number, alpha: number, x: number): number {
    if (n < 0) {
        throw new Error("Laguerre polynomial degree (n) cannot be negative.");
    }
    // No specific constraints on alpha or x beyond standard numbers for this formula.

    const cacheKey = `${n},${alpha},${x}`;
    if (laguerreCache.has(cacheKey)) {
        return laguerreCache.get(cacheKey)!;
    }

    let sum = 0;
    for (let k = 0; k <= n; k++) {
        // For n=0, k=0: C(alpha, 0)
        // This is where the fix in binomialCoefficient is crucial.
        const term = Math.pow(-1, k) *
                     binomialCoefficient(n + alpha, n - k) *
                     Math.pow(x, k) /
                     factorial(k);
        sum += term;
    }

    laguerreCache.set(cacheKey, sum);
    return sum;
}

/**
 * Calculates the radial wave function R_nl(r) for a hydrogen-like atom.
 * 'r' is expected to be in units of Bohr radii (atomic units).
 * @param n - Principal quantum number.
 * @param l - Azimuthal (angular momentum) quantum number.
 * @param r - Distance from the nucleus in Bohr radii.
 * @param Z - Nuclear charge (defaults to 1 for Hydrogen).
 * @returns The value of the radial wave function.
 */
export function radialWaveFunction(n: number, l: number, r: number, Z: number = 1): number {
    // Validate quantum numbers
    if (n < 1 || !Number.isInteger(n)) {
        throw new Error("Principal quantum number (n) must be a positive integer.");
    }
    if (l < 0 || l > n - 1 || !Number.isInteger(l)) {
        throw new Error("Azimuthal quantum number (l) must be an integer between 0 and n-1.");
    }
    if (r < 0) {
        throw new Error("Distance (r) cannot be negative.");
    }
    if (Z < 1 || !Number.isInteger(Z)) {
        throw new Error("Nuclear charge (Z) must be a positive integer.");
    }

    // A term often appears: rho = 2Zr / (n * a0)
    // Since r is in Bohr radii, and we effectively set a0=1,
    // rho_prime = 2 * Z * r / n
    const rho = (2 * Z * r) / n;

    // The normalization constant (the square root part)
    const normalizationFactor = Math.sqrt(
        (Math.pow((2 * Z) / n, 3) * factorial(n - l - 1)) /
        (2 * n * factorial(n + l))
    );

    // The (rho)^l term
    const rPowerTerm = Math.pow(rho, l);

    // The exponential term e^(-rho/2) (original formula uses -Zr/na0, which is -rho/2)
    const expTerm = Math.exp(-rho / 2);

    // The Laguerre polynomial term
    // n_prime = n - l - 1
    // alpha_prime = 2l + 1
    // x_prime = rho (which is 2Zr/na0)
    const laguerreTerm = laguerrePolynomial(n - l - 1, 2 * l + 1, rho);

    // Combine all parts
    return normalizationFactor * rPowerTerm * expTerm * laguerreTerm;
}

/**
 * Calculates the Associated Legendre Polynomial P_l^m(x).
 * Uses a recursive definition with memoization for efficiency.
 * x = cos(theta), so -1 <= x <= 1.
 * @param l - The degree of the polynomial.
 * @param m - The order of the polynomial (abs value corresponds to |m_l|). Must be non-negative.
 * @param x - The value at which to evaluate the polynomial (cos(theta)).
 * @returns The value of P_l^m(x).
 */
export function associatedLegendrePolynomial(l: number, m: number, x: number): number {
    if (l < 0 || !Number.isInteger(l)) { // Validate l first
        throw new Error("Associated Legendre Polynomial 'l' parameter must be a non-negative integer.");
    }
    if (m < 0 || !Number.isInteger(m)) { // Validate m is non-negative integer
        throw new Error("Associated Legendre Polynomial 'm' parameter must be a non-negative integer.");
    }
    if (Math.abs(x) > 1 + 1e-9) { // Allow for slight floating point inaccuracies
        // Clamp x to the valid range if it's very slightly outside due to floating point math
        x = Math.max(-1, Math.min(1, x));
        // console.warn(`Associated Legendre Polynomial 'x' parameter was slightly out of [-1, 1] range and clamped. Original: ${originalX}, Clamped: ${x}`);
    }
    if (m > l) { // Then apply mathematical rule for m > l
        return 0;
    }

    const cacheKey = `${l},${m},${x}`;
    if (legendreCache.has(cacheKey)) {
        return legendreCache.get(cacheKey)!;
    }

    let val;

    if (m === l) {
        let doubleFactorial = 1;
        for (let i = 2 * m - 1; i >= 1; i -= 2) {
            doubleFactorial *= i;
        }
        // The Math.pow(-1, m) term is often omitted for real spherical harmonics
        // as its sign is incorporated into the definition of Y_lm for m < 0.
        // For P_l^m itself, some definitions include it. We'll omit it here
        // to align with common real spherical harmonic formulations.
        val = doubleFactorial * Math.pow(1 - x * x, m / 2);
    } else if (m === l - 1) {
        val = x * (2 * m + 1) * associatedLegendrePolynomial(m, m, x); // P_m^m(x)
    } else {
        val = (x * (2 * l - 1) * associatedLegendrePolynomial(l - 1, m, x) -
               (l + m - 1) * associatedLegendrePolynomial(l - 2, m, x)) /
              (l - m);
    }

    legendreCache.set(cacheKey, val);
    return val;
}

/**
 * Calculates the Real Spherical Harmonic Y_lm_l(theta, phi).
 * This function handles the common real forms used for orbital visualization.
 * Theta and phi are in radians.
 * @param l - The angular momentum quantum number (non-negative integer).
 * @param ml - The magnetic quantum number (integer, -l <= ml <= l).
 * @param theta - The polar angle in radians (0 to PI).
 * @param phi - The azimuthal angle in radians (0 to 2*PI).
 * @returns The value of the real spherical harmonic.
 */
export function realSphericalHarmonic(l: number, ml: number, theta: number, phi: number): number {
    // Validate quantum numbers and angles
    if (l < 0 || !Number.isInteger(l)) {
        throw new Error("Spherical Harmonic 'l' parameter must be a non-negative integer.");
    }
    if (!Number.isInteger(ml) || Math.abs(ml) > l) {
        throw new Error("Spherical Harmonic 'ml' parameter must be an integer between -l and l (inclusive).");
    }
    if (theta < -1e-9 || theta > Math.PI + 1e-9) { // Allow for slight floating point inaccuracies
        // Clamp theta to the valid range
        theta = Math.max(0, Math.min(Math.PI, theta));
        // console.warn(`Spherical Harmonic 'theta' parameter was slightly out of [0, PI] range and clamped. Original: ${originalTheta}, Clamped: ${theta}`);
    }
    // No explicit check for phi range (0 to 2PI) as trigonometric functions handle periodicity,
    // but typically phi is normalized to [0, 2PI) for consistent input.

    const cacheKey = `${l},${ml},${theta},${phi}`;
    if (sphericalHarmonicCache.has(cacheKey)) {
        return sphericalHarmonicCache.get(cacheKey)!;
    }

    const abs_ml = Math.abs(ml);
    const cosTheta = Math.cos(theta);

    // Normalization factor, common to all forms
    const normalizationFactor = Math.sqrt(
        ((2 * l + 1) / (4 * Math.PI)) *
        (factorial(l - abs_ml) / factorial(l + abs_ml))
    );

    // Associated Legendre Polynomial part
    const legendrePart = associatedLegendrePolynomial(l, abs_ml, cosTheta);

    let result;
    if (ml === 0) {
        // Y_l0 (real and complex forms are identical)
        result = normalizationFactor * legendrePart;
    } else if (ml > 0) {
        // Real part (e.g., px, dxy)
        result = normalizationFactor * legendrePart * Math.cos(ml * phi) * Math.sqrt(2);
    } else { // ml < 0
        // Imaginary part (e.g., py, dyz)
        // Note: some definitions use (-1)^m factor here, but for real orbitals,
        // it's common to use sin(abs_ml * phi)
        result = normalizationFactor * legendrePart * Math.sin(abs_ml * phi) * Math.sqrt(2);
    }

    sphericalHarmonicCache.set(cacheKey, result);
    return result;
}

/**
 * Calculates the probability density of finding an electron at a given point
 * in space for a hydrogen-like atom (magnitude squared of the wave function).
 * Psi(r, theta, phi)^2 = [R_nl(r) * Y_lm_l(theta, phi)]^2
 * 'r' is expected to be in units of Bohr radii (atomic units).
 * Theta and phi are in radians.
 * @param n - Principal quantum number.
 * @param l - Azimuthal (angular momentum) quantum number.
 * @param ml - Magnetic quantum number.
 * @param r - Distance from the nucleus in Bohr radii.
 * @param theta - Polar angle in radians (0 to PI).
 * @param phi - Azimuthal angle in radians (0 to 2*PI).
 * @param Z - Nuclear charge (defaults to 1 for Hydrogen).
 * @returns The probability density (magnitude squared of the wave function).
 */
export function atomicOrbitalProbabilityDensity(
    n: number,
    l: number,
    ml: number,
    r: number,
    theta: number,
    phi: number,
    Z: number = 1
): OrbitalDataPoint {
    if (r < 0) {
        throw new Error("Distance (r) cannot be negative for atomic orbital probability density.");
    }

    const cacheKey = `${n},${l},${ml},${r},${theta},${phi},${Z}`;
    if (atomicOrbitalCache.has(cacheKey)) {
        return atomicOrbitalCache.get(cacheKey)!;
    }

    const radialPart = radialWaveFunction(n, l, r, Z);
    const angularPart = realSphericalHarmonic(l, ml, theta, phi);

    const waveFunctionValue = radialPart * angularPart;
    const probabilityDensity = waveFunctionValue * waveFunctionValue;

    const dataPoint: OrbitalDataPoint = { waveFunctionValue, probabilityDensity };
    atomicOrbitalCache.set(cacheKey, dataPoint);
    return dataPoint;
}

interface OrbitalData {
    grid: Float32Array;
    dims: [number, number, number];
    maxDensity: number;
    minVal: number; // Starting coordinate of the cube (e.g., -rMax)
    maxVal: number; // Ending coordinate of the cube (e.g., +rMax)
}

/**
 * Generates 3D volumetric data for an atomic orbital's probability density.
 * The data is generated on a Cartesian grid and returned as a flat array representing a 3D grid.
 *
 * @param n - Principal quantum number.
 * @param l - Azimuthal (angular momentum) quantum number.
 * @param ml - Magnetic quantum number.
 * @param Z - Nuclear charge (defaults to 1 for Hydrogen).
 * @param resolution - Number of steps along each Cartesian axis (e.g., if 50, grid is 50x50x50).
 * @param rMax - Maximum radial distance (in Bohr radii) to sample, defining the half-width of the cube.
 * The cube will extend from -rMax to +rMax along each axis.
 */
export function generateOrbitalData(
    n: number,
    l: number,
    ml: number,
    Z: number = 1,
    resolution: number = 50,
    rMax: number = 15
): OrbitalData {
    if (resolution <= 0 || !Number.isInteger(resolution)) {
        throw new Error("Resolution must be a positive integer.");
    }
    if (rMax <= 0) {
        throw new Error("rMax must be a positive number.");
    }

    const dims: [number, number, number] = [resolution, resolution, resolution];
    const grid = new Float32Array(dims[0] * dims[1] * dims[2]);
    let maxDensity = 0;

    const step = (rMax * 2) / (resolution - 1); // Size of each step along an axis
    const startCoord = -rMax; // Starting coordinate (e.g., -rMax)

    // Use getOrbitalPotentialFunction to calculate density values
    const orbitalPotentialFunction = getOrbitalPotentialFunction(n, l, ml, Z, 0); // isoLevel is 0 for raw density

    for (let xIdx = 0; xIdx < dims[0]; xIdx++) {
        const x = startCoord + xIdx * step;
        for (let yIdx = 0; yIdx < dims[1]; yIdx++) {
            const y = startCoord + yIdx * step;
            for (let zIdx = 0; zIdx < dims[2]; zIdx++) {
                const z = startCoord + zIdx * step;

                const { probabilityDensity } = orbitalPotentialFunction(x, y, z); // Extract density
                const index = xIdx * dims[1] * dims[2] + yIdx * dims[2] + zIdx;
                grid[index] = probabilityDensity;

                if (probabilityDensity > maxDensity) {
                    maxDensity = probabilityDensity;
                }
            }
        }
    }

    return {
        grid: grid,
        dims: dims,
        maxDensity: maxDensity,
        minVal: startCoord,
        maxVal: rMax
    };
}

/**
 * Returns a potential function (df) for marching-cubes-fast, which evaluates
 * the atomic orbital probability density (adjusted for isosurface) at a given 3D world coordinate (x, y, z).
 *
 * @param n The principal quantum number.
 * @param l The azimuthal quantum number.
 * @param ml The magnetic quantum number.
 * @param Z The atomic number.
 * @param isoLevel The isosurface level. The function will return (density - isoLevel).
 * @returns A function (df) that takes (x, y, z)
 * and returns the orbital probability density minus the isoLevel at that point.
 */
export function getOrbitalPotentialFunction(
    n: number,
    l: number,
    ml: number,
    Z: number,
    isoLevel: number
): (x: number, y: number, z: number) => OrbitalDataPoint {
    return (x, y, z) => {
        const r = Math.sqrt(x * x + y * y + z * z);
        const theta = Math.acos(Math.min(1, Math.max(-1, r === 0 ? 0 : z / r)));
        const phi = Math.atan2(y, x);

        let dataPoint: OrbitalDataPoint;
        if (r === 0) {
            dataPoint = atomicOrbitalProbabilityDensity(n, l, ml, 0, 0, 0, Z);
        } else {
            dataPoint = atomicOrbitalProbabilityDensity(n, l, ml, r, theta, phi, Z);
        }

        return {
            waveFunctionValue: dataPoint.waveFunctionValue,
            probabilityDensity: dataPoint.probabilityDensity - isoLevel
        };
    };
}

// Optional: function to clear all caches for testing purposes or specific scenarios
export const __clearAllCaches__ = (): void => {
    factorialCache.clear();
    pochhammerCache.clear();
    laguerreCache.clear();
    legendreCache.clear();
    sphericalHarmonicCache.clear();
    atomicOrbitalCache.clear();
    console.log("All quantum_functions caches cleared.");
};
