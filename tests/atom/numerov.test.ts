import { numerovForward, numerovBackward, countNodes } from '../../src/atom/numerov';

describe('numerov', () => {
    // y'' = -k^2 y  has solution sin(k x); g = -k^2
    it('reproduces sin(x) forward', () => {
        const size = 1001;
        const h = 0.01;
        const g = new Float64Array(size).fill(-1);
        const y = new Float64Array(size);
        y[0] = Math.sin(0);
        y[1] = Math.sin(h);
        numerovForward(g, h, y, 1, size - 1);
        for (const j of [100, 500, 1000]) {
            expect(y[j]).toBeCloseTo(Math.sin(j * h), 9);
        }
    });

    it('reproduces exp(-x) backward', () => {
        const size = 501;
        const h = 0.01;
        const g = new Float64Array(size).fill(1);   // y'' = y
        const y = new Float64Array(size);
        const last = size - 1;
        y[last] = Math.exp(-last * h);
        y[last - 1] = Math.exp(-(last - 1) * h);
        numerovBackward(g, h, y, last - 1, 0);
        for (const j of [400, 200, 0]) {
            expect(y[j]).toBeCloseTo(Math.exp(-j * h), 9);
        }
    });

    it('counts nodes of sin over two periods', () => {
        const size = 1001;
        const y = new Float64Array(size);
        for (let j = 0; j < size; j++) y[j] = Math.sin((4 * Math.PI * j) / (size - 1));
        // interior zeros of sin(4 pi s) for s in (0,1): s = 1/4, 1/2, 3/4 -> 3
        expect(countNodes(y, 0, size - 1)).toBe(3);
    });

    it('ignores exact zeros at the ends when counting nodes', () => {
        const y = Float64Array.from([0, 1, 2, 1, 0]);
        expect(countNodes(y, 0, 4)).toBe(0);
    });
});
