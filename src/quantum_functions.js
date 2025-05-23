// src/quantum_functions.js

// Using a Map for memoization is efficient for storing key-value pairs.
const factorialCache = new Map();
const pochhammerCache = new Map();

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
    // Create a unique cache key for (x, n)
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

// Export these for use in other parts of the module
export { factorial, pochhammer };

// For testing purposes, we might want to expose internal cache for inspection
// or a way to clear it, but for production code, it's usually encapsulated.
// export const __clearCaches__ = () => {
//     factorialCache.clear();
//     pochhammerCache.clear();
// };