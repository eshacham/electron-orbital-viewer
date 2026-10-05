import { fetchFloat32Grid } from './binary';
import { moleculePath } from './loader';
import type { GridSpec, LibraryMoleculeMeta } from './library_types';

/** A scalar grid in Phase 1's convention: z fastest, index = (i * ny + j) * nz + k. */
export interface ScalarGrid extends GridSpec {
    values: Float32Array;
}

/**
 * The coarse ESP grid named in `meta.espGrid`. `baseUrl`, when given,
 * replaces `loader.moleculePath`'s versioned folder (tests only; production
 * always resolves through the version loader.ts already owns -- D7).
 */
export async function loadEspGrid(meta: LibraryMoleculeMeta, baseUrl?: string): Promise<ScalarGrid> {
    const { shape, origin, spacing } = meta.espGrid;
    const folder = baseUrl === undefined ? moleculePath(meta.id) : `${baseUrl}/${meta.id}`;
    const values = await fetchFloat32Grid(`${folder}/esp.bin.gz`, shape[0] * shape[1] * shape[2]);
    return { shape, origin, spacing, values };
}

/** Trilinear interpolation, clamped to the box: a vertex a hair outside the last cell reads the edge, not garbage. */
export function sampleTrilinear(grid: ScalarGrid, x: number, y: number, z: number): number {
    const [nx, ny, nz] = grid.shape;
    const cell = (c: number, o: number, n: number): [number, number] => {
        const t = Math.min(n - 1, Math.max(0, (c - o) / grid.spacing));
        const i = Math.min(n - 2, Math.floor(t));
        return [i, t - i];
    };
    const [i, fx] = cell(x, grid.origin[0], nx);
    const [j, fy] = cell(y, grid.origin[1], ny);
    const [k, fz] = cell(z, grid.origin[2], nz);
    const at = (a: number, b: number, c: number) => grid.values[((i + a) * ny + (j + b)) * nz + (k + c)];
    const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
    return lerp(
        lerp(lerp(at(0, 0, 0), at(0, 0, 1), fz), lerp(at(0, 1, 0), at(0, 1, 1), fz), fy),
        lerp(lerp(at(1, 0, 0), at(1, 0, 1), fz), lerp(at(1, 1, 0), at(1, 1, 1), fz), fy),
        fx,
    );
}
