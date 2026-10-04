/**
 * The only linear algebra the exact H₂⁺ solver needs.
 *
 * Both separated equations of H₂⁺ (h2plus.ts) reduce to symmetric
 * tridiagonal matrices, and of each only one extreme eigenvalue is wanted --
 * the lowest of the angular matrix, the highest of the radial one. A Sturm
 * count with bisection does exactly that and nothing more: it is exact to
 * rounding, it cannot converge on the wrong eigenvalue the way an iterative
 * method started badly can, and it needs no general eigensolver in the
 * bundle. The eigenvector, wanted only when a wavefunction is drawn, comes
 * afterwards by inverse iteration at the eigenvalue already found.
 *
 * Every matrix is passed as its diagonal (length n) and its off-diagonal
 * (length n - 1, element i coupling rows i and i + 1).
 */

/** Bisection stops once the bracket is this narrow relative to the eigenvalue: a few ulps of a double. */
const RELATIVE_TOLERANCE = 1e-14;
/** Far more halvings than the tolerance needs (about 50 from a Gershgorin interval); a guard, not a budget. */
const MAX_BISECTIONS = 200;
/** Inverse iteration gains a factor (gap / shift offset) per sweep -- about 10⁹ here -- so a few sweeps reach rounding. */
const INVERSE_ITERATION_SWEEPS = 4;
/** How far inverse iteration's shift sits from the eigenvalue, relative to it: close, but never an exactly singular solve. */
const SHIFT_OFFSET = 1e-10;

/**
 * The number of eigenvalues below `x`: by Sylvester's law of inertia it
 * equals the number of negative pivots in the LDLᵀ factorisation of the
 * matrix minus x, and for a tridiagonal matrix each pivot follows from the
 * last by one recurrence.
 */
export function countEigenvaluesBelow(diag: Float64Array, off: Float64Array, x: number): number {
    let count = 0;
    let q = 1;
    for (let i = 0; i < diag.length; i++) {
        q = diag[i] - x - (i > 0 ? (off[i - 1] * off[i - 1]) / q : 0);
        // An exact zero pivot means x is an eigenvalue of a leading block, an
        // accident of measure zero; nudging it keeps the count defined and
        // moves the answer by nothing bisection could resolve.
        if (q === 0) q = 1e-300;
        if (q < 0) count++;
    }
    return count;
}

/**
 * The lowest or highest eigenvalue, by bisection on the Sturm count inside
 * the Gershgorin interval (which contains every eigenvalue, so the bracket is
 * right from the start).
 */
export function extremeEigenvalue(diag: Float64Array, off: Float64Array, which: 'lowest' | 'highest'): number {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < diag.length; i++) {
        const radius = (i > 0 ? Math.abs(off[i - 1]) : 0) + (i < off.length ? Math.abs(off[i]) : 0);
        lo = Math.min(lo, diag[i] - radius);
        hi = Math.max(hi, diag[i] + radius);
    }
    // The smallest x with `target` eigenvalues below it is the target-th eigenvalue.
    const target = which === 'lowest' ? 1 : diag.length;
    for (let iteration = 0; iteration < MAX_BISECTIONS; iteration++) {
        const mid = 0.5 * (lo + hi);
        if (hi - lo <= RELATIVE_TOLERANCE * Math.max(1, Math.abs(mid))) break;
        if (countEigenvaluesBelow(diag, off, mid) >= target) hi = mid;
        else lo = mid;
    }
    return 0.5 * (lo + hi);
}

/**
 * The unit eigenvector for an eigenvalue already found: inverse iteration
 * with the shift a hair off the eigenvalue, each solve by the Thomas
 * algorithm (tridiagonal Gaussian elimination, no pivoting). The overall
 * sign is whatever the iteration lands on; a caller that cares about it
 * fixes it itself.
 */
export function eigenvectorFor(diag: Float64Array, off: Float64Array, eigenvalue: number): Float64Array {
    const n = diag.length;
    const shift = eigenvalue + SHIFT_OFFSET * Math.max(1, Math.abs(eigenvalue));
    let x = new Float64Array(n).fill(1);
    for (let sweep = 0; sweep < INVERSE_ITERATION_SWEEPS; sweep++) {
        const c = new Float64Array(n);
        const d = new Float64Array(n);
        let pivot = diag[0] - shift;
        c[0] = (n > 1 ? off[0] : 0) / pivot;
        d[0] = x[0] / pivot;
        for (let i = 1; i < n; i++) {
            pivot = diag[i] - shift - off[i - 1] * c[i - 1];
            c[i] = (i < n - 1 ? off[i] : 0) / pivot;
            d[i] = (x[i] - off[i - 1] * d[i - 1]) / pivot;
        }
        const y = new Float64Array(n);
        y[n - 1] = d[n - 1];
        for (let i = n - 2; i >= 0; i--) y[i] = d[i] - c[i] * y[i + 1];
        const norm = Math.sqrt(y.reduce((sum, v) => sum + v * v, 0));
        x = y.map(v => v / norm);
    }
    return x;
}
