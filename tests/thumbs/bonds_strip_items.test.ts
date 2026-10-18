import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bondsStripItems, BONDS_THUMB_RESOLUTION, pendingBondsStripItems } from '../../src/thumbs/bonds_strip_items';
import type { BondsState } from '../../src/store/bondsSlice';
import type { BondsData } from '../../src/bonds/useBondsData';
import type { MoleculeBasis, MoleculeMeta, MoleculeScan } from '../../src/molecules/types';
import { pointId } from '../../src/bonds/systems';
import type { ThumbRequest } from '../../src/thumbs/ThumbnailService';

// Preflight D12: the Bonds fixtures live in tests/fixtures/molecules (the tests in tests/bonds read them there).
const fixture = (molecule: string, file: string) =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', molecule, file), 'utf8'));
const n2Scan: MoleculeScan = fixture('n2', 'scan.json');
const n2Meta: MoleculeMeta = fixture('n2', 'meta.json');
const n2Basis: MoleculeBasis = fixture('n2', 'basis.json');
const o2Meta: MoleculeMeta = fixture('o2', 'meta.json');
const o2Basis: MoleculeBasis = fixture('o2', 'basis.json');

const AT = 7;
const n2Bonds = (over: Partial<BondsState> = {}): BondsState => ({
    system: 'n2', R: n2Scan.points[AT].RBohr, scanIndex: AT, view: { kind: 'density' }, densityIso: 0.002, ...over,
});
/** The files of the point selected, as useBondsData hands them over: tagged with that point's id. */
const loaded = (meta: MoleculeMeta, basis: MoleculeBasis, id: string): BondsData => ({
    scan: n2Scan, meta: { ...meta, id }, basis: { ...basis, id }, loading: false, error: null,
});
const n2Data = () => loaded(n2Meta, n2Basis, pointId('n2', AT));

const fieldOf = (request: ThumbRequest) => {
    if (request.kind !== 'field') throw new Error(`expected a field request, got ${request.kind ?? 'orbital'}`);
    return request;
};
const requests = (items: ReturnType<typeof bondsStripItems>) => items.map(item => {
    if (item.thumb.kind !== 'orbital') throw new Error('every Bonds tile is a rendered picture');
    return fieldOf(item.thumb.request);
});

