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
 * This cache sits in front of the worker entirely. An atom's LDA ground
 * state is a pure function of Z, and the profile built from it a pure
 * function of (Z, enclosedFraction) -- same configuration, same grid, same
 * SCF loop, same fraction-to-contour slice every time -- so a hit here can
 * never go stale; there is no invalidation to get wrong, only a size bound
 * so a long session cannot grow this without limit.
 */
import { SerialisedAtomProfile } from '../workers/atomWorker';

// 118 elements times the app's 5 enclosed-fraction presets (orbital_presets.
// ts's ENCLOSED_FRACTIONS) is 590 possible entries; a real session touches a
// tiny fraction of that combination space at a time (a handful of elements,
// switching between a couple of fractions), so 20 is generous headroom
// without letting the cache grow unbounded across a long session.
const MAX_ENTRIES = 20;

const cache = new Map<string, SerialisedAtomProfile>();

function keyFor(Z: number, enclosedFraction: number): string {
    return `${Z}:${enclosedFraction}`;
}

/** Looks up a previously solved profile, marking it most-recently-used on a hit. */
export function getCachedProfile(Z: number, enclosedFraction: number): SerialisedAtomProfile | undefined {
    const key = keyFor(Z, enclosedFraction);
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
export function setCachedProfile(Z: number, enclosedFraction: number, profile: SerialisedAtomProfile): void {
    const key = keyFor(Z, enclosedFraction);
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
