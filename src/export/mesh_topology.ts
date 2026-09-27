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

/** The report, and the welded mesh it was made from -- what a writer must emit for the file to be the mesh that was checked. */
export interface MeshAnalysis {
    report: TopologyReport;
    /**
     * The triangles with area, as indices of each corner's canonical vertex
     * (see weldVertices). Writing these, at those vertices' positions, puts
     * bit-identical coordinates wherever the check saw one vertex.
     */
    triangles: Uint32Array;
}

/**
 * Each vertex's canonical vertex: the first one at (within a millionth of the
 * mesh's extent of) the same position. Marching cubes can emit coincident
 * vertices (a crossing exactly at a grid point), and a triangle soup is all
 * coincident vertices; either way the corners that meet must count as one.
 */
export function weldVertices(positions: Float32Array): Uint32Array {
    let extent = 0;
    for (let i = 0; i < positions.length; i++) extent = Math.max(extent, Math.abs(positions[i]));
    const tolerance = Math.max(extent, 1e-12) * 1e-6;
    const first = new Map<string, number>();
    const canonical = new Uint32Array(positions.length / 3);
    for (let v = 0; v < canonical.length; v++) {
        const key = `${Math.round(positions[3 * v] / tolerance)},${Math.round(positions[3 * v + 1] / tolerance)},${Math.round(positions[3 * v + 2] / tolerance)}`;
        let id = first.get(key);
        if (id === undefined) { id = v; first.set(key, id); }
        canonical[v] = id;
    }
    return canonical;
}

export function analyseMesh(positions: Float32Array, indices: Uint32Array): MeshAnalysis {
    const canonical = weldVertices(positions);
    const edges = new Map<string, { forward: number; backward: number }>();
    const kept: number[] = [];
    let degenerate = 0;
    let volume = 0;
    const p = (v: number, axis: number) => positions[3 * v + axis];
    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [canonical[indices[t]], canonical[indices[t + 1]], canonical[indices[t + 2]]];
        if (a === b || b === c || a === c) { degenerate++; continue; }
        kept.push(a, b, c);
        for (const [from, to] of [[a, b], [b, c], [c, a]]) {
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
        report: {
            triangles: indices.length / 3, degenerateTriangles: degenerate, boundaryEdges: boundary,
            nonManifoldEdges: nonManifold, misorientedEdges: misoriented, signedVolume: volume,
        },
        triangles: Uint32Array.from(kept),
    };
}

export function meshTopology(positions: Float32Array, indices: Uint32Array): TopologyReport {
    return analyseMesh(positions, indices).report;
}

export function isWatertight(report: TopologyReport): boolean {
    return report.triangles > report.degenerateTriangles
        && report.boundaryEdges === 0 && report.nonManifoldEdges === 0 && report.misorientedEdges === 0;
}
