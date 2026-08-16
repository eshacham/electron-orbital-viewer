import {
    getIsoLevel,
    computeSamplingRadius,
    MAX_SAMPLING_RADIUS,
} from '../src/orbital_presets';
import { generateOrbitalMesh } from '../src/orbital_mesh';
import { OrbitalParams } from '../src/types/orbital';

const MAX_N = 9;

const everyOrbital: Array<[string, number, number, number]> = [];
for (let n = 1; n <= MAX_N; n++) {
    for (let l = 0; l < n; l++) {
        for (let ml = -l; ml <= l; ml++) {
            everyOrbital.push([`n=${n} l=${l} ml=${ml}`, n, l, ml]);
        }
    }
}

/** True if any vertex sits on a wall of the sampling box. */
const touchesBoxWall = (positions: number[][], rMax: number) =>
    positions.some(p => p.some(c => Math.abs(Math.abs(c) - rMax) < 1e-9));

const meshFor = (n: number, l: number, ml: number, Z = 1, resolution = 32) => {
    const isoLevel = getIsoLevel(n, l)!;
    const rMax = computeSamplingRadius(n, l, ml, Z, isoLevel);
    const params: OrbitalParams = { n, l, ml, Z, resolution, rMax, isoLevel };
    return { mesh: generateOrbitalMesh(params), rMax };
};

const extentOf = (positions: number[][]) =>
    Math.max(...positions.map(p => Math.hypot(p[0], p[1], p[2])));

describe('iso levels', () => {
    it('covers every (n, l) up to n=9', () => {
        for (let n = 1; n <= MAX_N; n++) {
            for (let l = 0; l < n; l++) {
                expect(getIsoLevel(n, l)).toBeGreaterThan(0);
            }
        }
    });
});

describe('computeSamplingRadius', () => {
    // The box has to enclose the whole isosurface. When it does not, the orbital
    // is sliced flat where it meets the wall and lobes appear to be missing.
    it.each(everyOrbital)('encloses the whole orbital for %s', (_name, n, l, ml) => {
        const { mesh, rMax } = meshFor(n, l, ml);

        expect(mesh.cells.length).toBeGreaterThan(0);
        expect(touchesBoxWall(mesh.positions, rMax)).toBe(false);
    });

    // A box far larger than the orbital wastes resolution: the voxel is
    // 2 * rMax / resolution, so an oversized box blurs the radial shells.
    it.each(everyOrbital)('does not oversize the box for %s', (_name, n, l, ml) => {
        const { mesh, rMax } = meshFor(n, l, ml);
        expect(rMax).toBeLessThan(extentOf(mesh.positions) * 1.6);
    });

    // A table keyed on (n, l) cannot express this: a heavier nucleus pulls the
    // orbital in as 1/Z, and a box sized for hydrogen leaves it a speck.
    it('shrinks with Z roughly as 1/Z', () => {
        const iso = getIsoLevel(3, 2)!;
        const hydrogen = computeSamplingRadius(3, 2, 0, 1, iso);
        const helium = computeSamplingRadius(3, 2, 0, 2, iso);

        expect(helium).toBeLessThan(hydrogen);
        expect(helium).toBeGreaterThan(hydrogen / 3);
    });

    it('still encloses the orbital for a heavy nucleus', () => {
        for (const Z of [2, 6, 26]) {
            const { mesh, rMax } = meshFor(1, 0, 0, Z);
            expect(touchesBoxWall(mesh.positions, rMax)).toBe(false);
            // ...and does not park a tiny orbital in an enormous box.
            expect(rMax).toBeLessThan(extentOf(mesh.positions) * 1.6);
        }
    });

    // The iso level decides how much of the tail is drawn, so the box has to
    // follow it rather than being fixed per (n, l).
    it('widens as the iso level drops', () => {
        const tight = computeSamplingRadius(3, 2, 0, 1, 1e-4);
        const loose = computeSamplingRadius(3, 2, 0, 1, 1e-8);
        expect(loose).toBeGreaterThan(tight);
    });

    it('tracks ml, whose lobes reach different distances', () => {
        const iso = getIsoLevel(7, 3)!;
        const radii = [-3, -2, -1, 0, 1, 2, 3].map(ml => computeSamplingRadius(7, 3, ml, 1, iso));
        expect(new Set(radii).size).toBeGreaterThan(1);
    });

    it('never exceeds the point where a box stops resolving anything', () => {
        for (const [, n, l, ml] of everyOrbital) {
            const radius = computeSamplingRadius(n, l, ml, 1, getIsoLevel(n, l)!);
            expect(radius).toBeGreaterThan(0);
            expect(radius).toBeLessThanOrEqual(MAX_SAMPLING_RADIUS);
        }
    });
});
