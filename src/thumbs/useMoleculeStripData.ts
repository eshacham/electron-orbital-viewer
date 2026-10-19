import { useEffect, useState } from 'react';
import type { GridFieldSource } from '../field_source';
import type { ScalarGrid } from '../molecules/esp';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeBasis } from '../molecules/types';
import { getDensityGrid, getEspGrid } from '../molecules/grid_cache';
import { loadBasis } from '../molecules/loader';
import type { Loadable } from './molecule_strip_items';

/** The files the Molecules strip's pictures are made from (Task 15). */
export interface MoleculeStripData {
    density: Loadable<GridFieldSource>;
    esp: Loadable<ScalarGrid>;
    basis: Loadable<MoleculeBasis>;
}

const LOADING: MoleculeStripData = { density: 'loading', esp: 'loading', basis: 'loading' };

/**
 * The density grid, ESP grid and basis of `meta`'s molecule, each 'loading'
 * until it lands and null if it cannot be had -- through the same caches the
 * main view reads (grid_cache, loader), so a file is fetched once whoever
 * asks first. Results for a molecule no longer shown are dropped.
 */
export function useMoleculeStripData(meta: LibraryMoleculeMeta | null): MoleculeStripData {
    const [loaded, setLoaded] = useState<{ meta: LibraryMoleculeMeta; data: MoleculeStripData } | null>(null);
    useEffect(() => {
        if (!meta) return undefined;
        let live = true;
        const settle = <K extends keyof MoleculeStripData>(key: K, load: () => Promise<MoleculeStripData[K]>) => {
            // Promise.resolve().then: a loader that throws at once is a failure like any other, not an exception here.
            Promise.resolve().then(load).then(value => value ?? null, () => null).then(value => {
                if (!live) return;
                setLoaded(previous => ({ meta, data: { ...(previous?.meta === meta ? previous.data : LOADING), [key]: value } }));
            });
        };
        settle('density', () => getDensityGrid(meta));
        settle('esp', () => getEspGrid(meta));
        settle('basis', () => loadBasis(meta.id));
        return () => { live = false; };
    }, [meta]);
    return meta && loaded?.meta === meta ? loaded.data : LOADING;
}
