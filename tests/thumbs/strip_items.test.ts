import { atomStripItems, basicStripItems, THUMB_RESOLUTION } from '../../src/thumbs/strip_items';
import { neonProfile } from '../export/fixtures';
import { CURVE_COLORS } from '../../src/curve_colors';

const base = { profile: neonProfile(), selectedShell: null, selectedOrbital: null, enclosedFraction: 0.9, palette: CURVE_COLORS };

describe('the atom strip (spec §9.1 "Strip")', () => {
    it('shows the whole atom and one tile per shell at the atom level', () => {
        const items = atomStripItems({ ...base, level: 'atom' });
        expect(items.map(item => item.label)).toEqual(['Whole atom', 'K', 'L']);
        expect(items.map(item => item.spoken)).toEqual(['Whole atom', 'K shell (n = 1)', 'L shell (n = 2)']);
        expect(items[0].selected).toBe(true);
        expect(items[2].target).toEqual({ level: 'shell', n: 2 });
        expect(items.every(item => item.thumb.kind === 'rings')).toBe(true);
    });

    it('lists every occupied orbital of the open shell, grouped by subshell, after a back tile', () => {
        const items = atomStripItems({ ...base, level: 'orbital', selectedShell: 2, selectedOrbital: { n: 2, l: 1, ml: 0 } });
        expect(items.map(item => item.label)).toEqual(['Whole atom', '2s', '2p_y', '2p_z', '2p_x']);
        expect(items.map(item => item.group)).toEqual([null, '2s', '2p', '2p', '2p']);
        expect(items[0].thumb.kind).toBe('back');
        expect(items.find(item => item.selected)?.label).toBe('2p_z');
        expect(items[3].target).toEqual({ level: 'orbital', n: 2, l: 1, ml: 0 });
        const thumb = items[3].thumb;
        expect(thumb.kind === 'orbital' && thumb.request.params).toMatchObject({ n: 2, l: 1, ml: 0, Z: 10, resolution: THUMB_RESOLUTION });
        expect(thumb.kind === 'orbital' && thumb.request.contentKey).toContain('2|1|0');
    });

    // §3.3: a ring's hue is the shell's -- the same palette entry, by index, as its curve in the plot and its ring in the view.
    it('colours each shell glyph with its palette entry, by shell index', () => {
        const items = atomStripItems({ ...base, level: 'atom' });
        const rings = items.map(item => (item.thumb.kind === 'rings' ? item.thumb.rings.map(ring => ring.colour) : []));
        expect(rings).toEqual([[CURVE_COLORS[0], CURVE_COLORS[1]], [CURVE_COLORS[0]], [CURVE_COLORS[1]]]);
    });
});

describe('the Basic Orbitals strip (spec §9.2 "Strip", Task 8): n² tiles grouped by l', () => {
    it('lists all 9 of n = 3, grouped 3s (1), 3p (3), 3d (5), mₗ ascending within each group', () => {
        const items = basicStripItems({ selection: { n: 3, l: 2, ml: 0 }, enclosedFraction: 0.9 });
        expect(items).toHaveLength(9);
        expect(items.map(item => item.group)).toEqual(['3s', '3p', '3p', '3p', '3d', '3d', '3d', '3d', '3d']);
        const groupCounts = new Map<string, number>();
        for (const item of items) groupCounts.set(item.group!, (groupCounts.get(item.group!) ?? 0) + 1);
        expect([...groupCounts.entries()]).toEqual([['3s', 1], ['3p', 3], ['3d', 5]]);
        const byGroup = (group: string) => items.filter(item => item.group === group).map(item => item.target.ml);
        expect(byGroup('3p')).toEqual([-1, 0, 1]);
        expect(byGroup('3d')).toEqual([-2, -1, 0, 1, 2]);
    });

    it('lists all 81 of n = 9', () => {
        expect(basicStripItems({ selection: { n: 9, l: 0, ml: 0 }, enclosedFraction: 0.9 })).toHaveLength(81);
    });

    it('marks the selection\'s own tile selected, and no other', () => {
        const items = basicStripItems({ selection: { n: 3, l: 1, ml: -1 }, enclosedFraction: 0.9 });
        expect(items.filter(item => item.selected)).toHaveLength(1);
        expect(items.find(item => item.selected)?.target).toEqual({ n: 3, l: 1, ml: -1 });
    });

    // Interfaces produced: THUMB_RESOLUTION (64), Z fixed at 1 (BASIC_ORBITALS_Z).
    it('requests every tile at the strip resolution and Z = 1', () => {
        const items = basicStripItems({ selection: { n: 4, l: 2, ml: 1 }, enclosedFraction: 0.9 });
        for (const item of items) {
            expect(item.thumb.kind === 'orbital' && item.thumb.request.params).toMatchObject({ resolution: THUMB_RESOLUTION, Z: 1 });
        }
    });

    // Ruling T16-optname (spec §13): "<label> orbital".
    it('names every option "<label> orbital"', () => {
        const items = basicStripItems({ selection: { n: 3, l: 2, ml: 0 }, enclosedFraction: 0.9 });
        for (const item of items) expect(item.spoken).toBe(`${item.label} orbital`);
        expect(items.map(item => item.label)).toContain('3p_x');
    });
});
