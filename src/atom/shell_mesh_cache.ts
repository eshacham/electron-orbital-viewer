/**
 * Front-of-worker cache for a shell's composite orbital meshes (Addendum 2),
 * mirroring `profile_cache.ts`'s reasoning exactly: a shell's marching-cubes
 * lobes are a pure function of (Z, n, resolution, enclosedFraction) -- same
 * SCF solution, same subshells, same per-orbital sampling box and contour --
 * so a hit here can never go stale, and re-entering a shell already visited
 * this session needs no worker round trip at all.
 */
import { LobeMeshData } from '../workers/shellCompositionWorker';

// A handful of elements, each with at most a few shells actually visited in
// one session -- generous headroom without growing without bound across a
// long session (same order of magnitude as profile_cache.ts's MAX_ENTRIES).
const MAX_ENTRIES = 24;

const cache = new Map<string, LobeMeshData[]>();

/**
 * `isolatedL` is the subshell the composition view is currently isolated to
 * (Addendum 2's readability follow-up), or null for the full, overlapping
 * shell. Part of the key because the cached value is the *list of meshes
 * actually computed* -- isolating 3d computes five meshes, not nine, so an
 * isolated entry and a full one are different values under the same
 * (Z, n, resolution, fraction) and must not collide.
 */
export function shellMeshCacheKey(
    Z: number,
    n: number,
    resolution: number,
    enclosedFraction: number,
    isolatedL: number | null = null
): string {
    return `${Z}:${n}:${resolution}:${enclosedFraction}:${isolatedL ?? 'all'}`;
}

/** Looks up a previously computed shell's lobe meshes, marking it most-recently-used on a hit. */
export function getCachedShellMeshes(key: string): LobeMeshData[] | undefined {
    const hit = cache.get(key);
    if (hit !== undefined) {
        // Map iterates in insertion order, so re-inserting on a hit is what
        // makes that order double as recency for the LRU eviction below.
        cache.delete(key);
        cache.set(key, hit);
    }
    return hit;
}

/** Records a shell's lobe meshes, evicting the least-recently-used entry if this pushes the cache over its bound. */
export function setCachedShellMeshes(key: string, meshes: LobeMeshData[]): void {
    cache.delete(key);
    cache.set(key, meshes);
    if (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
}

/** Test-only escape hatch -- see profile_cache.ts's identical one for why this is needed. */
export function clearShellMeshCacheForTests(): void {
    cache.clear();
}
