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

    it('keys by species, and a neutral atom\'s key is unchanged', () => {
        expect(shellMeshCacheKey('26', 3, 32, 0.9)).toBe(shellMeshCacheKey(26, 3, 32, 0.9));
        expect(shellMeshCacheKey('11+1', 2, 32, 0.9)).not.toBe(shellMeshCacheKey(11, 2, 32, 0.9));
    });

    // Ruling C2: species@mode for a relativistic mode; off keeps today's string.
    it('separates relativity modes and j-levels, and keeps the non-relativistic key unchanged', () => {
        expect(shellMeshCacheKey(26, 3, 32, 0.9, null, 'off')).toBe(shellMeshCacheKey(26, 3, 32, 0.9, null));
        expect(shellMeshCacheKey(26, 3, 32, 0.9, null, 'off')).toBe('26:3:32:0.9:all');
        expect(shellMeshCacheKey(79, 6, 32, 0.9, null, 'scalar')).not.toBe(shellMeshCacheKey(79, 6, 32, 0.9, null, 'off'));
        expect(shellMeshCacheKey(79, 6, 32, 0.9, null, 'scalar')).not.toBe(shellMeshCacheKey(79, 6, 32, 0.9, null, 'spinOrbit'));
        expect(shellMeshCacheKey(79, 6, 32, 0.9, 1, 'spinOrbit', 0.5)).not.toBe(shellMeshCacheKey(79, 6, 32, 0.9, 1, 'spinOrbit', 1.5));
        expect(shellMeshCacheKey('79+1', 6, 32, 0.9, null, 'scalar')).toBe('79+1@scalar:6:32:0.9:all');
    });
});
