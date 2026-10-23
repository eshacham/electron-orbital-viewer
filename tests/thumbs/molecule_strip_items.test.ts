import { readFileSync } from 'fs';
import { resolve } from 'path';
import { moleculeStripItems, pendingMoleculeStripItems, type MoleculeStripArgs, type MoleculeStripItem } from '../../src/thumbs/molecule_strip_items';
import { MO_THUMB_RESOLUTION } from '../../src/thumbs/strip_items';
import type { ThumbRequest } from '../../src/thumbs/ThumbnailService';
import type { GridFieldSource } from '../../src/field_source';
import type { ScalarGrid } from '../../src/molecules/esp';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';
import type { MoleculeBasis } from '../../src/molecules/types';
import { ESP_LIMIT_HARTREE, ESP_SURFACE_DENSITY } from '../../src/molecules/esp_color';
import { gridHalfWidth } from '../../src/molecules/render_plan';
import { originReach } from '../../src/molecules/orbital_box';
import { methaneMeta, waterMeta } from '../molecules/fixtures';

// The library's own files (data v3) for the orbital tiles: water and the open-shell NO₂.
const fixture = (molecule: string, file: string) =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', molecule, file), 'utf8'));
const h2oMeta: LibraryMoleculeMeta = fixture('h2o', 'meta.json');
const h2oBasis: MoleculeBasis = { ...fixture('h2o', 'basis.json'), id: 'h2o' };
const no2Meta: LibraryMoleculeMeta = fixture('no2', 'meta.json');
const no2Basis: MoleculeBasis = { ...fixture('no2', 'basis.json'), id: 'no2' };

const density: GridFieldSource = {
    kind: 'grid', id: 'density:h2o', quantity: 'density', shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2,
    values: new Float32Array(8).fill(0.1),
} as GridFieldSource;
const esp: ScalarGrid = { shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, values: new Float32Array(8) };

/** Water as the fixture module builds it (HOMO and LUMO named, no LVMO), every file loaded, the density drawn. */
const args = (over: Partial<MoleculeStripArgs> = {}): MoleculeStripArgs => ({
    meta: waterMeta(), surface: { kind: 'density' }, representation: 'ball-and-stick', enclosedFraction: 0.9,
    densityGrid: density, espGrid: esp, espLimit: ESP_LIMIT_HARTREE, basis: h2oBasis, ...over,
});

const requestOf = (item: MoleculeStripItem): ThumbRequest => {
    if (item.thumb.kind !== 'orbital') throw new Error(`${item.label} is not a rendered tile (${item.thumb.kind})`);
    return item.thumb.request;
};
const byLabel = (items: MoleculeStripItem[], label: string) => items.find(item => item.label === label)!;