describe('bondsStripItems (spec §9.3 Strip, §12)', () => {
    it('opens a molecule\'s strip on the total density, then every orbital in the diagram\'s order', () => {
        const items = bondsStripItems({ bonds: n2Bonds(), data: n2Data(), h2plusR: null, enclosedFraction: 0.9 });
        expect(items.map(item => item.label)).toEqual(['Total density', ...n2Meta.orbitals.map(o => o.label)]);
        // Ruling T10-I2 (WCAG 2.5.3): the name holds the visible label (was 'total electron density').
        expect(items[0]).toMatchObject({ label: 'Total density', spoken: 'Total density, total electron density', target: { kind: 'density' }, selected: true, group: null });
        expect(items.slice(1).map(item => item.target)).toEqual([
            { kind: 'mo', label: '1σg', spin: 'restricted', component: 0 },
            { kind: 'mo', label: '1σu*', spin: 'restricted', component: 0 },
            { kind: 'mo', label: '2σg', spin: 'restricted', component: 0 },
            { kind: 'mo', label: '2σu*', spin: 'restricted', component: 0 },
            { kind: 'mo', label: '1πu', spin: 'restricted', component: 0 },
            { kind: 'mo', label: '1πu', spin: 'restricted', component: 1 },
            { kind: 'mo', label: '3σg', spin: 'restricted', component: 0 },
            { kind: 'mo', label: '1πg*', spin: 'restricted', component: 0 },
            { kind: 'mo', label: '1πg*', spin: 'restricted', component: 1 },
            { kind: 'mo', label: '3σu*', spin: 'restricted', component: 0 },
        ]);
        // Ruling T16-optname: "<label> orbital"; a degenerate partner also says which of the pair it is.
        expect(items.map(item => item.spoken).slice(1, 7)).toEqual([
            '1σg orbital', '1σu* orbital', '2σg orbital', '2σu* orbital', '1πu orbital (1 of 2)', '1πu orbital (2 of 2)',
        ]);
        expect(items.every(item => item.group === null)).toBe(true);
        expect(new Set(items.map(item => item.key)).size).toBe(items.length);
    });

    it('draws the density tile exactly as the main view draws the density, in its colour; the orbitals in phase', () => {
        const items = bondsStripItems({ bonds: n2Bonds(), data: n2Data(), h2plusR: null, enclosedFraction: 0.9 });
        const [density, ...orbitals] = requests(items);
        expect(density.colouring).toBe('density');
        expect(density.field.sources[0].recipe).toEqual({ type: 'gaussianDensity', moleculeId: 'n2@07' });
        expect(density.field.densityIsoValue).toBe(0.002);
        expect(density.field.bases?.map(basis => basis.id)).toEqual(['n2@07']);
        expect(orbitals.map(request => request.colouring)).toEqual(orbitals.map(() => 'phase'));
        expect(orbitals.map(request => request.field.sources[0].recipe)).toEqual(
            n2Meta.orbitals.map(o => ({ type: 'gaussianMO', moleculeId: 'n2@07', index: o.index })));
    });

    it('meshes every tile at 40³, from exactly one source', () => {
        expect(BONDS_THUMB_RESOLUTION).toBe(40);
        const molecule = requests(bondsStripItems({ bonds: n2Bonds(), data: n2Data(), h2plusR: null, enclosedFraction: 0.9 }));
        const h2plus = requests(bondsStripItems({
            bonds: { system: 'h2plus', R: 2, scanIndex: null, view: { kind: 'h2plus', state: '1sigma_g' }, densityIso: 0.002 },
            data: { meta: null, basis: null }, h2plusR: 2, enclosedFraction: 0.9,
        }));
        for (const request of [...molecule, ...h2plus]) {
            expect(request.field.resolution).toBe(40);
            expect(request.field.sources).toHaveLength(1);
        }
    });

    it('marks the orbital on screen as selected, and only it', () => {
        const view = { kind: 'mo', label: '1πu', spin: 'restricted', component: 1 } as const;
        const items = bondsStripItems({ bonds: n2Bonds({ view }), data: n2Data(), h2plusR: null, enclosedFraction: 0.9 });
        expect(items.filter(item => item.selected).map(item => item.target)).toEqual([view]);
    });

    it('keys each picture by system, point, view, fraction and colouring, so no two tiles or points share one', () => {
        const at = (index: number) => bondsStripItems({
            bonds: n2Bonds({ scanIndex: index, R: n2Scan.points[index].RBohr }), data: loaded(n2Meta, n2Basis, pointId('n2', index)),
            h2plusR: null, enclosedFraction: 0.9,
        });
        const keys = requests(at(AT)).map(request => request.contentKey);
        expect(new Set(keys).size).toBe(keys.length);
        // Ruling T10-M4: the density is drawn at ρ, so its key has no enclosed fraction (was '…|density@0.002|0.9|density').
        expect(keys[0]).toBe('bonds|n2|n2@07|density@0.002|density');
        expect(keys[1]).toBe('bonds|n2|n2@07|mo:1σg:restricted:0|0.9|phase');
        const elsewhere = requests(at(8)).map(request => request.contentKey);
        expect(elsewhere.filter(key => keys.includes(key))).toEqual([]);
        // The density is drawn at its ρ: another ρ is another picture.
        const otherIso = requests(bondsStripItems({ bonds: n2Bonds({ densityIso: 0.01 }), data: n2Data(), h2plusR: null, enclosedFraction: 0.9 }));
        expect(otherIso[0].contentKey).not.toBe(keys[0]);
    });

    // Ruling T10-M4: a new enclosed fraction re-meshes the orbitals, never the density (drawn at ρ).
    it('keeps the density tile\'s key when the enclosed fraction changes, and changes every orbital\'s', () => {
        const at = (enclosedFraction: number) => requests(bondsStripItems({ bonds: n2Bonds(), data: n2Data(), h2plusR: null, enclosedFraction }))
            .map(request => request.contentKey);
        const [density90, ...orbitals90] = at(0.9);
        const [density75, ...orbitals75] = at(0.75);
        expect(density75).toBe(density90);
        orbitals75.forEach((key, i) => expect(key).not.toBe(orbitals90[i]));
    });

    it('names an open-shell molecule\'s orbitals with their spin', () => {
        const bonds: BondsState = { system: 'o2', R: 2.28, scanIndex: 7, view: { kind: 'density' }, densityIso: 0.002 };
        const items = bondsStripItems({ bonds, data: loaded(o2Meta, o2Basis, pointId('o2', 7)), h2plusR: null, enclosedFraction: 0.9 });
        expect(items).toHaveLength(1 + o2Meta.orbitals.length);
        expect(items[1]).toMatchObject({ label: '1σg (α)', spoken: '1σg (α) orbital', target: { kind: 'mo', label: '1σg', spin: 'alpha', component: 0 } });
        expect(items.find(item => item.label === '1σg (β)')?.target).toEqual({ kind: 'mo', label: '1σg', spin: 'beta', component: 0 });
    });

    it('gives H₂⁺ its two exact states at the R on the slider, in the phase colours', () => {
        const items = bondsStripItems({
            bonds: { system: 'h2plus', R: 1.5, scanIndex: null, view: { kind: 'h2plus', state: '1sigma_u' }, densityIso: 0.002 },
            data: { meta: null, basis: null }, h2plusR: 1.5, enclosedFraction: 0.9,
        });
        expect(items.map(item => [item.label, item.spoken, item.selected])).toEqual([
            ['1σg', '1σg orbital', false], ['1σu*', '1σu* orbital', true],
        ]);
        expect(items.map(item => item.target)).toEqual([{ kind: 'h2plus', state: '1sigma_g' }, { kind: 'h2plus', state: '1sigma_u' }]);
        const [g, u] = requests(items);
        expect(g.field.sources[0].recipe).toEqual({ type: 'h2plus', R: 1.5, state: '1sigma_g' });
        expect(u.field.sources[0].recipe).toEqual({ type: 'h2plus', R: 1.5, state: '1sigma_u' });
        expect([g.colouring, u.colouring]).toEqual(['phase', 'phase']);
        expect(g.contentKey).toBe('bonds|h2plus|1.5|h2plus:1sigma_g|0.9|phase');
        expect(bondsStripItems({
            bonds: { system: 'h2plus', R: null, scanIndex: null, view: { kind: 'h2plus', state: '1sigma_g' }, densityIso: 0.002 },
            data: { meta: null, basis: null }, h2plusR: null, enclosedFraction: 0.9,
        })).toEqual([]);
    });

    // Review Focus 5, first half (preflight D19: the cancel half is App's, src/App.test.tsx).
    it('requests nothing until the basis for this R has loaded (Review Focus 5)', () => {
        const args = { bonds: n2Bonds(), h2plusR: null, enclosedFraction: 0.9 };
        // Still loading: nothing for this point yet.
        expect(bondsStripItems({ ...args, data: { meta: null, basis: null } })).toEqual([]);
        // The previous point's files, still held while this one's load: never meshed under this R.
        expect(bondsStripItems({ ...args, data: loaded(n2Meta, n2Basis, pointId('n2', AT - 1)) })).toEqual([]);
        // Another molecule's files.
        expect(bondsStripItems({ ...args, data: loaded(o2Meta, o2Basis, pointId('o2', AT)) })).toEqual([]);
        // R not yet snapped to the scan.
        expect(bondsStripItems({ ...args, bonds: n2Bonds({ scanIndex: null, R: null }), data: n2Data() })).toEqual([]);
        // And once it has, every tile is there.
        expect(bondsStripItems({ ...args, data: n2Data() })).toHaveLength(1 + n2Meta.orbitals.length);
    });

    // Ruling T10-I1: while the same molecule's next scan point loads, the strip stays up as glyphs --
    // the tiles of the point last shown, each asking for nothing, so no basis but this R's is ever meshed.
    it('turns a strip into glyph tiles that ask for nothing, keeping keys, labels, names and targets', () => {
        const shown = bondsStripItems({ bonds: n2Bonds(), data: n2Data(), h2plusR: null, enclosedFraction: 0.9 });
        const view = { kind: 'mo', label: '2σu*', spin: 'restricted', component: 0 } as const;
        const pending = pendingBondsStripItems(shown, view);
        expect(pending.map(item => item.thumb)).toEqual(shown.map(() => ({ kind: 'pending' })));
        expect(pending.map(item => [item.key, item.label, item.spoken, item.target]))
            .toEqual(shown.map(item => [item.key, item.label, item.spoken, item.target]));
        // The selection follows the view chosen meanwhile, as the diagram's does.
        expect(pending.filter(item => item.selected).map(item => item.target)).toEqual([view]);
    });
});
