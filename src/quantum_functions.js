// src/quantum_functions.js

const factorialCache = new Map();
const pochhammerCache = new Map();
const laguerreCache = new Map(); // New cache for Laguerre polynomials

// Bohr radius in meters (approximately 5.29 x 10^-11 m).
// For convenience in calculations, we might consider using atomic units where a_0 = 1.
// However, to keep it physically grounded, we'll use its value.
// It's often helpful to keep this as a configurable constant if we want to scale units later.
const BOHR_RADIUS = 0.0529177210903; // nm or Angstroms depending on your desired scale for 'r' input.
                                     // Let's assume input 'r' will also be in these units (e.g. nm)
                                     // if we're visualizing in a range of say 0-10 nm.
                                     // If we use 'r' as a multiple of a_0, then a_0=1.
                                     // For now, assume r is already in units of a_0, so a_0 = 1 for calculation simplicity.
                                     // This simplifies the formula's r/a_0 term.
                                     // Let's refine this: the 2Zr/na0 term implies r is in units of a0.
                                     // So, for calculations inside the function, we'll treat `a0` as 1 (atomic units).
                                     // When we call this function from the main rendering loop,
                                     // 'r' will be the distance in Bohr radii.

// Re-evaluating BOHR_RADIUS: If r is in Bohr radii, then r/a0 is just r.
// If r is in physical units (like nanometers), then r/a0 should be r/BOHR_RADIUS.
// Let's define the function such that 'r' is passed in **Bohr radii**. This makes the math simpler.
// So, effectively, a0 = 1 within the formula.

// New approach: Pass r in atomic units (Bohr radii), Z = 1 for hydrogen.
// So, BOHR_RADIUS constant isn't strictly needed inside this specific formula unless we scale r.
// Let's rename the constant to something like ATOMIC_LENGTH_UNIT if we decide to use it for scaling visuals.
// For now, assume r is the value in (r/a0) units.


/**
 * Calculates the factorial of a non-negative integer with memoization.
 * @param {number} n - The integer.
 * @returns {number} The factorial of n.
 */
function factorial(n) {
    if (n < 0) {
        throw new Error("Factorial is not defined for negative numbers.");
    }
    if (n === 0 || n === 1) {
        return 1;
    }
    if (factorialCache.has(n)) {
        return factorialCache.get(n);
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
 * @param {number} x - The base value.
 * @param {number} n - The number of terms.
 * @returns {number} The Pochhammer symbol value.
 */
function pochhammer(x, n) {
    if (n < 0) {
        throw new Error("Pochhammer symbol is not defined for negative n.");
    }
    if (n === 0) {
        return 1;
    }
    const cacheKey = `${x},${n}`;
    if (pochhammerCache.has(cacheKey)) {
        return pochhammerCache.get(cacheKey);
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
 * @param {number} N - The total number of items.
 * @param {number} K - The number of items to choose.
 * @returns {number} The binomial coefficient.
 */
function binomialCoefficient(N, K) {
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
 * @param {number} n - The degree of the polynomial.
 * @param {number} alpha - The order of the polynomial.
 * @param {number} x - The value at which to evaluate the polynomial.
 * @returns {number} The value of the generalized Laguerre polynomial.
 */
function laguerrePolynomial(n, alpha, x) {
    if (n < 0) {
        throw new Error("Laguerre polynomial degree (n) cannot be negative.");
    }
    // No specific constraints on alpha or x beyond standard numbers for this formula.

    const cacheKey = `${n},${alpha},${x}`;
    if (laguerreCache.has(cacheKey)) {
        return laguerreCache.get(cacheKey);
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
 * @param {number} n - Principal quantum number.
 * @param {number} l - Azimuthal (angular momentum) quantum number.
 * @param {number} r - Distance from the nucleus in Bohr radii.
 * @param {number} Z - Nuclear charge (defaults to 1 for Hydrogen).
 * @returns {number} The value of the radial wave function.
 */
function radialWaveFunction(n, l, r, Z = 1) {
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

// Export all relevant functions
export { factorial, pochhammer, binomialCoefficient, laguerrePolynomial, radialWaveFunction };

// Optional: function to clear all caches for testing purposes
export const __clearAllCaches__ = () => {
    factorialCache.clear();
    pochhammerCache.clear();
    laguerreCache.clear();
};