import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildMoDiagram, DiagramLevel, h2plusOrbitals } from '../../src/bonds/mo_diagram';
import {
    layoutMoDiagram, levelFootprint, MO_BOX_HEIGHT, MO_LEVEL_AREA_WIDTH, MO_MAX_HEIGHT, MO_PX_PER_EV,
} from '../../src/bonds/mo_layout';
import { HARTREE_IN_EV } from '../../src/format/energy';
import { MoleculeOrbitalInfo } from '../../src/molecules/types';

/**
 * Science corrections S1 (critique P1): the diagram is drawn to one true eV scale. Every diatomic shares
 * MO_PX_PER_EV; a level's y is its energy and nothing else (no stretching to fill, no 20 px minimum row).
 */
const fixture = (path: string, key: 'meta.json' | 'basis.json'): MoleculeOrbitalInfo[] =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', path, key), 'utf8')).orbitals;

/** The published v3 orbitals the tests already carry: meta.json at Rₑ, and basis.json at one scan point. */
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

const levelsOf = (orbitals: MoleculeOrbitalInfo[]): DiagramLevel[] => buildMoDiagram(orbitals).levels;
const ev = (level: DiagramLevel) => level.energyHartree * HARTREE_IN_EV;

describe('layoutMoDiagram', () => {
    it('places every valence level linearly in energy at MO_PX_PER_EV, in every system', () => {
        for (const [id, orbitals] of Object.entries(SYSTEMS)) {
            const levels = levelsOf(orbitals);
            const layout = layoutMoDiagram(levels);
            expect([id, layout.axis.shrunk, layout.axis.pxPerEv]).toEqual([id, false, MO_PX_PER_EV]);
            const valence = layout.rows.filter(row => !levels[row.levelIndex].core);
            const [first] = valence;
            for (const row of valence) {
                // Higher energy is higher on screen (smaller y), by exactly ΔE × 5 px.
                expect(first.y - row.y).toBeCloseTo((ev(levels[row.levelIndex]) - ev(levels[first.levelIndex])) * MO_PX_PER_EV, 9);
            }
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

    it('keeps every row inside the left column', () => {
        for (const [id, orbitals] of Object.entries({ ...SYSTEMS, he2, h2 })) {
            const levels = levelsOf(orbitals);
            for (const row of layoutMoDiagram(levels).rows) {
                expect([id, row.xOffset + levelFootprint(levels[row.levelIndex]) <= MO_LEVEL_AREA_WIDTH]).toEqual([id, true]);
            }
        }
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

    it('ticks every 10 eV when the span is 20 eV or more (N2: 52 eV)', () => {
        const layout = layoutMoDiagram(levelsOf(SYSTEMS.n2));
        expect(layout.axis.ticks.map(tick => tick.label)).toEqual(['20', '10', '0', '−10', '−20', '−30']);
        const [a, b] = layout.axis.ticks;
        expect(b.y - a.y).toBeCloseTo(10 * MO_PX_PER_EV, 9);
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
        // 109 eV of valence levels, each under 1 Ha from the next (so none is split off as core).
        const wide = levelsOf([r(0, '2σg', -3), r(1, '2σu*', -2.2), r(2, '1πu', -1.4), r(3, '3σg', -0.6), r(4, '1πg*', 0.2, 0), r(5, '3σu*', 1, 0)]);
        const layout = layoutMoDiagram(wide);
        expect(layout.axis.shrunk).toBe(true);
        expect(layout.axis.pxPerEv).toBeLessThan(MO_PX_PER_EV);
        expect(layout.height).toBeLessThanOrEqual(MO_MAX_HEIGHT);
        // A box stands on its level line: it spans [y − 18, y].
        for (const row of layout.rows) {
            expect(row.y - MO_BOX_HEIGHT).toBeGreaterThanOrEqual(0);
            expect(row.y).toBeLessThanOrEqual(layout.height);
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
        const valence = layout.rows.filter(row => !levels[row.levelIndex].core);
        expect(core).toHaveLength(2);
        expect(layout.breakY).not.toBeNull();
        const breakY = layout.breakY!;
        // The break is one 13 px line; an 18 px box stands on its level line, spanning [y − 18, y].
        expect(Math.max(...valence.map(row => row.y))).toBeLessThan(breakY);
        for (const row of core) {
            expect(breakY + 13).toBeLessThanOrEqual(row.y - MO_BOX_HEIGHT);
            expect(row.y).toBeLessThanOrEqual(layout.height);
        }
        // The core pair, millihartree apart, shares one row side by side.
        expect(core[0].y).toBe(core[1].y);
        expect(core[1].xOffset).toBeGreaterThan(core[0].xOffset);
        expect(layoutMoDiagram(levelsOf(he2)).breakY).toBeNull();
    });
});
