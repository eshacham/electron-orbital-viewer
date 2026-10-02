/**
 * The main-thread cache of ΔSCF energies, in front of useDeltaScfEnergies'
 * disposable worker -- the same idea as profile_cache.ts for pictures.
 *
 * That worker is terminated on every species change (so a slow ΔSCF never
 * queues in front of a picture), which takes delta_scf's own memoisation
 * with it. Without this cache, stepping Na -> Na⁺ -> Na, or re-picking the
 * species already selected (which clears the store's energies, ruling C5),
 * reran two spin-polarised solves -- tens of seconds for the heaviest atoms.
 *
 * Keyed by speciesKey alone: unlike a profile, ΔSCF energies are total-energy
 * differences and do not depend on the enclosed fraction. A pure function of
 * the species, so a hit can never go stale; only a size bound is needed.
 * Failures are never stored -- they say nothing a retry could not.
 */
import type { EnergyReading } from './delta_scf';

export interface CachedEnergies {
    ionisation: EnergyReading | null;
    excitation: EnergyReading | null;
}

// One entry per species rather than per (species, fraction), so a bound a
// little above profile_cache's covers the same session comfortably.
const MAX_ENTRIES = 32;

const cache = new Map<string, CachedEnergies>();

/** Looks up a species' energies, marking them most-recently-used on a hit. */
export function getCachedEnergies(speciesKey: string): CachedEnergies | undefined {
    const hit = cache.get(speciesKey);
    if (hit !== undefined) {
        // Re-inserting makes Map's insertion order double as recency.
        cache.delete(speciesKey);
        cache.set(speciesKey, hit);
    }
    return hit;
}

/** Records a species' energies, evicting the least-recently-used entry past the bound. */
export function setCachedEnergies(speciesKey: string, energies: CachedEnergies): void {
    cache.delete(speciesKey);
    cache.set(speciesKey, energies);
    if (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
}

/** Test-only: jest keeps module state across `it` blocks in one file. */
export function clearEnergiesCacheForTests(): void {
    cache.clear();
}
