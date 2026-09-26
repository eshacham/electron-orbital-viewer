import {
    computeSamplingRadius,
    MAX_SAMPLING_RADIUS,
    DEFAULT_ENCLOSED_FRACTION,
    ENCLOSED_FRACTIONS,
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

const meshFor = (
    n: number, l: number, ml: number,
    Z = 1, resolution = 32, enclosedFraction = DEFAULT_ENCLOSED_FRACTION
) => {
    const rMax = computeSamplingRadius(n, l, Z);
    const params: OrbitalParams = { n, l, ml, Z, resolution, rMax, enclosedFraction };
    return { mesh: generateOrbitalMesh(params), rMax };
};

const extentOf = (positions: number[][]) =>
    Math.max(...positions.map(p => Math.hypot(p[0], p[1], p[2])));

describe('enclosed fraction options', () => {
    it('offers only fractions strictly inside 0 and 1', () => {
        for (const fraction of ENCLOSED_FRACTIONS) {
            expect(fraction).toBeGreaterThan(0);
            expect(fraction).toBeLessThan(1);
        }
        expect(ENCLOSED_FRACTIONS).toContain(DEFAULT_ENCLOSED_FRACTION);
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

    // ...including at the loosest contour offered, which reaches furthest out.
    it.each(everyOrbital)('still encloses it at 99%% for %s', (_name, n, l, ml) => {
        const { mesh, rMax } = meshFor(n, l, ml, 1, 32, 0.99);
        expect(touchesBoxWall(mesh.positions, rMax)).toBe(false);
    });

    // A box far larger than the orbital wastes resolution: the voxel is
    // 2 * rMax / resolution, so an oversized box blurs the radial shells.
    it.each(everyOrbital)('does not oversize the box for %s', (_name, n, l, ml) => {
        const { mesh, rMax } = meshFor(n, l, ml);
        expect(rMax).toBeLessThan(extentOf(mesh.positions) * 4);
    });

    it('shrinks with Z roughly as 1/Z', () => {
        const hydrogen = computeSamplingRadius(3, 2, 1);
        const helium = computeSamplingRadius(3, 2, 2);

        expect(helium).toBeLessThan(hydrogen);
        expect(helium).toBeGreaterThan(hydrogen / 3);
    });

    it('still encloses the orbital for a heavy nucleus', () => {
        for (const Z of [2, 6, 26]) {
            const { mesh, rMax } = meshFor(1, 0, 0, Z);
            expect(touchesBoxWall(mesh.positions, rMax)).toBe(false);
            expect(rMax).toBeLessThan(extentOf(mesh.positions) * 4);
        }
    });

    it('never exceeds the point where a box stops resolving anything', () => {
        for (const [, n, l] of everyOrbital) {
            const radius = computeSamplingRadius(n, l, 1);
            expect(radius).toBeGreaterThan(0);
            expect(radius).toBeLessThanOrEqual(MAX_SAMPLING_RADIUS);
        }
    });
});

describe('enclosed fraction drives the surface', () => {
    it('grows the surface as more of the electron is asked for', () => {
        const tight = meshFor(3, 2, 0, 1, 32, 0.5);
        const loose = meshFor(3, 2, 0, 1, 32, 0.99);

        // Same box, lower contour, so the surface reaches further out.
        expect(loose.mesh.isoLevel).toBeLessThan(tight.mesh.isoLevel);
        expect(extentOf(loose.mesh.positions)).toBeGreaterThan(extentOf(tight.mesh.positions));
    });

    it('reports the contour it settled on', () => {
        const { mesh } = meshFor(2, 1, 0);
        expect(mesh.isoLevel).toBeGreaterThan(0);
    });

    it('rejects a fraction outside 0 to 1', () => {
        const rMax = computeSamplingRadius(2, 1, 1);
        for (const enclosedFraction of [0, 1, 1.5, -0.2]) {
            expect(() => generateOrbitalMesh({
                n: 2, l: 1, ml: 0, Z: 1, resolution: 16, rMax, enclosedFraction,
            })).toThrow(/enclosedFraction/);
        }
    });
});

// Final review: every hybrid and Stark source asks for this box, and App's
// legend and radial plot build those sources on every render -- two
// radiusContaining searches (~3 ms each) per source, per render. It depends
// on n alone, so it is worked out once per n.
describe('combinationSamplingRadius', () => {
    it('is worked out once per n', () => {
        jest.isolateModules(() => {
            const actual = jest.requireActual('../src/radial_distribution');
            const radiusContaining = jest.fn(actual.radiusContaining);
            jest.doMock('../src/radial_distribution', () => ({ ...actual, radiusContaining }));
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const presets = require('../src/orbital_presets') as typeof import('../src/orbital_presets');

            const first = presets.combinationSamplingRadius(2);
            const callsForOne = radiusContaining.mock.calls.length;
            expect(callsForOne).toBe(2);
            for (let i = 0; i < 5; i++) expect(presets.combinationSamplingRadius(2)).toBe(first);
            expect(radiusContaining).toHaveBeenCalledTimes(callsForOne);
            expect(first).toBe(presets.computeSamplingRadius(2, 0, presets.BASIC_ORBITALS_Z));
        });
    });
});
