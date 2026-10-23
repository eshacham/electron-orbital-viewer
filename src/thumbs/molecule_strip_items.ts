import type { GridFieldSource } from '../field_source';
import type { ScalarGrid } from '../molecules/esp';
import { ESP_SURFACE_DENSITY } from '../molecules/esp_color';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeBasis } from '../molecules/types';
import type { MoleculeSurface, Representation } from '../store/moleculeSlice';
import { fitToOrbital } from '../molecules/orbital_box';
import { frontierOrbitals } from '../molecules/orbital_display';
import { moleculeGridRequest, planMoleculeRender } from '../molecules/render_plan';
import { spaceFillingUnavailableReason } from '../molecules/vdw_radii';
import { MO_THUMB_RESOLUTION, type StripItem, type StripThumb } from './strip_items';

/**
 * What a Molecules tile sets (ruling P7): a surface -- with, for a structure
 * tile, its representation -- exactly as the View controls set them (spec
 * §9.4 Strip), or "open the orbital list".
 */
export type MoleculeStripTarget = { surface: MoleculeSurface; representation?: Exclude<Representation, 'none'> } | { openOrbitals: true };
export type MoleculeStripItem = StripItem<MoleculeStripTarget>;

/** A file a tile needs: here, still on its way ('loading': the tile waits on its glyph, ruling T10-I1), or not to be had (null: no tile). */
export type Loadable<T> = T | 'loading' | null;

export interface MoleculeStripArgs {
    meta: LibraryMoleculeMeta;
    surface: MoleculeSurface;
    representation: Representation;
    enclosedFraction: number;
    /** The density grid the main view meshes (grid_cache.getDensityGrid). */
    densityGrid: Loadable<GridFieldSource>;
    /** The ESP grid the ESP surface is coloured from (grid_cache.getEspGrid). */
    espGrid: Loadable<ScalarGrid>;
    /** The ESP colour scale's ±limit, Ha/e (ESP_LIMIT_HARTREE): the main view's. */
    espLimit: number;
    /** The basis the orbital tiles are evaluated from (loader.loadBasis). */
    basis: Loadable<MoleculeBasis>;
}

const surfaceKey = (surface: MoleculeSurface): string => (surface.kind === 'mo' ? `mo:${surface.index}` : surface.kind);

/**
 * The tile showing what is drawn: a surface tile while that surface is drawn; with no surface, the structure
 * tile of the representation drawn (a surface over the spheres is that surface's view, not the bare structure's).
 */
function shows(target: MoleculeStripTarget, surface: MoleculeSurface, representation: Representation): boolean {
    if ('openOrbitals' in target) return false;
    if (surfaceKey(target.surface) !== surfaceKey(surface)) return false;
    return target.representation === undefined || target.representation === representation;
}

/**
 * The Molecules strip (spec §9.4 Strip, §12; rulings P5, P6, P7, preflight
 * D8): the molecule's views, in order --
 *   Ball and stick · Space filling (Canvas-2D glyphs of the structure; Space
 *   filling only where every element has a van der Waals radius, ruling P8b)
 *   · Electron density · Electrostatic potential (grid jobs on the loaded
 *   density grid, meshed by the request the main view sends) · one tile per
 *   frontier orbital the data name, by role -- HOMO, SOMO (an open shell),
 *   LUMO, LVMO (field jobs evaluated from the basis at 40³, each in a box
 *   fitted to its orbital, ruling T10-core) · All orbitals (an icon: it opens
 *   the orbital list).
 * A tile whose file is still loading waits on its glyph and label (ruling
 * T10-I1), so the row never reshuffles as files land; one whose file cannot
 * be had is left out (real or absent, §3.5).
 */
