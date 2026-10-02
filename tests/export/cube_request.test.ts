import { buildCubeBlob, requestCube, CubeWorkerHandle, CubeRequest } from '../../src/export/cube_request';
// cubeJobFor/cubeReason build the request out of the store's state -- caption.ts,
// Redux -- so ruling C8 keeps them out of cube_request.ts (which the worker
// imports) and in run_export.ts instead, alongside the other reason functions.
import { cubeJobFor, cubeReason } from '../../src/export/run_export';
import { drillToShell, drillToSubshell, drillToOrbital, setMode } from '../../src/store/atomSlice';
import { setCombination, startOrbitalCalculation, startFieldCalculation, finishOrbitalCalculation } from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { fieldRequestFor } from '../../src/combinations';
import { hydrogenicSource } from '../../src/field_source';
import { makeStore, neonStore, readText } from './fixtures';

function fakeWorker(reply: (request: CubeRequest) => unknown): CubeWorkerHandle & { terminate: jest.Mock } {
    const worker = {
        onmessage: null, onerror: null, onmessageerror: null, terminate: jest.fn(),
        postMessage(request: CubeRequest) { setTimeout(() => worker.onmessage?.({ data: reply(request) } as MessageEvent)); },
    } as CubeWorkerHandle & { terminate: jest.Mock };
    return worker;
}

/** A worker whose postMessage never replies -- the test drives onerror/onmessageerror by hand. */
function silentWorker(): CubeWorkerHandle & { terminate: jest.Mock; postMessage: jest.Mock } {
    return { onmessage: null, onerror: null, onmessageerror: null, terminate: jest.fn(), postMessage: jest.fn() };
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

    // M4: the atom-mode orbital level (level 3) renders through
    // state.orbital.currentParams, same as Basic Orbitals -- carrying the
    // solved profile's own Z and its numerical R(r) override is what makes
    // the exported ψ the SCF orbital rather than the analytic hydrogenic one.
    it('carries the SCF profile\'s own Z and numerical R(r) for an atom-mode orbital (level 3)', () => {
        const store = neonStore();
        store.dispatch(drillToOrbital(2, 1, 0));
        const profile = store.getState().atom.profile!;
        const subshell = profile.subshells.find(s => s.n === 2 && s.l === 1)!;
        const radialSamples = { R: subshell.R, rMin: profile.rMin, dx: profile.dx, size: profile.size };
        store.dispatch(startOrbitalCalculation({
            n: 2, l: 1, ml: 0, Z: profile.Z, resolution: 64, rMax: subshell.samplingRadius,
            enclosedFraction: 0.9, radialSamples,
        }));
        const job = cubeJobFor(store.getState());
        expect(job.type).toBe('fieldCube');
        expect(job.atoms).toEqual([{ Z: 10, position: [0, 0, 0] }]);
        if (job.type !== 'fieldCube') throw new Error('unreachable');
        const recipe = job.source.recipe as { type: 'hydrogenic'; radialSamples?: unknown };
        expect(recipe.radialSamples).toEqual(radialSamples);
    });

    // M4.
    it('takes the field job\'s source straight from hydrogenicSource(currentParams) for a plain Basic Orbitals render', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        const params = basicOrbitalParams(2, 1, 0, 0.9);
        store.dispatch(startOrbitalCalculation(params));
        store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
        const job = cubeJobFor(store.getState());
        expect(job.type).toBe('fieldCube');
        if (job.type !== 'fieldCube') throw new Error('unreachable');
        expect(job.source).toEqual(hydrogenicSource(params));
    });

    // M4: Stark "Both" overlays the lower and upper n=2 states, same shape of
    // refusal as a hybrid's "All" (Review Focus 4).
    it('refuses a Stark "Both" overlay the same way as a hybrid\'s "All"', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        const both = { kind: 'field' as const, level: 2 as const, field: 0.001, stark: 'both' as const };
        store.dispatch(setCombination(both));
        store.dispatch(startFieldCalculation(fieldRequestFor(both, 0.9)!));
        store.dispatch(finishOrbitalCalculation({ isoLevel: 1e-4 }));
        expect(cubeReason(store.getState())).toMatch(/pick one member/);
    });

    // M1/M4: every way the worker boundary can fail, not just a reply typed 'error'.
    describe('requestCube failure paths', () => {
        it('rejects and terminates when postMessage throws synchronously', async () => {
            const worker = silentWorker();
            worker.postMessage.mockImplementation(() => { throw new Error('DataCloneError: could not clone the request'); });
            await expect(requestCube(cubeJobFor(neonStore().getState()), () => worker)).rejects.toThrow('DataCloneError');
            expect(worker.terminate).toHaveBeenCalled();
        });

        it('rejects with the worker error\'s own message, and terminates', async () => {
            const worker = silentWorker();
            const promise = requestCube(cubeJobFor(neonStore().getState()), () => worker);
            worker.onerror?.({ message: 'script error' } as ErrorEvent);
            await expect(promise).rejects.toThrow('script error');
            expect(worker.terminate).toHaveBeenCalled();
        });

        it('falls back to a stated reason when the worker error carries no message', async () => {
            const worker = silentWorker();
            const promise = requestCube(cubeJobFor(neonStore().getState()), () => worker);
            worker.onerror?.({ message: '' } as ErrorEvent);
            await expect(promise).rejects.toThrow('The cube file could not be built.');
            expect(worker.terminate).toHaveBeenCalled();
        });

        it('rejects and terminates on onmessageerror, an undeserialisable reply', async () => {
            const worker = silentWorker();
            const promise = requestCube(cubeJobFor(neonStore().getState()), () => worker);
            worker.onmessageerror?.({} as MessageEvent);
            await expect(promise).rejects.toThrow('The cube reply could not be read.');
            expect(worker.terminate).toHaveBeenCalled();
        });
    });
});