describe('moleculeStripItems (spec §9.4 Strip, §12; rulings P5, P6, P7)', () => {
    it('lists water\'s views in order, each with the picture it needs', () => {
        const items = moleculeStripItems(args());
        expect(items.map(item => item.label)).toEqual([
            'Ball and stick', 'Space filling', 'Electron density', 'Electrostatic potential', 'HOMO', 'LUMO', 'All orbitals',
        ]);
        expect(items.map(item => item.thumb.kind)).toEqual(['structure', 'structure', 'orbital', 'orbital', 'orbital', 'orbital', 'icon']);
        expect(items.slice(2, 6).map(item => requestOf(item).kind)).toEqual(['grid', 'grid', 'field', 'field']);
        expect(items.every(item => item.group === null && item.groupSpoken === null)).toBe(true);
    });

    it('names each tile with its visible label inside the name (WCAG 2.5.3, ruling T10-I2), orbital tiles "<role> orbital"', () => {
        expect(moleculeStripItems(args()).map(item => item.spoken)).toEqual([
            'Ball and stick structure', 'Space filling structure', 'Electron density surface',
            'Electrostatic potential on the density surface, red negative to blue positive',
            'HOMO orbital', 'LUMO orbital', 'All orbitals — open the list',
        ]);
    });

    it('adds the LVMO where the data name one (the library\'s water: a constructed LVMO)', () => {
        const items = moleculeStripItems(args({ meta: h2oMeta }));
        expect(items.map(item => item.label)).toEqual([
            'Ball and stick', 'Space filling', 'Electron density', 'Electrostatic potential', 'HOMO', 'LUMO', 'LVMO', 'All orbitals',
        ]);
        expect(byLabel(items, 'LVMO')).toMatchObject({ spoken: 'LVMO orbital', target: { surface: { kind: 'mo', index: 10 } } });
    });

    // Preflight D8: an open shell's tiles are named by their roles -- NO₂'s data name a HOMO and a SOMO.
    it('gives an open shell its SOMO tile, labelled by its role (NO₂)', () => {
        const items = moleculeStripItems(args({ meta: no2Meta, basis: no2Basis }));
        expect(items.map(item => item.label)).toEqual([
            'Ball and stick', 'Space filling', 'Electron density', 'Electrostatic potential', 'HOMO', 'SOMO', 'LUMO', 'All orbitals',
        ]);
        expect(byLabel(items, 'SOMO')).toMatchObject({ spoken: 'SOMO orbital', target: { surface: { kind: 'mo', index: 11 } } });
        expect(byLabel(items, 'HOMO').target).toEqual({ surface: { kind: 'mo', index: 10 } });
    });

    it('meshes the density and the ESP surface exactly as the main view asks for them', () => {
        const items = moleculeStripItems(args());
        const densityRequest = requestOf(byLabel(items, 'Electron density'));
        expect(densityRequest).toEqual({
            kind: 'grid', contentKey: 'mol|h2o|density|0.9', colouring: 'density',
            grid: { type: 'calculate', source: density, enclosedFraction: 0.9, requestId: 0 },
        });
        const espRequest = requestOf(byLabel(items, 'Electrostatic potential'));
        expect(espRequest).toEqual({
            kind: 'grid', contentKey: `mol|h2o|esp|${ESP_SURFACE_DENSITY}`, colouring: { kind: 'esp', grid: esp, limit: ESP_LIMIT_HARTREE },
            grid: { type: 'calculate', source: density, isoValue: ESP_SURFACE_DENSITY, requestId: 0 },
        });
    });

    // Task 16c fix round 1 (ruling T16c-I1): a tile never probes; its limit is the density's box or the orbital's originReach, whichever is larger.
    it('evaluates each frontier orbital from the basis at 40³, in a box fitted to it and never larger than its limit', () => {
        const items = moleculeStripItems(args({ meta: h2oMeta }));
        for (const [label, index] of [['HOMO', 4], ['LUMO', 5], ['LVMO', 10]] as const) {
            const request = requestOf(byLabel(items, label));
            if (request.kind !== 'field') throw new Error('an orbital tile is a field job');
            expect(request.contentKey).toBe(`mol|h2o|mo:${index}|0.9`);
            expect(request.colouring).toBe('phase');
            expect(request.field.resolution).toBe(MO_THUMB_RESOLUTION);
            expect(MO_THUMB_RESOLUTION).toBe(40);
            expect(request.field.enclosedFraction).toBe(0.9);
            expect(request.field.sources).toHaveLength(1);
            const [source] = request.field.sources;
            expect(source.recipe).toMatchObject({ type: 'gaussianMO', index });
            expect(source.rMax).toBeLessThanOrEqual(Math.max(gridHalfWidth(h2oMeta), originReach(h2oBasis, index)));
            // The basis the worker registers is the one the recipe names (moved onto the box's centre, or the molecule's own).
            expect(request.field.bases).toHaveLength(1);
            expect(source.recipe.type === 'gaussianMO' && source.recipe.moleculeId).toBe(request.field.bases![0].id);
        }
        // The core-free valence HOMO of water still gets a box of its own, smaller than the density's.
        const homo = requestOf(byLabel(items, 'HOMO'));
        expect(homo.kind === 'field' && homo.field.sources[0].rMax).toBeLessThan(gridHalfWidth(h2oMeta));
    });

    it('keys the density and orbitals by the enclosed fraction, and the ESP surface (fixed ρ) not', () => {
        const at = (fraction: number) => moleculeStripItems(args({ enclosedFraction: fraction })).map(item =>
            (item.thumb.kind === 'orbital' ? item.thumb.request.contentKey : null));
        const [a, b] = [at(0.9), at(0.75)];
        expect(a[2]).not.toBe(b[2]);
        expect(a[3]).toBe(b[3]);
        expect(a[4]).not.toBe(b[4]);
    });

    // Real or absent (§3.5), with ruling T10-I1's pending tile while a file is still on its way.
    it('shows a tile still waiting for its file as pending, and leaves out one whose file cannot be had', () => {
        const loading = moleculeStripItems(args({ densityGrid: 'loading', espGrid: 'loading', basis: 'loading' }));
        expect(loading.map(item => [item.label, item.thumb.kind])).toEqual([
            ['Ball and stick', 'structure'], ['Space filling', 'structure'], ['Electron density', 'pending'],
            ['Electrostatic potential', 'pending'], ['HOMO', 'pending'], ['LUMO', 'pending'], ['All orbitals', 'icon'],
        ]);
        // No grids: the two structure tiles, the frontier orbitals and All orbitals only.
        expect(moleculeStripItems(args({ densityGrid: null, espGrid: null })).map(item => item.label))
            .toEqual(['Ball and stick', 'Space filling', 'HOMO', 'LUMO', 'All orbitals']);
        // The ESP surface needs both grids: the potential's own grid missing drops that tile alone.
        expect(moleculeStripItems(args({ espGrid: null })).map(item => item.label))
            .toEqual(['Ball and stick', 'Space filling', 'Electron density', 'HOMO', 'LUMO', 'All orbitals']);
        expect(byLabel(moleculeStripItems(args({ espGrid: 'loading' })), 'Electrostatic potential').thumb.kind).toBe('pending');
        // Its glyph is short: "Electrostatic" alone does not fit inside a 72 px tile (the label under it is in full).
        expect(byLabel(loading, 'Electrostatic potential').glyph).toBe('ESP');
        expect(loading.filter(item => item.glyph !== undefined).map(item => item.label)).toEqual(['Electrostatic potential']);
        // No basis: no orbital tiles (All orbitals still opens the list, which needs only the meta).
        expect(moleculeStripItems(args({ basis: null })).map(item => item.label))
            .toEqual(['Ball and stick', 'Space filling', 'Electron density', 'Electrostatic potential', 'All orbitals']);
    });

    it('has no Space filling tile for a molecule holding an element with no van der Waals radius (ruling P8b)', () => {
        const meta = methaneMeta();
        const withIron = { ...meta, atoms: [{ Z: 26, position: [0, 0, 0] }, ...meta.atoms.slice(1)] } as LibraryMoleculeMeta;
        expect(moleculeStripItems(args({ meta: withIron })).map(item => item.label)).not.toContain('Space filling');
    });

    it('draws the structure tiles from the molecule\'s own atoms', () => {
        const items = moleculeStripItems(args());
        expect(items[0].thumb).toEqual({ kind: 'structure', atoms: waterMeta().atoms, representation: 'ball-and-stick' });
        expect(items[1].thumb).toEqual({ kind: 'structure', atoms: waterMeta().atoms, representation: 'space-filling' });
    });

    // Spec §9.4: "Each tile sets surface / representation exactly as the View tab does". A structure tile is the
    // picture it shows -- the structure alone -- so it sets the surface to None with its representation.
    it('targets what each tile shows', () => {
        expect(moleculeStripItems(args()).map(item => item.target)).toEqual([
            { surface: { kind: 'none' }, representation: 'ball-and-stick' },
            { surface: { kind: 'none' }, representation: 'space-filling' },
            { surface: { kind: 'density' } },
            { surface: { kind: 'esp' } },
            { surface: { kind: 'mo', index: 4 } },
            { surface: { kind: 'mo', index: 5 } },
            { openOrbitals: true },
        ]);
    });

    it('selects the tile showing what is drawn: the surface, or with no surface the representation', () => {
        const selected = (over: Partial<MoleculeStripArgs>) => moleculeStripItems(args(over)).filter(item => item.selected).map(item => item.label);
        expect(selected({ surface: { kind: 'density' } })).toEqual(['Electron density']);
        expect(selected({ surface: { kind: 'esp' } })).toEqual(['Electrostatic potential']);
        expect(selected({ surface: { kind: 'mo', index: 4 } })).toEqual(['HOMO']);
        expect(selected({ surface: { kind: 'mo', index: 5 } })).toEqual(['LUMO']);
        // An orbital without a tile of its own: no tile shows it.
        expect(selected({ surface: { kind: 'mo', index: 2 } })).toEqual([]);
        expect(selected({ surface: { kind: 'none' }, representation: 'ball-and-stick' })).toEqual(['Ball and stick']);
        expect(selected({ surface: { kind: 'none' }, representation: 'space-filling' })).toEqual(['Space filling']);
        // A surface drawn over the spheres is that surface's view, not the bare structure's.
        expect(selected({ surface: { kind: 'density' }, representation: 'space-filling' })).toEqual(['Electron density']);
        expect(selected({ surface: { kind: 'none' }, representation: 'none' })).toEqual([]);
    });
});

describe('pendingMoleculeStripItems (ruling T10-I1, for a molecule change)', () => {
    it('keeps the last molecule\'s tiles on their glyphs, asking for nothing, the selection following the view', () => {
        const items = moleculeStripItems(args({ meta: h2oMeta }));
        const pending = pendingMoleculeStripItems(items, { kind: 'esp' }, 'ball-and-stick');
        expect(pending.map(item => item.key)).toEqual(items.map(item => item.key));
        expect(pending.map(item => item.label)).toEqual(items.map(item => item.label));
        // The structure glyphs too: they would draw the molecule being left. The icon is no one molecule's.
        expect(pending.map(item => item.thumb.kind)).toEqual(['pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'icon']);
        expect(pending.filter(item => item.selected).map(item => item.label)).toEqual(['Electrostatic potential']);
        expect(pendingMoleculeStripItems(items, { kind: 'none' }, 'space-filling').filter(item => item.selected).map(item => item.label))
            .toEqual(['Space filling']);
    });
});