export function moleculeStripItems(args: MoleculeStripArgs): MoleculeStripItem[] {
    const { meta, surface, representation, enclosedFraction, densityGrid, espGrid, espLimit, basis } = args;
    const items: MoleculeStripItem[] = [];
    const add = (key: string, label: string, spoken: string, target: MoleculeStripTarget, thumb: StripThumb, glyph?: string) => {
        items.push({
            key, label, spoken, group: null, groupSpoken: null, target, selected: shows(target, surface, representation), thumb,
            ...(glyph ? { glyph } : {}),
        });
    };

    // Ruling T10-I2 (WCAG 2.5.3): every name holds its tile's visible label.
    add('ball-and-stick', 'Ball and stick', 'Ball and stick structure', { surface: { kind: 'none' }, representation: 'ball-and-stick' },
        { kind: 'structure', atoms: meta.atoms, representation: 'ball-and-stick' });
    if (spaceFillingUnavailableReason(meta.atoms) === null) {
        add('space-filling', 'Space filling', 'Space filling structure', { surface: { kind: 'none' }, representation: 'space-filling' },
            { kind: 'structure', atoms: meta.atoms, representation: 'space-filling' });
    }

    if (densityGrid !== null) {
        const plan = planMoleculeRender(meta, { kind: 'density' }, enclosedFraction);
        add('density', 'Electron density', 'Electron density surface', { surface: { kind: 'density' } },
            densityGrid === 'loading' || plan.kind !== 'grid' ? { kind: 'pending' } : {
                kind: 'orbital',
                request: { kind: 'grid', contentKey: `mol|${meta.id}|density|${enclosedFraction}`, grid: moleculeGridRequest(plan, densityGrid, 0), colouring: 'density' },
            });
    }
    if (densityGrid !== null && espGrid !== null) {
        const plan = planMoleculeRender(meta, { kind: 'esp' }, enclosedFraction);
        // Spec §3.3: the ESP hues are keyed in the name -- the ESP bar is on screen only while the map is drawn.
        add('esp', 'Electrostatic potential', 'Electrostatic potential on the density surface, red negative to blue positive', { surface: { kind: 'esp' } },
            densityGrid === 'loading' || espGrid === 'loading' || plan.kind !== 'grid' ? { kind: 'pending' } : {
                kind: 'orbital',
                request: {
                    // Drawn at a fixed ρ (ruling D4), so the enclosed fraction is not part of the picture; the colour
                    // limit is (Task 16d item 4, T15-M1).
                    kind: 'grid', contentKey: `mol|${meta.id}|esp|${ESP_SURFACE_DENSITY}|${espLimit}`, grid: moleculeGridRequest(plan, densityGrid, 0),
                    colouring: { kind: 'esp', grid: espGrid, limit: espLimit },
                },
            },
            // "Electrostatic" alone is wider than the 72 px tile its glyph sits in (the label under it says it in full).
            'ESP');
    }

    if (basis !== null) {
        const moved = new Map<string, MoleculeBasis>();
        for (const { role, orbital } of frontierOrbitals(meta.orbitals)) {
            const target: MoleculeStripTarget = { surface: { kind: 'mo', index: orbital.index } };
            let thumb: StripThumb = { kind: 'pending' };
            if (basis !== 'loading') {
                // Ruling T16c-I1: a tile fits its own box (fitToOrbital), so the main view's probe is not run for it.
                const plan = planMoleculeRender(meta, target.surface, enclosedFraction, basis, { probe: false });
                if (plan.kind !== 'mo') continue;
                thumb = {
                    kind: 'orbital',
                    request: {
                        kind: 'field', contentKey: `mol|${meta.id}|mo:${orbital.index}|${enclosedFraction}`, colouring: 'phase',
                        field: fitToOrbital({ ...plan.request, resolution: MO_THUMB_RESOLUTION }, basis, moved),
                    },
                };
            }
            // Ruling T16-optname: "<label> orbital"; preflight D8: the label is the orbital's own role, never relabelled.
            add(`mo-${role}`, role, `${role} orbital`, target, thumb);
        }
    }

    add('all-orbitals', 'All orbitals', 'All orbitals — open the list', { openOrbitals: true }, { kind: 'icon' });
    return items;
}

/**
 * Ruling T10-I1, for a molecule change: while the next molecule's meta loads, the strip keeps the last
 * molecule's tiles, each on its glyph and label and asking for nothing -- the structure glyphs too, which would
 * draw the molecule being left -- so the strip (a bottom inset zone, and the phone sheet's first row) never
 * leaves and comes back. The selection follows the view chosen now.
 */
export function pendingMoleculeStripItems(items: readonly MoleculeStripItem[], surface: MoleculeSurface, representation: Representation): MoleculeStripItem[] {
    return items.map(item => ({
        ...item,
        selected: shows(item.target, surface, representation),
        thumb: item.thumb.kind === 'icon' ? item.thumb : { kind: 'pending' },
    }));
}
