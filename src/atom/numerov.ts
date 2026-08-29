/**
 * Numerov integration of y'' = g(x) y on a uniformly spaced grid.
 *
 * The radial Schrodinger equation has no first-derivative term once it is
 * written on a logarithmic grid (see radial_solver), which is exactly the form
 * Numerov wants. It is O(h^4) for the cost of a three-term recurrence, which is
 * why atomic structure codes have used it for sixty years.
 *
 * Both directions mutate `y` in place and expect the two seed values adjacent
 * to `from` to be set already. `to` is inclusive.
 *
 * The eigenvalue solver bisects many times per state and the SCF loop calls it
 * once per subshell per iteration, so this runs order 10^5 times over a run.
 * Each call only ever touches [from, to], usually a fraction of the grid, so
 * the factor f_j = 1 - h^2 g_j / 12 is rolled forward on the fly from g rather
 * than precomputed over the whole array — nothing is allocated, and nothing
 * outside the range actually integrated is ever touched.
 */

export function numerovForward(
    g: Float64Array, h: number, y: Float64Array, from: number, to: number
): void {
    const twelfth = (h * h) / 12;
    let fPrev = 1 - twelfth * g[from - 1];
    let fCurr = 1 - twelfth * g[from];
    for (let j = from; j < to; j++) {
        const fNext = 1 - twelfth * g[j + 1];
        y[j + 1] = ((12 - 10 * fCurr) * y[j] - fPrev * y[j - 1]) / fNext;
        fPrev = fCurr;
        fCurr = fNext;
    }
}

export function numerovBackward(
    g: Float64Array, h: number, y: Float64Array, from: number, to: number
): void {
    const twelfth = (h * h) / 12;
    let fNext = 1 - twelfth * g[from + 1];
    let fCurr = 1 - twelfth * g[from];
    for (let j = from; j > to; j--) {
        const fPrev = 1 - twelfth * g[j - 1];
        y[j - 1] = ((12 - 10 * fCurr) * y[j] - fNext * y[j + 1]) / fPrev;
        fNext = fCurr;
        fCurr = fPrev;
    }
}

/**
 * Sign changes over [from, to], which for a radial function u(r) is its number
 * of nodes. This is what identifies which state an energy has converged onto:
 * the state (n, l) has exactly n - l - 1 of them.
 */
export function countNodes(y: Float64Array, from: number, to: number): number {
    let nodes = 0;
    let previous = 0;
    for (let j = from; j <= to; j++) {
        const value = y[j];
        if (value === 0) continue;
        const sign = value > 0 ? 1 : -1;
        if (previous !== 0 && sign !== previous) nodes++;
        previous = sign;
    }
    return nodes;
}
