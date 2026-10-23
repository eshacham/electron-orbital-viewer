import type { MoleculeAtom } from '../molecules/library_types';
import type { Representation } from '../molecules/ball_and_stick';
import { ATOM_RADIUS_FACTOR, BOHR_TO_ANGSTROM, BOND_RADIUS_BOHR, COVALENT_RADII_ANGSTROM, CPK_COLORS, detectBonds } from '../molecules/ball_and_stick';
import { VDW_RADII_ANGSTROM } from '../molecules/vdw_radii';
import { moleculeCentre } from '../molecules/render_plan';
import { hexToRgb255 } from '../design/colour_math';
import { THUMB_CAMERA_DIRECTION, THUMB_LIGHT_RIG } from './render_thumbnail';
import { THUMB_FILL, THUMB_TILE_PX } from './thumb_key';

export type GlyphContext = Pick<CanvasRenderingContext2D,
    'clearRect' | 'beginPath' | 'arc' | 'fill' | 'stroke' | 'moveTo' | 'lineTo' | 'createRadialGradient' | 'createLinearGradient'> & {
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
    lineCap: CanvasLineCap;
};

/** The theme's colours a glyph needs: the atoms' outline (the `text-3` token) and hydrogen's (CPK white, or Light Clean's own, ruling R12). */
export interface GlyphColours { outline: string; hydrogen: string }

type Vec = [number, number, number];
const dot = (u: Vec, v: Vec) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cross = (u: Vec, v: Vec): Vec => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const unit = (v: Vec): Vec => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };

/** An atom as the tile camera sees it, in Å: canvas axes (x right, y down) about the molecule's centre; depth grows towards the camera. */
export interface TileAtom { index: number; x: number; y: number; depth: number }

/**
 * Task 16d item 3 (T15-a): the atoms as the strip's other tiles see the molecule -- from THUMB_CAMERA_DIRECTION,
 * up = +z, exactly render_thumbnail's camera -- orthographic (the tiles' 30° field barely bends a molecule), about
 * the molecule's own centre, in painter's order (farthest first). Was StructurePreview's projectStructure, which
 * looks down the thinnest axis, so the structure tiles showed the molecule from another side than the tiles beside them.
 */
export function projectFromTileCamera(atoms: readonly MoleculeAtom[]): TileAtom[] {
    const towards = unit([...THUMB_CAMERA_DIRECTION] as Vec);
    // three's lookAt with up = +z: screen right = up × towards, screen up = towards × right.
    const right = unit(cross([0, 0, 1], towards));
    const up = cross(towards, right);
    const centre = moleculeCentre({ atoms: [...atoms] });
    return atoms
        .map(({ position }, index) => {
            const p = [0, 1, 2].map(k => (position[k] - centre[k]) * BOHR_TO_ANGSTROM) as Vec;
            return { index, x: dot(p, right), y: -dot(p, up), depth: dot(p, towards) };
        })
        .sort((a, b) => a.depth - b.depth);
}

/** The key light's direction on the canvas (x right, y down), from THUMB_LIGHT_RIG.key (camera frame: y up). */
const KEY_ON_CANVAS = (() => {
    const [x, y] = THUMB_LIGHT_RIG.key;
    const n = Math.hypot(x, y);
    return [x / n, -y / n] as const;
})();
/** How far towards white the highlight goes, and how dark the rim (the tiles' lit spheres read ≈ 60 % at the edge). */
const HIGHLIGHT_TOWARDS_WHITE = 0.45;
const RIM_SHADE = 0.6;
const rgb = ([r, g, b]: number[]) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
const lighter = (hex: string) => rgb(hexToRgb255(hex).map(c => c + (255 - c) * HIGHLIGHT_TOWARDS_WHITE));
const darker = (hex: string) => rgb(hexToRgb255(hex).map(c => c * RIM_SHADE));

