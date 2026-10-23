import * as THREE from 'three';
import { drawStructureGlyph, projectFromTileCamera, type GlyphContext } from '../../src/thumbs/structure_glyph';
import { BOHR_TO_ANGSTROM, COVALENT_RADII_ANGSTROM, CPK_COLORS, detectBonds } from '../../src/molecules/ball_and_stick';
import { VDW_RADII_ANGSTROM } from '../../src/molecules/vdw_radii';
import { THUMB_FILL } from '../../src/thumbs/thumb_key';
import { THUMB_CAMERA_DIRECTION, THUMB_LIGHT_RIG } from '../../src/thumbs/render_thumbnail';
import { hexToRgb255 } from '../../src/design/colour_math';
import { LIGHT_HYDROGEN } from '../../src/design/science';
import { TOKENS } from '../../src/design/tokens';
import { glycineAtoms, waterAtoms } from '../molecules/fixtures';

/** Task 16d item 3: a recorded gradient -- its geometry and its colour stops. */
interface Gradient { kind: 'radial' | 'linear'; args: number[]; stops: Array<[number, string]> }
const gradient = (kind: Gradient['kind'], args: number[]): Gradient & { addColorStop(offset: number, colour: string): void } => {
    const g: Gradient = { kind, args, stops: [] };
    return Object.assign(g, { addColorStop: (offset: number, colour: string) => { g.stops.push([offset, colour]); } });
};
/** A shaded fill's base colour is its stop at 0.5 (Task 16d item 3); a flat one is the colour itself. */
const baseOf = (style: string | Gradient) => (typeof style === 'string' ? style : style.stops.find(([offset]) => offset === 0.5)![1]);
const rgbOf = (css: string) => (css.startsWith('#') ? hexToRgb255(css) : css.match(/\d+/g)!.slice(0, 3).map(Number));
const lightness = (css: string) => rgbOf(css).reduce((a, b) => a + b, 0);

/** A 2D context that records what is drawn: each circle (centre, radius, fill and outline) and each stick. */
function recorder() {
    // Task 16d item 3: fills and strokes are gradients now; `fill`/`colour` keep the base colour the tests compared,
    // and `style` keeps the whole gradient.
    const circles: Array<{ x: number; y: number; r: number; fill: string; style: string | Gradient; outline: string; width: number }> = [];
    const sticks: Array<{ from: [number, number]; to: [number, number]; colour: string; style: string | Gradient; width: number }> = [];
    let path: { arc?: [number, number, number]; from?: [number, number]; to?: [number, number] } = {};
    const ctx = {
        fillStyle: '' as string | Gradient, strokeStyle: '' as string | Gradient, lineWidth: 0, lineCap: 'butt' as CanvasLineCap,
        createRadialGradient: jest.fn((...args: number[]) => gradient('radial', args)),
        createLinearGradient: jest.fn((...args: number[]) => gradient('linear', args)),
        clearRect: jest.fn(),
        beginPath: jest.fn(() => { path = {}; }),
        arc: jest.fn((x: number, y: number, r: number) => { path.arc = [x, y, r]; }),
        moveTo: jest.fn((x: number, y: number) => { path.from = [x, y]; }),
        lineTo: jest.fn((x: number, y: number) => { path.to = [x, y]; }),
        fill: jest.fn(() => {
            if (path.arc) circles.push({ x: path.arc[0], y: path.arc[1], r: path.arc[2], fill: baseOf(ctx.fillStyle), style: ctx.fillStyle, outline: '', width: 0 });
        }),
        stroke: jest.fn(() => {
            if (path.arc) {
                const last = circles[circles.length - 1];
                last.outline = baseOf(ctx.strokeStyle);
                last.width = ctx.lineWidth;
            } else if (path.from && path.to) {
                sticks.push({ from: path.from, to: path.to, colour: baseOf(ctx.strokeStyle), style: ctx.strokeStyle, width: ctx.lineWidth });
            }
        }),
    };
    return { ctx: ctx as unknown as GlyphContext & typeof ctx, circles, sticks };
}

const DARK = { outline: TOKENS.dark['text-3'], hydrogen: CPK_COLORS[1] };
const LIGHT = { outline: TOKENS.light['text-3'], hydrogen: LIGHT_HYDROGEN };

