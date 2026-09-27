import { ExportSurface, NOTHING_TO_EXPORT_REASON, surfaceBounds } from './surfaces';
import { isWatertight, meshTopology, TopologyReport, weldVertices } from './mesh_topology';

export class StlExportError extends Error {}

/** What the manifold check found, in words -- the refusal says why, not just that. */
function topologyProblem(report: TopologyReport): string {
    const problems: string[] = [];
    if (report.boundaryEdges > 0) problems.push(`${report.boundaryEdges} open edges`);
    if (report.nonManifoldEdges > 0) problems.push(`${report.nonManifoldEdges} edges shared by more than two triangles`);
    if (report.misorientedEdges > 0) problems.push(`${report.misorientedEdges} edges wound inconsistently`);
    if (problems.length === 0) problems.push('no triangles with area');
    return problems.join(', ');
}

/**
 * Binary STL, in millimetres (the unit slicers assume), the longest side at
 * the size chosen. Every surface must pass the manifold check; one that does
 * not is refused with the reason rather than printed as something else.
 */
export function encodeStl(surfaces: ExportSurface[], longestSideMm: number): ArrayBuffer {
    if (surfaces.length === 0) throw new StlExportError(NOTHING_TO_EXPORT_REASON);
    const { longestSide } = surfaceBounds(surfaces);
    if (!(longestSideMm > 0) || !(longestSide > 0)) throw new StlExportError('Pick a print size.');
    const mmPerBohr = longestSideMm / longestSide;

    const triangles: Array<{ surface: ExportSurface; a: number; b: number; c: number }> = [];
    for (const surface of surfaces) {
        const report = meshTopology(surface.positions, surface.indices);
        if (!isWatertight(report)) {
            // Open edges are where the surface ran into the sampling box: a
            // smaller contour stays inside it.
            const hint = report.boundaryEdges > 0 ? ' Try a lower enclosed fraction.' : '';
            throw new StlExportError(`${surface.name} is not watertight (${topologyProblem(report)}), so it would not print as a solid.${hint}`);
        }
        const flip = report.signedVolume < 0;
        const id = weldVertices(surface.positions);
        for (let t = 0; t < surface.indices.length; t += 3) {
            const [a, b, c] = [surface.indices[t], surface.indices[t + 1], surface.indices[t + 2]];
            if (id[a] === id[b] || id[b] === id[c] || id[a] === id[c]) continue;
            triangles.push(flip ? { surface, a, b: c, c: b } : { surface, a, b, c });
        }
    }

    const buffer = new ArrayBuffer(84 + 50 * triangles.length);
    const view = new DataView(buffer);
    // A binary STL's header must not start with "solid": some readers take
    // that as the ASCII format and fail on the bytes after it.
    const header = `electron-orbital-viewer, millimetres, 1 a0 = ${mmPerBohr.toFixed(2)} mm`.slice(0, 80);
    for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);
    view.setUint32(80, triangles.length, true);

    let offset = 84;
    const vertex = (s: ExportSurface, v: number) => [0, 1, 2].map(axis => s.positions[3 * v + axis] * mmPerBohr);
    for (const { surface, a, b, c } of triangles) {
        const [pa, pb, pc] = [vertex(surface, a), vertex(surface, b), vertex(surface, c)];
        const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const length = Math.hypot(n[0], n[1], n[2]) || 1;
        for (const value of [...n.map(x => x / length), ...pa, ...pb, ...pc]) {
            view.setFloat32(offset, value, true);
            offset += 4;
        }
        view.setUint16(offset, 0, true);
        offset += 2;
    }
    return buffer;
}
