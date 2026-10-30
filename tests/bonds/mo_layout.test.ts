import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildMoDiagram, DiagramLevel, h2plusOrbitals } from '../../src/bonds/mo_diagram';
import {
    layoutMoDiagram, levelFootprint, MO_BOX_HEIGHT, MO_BREAK_LINE, MO_DIAGRAM_WIDTH, MO_LEVEL_LEFT, MO_MAX_HEIGHT, MO_PX_PER_EV,
} from '../../src/bonds/mo_layout';
import { HARTREE_IN_EV } from '../../src/format/energy';
import { MoleculeOrbitalInfo } from '../../src/molecules/types';

/**
 * Science corrections S1 (critique P1): the diagram is drawn to one true eV scale. Every diatomic shares
 * MO_PX_PER_EV; a level's y is its energy and nothing else (no stretching to fill, no 20 px minimum row).
 */
const fixture = (path: string, key: 'meta.json' | 'basis.json'): MoleculeOrbitalInfo[] =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', path, key), 'utf8')).orbitals;

/** The published v3 orbitals the tests already carry: meta.json and basis.json at Rₑ (scan point 07), C₂ at point 01. */
const SYSTEMS: Record<string, MoleculeOrbitalInfo[]> = {
    n2: fixture('n2', 'meta.json'),
    o2: fixture('o2', 'meta.json'),
    hf: fixture('hf', 'meta.json'),
    'b2@07': fixture('b2-07', 'basis.json'),
    'c2@01': fixture('c2-01', 'basis.json'),
    'f2@07': fixture('f2-07', 'basis.json'),
    'li2@07': fixture('li2-07', 'basis.json'),
    'h2plus R=2': h2plusOrbitals(2),
    'h2plus R=0.5': h2plusOrbitals(0.5),
};

const r = (index: number, label: string, energyHartree: number, occupation = 2): MoleculeOrbitalInfo =>
    ({ index, label, energyHartree, occupation, spin: 'restricted' });
/** He₂'s 1σg–1σu* pair, 4 mHa apart (critique P1), and H₂'s, 490 mHa apart. */
const he2 = [r(0, '1σg', -0.5797), r(1, '1σu*', -0.5757)];
const h2 = [r(0, '1σg', -0.43), r(1, '1σu*', 0.06, 0)];
/**
 * The published v3 CO at scan point 00 (R = 1.706 a₀): C 1s (2σ) at −278 eV and O 1s (1σ) at −523 eV, 9.0 Ha apart --
 * wider than the 8.9 Ha from 2σ up to 3σ, so a widest-gap core split once left C 1s among the valence levels -- and
 * 6σ at +44 eV, which once shrank the scale to 0.81 px/eV with 32 ticks 8 px apart (review I1).
 */
const co00 = [r(0, '1σ', -19.217), r(1, '2σ', -10.212), r(2, '3σ', -1.292), r(3, '4σ', -0.585), r(4, '1π', -0.579),
    r(5, '1π', -0.579), r(6, '5σ', -0.36), r(7, '2π', 0.054, 0), r(8, '2π', 0.054, 0), r(9, '6σ', 1.627, 0)];
/**
 * The widest real cluster (review I2): the published v3 F₂ at scan point 10 (R = 2.828 a₀; points 09-14 and O₂@15 are
 * alike). 3σg, 1πu and 1πg* sit within a box of each other, so they take three columns, and once ran to 271 px.
 */
const f2at10 = [r(0, '1σg', -24.8017), r(1, '1σu*', -24.8017), r(2, '2σg', -1.3204), r(3, '2σu*', -1.1353), r(4, '3σg', -0.5948),
    r(5, '1πu', -0.5349), r(6, '1πu', -0.5349), r(7, '1πg*', -0.4332), r(8, '1πg*', -0.4332), r(9, '3σu*', -0.212, 0)];

const levelsOf = (orbitals: MoleculeOrbitalInfo[]): DiagramLevel[] => buildMoDiagram(orbitals).levels;
const ev = (level: DiagramLevel) => level.energyHartree * HARTREE_IN_EV;
const toScale = (level: DiagramLevel) => !level.core && !level.folded;
/** A box stands on its level line: the line's 2 px centred on y, the box spans [y − 17, y + 1]. */
const boxTop = (y: number) => y + 1 - MO_BOX_HEIGHT;
const boxBottom = (y: number) => y + 1;
/** The space between each level's label end and the next one's first box, left to right, for levels on one row. */
const gapsOf = (levels: DiagramLevel[], rows: { levelIndex: number; xOffset: number }[]) =>
    rows.slice(1).map((row, i) => row.xOffset - (rows[i].xOffset + levelFootprint(levels[rows[i].levelIndex])));
