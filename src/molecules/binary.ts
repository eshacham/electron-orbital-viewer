import { MoleculeLoadError, decodeFloat32 } from './loader';

/**
 * Fetches a float32 grid (spec §4.2: little-endian, gzipped unless the host
 * already decoded it). Gzip-vs-already-inflated and the length check are
 * `decodeFloat32`'s job (D18: shared with the Phase 5 density path rather
 * than duplicated here).
 */
export async function fetchFloat32Grid(url: string, expectedLength: number): Promise<Float32Array> {
    const response = await fetch(url);
    if (!response.ok) throw new MoleculeLoadError(`Could not load ${url} (HTTP ${response.status})`);
    return decodeFloat32(await response.arrayBuffer(), expectedLength, url);
}
