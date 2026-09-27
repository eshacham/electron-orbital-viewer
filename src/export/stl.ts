import { ExportSurface, NOTHING_TO_EXPORT_REASON, surfaceBounds } from './surfaces';
import { analyseMesh, isWatertight, TopologyReport } from './mesh_topology';

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
 *
 * Several surfaces (a shell's lobes, an overlay's members) are written as
 * that many solids in one file, each closed on its own. Where they meet they
 * share edges -- used by four triangles, two each way -- which a slicer
 * resolves by merging the solids into one; the export dialog says so.
 */
export function encodeStl(surfaces: ExportSurface[], longestSideMm: number): ArrayBuffer {
    if (surfaces.length === 0) throw new StlExportError(NOTHING_TO_EXPORT_REASON);
    if (!(longestSideMm > 0) || !Number.isFinite(longestSideMm)) throw new StlExportError('Pick a print size.');
    for (const { name, positions } of surfaces) {
        if (!positions.every(Number.isFinite)) {
            throw new StlExportError(`${name} has coordinates that are not finite numbers, so it cannot be printed.`);
        }
    }
    const { longestSide } = surfaceBounds(surfaces);
    if (!(longestSide > 0)) {
        throw new StlExportError('The surface has no size: every vertex is at one point, so there is nothing to scale to a print.');
    }
    const mmPerBohr = longestSideMm / longestSide;

    // Checked and written from the same welded mesh (analyseMesh), so the
    // file holds exactly the vertices and triangles the check passed.
    const checked: Array<{ positions: Float32Array; triangles: Uint32Array; flip: boolean }> = [];
    for (const surface of surfaces) {
        const { report, triangles } = analyseMesh(surface.positions, surface.indices);
        if (!isWatertight(report)) {
            // Open edges are where the surface ran into the sampling box: a
            // smaller contour stays inside it.
            const hint = report.boundaryEdges > 0 ? ' Try a lower enclosed fraction.' : '';
            throw new StlExportError(`${surface.name} is not watertight (${topologyProblem(report)}), so it would not print as a solid.${hint}`);
        }
        checked.push({ positions: surface.positions, triangles, flip: report.signedVolume < 0 });
    }
    const triangleCount = checked.reduce((sum, { triangles }) => sum + triangles.length / 3, 0);

    const buffer = new ArrayBuffer(84 + 50 * triangleCount);
    const view = new DataView(buffer);
    // A binary STL's header must not start with "solid": some readers take
    // that as the ASCII format and fail on the bytes after it.
    const header = `electron-orbital-viewer, millimetres, 1 a0 = ${mmPerBohr.toPrecision(4)} mm`.slice(0, 80);
    for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);
    view.setUint32(80, triangleCount, true);

    let offset = 84;
    for (const { positions, triangles, flip } of checked) {
        const vertex = (v: number) => [0, 1, 2].map(axis => positions[3 * v + axis] * mmPerBohr);
        for (let t = 0; t < triangles.length; t += 3) {
            const pa = vertex(triangles[t]);
            const [pb, pc] = flip
                ? [vertex(triangles[t + 2]), vertex(triangles[t + 1])]
                : [vertex(triangles[t + 1]), vertex(triangles[t + 2])];
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
    }
    return buffer;
}
