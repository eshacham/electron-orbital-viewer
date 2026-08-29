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
 */

function numerovFactors(g: Float64Array, h: number): Float64Array {
    const twelfth = (h * h) / 12;
    const f = new Float64Array(g.length);
    for (let j = 0; j < g.length; j++) f[j] = 1 - twelfth * g[j];
    return f;
}

export function numerovForward(
    g: Float64Array, h: number, y: Float64Array, from: number, to: number
): void {
    const f = numerovFactors(g, h);
    for (let j = from; j < to; j++) {
        y[j + 1] = ((12 - 10 * f[j]) * y[j] - f[j - 1] * y[j - 1]) / f[j + 1];
    }
}

export function numerovBackward(
    g: Float64Array, h: number, y: Float64Array, from: number, to: number
): void {
    const f = numerovFactors(g, h);
    for (let j = from; j > to; j--) {
        y[j - 1] = ((12 - 10 * f[j]) * y[j] - f[j + 1] * y[j + 1]) / f[j - 1];
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
