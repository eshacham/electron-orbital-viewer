import {
    shellMeshCacheKey,
    getCachedShellMeshes,
    setCachedShellMeshes,
    clearShellMeshCacheForTests,
} from '../../src/atom/shell_mesh_cache';
import { LobeMeshData } from '../../src/workers/shellCompositionWorker';

const mesh = (n: number): LobeMeshData[] =>
    Array.from({ length: n }, () => ({ positions: [[0, 0, 0]], cells: [[0, 0, 0]] }));

describe('shellMeshCacheKey', () => {
    beforeEach(clearShellMeshCacheForTests);

    it('separates the full shell from an isolated subshell of it', () => {
        // Iron's M shell: nine meshes overlapping, five when 3d is isolated.
        // Same (Z, n, resolution, fraction) -- different cached value, so a
        // shared key would serve one where the other was asked for.
        const full = shellMeshCacheKey(26, 3, 32, 0.9, null);
        const isolated = shellMeshCacheKey(26, 3, 32, 0.9, 2);
        expect(full).not.toBe(isolated);

        setCachedShellMeshes(full, mesh(9));
        setCachedShellMeshes(isolated, mesh(5));
        expect(getCachedShellMeshes(full)).toHaveLength(9);
        expect(getCachedShellMeshes(isolated)).toHaveLength(5);
    });

    it('separates two different isolated subshells of the same shell', () => {
        expect(shellMeshCacheKey(26, 3, 32, 0.9, 1)).not.toBe(shellMeshCacheKey(26, 3, 32, 0.9, 2));
    });

    it('defaults to the full shell when no isolation is given', () => {
        expect(shellMeshCacheKey(26, 3, 32, 0.9)).toBe(shellMeshCacheKey(26, 3, 32, 0.9, null));
    });
});