const tickGaps = (layout: ReturnType<typeof layoutMoDiagram>) => layout.axis.ticks.slice(1).map((tick, i) => tick.y - layout.axis.ticks[i].y);

describe('layoutMoDiagram', () => {
    it('places every level drawn to scale linearly in energy at MO_PX_PER_EV, in every system', () => {
        for (const [id, orbitals] of Object.entries(SYSTEMS)) {
            const levels = levelsOf(orbitals);
            const layout = layoutMoDiagram(levels);
            expect([id, layout.axis.shrunk, layout.axis.pxPerEv]).toEqual([id, false, MO_PX_PER_EV]);
            const valence = layout.rows.filter(row => toScale(levels[row.levelIndex]));
            const [first] = valence;
            for (const row of valence) {
                // Higher energy is higher on screen (smaller y), by exactly ΔE × 5 px.
                expect(first.y - row.y).toBeCloseTo((ev(levels[row.levelIndex]) - ev(levels[first.levelIndex])) * MO_PX_PER_EV, 9);
            }
        }
    });

    // Ruling T2 c5: H₂⁺ has one electron and two levels -- nothing is core, at any R.
    it("draws both of H2+'s levels to scale at every R, never a core band", () => {
        for (const R of [0.5, 0.75, 1, 2, 10]) {
            const levels = levelsOf(h2plusOrbitals(R));
            expect(levels.map(level => [level.core, level.folded])).toEqual([[false, false], [false, false]]);
            const layout = layoutMoDiagram(levels);
            expect(layout.breakY).toBeNull();
            expect(layout.rows[0].y - layout.rows[1].y).toBeCloseTo((ev(levels[1]) - ev(levels[0])) * MO_PX_PER_EV, 9);
        }
    });

    it("draws H2's 490 mHa gap as its eV gap × 5 px", () => {
        const layout = layoutMoDiagram(levelsOf(h2));
        const [lower, upper] = layout.rows;
        expect(lower.y - upper.y).toBeCloseTo(0.49 * HARTREE_IN_EV * 5, 9);
        expect(lower.y - upper.y).toBeGreaterThan(60);
        expect([lower.xOffset, upper.xOffset]).toEqual([0, 0]);
    });

    it("draws He2's 4 mHa split under 1 px apart, the upper level beside the lower one", () => {
        const levels = levelsOf(he2);
        const layout = layoutMoDiagram(levels);
        const [lower, upper] = layout.rows;
        expect(lower.y - upper.y).toBeCloseTo(0.004 * HARTREE_IN_EV * 5, 9);
        expect(lower.y - upper.y).toBeLessThan(1);
        expect(lower.xOffset).toBe(0);
        // Side by side: the upper box starts past the lower level's box and label, plus a gap.
        expect(upper.xOffset).toBeGreaterThan(levelFootprint(levels[lower.levelIndex]));
    });

    it("never moves a level for a neighbour: O2's 3σg keeps its true height 1.8 px over 1πu", () => {
        const levels = levelsOf(SYSTEMS.o2);
        const rowOf = (layout: ReturnType<typeof layoutMoDiagram>, label: string) =>
            layout.rows.find(row => levels[row.levelIndex].label === label)!;
        const full = layoutMoDiagram(levels);
        const pi = rowOf(full, '1πu');
        const sigma = rowOf(full, '3σg');
        const piLevel = levels[pi.levelIndex];
        const sigmaLevel = levels[sigma.levelIndex];
        expect(pi.y - sigma.y).toBeCloseTo((ev(sigmaLevel) - ev(piLevel)) * MO_PX_PER_EV, 9);
        expect(pi.y - sigma.y).toBeLessThan(MO_BOX_HEIGHT);
        expect(sigma.xOffset).toBeGreaterThan(pi.xOffset);
        // Without 3σg the other levels sit exactly where they did.
        const without = levels.filter(level => level.label !== '3σg');
        const alone = layoutMoDiagram(without);
        for (const row of alone.rows) {
            const same = full.rows.find(other => levels[other.levelIndex] === without[row.levelIndex])!;
            expect(row.y).toBeCloseTo(same.y, 9);
        }
    });

    it('offsets only levels closer than a box; levels a box apart or more stay in the first column', () => {
        const layout = layoutMoDiagram(levelsOf([r(0, '2σg', -1), r(1, '3σg', -1 + (MO_BOX_HEIGHT + 0.01) / MO_PX_PER_EV / HARTREE_IN_EV)]));
        expect(layout.rows.map(row => row.xOffset)).toEqual([0, 0]);
    });

    it("keeps every level and label inside the diagram's width, the widest real cluster (F2@10) included", () => {
        const rightEdge = (levels: DiagramLevel[], width?: number) =>
            Math.max(...layoutMoDiagram(levels, { width }).rows.map(row => MO_LEVEL_LEFT + row.xOffset + levelFootprint(levels[row.levelIndex])));
        for (const [id, orbitals] of Object.entries({ ...SYSTEMS, he2, h2, co00, f2at10 })) {
            expect([id, rightEdge(levelsOf(orbitals)) <= MO_DIAGRAM_WIDTH]).toEqual([id, true]);
        }
        // F₂@10 takes three columns: 3σg, then 1πu beside it, then 1πg* beside that.
        const levels = levelsOf(f2at10);
        const offsets = layoutMoDiagram(levels).rows.filter(row => toScale(levels[row.levelIndex]))
            .map(row => [levels[row.levelIndex].label, row.xOffset > 0]);
        expect(offsets.filter(([, offset]) => offset).map(([label]) => label)).toEqual(['1πu', '1πg*']);
        expect(rightEdge(levels)).toBeGreaterThan(MO_DIAGRAM_WIDTH - 20);
        // The bands follow the width the caller gives (review M3): wide enough, N₂'s core pair shares a row at the same
        // gap whatever the width; too narrow for both, the second wraps to the row above, at the left.
        const n2 = levelsOf(SYSTEMS.n2);
        const coreRows = (width?: number) => layoutMoDiagram(n2, { width }).rows.filter(row => n2[row.levelIndex].core);
        expect(coreRows(300).map(row => row.xOffset)).toEqual(coreRows().map(row => row.xOffset));
        const [first, second] = coreRows(120);
        expect([first.xOffset, second.xOffset]).toEqual([0, 0]);
        expect(second.y).toBeLessThan(first.y);
    });

    it('ticks every 5 eV with a true minus when the span is under 20 eV', () => {
        const levels = levelsOf(h2);
        const layout = layoutMoDiagram(levels);
        expect(layout.axis.ticks.map(tick => tick.label)).toEqual(['0', '−5', '−10']);
        // A tick sits at its own energy on the same scale as the levels.
        const lower = layout.rows[0];
        const zero = layout.axis.ticks[0];
        expect(lower.y - zero.y).toBeCloseTo((0 - ev(levels[0])) * MO_PX_PER_EV, 9);
        for (const tick of layout.axis.ticks) expect(tick.label).not.toMatch(/-/);
    });

    it('ticks every 10 eV when the span is 20 eV or more (N2: 30 eV to scale)', () => {
        const layout = layoutMoDiagram(levelsOf(SYSTEMS.n2));
        expect(layout.axis.ticks.map(tick => tick.label)).toEqual(['−10', '−20', '−30']);
        expect(tickGaps(layout)).toEqual([10 * MO_PX_PER_EV, 10 * MO_PX_PER_EV].map(gap => expect.closeTo(gap, 9)));
    });

    it("always draws two labelled ticks, even round He2's 0.1 eV", () => {
        const layout = layoutMoDiagram(levelsOf(he2));
        expect(layout.axis.ticks.map(tick => tick.label)).toEqual(['−15', '−20']);
        for (const tick of layout.axis.ticks) {
            expect(tick.y).toBeGreaterThanOrEqual(0);
            expect(tick.y).toBeLessThanOrEqual(layout.height);
        }
    });

    it('shrinks a span over the height cap to fit, says so, and clips nothing', () => {
        // 109 eV of occupied levels and the lowest wholly empty one, each under 1 Ha from the next (so none is split off as core).
        const wide = levelsOf([r(0, '2σg', -3), r(1, '2σu*', -2.2), r(2, '1πu', -1.4), r(3, '3σg', -0.6), r(4, '1πg*', 0.2), r(5, '3σu*', 1, 0)]);
        const layout = layoutMoDiagram(wide);
        expect(layout.axis.shrunk).toBe(true);
        expect(layout.axis.pxPerEv).toBeLessThan(MO_PX_PER_EV);
        expect(layout.height).toBeLessThanOrEqual(MO_MAX_HEIGHT);
        for (const row of layout.rows) {
            expect(boxTop(row.y)).toBeGreaterThanOrEqual(0);
            expect(boxBottom(row.y)).toBeLessThanOrEqual(layout.height);
        }
        for (const tick of layout.axis.ticks) {
            expect(tick.y).toBeGreaterThanOrEqual(0);
            expect(tick.y).toBeLessThanOrEqual(layout.height);
        }
        // Still one linear scale, at the reduced px per eV.
        const low = layout.rows[0];
        const high = layout.rows[5];
        expect(layout.breakY).toBeNull();
        expect(low.y - high.y).toBeCloseTo(4 * HARTREE_IN_EV * layout.axis.pxPerEv, 9);
    });

    // Review I1: a shrunk scale coarsens its ticks rather than stacking them.
    it('keeps ticks at least 16 px apart however far the scale shrinks', () => {
        for (const maxHeight of [320, 200, 140, 120]) {
            const layout = layoutMoDiagram(levelsOf(SYSTEMS.n2), { maxHeight });
            expect(layout.axis.ticks.length).toBeGreaterThanOrEqual(2);
            for (const gap of tickGaps(layout)) expect([maxHeight, gap >= 16]).toEqual([maxHeight, true]);
        }
        const tight = layoutMoDiagram(levelsOf(SYSTEMS.n2), { maxHeight: 120 });
        expect(tight.axis.shrunk).toBe(true);
        expect(tight.axis.ticks.map(tick => tick.label)).toEqual(['0', '−50']);
    });

    it('honours a smaller cap the caller passes', () => {
        const layout = layoutMoDiagram(levelsOf(SYSTEMS.n2), { maxHeight: 200 });
        expect(layout.axis.shrunk).toBe(true);
        expect(layout.height).toBeLessThanOrEqual(200);
        expect(layoutMoDiagram(levelsOf(h2), { pxPerEv: 2 }).axis.pxPerEv).toBe(2);
    });

    it('puts the break between the core band and the lowest valence row', () => {
        const levels = levelsOf(SYSTEMS.n2);
        const layout = layoutMoDiagram(levels);
        const core = layout.rows.filter(row => levels[row.levelIndex].core);
        const valence = layout.rows.filter(row => toScale(levels[row.levelIndex]));
        expect(core).toHaveLength(2);
        expect(layout.breakY).not.toBeNull();
        const breakY = layout.breakY!;
        // The break is one 13 px line.
        expect(Math.max(...valence.map(row => boxBottom(row.y)))).toBeLessThan(breakY);
        for (const row of core) {
            expect(breakY + MO_BREAK_LINE).toBeLessThanOrEqual(boxTop(row.y));
            expect(boxBottom(row.y)).toBeLessThanOrEqual(layout.height);
        }
        // The core pair, millihartree apart, shares one row side by side.
        expect(core[0].y).toBe(core[1].y);
        expect(core[1].xOffset).toBeGreaterThan(core[0].xOffset);
        expect(layoutMoDiagram(levelsOf(he2)).breakY).toBeNull();
    });

    // Ruling I1: CO at short R, where C 1s once sat among the valence levels and the scale fell to 0.81 px/eV.
    it("bands both of CO's 1s levels as core at short R, and reads its axis", () => {
        const levels = levelsOf(co00);
        expect(levels.filter(level => level.core).map(level => [level.label, Math.round(ev(level))])).toEqual([['1σ', -523], ['2σ', -278]]);
        const layout = layoutMoDiagram(levels);
        expect(layout.axis.shrunk).toBe(false);
        expect(layout.axis.ticks.map(tick => tick.label)).toEqual(['0', '−10', '−20', '−30']);
        for (const gap of tickGaps(layout)) expect(gap).toBeGreaterThanOrEqual(16);
        const core = layout.rows.filter(row => levels[row.levelIndex].core);
        expect(core.map(row => row.y)).toEqual([core[0].y, core[0].y]);
        expect(core[0].y).toBeGreaterThan(layout.breakY!);
    });

    // Rulings M2, N1: occupied and partly occupied levels and the lowest wholly empty one are to scale; higher empty
    // levels fold into a band
    // over a second break, in energy order.
    it('folds the empty levels above the lowest wholly empty one into a band over a second break', () => {
        const n2 = levelsOf(SYSTEMS.n2);
        expect(n2.filter(level => level.folded).map(level => level.label)).toEqual(['3σu*']);
        expect(n2.find(level => level.label === '1πg*')!.folded).toBe(false);
        const layout = layoutMoDiagram(n2);
        const upper = layout.rows.filter(row => n2[row.levelIndex].folded);
        const valence = layout.rows.filter(row => toScale(n2[row.levelIndex]));
        const upperBreakY = layout.upperBreakY!;
        expect(upperBreakY).not.toBeNull();
        for (const row of upper) {
            expect(boxTop(row.y)).toBeGreaterThanOrEqual(0);
            expect(boxBottom(row.y)).toBeLessThanOrEqual(upperBreakY);
        }
        expect(upperBreakY + MO_BREAK_LINE).toBeLessThanOrEqual(Math.min(...valence.map(row => boxTop(row.y))));
        // N₂'s valence now spans 2σg to 1πg* (30 eV): 5 px/eV, under 250 px all told.
        expect(layout.axis.pxPerEv).toBe(MO_PX_PER_EV);
        expect(layout.height).toBeLessThan(250);

        // B₂ (Rₑ, unrestricted): α 3σg is wholly empty, the lowest such; 1πg* and 3σu* fold, left to right by energy.
        const b2 = levelsOf(SYSTEMS['b2@07']);
        expect(b2.filter(level => level.folded).map(level => level.label)).toEqual(['1πg*', '3σu*']);
        const b2Upper = layoutMoDiagram(b2).rows.filter(row => b2[row.levelIndex].folded);
        expect(b2Upper[1].xOffset).toBeGreaterThan(b2Upper[0].xOffset);
        expect(b2Upper[0].y).toBe(b2Upper[1].y);

        // O₂: 1πg* holds its two α electrons -- half-filled counts as filled (ruling N1) -- so 3σu* is the lowest
        // wholly empty level and nothing folds, though the data's LUMO is β 1πg*; He₂ is all occupied.
        expect(levelsOf(SYSTEMS.o2).some(level => level.folded)).toBe(false);
        expect(layoutMoDiagram(levelsOf(he2)).upperBreakY).toBeNull();
    });

    // Re-review N3, final polish F6: a band is a left-to-right row in ascending energy with one constant gap, wrapping
    // to the row above when full. Three levels, a π pair among them, fit one 222 px row; a narrower diagram wraps the third.
    it('packs a band of three folded levels, a π pair among them, in one row at one even gap, without a collision', () => {
        const levels = levelsOf([r(0, '1σg', -0.6), r(1, '1σu*', -0.1, 0), r(2, '1πg*', 0.2, 0), r(3, '1πg*', 0.2, 0),
            r(4, '3σu*', 0.5, 0), r(5, '4σg', 0.8, 0)]);
        expect(levels.filter(level => level.folded).map(level => level.label)).toEqual(['1πg*', '3σu*', '4σg']);
        const layout = layoutMoDiagram(levels);
        const band = layout.rows.filter(row => levels[row.levelIndex].folded);
        const rect = (row: typeof band[number]) => ({
            left: row.xOffset, right: row.xOffset + levelFootprint(levels[row.levelIndex]), top: boxTop(row.y), bottom: boxBottom(row.y),
        });
        for (const row of band) {
            expect(row.xOffset + levelFootprint(levels[row.levelIndex])).toBeLessThanOrEqual(MO_DIAGRAM_WIDTH - MO_LEVEL_LEFT);
            expect(boxTop(row.y)).toBeGreaterThanOrEqual(0);
            expect(boxBottom(row.y)).toBeLessThanOrEqual(layout.upperBreakY!);
        }
        band.forEach((a, i) => band.slice(i + 1).forEach(b => {
            const [p, q] = [rect(a), rect(b)];
            expect(p.right <= q.left || q.right <= p.left || p.bottom <= q.top || q.bottom <= p.top).toBe(true);
        }));
        // In energy order, left to right on one row, one gap between each level's end and the next one's start.
        expect(band.map(row => levels[row.levelIndex].label)).toEqual(['1πg*', '3σu*', '4σg']);
        expect(band[0].xOffset).toBe(0);
        expect(new Set(band.map(row => row.y)).size).toBe(1);
        expect(gapsOf(levels, band).length).toBe(2);
        expect(new Set(gapsOf(levels, band)).size).toBe(1);
        expect(gapsOf(levels, band)[0]).toBeGreaterThan(0);
        // A narrower diagram (200 px) wraps the third level to the row above, at the start; the first two keep their gap.
        const narrow = layoutMoDiagram(levels, { width: 200 }).rows.filter(row => levels[row.levelIndex].folded);
        expect(narrow.map(row => [levels[row.levelIndex].label, row.xOffset === 0, row.y === narrow[0].y])).toEqual(
            [['1πg*', true, true], ['3σu*', false, true], ['4σg', true, false]]);
        expect(narrow[2].y).toBeLessThan(narrow[0].y);
        expect(gapsOf(levels, narrow.slice(0, 2))).toEqual([gapsOf(levels, band)[0]]);
        // A narrower diagram (200 px) wraps sooner, and still nothing runs past it.
        const wide = layoutMoDiagram(levels, { width: 200 }).rows.filter(row => levels[row.levelIndex].folded);
        for (const row of wide) expect(row.xOffset + levelFootprint(levels[row.levelIndex])).toBeLessThanOrEqual(200 - MO_LEVEL_LEFT);
    });

    // Final polish F6: the core band reads like the folded one. N₂'s 1σg and 1σu* sit side by side, in energy order, one
    // gap apart (not a column apart); a core of four wraps to the row above, in order, and the diagram grows to hold it.
    it('puts the core band in energy order, left to right at one even gap, wrapping upward when full', () => {
        const n2 = levelsOf(SYSTEMS.n2);
        const core = layoutMoDiagram(n2).rows.filter(row => n2[row.levelIndex].core);
        expect(core.map(row => n2[row.levelIndex].label)).toEqual(['1σg', '1σu*']);
        expect(core[0].xOffset).toBe(0);
        expect(core[0].y).toBe(core[1].y);
        expect(gapsOf(n2, core)[0]).toBeGreaterThan(0);
        expect(gapsOf(n2, core)[0]).toBeLessThan(20);

        // Four 1s-like cores, each 12 Ha apart, over a valence pair: 1σg 1σu* 2σg 2σu* wide, a 200 px diagram forces a wrap.
        const four = levelsOf([r(0, '1σg', -90), r(1, '1σu*', -78), r(2, '2σg', -66), r(3, '2σu*', -54), r(4, '3σg', -1), r(5, '4σg', -0.5)]);
        expect(four.filter(level => level.core).map(level => level.label)).toEqual(['1σg', '1σu*', '2σg', '2σu*']);
        const roomy = layoutMoDiagram(four, { width: 300 });
        const single = roomy.rows.filter(row => four[row.levelIndex].core);
        expect(new Set(single.map(row => row.y)).size).toBe(1);
        expect(new Set(gapsOf(four, single)).size).toBe(1);
        const narrow = layoutMoDiagram(four, { width: 200 });
        const wrapped = narrow.rows.filter(row => four[row.levelIndex].core);
        // Energy order: the first row holds the lowest levels; each later row is above (smaller y) and starts at the left.
        expect(wrapped.map(row => four[row.levelIndex].label)).toEqual(['1σg', '1σu*', '2σg', '2σu*']);
        const ys = wrapped.map(row => row.y);
        expect(ys).toEqual([...ys].sort((a, b) => b - a));
        expect(new Set(ys).size).toBe(2);
        const firstOfRow = wrapped.filter((row, i) => i === 0 || row.y !== wrapped[i - 1].y);
        expect(firstOfRow.map(row => row.xOffset)).toEqual([0, 0]);
        for (const row of wrapped) expect(row.xOffset + levelFootprint(four[row.levelIndex])).toBeLessThanOrEqual(200 - MO_LEVEL_LEFT);
        for (const y of new Set(ys)) {
            const sameRow = wrapped.filter(row => row.y === y);
            expect(new Set(gapsOf(four, sameRow)).size).toBeLessThanOrEqual(1);
        }
        expect(boxTop(Math.min(...ys))).toBeGreaterThan(narrow.breakY! + MO_BREAK_LINE - 1);
        expect(boxBottom(Math.max(...ys))).toBeLessThanOrEqual(narrow.height);
    });
});
