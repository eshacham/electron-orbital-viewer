import type { MoleculeIndexEntry } from '../molecules/types';
import type { JobView } from './api_types';

export const COMPUTED_CATEGORY = { key: 'computed', label: 'Computed' } as const;

/**
 * The month's finished jobs as picker entries (spec §9.1: the owner's
 * "Computed" category). The same name can be computed both ways, so an
 * optimised geometry says so; every entry also carries a "· computed" suffix
 * (preflight D19) since the library can list the very same molecule (e.g.
 * "Water") under All, and the two rows must read differently, not just sort
 * differently.
 */
export function computedEntries(jobs: JobView[]): MoleculeIndexEntry[] {
    return jobs.filter(job => job.status === 'DONE').map(job => ({
        id: job.key,
        name: `${job.recipe === 'optimise' ? `${job.name} (optimised)` : job.name} · computed`,
        formula: job.formula,
        category: COMPUTED_CATEGORY.key,
        tags: ['computed', job.recipe],
        tier: 'computed' as const,
    }));
}

/** The library, then the owner's computed molecules; the same array when there are none, so nothing re-renders for nothing. */
export function withComputed(index: MoleculeIndexEntry[] | null, jobs: JobView[] | null): MoleculeIndexEntry[] | null {
    if (index === null || jobs === null) return index;
    const entries = computedEntries(jobs);
    return entries.length ? [...index, ...entries] : index;
}
