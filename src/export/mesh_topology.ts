/**
 * Whether a triangle mesh bounds a solid: every edge shared by exactly two
 * triangles, traversed in opposite directions by the two. A 3D printer
 * cannot fill a surface with a hole in it, and a slicer's guess at one is not
 * the orbital (spec §5 Phase 2: "watertight").
 */
export interface TopologyReport {
    triangles: number;
    degenerateTriangles: number;
    boundaryEdges: number;
    nonManifoldEdges: number;
    misorientedEdges: number;
    /** Positive when the triangles are wound outward. */
    signedVolume: number;
}

/** Canonical vertex ids: marching cubes can emit coincident vertices (a crossing exactly at a grid point). */
export function weldVertices(positions: Float32Array): Uint32Array {
    let extent = 0;
    for (let i = 0; i < positions.length; i++) extent = Math.max(extent, Math.abs(positions[i]));
    const tolerance = Math.max(extent, 1e-12) * 1e-6;
    const ids = new Map<string, number>();
    const canonical = new Uint32Array(positions.length / 3);
    for (let v = 0; v < canonical.length; v++) {
        const key = `${Math.round(positions[3 * v] / tolerance)},${Math.round(positions[3 * v + 1] / tolerance)},${Math.round(positions[3 * v + 2] / tolerance)}`;
        let id = ids.get(key);
        if (id === undefined) { id = ids.size; ids.set(key, id); }
        canonical[v] = id;
    }
    return canonical;
}

export function meshTopology(positions: Float32Array, indices: Uint32Array): TopologyReport {
    const id = weldVertices(positions);
    const edges = new Map<string, { forward: number; backward: number }>();
    let degenerate = 0;
    let volume = 0;
    const p = (v: number, axis: number) => positions[3 * v + axis];
    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
        const [u, v, w] = [id[a], id[b], id[c]];
        if (u === v || v === w || u === w) { degenerate++; continue; }
        for (const [from, to] of [[u, v], [v, w], [w, u]]) {
            const key = from < to ? `${from}_${to}` : `${to}_${from}`;
            const entry = edges.get(key) ?? { forward: 0, backward: 0 };
            if (from < to) entry.forward++; else entry.backward++;
            edges.set(key, entry);
        }
        volume += (p(a, 0) * (p(b, 1) * p(c, 2) - p(b, 2) * p(c, 1))
            - p(a, 1) * (p(b, 0) * p(c, 2) - p(b, 2) * p(c, 0))
            + p(a, 2) * (p(b, 0) * p(c, 1) - p(b, 1) * p(c, 0))) / 6;
    }
    let boundary = 0, nonManifold = 0, misoriented = 0;
    for (const { forward, backward } of edges.values()) {
        const uses = forward + backward;
        if (uses === 1) boundary++;
        else if (uses > 2) nonManifold++;
        else if (forward !== 1) misoriented++;
    }
    return {
        triangles: indices.length / 3, degenerateTriangles: degenerate, boundaryEdges: boundary,
        nonManifoldEdges: nonManifold, misorientedEdges: misoriented, signedVolume: volume,
    };
}

export function isWatertight(report: TopologyReport): boolean {
    return report.triangles > report.degenerateTriangles
        && report.boundaryEdges === 0 && report.nonManifoldEdges === 0 && report.misorientedEdges === 0;
}
