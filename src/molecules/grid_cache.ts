import type { GridFieldSource } from '../field_source';
import { loadDensityGrid } from './loader';
import { loadEspGrid, ScalarGrid } from './esp';
import type { LibraryMoleculeMeta } from './library_types';

/**
 * The typed-array grids stay out of Redux (they are megabytes) and are kept
 * here instead, most-recently-used first, for the three molecules in
 * current use. This bounds ESP: `loadEspGrid` has no cache of its own, so
 * the capacity below really is the only thing holding ESP grids resident.
 * It does not bound density: `loader.loadDensityGrid` caches every grid it
 * has ever fetched for the whole session (ruling D19), so evicting an entry
 * here only drops this module's own reference -- the data itself stays
 * resident until the page reloads (worst case the whole library, tens of
 * MB). A failed load is forgotten here, so choosing the molecule again
 * retries.
 */
const CAPACITY = 3;

class PromiseCache<T> {
    private entries = new Map<string, Promise<T>>();
    get(key: string, load: () => Promise<T>): Promise<T> {
        const hit = this.entries.get(key);
        if (hit) {
            this.entries.delete(key);
            this.entries.set(key, hit);
            return hit;
        }
        const promise = load();
        this.entries.set(key, promise);
        promise.catch(() => { if (this.entries.get(key) === promise) this.entries.delete(key); });
        while (this.entries.size > CAPACITY) this.entries.delete(this.entries.keys().next().value as string);
        return promise;
    }
    clear(): void {
        this.entries.clear();
    }
}

const densities = new PromiseCache<GridFieldSource>();
const esps = new PromiseCache<ScalarGrid>();

export const getDensityGrid = (meta: LibraryMoleculeMeta) => densities.get(meta.id, () => loadDensityGrid(meta));
export const getEspGrid = (meta: LibraryMoleculeMeta) => esps.get(meta.id, () => loadEspGrid(meta));
export function clearGridCache(): void {
    densities.clear();
    esps.clear();
}
