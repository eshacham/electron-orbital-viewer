import { orbitalName, shellLetter } from '../src/orbital_names';
import { makeWaveFunctionEvaluator } from '../src/quantum_functions';

describe('shellLetter', () => {
    it.each([[0, 's'], [1, 'p'], [2, 'd'], [3, 'f'], [4, 'g'], [5, 'h'], [6, 'i'], [7, 'k'], [8, 'l']])(
        'calls l=%i "%s"', (l, letter) => expect(shellLetter(l)).toBe(letter));
});

describe('orbitalName', () => {
    it.each([
        [1, 0, 0, '1s'],
        [2, 0, 0, '2s'],
        [2, 1, 0, '2p_z'],
        [2, 1, 1, '2p_x'],
        [2, 1, -1, '2p_y'],
        [3, 2, 0, '3d_z²'],
        [3, 2, 1, '3d_xz'],
        [3, 2, -1, '3d_yz'],
        [3, 2, 2, '3d_x²−y²'],
        [3, 2, -2, '3d_xy'],
        [4, 3, 0, '4f_z³'],
        [4, 3, -2, '4f_xyz'],
    ])('names (%i, %i, %i) as %s', (n, l, ml, expected) => {
        expect(orbitalName(n, l, ml)).toBe(expected);
    });

    it('falls back to the magnetic number past f, where subscripts are not conventional', () => {
        expect(orbitalName(5, 4, 2)).toBe('5g (mₗ = +2)');
        expect(orbitalName(9, 8, -3)).toBe('9l (mₗ = -3)');
    });

    it('gives every orbital up to n=9 a distinct name', () => {
        const names = new Set<string>();
        let count = 0;
        for (let n = 1; n <= 9; n++)
            for (let l = 0; l < n; l++)
                for (let ml = -l; ml <= l; ml++) { names.add(orbitalName(n, l, ml)); count++; }
        expect(names.size).toBe(count);
    });

    // The subscripts describe the real harmonics this app actually draws, so
    // they have to match the shapes: p_x must be the one that points along x.
    it.each([
        [2, 1, 1, [1, 0, 0]],    // p_x
        [2, 1, -1, [0, 1, 0]],   // p_y
        [2, 1, 0, [0, 0, 1]],    // p_z
    ] as Array<[number, number, number, number[]]>)(
        'puts %i%i ml=%i along its named axis', (n, l, ml, axis) => {
            const psi = makeWaveFunctionEvaluator(n, l, ml, 1);
            const along = Math.abs(psi(axis[0] * 3, axis[1] * 3, axis[2] * 3));
            const others = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
                .filter(a => a.join() !== axis.join())
                .map(a => Math.abs(psi(a[0] * 3, a[1] * 3, a[2] * 3)));
            for (const other of others) expect(along).toBeGreaterThan(other);
        });

    it('puts d_xy in the xy plane and d_x²−y² on the axes', () => {
        const dxy = makeWaveFunctionEvaluator(3, 2, -2, 1);
        const dx2 = makeWaveFunctionEvaluator(3, 2, 2, 1);
        const diagonal = 3 / Math.SQRT2;
        // d_xy peaks between the axes, d_x²−y² peaks on them.
        expect(Math.abs(dxy(diagonal, diagonal, 0))).toBeGreaterThan(Math.abs(dxy(3, 0, 0)));
        expect(Math.abs(dx2(3, 0, 0))).toBeGreaterThan(Math.abs(dx2(diagonal, diagonal, 0)));
    });
});
