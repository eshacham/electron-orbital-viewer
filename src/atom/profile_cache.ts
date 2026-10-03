/**
 * The main-thread half of Task 20's atom-profile cache fix.
 *
 * `solveAtom` (scf.ts, ruling R28) is already memoised by Z, but that
 * memoisation lives in the worker's module scope, and reaching it still
 * costs a postMessage round trip -- one that, until this fix, always ran a
 * full solve anyway because useAtomSolver.ts used to create and terminate a
 * fresh worker per request, wiping the worker's module scope (and its
 * cache) every time.
 *
 * This cache sits in front of the worker entirely. A species' LDA ground
 * state is a pure function of (Z, charge, excitation) -- its speciesKey --
 * and the profile built from it a pure function of (species, enclosedFraction)
 * -- same configuration, same grid, same SCF loop, same fraction-to-contour
 * slice every time -- so a hit here can never go stale; there is no
 * invalidation to get wrong, only a size bound so a long session cannot grow
 * this without limit.
 *
 * Phase 4 adds the relativistic treatment to that tuple: the same species
 * solved with a different radial equation is a different picture, and must
 * never be served for the other mode (Review Focus 2). Keyed as the worker's
 * own solve cache is (ruling C2): the species key alone for 'off' -- exactly
 * today's key, so nothing about the non-relativistic cache changes -- and
 * `${speciesKey}@${relativity}` otherwise.
 */
import { SerialisedAtomProfile } from '../workers/atomWorker';
import { RelativityMode } from './relativity';

// Ions and excitations widen the key space well past "118 elements times 5
// enclosed-fraction presets" (orbital_presets.ts's ENCLOSED_FRACTIONS), since
// a species key can now also carry a charge or an excitation -- but a real
// session still only ever touches a handful of species at a time (switching
// an element's charge/excitation/fraction a few times, not sweeping the
// whole offered range), so 20 was generous headroom without letting the
// cache grow unbounded across a long session. Three relativity modes can
// each hold a picture of the same species, hence a little more (M8).
const MAX_ENTRIES = 32;

const cache = new Map<string, SerialisedAtomProfile>();

function keyFor(species: string, enclosedFraction: number, relativity: RelativityMode): string {
    const solved = relativity === 'off' ? species : `${species}@${relativity}`;
    return `${solved}:${enclosedFraction}`;
}

/** Looks up a previously solved profile, marking it most-recently-used on a hit. */
export function getCachedProfile(
    species: string, enclosedFraction: number, relativity: RelativityMode = 'off',
): SerialisedAtomProfile | undefined {
    const key = keyFor(species, enclosedFraction, relativity);
    const hit = cache.get(key);
    if (hit !== undefined) {
        // Map iterates in insertion order, so re-inserting on a hit is what
        // makes that order double as recency for the LRU eviction below.
        cache.delete(key);
        cache.set(key, hit);
    }
    return hit;
}

/** Records a solved profile, evicting the least-recently-used entry if this pushes the cache over its bound. */
export function setCachedProfile(
    species: string, enclosedFraction: number, profile: SerialisedAtomProfile, relativity: RelativityMode = 'off',
): void {
    const key = keyFor(species, enclosedFraction, relativity);
    cache.delete(key);
    cache.set(key, profile);
    if (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
}

/**
 * Test-only escape hatch. Without it, this module-level cache would leak
 * state between test cases in the same file (jest does not reset module
 * state between `it` blocks, only between test files), which would make
 * later tests silently short-circuit on an earlier test's cached profile
 * instead of exercising the worker path they intend to.
 */
export function clearProfileCacheForTests(): void {
    cache.clear();
}
