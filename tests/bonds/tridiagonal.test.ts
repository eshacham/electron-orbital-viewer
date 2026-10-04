import { countEigenvaluesBelow, extremeEigenvalue, eigenvectorFor } from '../../src/bonds/tridiagonal';

const diag = Float64Array.from([2, 2, 2]);
const off = Float64Array.from([-1, -1]);

describe('symmetric tridiagonal eigenproblems', () => {
    it('counts eigenvalues below a shift (2 − √2, 2, 2 + √2)', () => {
        expect(countEigenvaluesBelow(diag, off, 0.5)).toBe(0);
        expect(countEigenvaluesBelow(diag, off, 2.0001)).toBe(2);
        expect(countEigenvaluesBelow(diag, off, 4)).toBe(3);
    });

    it('finds the extreme eigenvalues', () => {
        expect(extremeEigenvalue(diag, off, 'lowest')).toBeCloseTo(2 - Math.SQRT2, 12);
        expect(extremeEigenvalue(diag, off, 'highest')).toBeCloseTo(2 + Math.SQRT2, 12);
        expect(extremeEigenvalue(Float64Array.from([5]), new Float64Array(0), 'lowest')).toBe(5);
    });

    it('returns a unit eigenvector', () => {
        const v = eigenvectorFor(diag, off, 2 - Math.SQRT2);
        expect(Array.from(v, Math.abs).map(x => x.toFixed(8))).toEqual(['0.50000000', '0.70710678', '0.50000000']);
        expect(Math.sign(v[0])).toBe(Math.sign(v[1]));
    });
});
