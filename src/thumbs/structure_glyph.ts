import type { MoleculeAtom } from '../molecules/library_types';
import type { CanonicalAtom } from '../jobs/api_types';
import type { Representation } from '../molecules/ball_and_stick';
import { BOHR_TO_ANGSTROM, BOND_RADIUS_BOHR, CPK_COLORS } from '../molecules/ball_and_stick';
import { VDW_RADII_ANGSTROM } from '../molecules/vdw_radii';
import { projectStructure, type ProjectedAtom } from '../jobs/structure_projection';
import { THUMB_FILL, THUMB_TILE_PX } from './thumb_key';

export type GlyphContext = Pick<CanvasRenderingContext2D, 'clearRect' | 'beginPath' | 'arc' | 'fill' | 'stroke' | 'moveTo' | 'lineTo'> & {
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
    lineCap: CanvasLineCap;
};

/** The theme's colours a glyph needs: the atoms' outline (the `text-3` token) and hydrogen's (CPK white, or Light Clean's own, ruling R12). */
export interface GlyphColours { outline: string; hydrogen: string }

/** The library's atoms (bohr) as the jobs API writes them, `[Z, x, y, z]` in Å -- what projectStructure reads. */
export function toCanonicalAtoms(atoms: readonly MoleculeAtom[]): CanonicalAtom[] {
    return atoms.map(({ Z, position: [x, y, z] }) => [Z, x * BOHR_TO_ANGSTROM, y * BOHR_TO_ANGSTROM, z * BOHR_TO_ANGSTROM]);
}

/**
 * Ruling P6: the Molecules strip's Ball and stick and Space filling tiles are
 * Canvas-2D pictures of the molecule's real structure -- no WebGL and no job.
 * The projection is StructurePreview's (projectStructure at yaw 0: looking
 * down the structure's thinnest axis, never a mirror image), drawn in
 * painter's order (farthest first). Atoms are CPK circles with a 1 px (at the
 * 72 px tile) outline in the theme's `text-3`, which keeps white hydrogen
 * visible on a light tile; ball and stick adds each bond as two half-sticks,
 * each in its atom's colour (StructurePreview's split), on an outline of its
 * own drawn first (one line per bond); space filling sizes
 * the circles by van der Waals radius (vdw_radii.ts, as buildSpaceFilling
 * does) and draws no sticks. The drawing fills THUMB_FILL of the half-side,
 * as an orbital tile's mesh and a ring glyph do, so a strip's tiles are
 * framed alike.
 */
export function drawStructureGlyph(
    ctx: GlyphContext, size: number, atoms: readonly MoleculeAtom[], representation: Exclude<Representation, 'none'>, colours: GlyphColours,
): void {
    ctx.clearRect(0, 0, size, size);
    if (atoms.length === 0) return;
    const projection = projectStructure(toCanonicalAtoms(atoms));
    // The strip never offers space filling for an element with no radius (ruling P8b); ball-and-stick's ball stands in.
    const radiusOf = (atom: ProjectedAtom) => (representation === 'space-filling' ? VDW_RADII_ANGSTROM[atom.Z] ?? atom.radius : atom.radius);
    const reach = Math.max(...projection.atoms.map(atom => Math.hypot(atom.x, atom.y) + radiusOf(atom)));
    const scale = ((size / 2) * THUMB_FILL) / reach;
    const centre = size / 2;
    const at = (atom: ProjectedAtom): [number, number] => [centre + atom.x * scale, centre + atom.y * scale];
    const colourOf = (atom: ProjectedAtom) => (atom.Z === 1 ? colours.hydrogen : CPK_COLORS[atom.Z] ?? atom.color);

    const outline = size / THUMB_TILE_PX;
    if (representation === 'ball-and-stick') {
        const byIndex = new Map(projection.atoms.map(atom => [atom.index, atom]));
        const sticks = projection.bonds.map(bond => [byIndex.get(bond.a)!, byIndex.get(bond.b)!] as const);
        const stick = 2 * BOND_RADIUS_BOHR * BOHR_TO_ANGSTROM * scale;
        ctx.lineCap = 'butt';
        // Each stick sits on an outline as the atoms do -- a hydrogen's near-white half-stick vanished on a light tile.
        ctx.strokeStyle = colours.outline;
        ctx.lineWidth = stick + 2 * outline;
        for (const [p, q] of sticks) {
            ctx.beginPath();
            ctx.moveTo(...at(p));
            ctx.lineTo(...at(q));
            ctx.stroke();
        }
        ctx.lineWidth = stick;
        for (const [p, q] of sticks) {
            const [[px, py], [qx, qy]] = [at(p), at(q)];
            const [mx, my] = [(px + qx) / 2, (py + qy) / 2];
            for (const [atom, [x0, y0], [x1, y1]] of [[p, [px, py], [mx, my]], [q, [mx, my], [qx, qy]]] as const) {
                ctx.strokeStyle = colourOf(atom);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }
        }
    }
    for (const atom of projection.atoms) {
        const [x, y] = at(atom);
        ctx.beginPath();
        ctx.arc(x, y, radiusOf(atom) * scale, 0, 2 * Math.PI);
        ctx.fillStyle = colourOf(atom);
        ctx.fill();
        ctx.strokeStyle = colours.outline;
        ctx.lineWidth = outline;
        ctx.stroke();
    }
}
