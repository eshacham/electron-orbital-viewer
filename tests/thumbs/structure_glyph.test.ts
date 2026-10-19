import { drawStructureGlyph, toCanonicalAtoms, type GlyphContext } from '../../src/thumbs/structure_glyph';
import { BOHR_TO_ANGSTROM, COVALENT_RADII_ANGSTROM, CPK_COLORS, detectBonds } from '../../src/molecules/ball_and_stick';
import { VDW_RADII_ANGSTROM } from '../../src/molecules/vdw_radii';
import { projectStructure } from '../../src/jobs/structure_projection';
import { THUMB_FILL } from '../../src/thumbs/thumb_key';
import { LIGHT_HYDROGEN } from '../../src/design/science';
import { TOKENS } from '../../src/design/tokens';
import { glycineAtoms, waterAtoms } from '../molecules/fixtures';

/** A 2D context that records what is drawn: each circle (centre, radius, fill and outline) and each stick. */
function recorder() {
    const circles: Array<{ x: number; y: number; r: number; fill: string; outline: string; width: number }> = [];
    const sticks: Array<{ from: [number, number]; to: [number, number]; colour: string }> = [];
    let path: { arc?: [number, number, number]; from?: [number, number]; to?: [number, number] } = {};
    const ctx = {
        fillStyle: '' as string, strokeStyle: '' as string, lineWidth: 0, lineCap: 'butt' as CanvasLineCap,
        clearRect: jest.fn(),
        beginPath: jest.fn(() => { path = {}; }),
        arc: jest.fn((x: number, y: number, r: number) => { path.arc = [x, y, r]; }),
        moveTo: jest.fn((x: number, y: number) => { path.from = [x, y]; }),
        lineTo: jest.fn((x: number, y: number) => { path.to = [x, y]; }),
        fill: jest.fn(() => {
            if (path.arc) circles.push({ x: path.arc[0], y: path.arc[1], r: path.arc[2], fill: ctx.fillStyle, outline: '', width: 0 });
        }),
        stroke: jest.fn(() => {
            if (path.arc) {
                const last = circles[circles.length - 1];
                last.outline = ctx.strokeStyle;
                last.width = ctx.lineWidth;
            } else if (path.from && path.to) sticks.push({ from: path.from, to: path.to, colour: ctx.strokeStyle });
        }),
    };
    return { ctx: ctx as unknown as GlyphContext & typeof ctx, circles, sticks };
}

const DARK = { outline: TOKENS.dark['text-3'], hydrogen: CPK_COLORS[1] };
const LIGHT = { outline: TOKENS.light['text-3'], hydrogen: LIGHT_HYDROGEN };

describe('drawStructureGlyph (ruling P6: the structure tiles are Canvas-2D glyphs of the real structure)', () => {
    it('turns the library\'s bohr into the API\'s [Z, x, y, z] in Å, which projectStructure reads', () => {
        const [o, h] = toCanonicalAtoms(waterAtoms());
        expect(o).toEqual([8, 0, 0, 0]);
        expect(h[0]).toBe(1);
        expect(Math.hypot(h[1], h[2], h[3])).toBeCloseTo(0.958, 6);
        expect(h[3]).toBeCloseTo(waterAtoms()[1].position[2] * BOHR_TO_ANGSTROM, 9);
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

    it('draws in projectStructure\'s painter\'s order (farthest first), so a nearer atom covers the ones behind it', () => {
        const { ctx, circles } = recorder();
        drawStructureGlyph(ctx, 144, glycineAtoms(), 'space-filling', DARK);
        const order = projectStructure(toCanonicalAtoms(glycineAtoms())).atoms.map(atom => (atom.Z === 1 ? DARK.hydrogen : CPK_COLORS[atom.Z]));
        expect(circles.map(c => c.fill)).toEqual(order);
    });
});
