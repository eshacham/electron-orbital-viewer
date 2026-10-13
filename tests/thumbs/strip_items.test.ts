import { atomStripItems, THUMB_RESOLUTION } from '../../src/thumbs/strip_items';
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