/**
 * Ruling P6: the Molecules strip's Ball and stick and Space filling tiles are
 * Canvas-2D pictures of the molecule's real structure -- no WebGL and no job.
 * Seen from the tile camera (projectFromTileCamera, Task 16d) and drawn in
 * painter's order (farthest first). Atoms are CPK discs with a 1 px (at the
 * 72 px tile) outline in the theme's `text-3`, which keeps white hydrogen
 * visible on a light tile; ball and stick adds each bond as two half-sticks,
 * each in its atom's colour (StructurePreview's split), on an outline of its
 * own drawn first (one line per bond); space filling sizes
 * the circles by van der Waals radius (vdw_radii.ts, as buildSpaceFilling
 * does) and draws no sticks. The drawing fills THUMB_FILL of the half-side,
 * as an orbital tile's mesh and a ring glyph do, so a strip's tiles are
 * framed alike.
 *
 * Task 16d item 3 (T15-a): shaded, as the lit tiles beside them -- each disc a
 * radial gradient from a highlight towards the tiles' key light (upper left)
 * through its CPK colour (the stop at 0.5) to a darker rim, and each
 * half-stick a linear gradient across its width, lit on the same side.
 */
export function drawStructureGlyph(
    ctx: GlyphContext, size: number, atoms: readonly MoleculeAtom[], representation: Exclude<Representation, 'none'>, colours: GlyphColours,
): void {
    ctx.clearRect(0, 0, size, size);
    if (atoms.length === 0) return;
    const projected = projectFromTileCamera(atoms);
    const Z = (atom: TileAtom) => atoms[atom.index].Z;
    const ballRadius = (atom: TileAtom) => ATOM_RADIUS_FACTOR * COVALENT_RADII_ANGSTROM[Z(atom)];
    // The strip never offers space filling for an element with no radius (ruling P8b); ball-and-stick's ball stands in.
    const radiusOf = (atom: TileAtom) => (representation === 'space-filling' ? VDW_RADII_ANGSTROM[Z(atom)] ?? ballRadius(atom) : ballRadius(atom));
    const reach = Math.max(...projected.map(atom => Math.hypot(atom.x, atom.y) + radiusOf(atom)));
    const scale = ((size / 2) * THUMB_FILL) / reach;
    const centre = size / 2;
    const at = (atom: TileAtom): [number, number] => [centre + atom.x * scale, centre + atom.y * scale];
    const colourOf = (atom: TileAtom) => (Z(atom) === 1 ? colours.hydrogen : CPK_COLORS[Z(atom)]);

    const outline = size / THUMB_TILE_PX;
    if (representation === 'ball-and-stick') {
        const byIndex = new Map(projected.map(atom => [atom.index, atom]));
        const sticks = detectBonds([...atoms]).map(bond => [byIndex.get(bond.a)!, byIndex.get(bond.b)!] as const);
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
            // Across the stick, from its shaded side to its lit one (the normal facing the key light).
            const length = Math.hypot(qx - px, qy - py) || 1;
            let [nx, ny] = [-(qy - py) / length, (qx - px) / length];
            if (nx * KEY_ON_CANVAS[0] + ny * KEY_ON_CANVAS[1] < 0) [nx, ny] = [-nx, -ny];
            for (const [atom, [x0, y0], [x1, y1]] of [[p, [px, py], [mx, my]], [q, [mx, my], [qx, qy]]] as const) {
                const base = colourOf(atom);
                const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
                const shade = ctx.createLinearGradient(cx - (nx * stick) / 2, cy - (ny * stick) / 2, cx + (nx * stick) / 2, cy + (ny * stick) / 2);
                shade.addColorStop(0, darker(base));
                shade.addColorStop(0.5, base);
                shade.addColorStop(0.8, lighter(base));
                shade.addColorStop(1, base);
                ctx.strokeStyle = shade;
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }
        }
    }
    for (const atom of projected) {
        const [x, y] = at(atom);
        const r = radiusOf(atom) * scale;
        const base = colourOf(atom);
        const shade = ctx.createRadialGradient(x + KEY_ON_CANVAS[0] * 0.4 * r, y + KEY_ON_CANVAS[1] * 0.4 * r, 0, x, y, r);
        shade.addColorStop(0, lighter(base));
        shade.addColorStop(0.5, base);
        shade.addColorStop(1, darker(base));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = shade;
        ctx.fill();
        ctx.strokeStyle = colours.outline;
        ctx.lineWidth = outline;
        ctx.stroke();
    }
}
