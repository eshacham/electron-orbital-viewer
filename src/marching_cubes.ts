import { EDGE_TABLE, TRI_TABLE, CUBE_CORNERS, EDGE_CORNERS } from './marching_cubes_tables';

export interface IsosurfaceMesh {
    positions: number[][];
    cells: number[][];
}

/**
 * Polygonises a scalar field sampled on a regular grid.
 *
 * Differences from `marching-cubes-fast`, which this replaces:
 *
 *  - The field is sampled once per grid point (`(res+1)^3` values) instead of
 *    once per cube corner (`8 * res^3`, plus an octree probe per node), so the
 *    expensive wave-function evaluation runs ~8x less often.
 *  - Samples and interpolation are float64, and a crossing is interpolated
 *    whenever the two corner values differ at all. The library gated this on
 *    `Math.abs(a - b) > 1e-6`, an absolute threshold that probability densities
 *    (1e-5 down to 1e-8) never clear, so vertices collapsed onto cube corners
 *    and the surface came out cracked and faceted.
 *  - Vertices are shared between neighbouring cubes via an edge cache, so the
 *    result is an indexed, watertight mesh rather than loose triangles.
 */
export function marchingCubes(
    resolution: number,
    samples: Float64Array,
    origin: number,
    step: number
): IsosurfaceMesh {
    const side = resolution + 1;
    const sampleAt = (i: number, j: number, k: number) => (i * side + j) * side + k;

    const positions: number[][] = [];
    const cells: number[][] = [];

    // One vertex per grid edge that the surface crosses, keyed by
    // (grid point, axis) so both cubes sharing the edge reuse it.
    const vertexOfEdge = new Map<number, number>();
    const cornerValue = new Float64Array(8);
    const cubeEdgeVertex = new Int32Array(12);

    for (let i = 0; i < resolution; i++) {
        for (let j = 0; j < resolution; j++) {
            for (let k = 0; k < resolution; k++) {
                let cubeIndex = 0;
                for (let c = 0; c < 8; c++) {
                    const [dx, dy, dz] = CUBE_CORNERS[c];
                    const value = samples[sampleAt(i + dx, j + dy, k + dz)];
                    cornerValue[c] = value;
                    if (value > 0) cubeIndex |= 1 << c;
                }

                const edgeMask = EDGE_TABLE[cubeIndex];
                if (edgeMask === 0) continue;

                for (let e = 0; e < 12; e++) {
                    if ((edgeMask & (1 << e)) === 0) continue;

                    const [ca, cb] = EDGE_CORNERS[e];
                    const a = cornerValue[ca];
                    const b = cornerValue[cb];

                    // Identify the edge by its lower endpoint and axis, so the
                    // neighbouring cube resolves to the same key.
                    const [ax, ay, az] = CUBE_CORNERS[ca];
                    const [bx, by, bz] = CUBE_CORNERS[cb];
                    const lowX = i + Math.min(ax, bx);
                    const lowY = j + Math.min(ay, by);
                    const lowZ = k + Math.min(az, bz);
                    const axis = ax !== bx ? 0 : ay !== by ? 1 : 2;
                    const edgeKey = ((lowX * side + lowY) * side + lowZ) * 3 + axis;

                    let vertex = vertexOfEdge.get(edgeKey);
                    if (vertex === undefined) {
                        // Fraction of the way from corner a to corner b where the
                        // field crosses zero. No magnitude threshold: a and b differ
                        // in sign, so a - b is non-zero by construction.
                        const t = a / (a - b);
                        positions.push([
                            origin + (i + ax + t * (bx - ax)) * step,
                            origin + (j + ay + t * (by - ay)) * step,
                            origin + (k + az + t * (bz - az)) * step,
                        ]);
                        vertex = positions.length - 1;
                        vertexOfEdge.set(edgeKey, vertex);
                    }
                    cubeEdgeVertex[e] = vertex;
                }

                const triangles = TRI_TABLE[cubeIndex];
                for (let t = 0; t < triangles.length; t += 3) {
                    cells.push([
                        cubeEdgeVertex[triangles[t]],
                        cubeEdgeVertex[triangles[t + 1]],
                        cubeEdgeVertex[triangles[t + 2]],
                    ]);
                }
            }
        }
    }

    return { positions, cells };
}