describe('drawStructureGlyph (ruling P6: the structure tiles are Canvas-2D glyphs of the real structure)', () => {
    // Task 16d item 3 (replaces the bohr → [Z, x, y, z] Å test: projectStructure is no longer what the glyph reads).
    // The glyph looks along the tile camera's own direction (THUMB_CAMERA_DIRECTION, up = +z, as
    // render_thumbnail's camera), so it shows the molecule from the side every other tile does; Å throughout.
    it('projects the library\'s bohr, in Å, as the tile camera sees it -- the side every other tile shows', () => {
        const camera = new THREE.PerspectiveCamera();
        camera.up.set(0, 0, 1);
        camera.position.set(...THUMB_CAMERA_DIRECTION);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const towards = new THREE.Vector3(...THUMB_CAMERA_DIRECTION).normalize();
        const atoms = waterAtoms();
        const projected = projectFromTileCamera(atoms);
        expect(projected.map(p => p.index).sort()).toEqual([0, 1, 2]);
        for (const p of projected) {
            const position = new THREE.Vector3(...atoms[p.index].position).multiplyScalar(BOHR_TO_ANGSTROM);
            const [h, o] = [position, new THREE.Vector3(...atoms[0].position).multiplyScalar(BOHR_TO_ANGSTROM)];
            const relative = h.clone().sub(o);
            const fromO = projected.find(q => q.index === 0)!;
            // Screen right is +x, screen up is canvas -y; depth grows towards the camera.
            expect(p.x - fromO.x).toBeCloseTo(relative.dot(right), 9);
            expect(p.y - fromO.y).toBeCloseTo(-relative.dot(up), 9);
            expect(p.depth - fromO.depth).toBeCloseTo(relative.dot(towards), 9);
        }
        // Painter's order: farthest from the camera first.
        const depths = projected.map(p => p.depth);
        expect(depths).toEqual([...depths].sort((a, b) => a - b));
    });

    it('draws ball and stick as one circle per atom and two half-sticks per bond, each half in its atom\'s colour', () => {
        const { ctx, circles, sticks } = recorder();
        drawStructureGlyph(ctx, 144, waterAtoms(), 'ball-and-stick', DARK);
        expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 144, 144);
        expect(ctx.arc).toHaveBeenCalledTimes(3);
        const bonds = detectBonds(waterAtoms()).length;
        // Each bond: one outline line under it (so a near-white hydrogen half shows on a light tile), then its two halves.
        expect(ctx.lineTo).toHaveBeenCalledTimes(bonds * 3);
        expect(sticks.slice(0, bonds).map(s => s.colour)).toEqual([TOKENS.dark['text-3'], TOKENS.dark['text-3']]);
        expect(sticks.slice(bonds).map(s => s.colour).sort()).toEqual([CPK_COLORS[1], CPK_COLORS[1], CPK_COLORS[8], CPK_COLORS[8]].sort());
        // CPK fills, each with a 1 px (at the 72 px tile, so 2 device px here) text-3 outline.
        expect(circles.map(c => c.fill).sort()).toEqual([CPK_COLORS[1], CPK_COLORS[1], CPK_COLORS[8]].sort());
        circles.forEach(c => { expect(c.outline).toBe(TOKENS.dark['text-3']); expect(c.width).toBeCloseTo(2, 9); });
        // Sized as ball and stick sizes atoms: oxygen's ball over hydrogen's is their covalent radii's ratio.
        const radius = (fill: string) => circles.find(c => c.fill === fill)!.r;
        expect(radius(CPK_COLORS[8]) / radius(CPK_COLORS[1])).toBeCloseTo(COVALENT_RADII_ANGSTROM[8] / COVALENT_RADII_ANGSTROM[1], 9);
    });

    it('draws space filling as van der Waals circles and no sticks', () => {
        const { ctx, circles } = recorder();
        drawStructureGlyph(ctx, 144, waterAtoms(), 'space-filling', DARK);
        expect(ctx.arc).toHaveBeenCalledTimes(3);
        expect(ctx.lineTo).not.toHaveBeenCalled();
        const radius = (fill: string) => circles.find(c => c.fill === fill)!.r;
        expect(radius(CPK_COLORS[8]) / radius(CPK_COLORS[1])).toBeCloseTo(VDW_RADII_ANGSTROM[8] / VDW_RADII_ANGSTROM[1], 9);
    });

    it('frames what it draws as an orbital tile is framed: inside THUMB_FILL of the half-side, and filling it', () => {
        for (const representation of ['ball-and-stick', 'space-filling'] as const) {
            for (const atoms of [waterAtoms(), glycineAtoms()]) {
                const { ctx, circles } = recorder();
                drawStructureGlyph(ctx, 144, atoms, representation, DARK);
                const reach = Math.max(...circles.map(c => Math.hypot(c.x - 72, c.y - 72) + c.r));
                expect(reach).toBeLessThanOrEqual(72 * THUMB_FILL + 1e-9);
                expect(reach).toBeGreaterThan(72 * THUMB_FILL * 0.95);
            }
        }
    });

    it('paints hydrogen in Light Clean\'s own hydrogen colour (ruling R12), outlined in that theme\'s text-3', () => {
        const { ctx, circles } = recorder();
        drawStructureGlyph(ctx, 72, waterAtoms(), 'ball-and-stick', LIGHT);
        expect(circles.filter(c => c.fill === LIGHT_HYDROGEN)).toHaveLength(2);
        circles.forEach(c => { expect(c.outline).toBe(TOKENS.light['text-3']); expect(c.width).toBeCloseTo(1, 9); });
    });

    // Task 16d item 3: the tile camera's painter's order now (was projectStructure's, looking down the thinnest axis).
    it('draws in the tile camera\'s painter\'s order (farthest first), so a nearer atom covers the ones behind it', () => {
        const { ctx, circles } = recorder();
        drawStructureGlyph(ctx, 144, glycineAtoms(), 'space-filling', DARK);
        const atoms = glycineAtoms();
        const order = projectFromTileCamera(atoms).map(p => (atoms[p.index].Z === 1 ? DARK.hydrogen : CPK_COLORS[atoms[p.index].Z]));
        expect(circles.map(c => c.fill)).toEqual(order);
    });

    // Task 16d item 3 (T15-a): shaded like the lit tiles beside them -- still Canvas 2D, no WebGL (P6).
    it('shades each atom with a radial gradient: lighter towards the tiles\' key light (upper left), darker at the rim', () => {
        const { ctx, circles } = recorder();
        drawStructureGlyph(ctx, 144, waterAtoms(), 'ball-and-stick', DARK);
        const [kx, ky] = THUMB_LIGHT_RIG.key;
        for (const circle of circles) {
            const style = circle.style as Gradient;
            expect(style.kind).toBe('radial');
            const [x0, y0, r0, x1, y1, r1] = style.args;
            // The outer circle is the atom's own; the highlight sits inside it, towards the key light (canvas y is down).
            expect([x1, y1, r1]).toEqual([circle.x, circle.y, circle.r]);
            expect(r0).toBe(0);
            const [dx, dy] = [x0 - circle.x, y0 - circle.y];
            expect(Math.hypot(dx, dy)).toBeLessThan(circle.r);
            expect(dx * kx + dy * -ky).toBeGreaterThan(0.9 * Math.hypot(dx, dy) * Math.hypot(kx, ky));
            const offsets = style.stops.map(([offset]) => offset);
            expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
            const [highlight, rim] = [style.stops[0][1], style.stops[style.stops.length - 1][1]];
            expect(lightness(highlight)).toBeGreaterThan(lightness(circle.fill) - 1e-9);
            expect(lightness(rim)).toBeLessThan(lightness(circle.fill));
        }
        // Oxygen's base is its CPK red, exactly.
        expect(circles.some(c => c.fill === CPK_COLORS[8])).toBe(true);
    });

    it('shades each half-stick with a linear gradient across its width, its base the atom\'s CPK colour', () => {
        const { ctx, sticks } = recorder();
        drawStructureGlyph(ctx, 144, waterAtoms(), 'ball-and-stick', DARK);
        const halves = sticks.filter(s => typeof s.style !== 'string');
        expect(halves).toHaveLength(2 * detectBonds(waterAtoms()).length);
        for (const half of halves) {
            const style = half.style as Gradient;
            expect(style.kind).toBe('linear');
            const [x0, y0, x1, y1] = style.args;
            const [gx, gy] = [x1 - x0, y1 - y0];
            const [sx, sy] = [half.to[0] - half.from[0], half.to[1] - half.from[1]];
            // Across the stick (perpendicular), its full width.
            expect(Math.abs(gx * sx + gy * sy)).toBeLessThan(1e-6 * Math.hypot(sx, sy));
            expect(Math.hypot(gx, gy)).toBeCloseTo(half.width, 9);
            // Lighter towards the key light's side, darker on the far side.
            const lit = style.stops[style.stops.length - 2][1];
            expect(lightness(style.stops[0][1])).toBeLessThan(lightness(half.colour));
            expect(lightness(lit)).toBeGreaterThan(lightness(half.colour) - 1e-9);
            const [kx, ky] = THUMB_LIGHT_RIG.key;
            expect(gx * kx + gy * -ky).toBeGreaterThan(0);
        }
        expect(halves.map(h => h.colour).sort()).toEqual([CPK_COLORS[1], CPK_COLORS[1], CPK_COLORS[8], CPK_COLORS[8]].sort());
    });
});
