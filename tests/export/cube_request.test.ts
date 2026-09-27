import { buildCubeBlob, requestCube, CubeWorkerHandle, CubeRequest } from '../../src/export/cube_request';
// cubeJobFor/cubeReason build the request out of the store's state -- caption.ts,
// Redux -- so ruling C8 keeps them out of cube_request.ts (which the worker
// imports) and in run_export.ts instead, alongside the other reason functions.
import { cubeJobFor, cubeReason } from '../../src/export/run_export';
import { drillToShell, drillToSubshell, setMode } from '../../src/store/atomSlice';
import { setCombination, startOrbitalCalculation, startFieldCalculation, finishOrbitalCalculation } from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { fieldRequestFor } from '../../src/combinations';
import { makeStore, neonStore, readText } from './fixtures';

function fakeWorker(reply: (request: CubeRequest) => unknown): CubeWorkerHandle & { terminate: jest.Mock } {
    const worker = {
        onmessage: null, onerror: null, terminate: jest.fn(),
        postMessage(request: CubeRequest) { setTimeout(() => worker.onmessage?.({ data: reply(request) } as MessageEvent)); },
    } as CubeWorkerHandle & { terminate: jest.Mock };
    return worker;
}

describe('cube requests', () => {
    it('builds a cube blob from a radial job', async () => {
        const job = cubeJobFor(neonStore().getState());
        expect(job.type).toBe('radialCube');
        const text = await readText(buildCubeBlob({ ...job, resolution: 8, requestId: 1 } as CubeRequest));
        expect(text.split('\n')[0]).toBe('electron-orbital-viewer: Neon (Ne, Z = 10), whole atom, 90% contour');
        expect(text.split('\n')[1]).toMatch(/^rho\(r\) = D\(r\)\/\(4 pi r\^2\), total electron density/);
        expect(text.split('\n')[6].trim().split(/\s+/)).toEqual(['10', '10.000000', '0.000000', '0.000000', '0.000000']);
    });

    it('takes the subshell\'s curve at the shell level when one is isolated', () => {
        const store = neonStore();
        store.dispatch(drillToShell(2));
        expect(cubeJobFor(store.getState())).toMatchObject({ type: 'radialCube', description: expect.stringContaining('n = 2 shell') });
        store.dispatch(drillToSubshell(2, 1));
        expect(cubeJobFor(store.getState())).toMatchObject({ description: expect.stringContaining('2p subshell') });
    });

    it('re-samples the drawn orbital for Basic Orbitals, and refuses an overlay', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        expect(cubeReason(store.getState())).toBe('Nothing is drawn yet.');
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9)));
        expect(cubeReason(store.getState())).toBe('The surface is still being computed.');
        store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
        expect(cubeReason(store.getState())).toBeNull();
        expect(cubeJobFor(store.getState())).toMatchObject({ type: 'fieldCube', resolution: 128, atoms: [{ Z: 1, position: [0, 0, 0] }] });
        const sp3All = { kind: 'hybrid', hybrid: 'sp3', member: 'all' } as const;
        store.dispatch(setCombination(sp3All));
        store.dispatch(startFieldCalculation(fieldRequestFor(sp3All, 0.9)!));
        store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
        expect(cubeReason(store.getState())).toMatch(/pick one member/);
    });

    it('round-trips through a worker, and terminates it either way', async () => {
        const ok = fakeWorker(request => ({ type: 'success', blob: new Blob(['cube']), requestId: request.requestId }));
        expect((await requestCube(cubeJobFor(neonStore().getState()), () => ok)).size).toBe(4);
        expect(ok.terminate).toHaveBeenCalled();
        const bad = fakeWorker(request => ({ type: 'error', message: 'out of memory', requestId: request.requestId }));
        await expect(requestCube(cubeJobFor(neonStore().getState()), () => bad)).rejects.toThrow('out of memory');
        expect(bad.terminate).toHaveBeenCalled();
    });
});
