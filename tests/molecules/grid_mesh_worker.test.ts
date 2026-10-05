import { handleGridMeshRequest } from '../../src/molecules/grid_mesh_request';
import { runMeshWorker } from '../../src/molecules/mesh_worker_client';
import type { GridFieldSource } from '../../src/field_source';

function blob(n = 17, half = 4): GridFieldSource {
    const h = (2 * half) / (n - 1);
    const values = new Float32Array(n ** 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const [x, y, z] = [i, j, k].map(v => -half + v * h);
        values[(i * n + j) * n + k] = Math.exp(-(x * x + y * y + z * z));
    }
    return { kind: 'grid', id: 'blob', shape: [n, n, n], origin: [-half, -half, -half], spacing: h, quantity: 'density', values };
}

describe('grid meshing', () => {
    it('meshes a density grid on its own resolution via an enclosed fraction', () => {
        const response = handleGridMeshRequest({ type: 'calculate', source: blob(), enclosedFraction: 0.9, requestId: 7 });
        expect(response.type).toBe('success');
        expect(response.requestId).toBe(7);
    });
    it('reports a failure as a message', () => {
        const response = handleGridMeshRequest({ type: 'calculate', source: blob(), enclosedFraction: 1.5, requestId: 8 });
        expect(response).toEqual(expect.objectContaining({ type: 'error', requestId: 8 }));
    });
    // Ruling D4: the ESP surface is meshed EXACTLY at a fixed isoValue
    // (generateGridIsoValueMesh), not an enclosed fraction.
    it('meshes a grid exactly at a given isoValue', () => {
        const response = handleGridMeshRequest({ type: 'calculate', source: blob(), isoValue: 0.1, requestId: 9 });
        expect(response.type).toBe('success');
        if (response.type === 'success') expect(response.meshData.isoLevel).toBeCloseTo(0.1, 9);
    });
    it('refuses a request giving both enclosedFraction and isoValue', () => {
        const response = handleGridMeshRequest({ type: 'calculate', source: blob(), enclosedFraction: 0.9, isoValue: 0.1, requestId: 10 });
        expect(response).toEqual(expect.objectContaining({ type: 'error', requestId: 10 }));
    });
    it('refuses a request giving neither enclosedFraction nor isoValue', () => {
        const response = handleGridMeshRequest({ type: 'calculate', source: blob(), requestId: 11 });
        expect(response).toEqual(expect.objectContaining({ type: 'error', requestId: 11 }));
    });
    // Ruling D25: a density grid should never carry a value further below
    // zero than numerical noise explains (C13); the worker refuses it
    // explicitly rather than letting gridAsSampledField clamp it silently.
    it('refuses a density grid holding a genuine negative value', () => {
        const source = blob();
        source.values[0] = -1; // far below -1e-6 * max (max is ~1)
        const response = handleGridMeshRequest({ type: 'calculate', source, enclosedFraction: 0.9, requestId: 12 });
        expect(response.type).toBe('error');
        if (response.type === 'error') expect(response.message).toMatch(/density grid blob holds negative values down to/);
    });
    it('runMeshWorker resolves on its own reply, ignoring a stale one', async () => {
        const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null };
        const pending = runMeshWorker(worker as unknown as Worker, { type: 'calculate', source: blob(), enclosedFraction: 0.9, requestId: 2 });
        worker.onmessage!({ data: { type: 'success', meshData: 'stale', requestId: 1 } });
        worker.onmessage!({ data: { type: 'success', meshData: 'mine', requestId: 2 } });
        await expect(pending).resolves.toBe('mine');
        expect(worker.terminate).toHaveBeenCalled();
    });
});
