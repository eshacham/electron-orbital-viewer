import { buildCubeBlob, requestCube, CubeWorkerHandle, CubeRequest } from '../../src/export/cube_request';
// cubeJobFor/cubeReason build the request out of the store's state -- caption.ts,
// Redux -- so ruling C8 keeps them out of cube_request.ts (which the worker
// imports) and in run_export.ts instead, alongside the other reason functions.
import { cubeJobFor, cubeReason } from '../../src/export/run_export';
import { drillToShell, drillToSubshell, drillToOrbital, setMode, setElement, setRelativity, solveSucceeded } from '../../src/store/atomSlice';
import { setCombination, startOrbitalCalculation, startFieldCalculation, finishOrbitalCalculation } from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { fieldRequestFor } from '../../src/combinations';
import { hydrogenicSource } from '../../src/field_source';
import { makeStore, neonStore, neonProfile, readText, goldStore } from './fixtures';

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

    // Ruling C7/C8 (Task 10's part): with spin–orbit an isolated subshell
    // is one j-level, and the cube is that j-level's density, not the first
    // (n, l) found.
    it('takes the isolated j-level\'s curve with spin–orbit', () => {
        const store = makeStore();
        store.dispatch(setElement(10));
        store.dispatch(setRelativity('spinOrbit'));
        const neon = neonProfile();
        const p = neon.subshells.find(s => s.n === 2 && s.l === 1)!;
        const pHalf = { ...p, j: 0.5, electrons: 2, curve: new Float64Array(neon.size).fill(1) };
        const pThreeHalves = { ...p, j: 1.5, electrons: 4, curve: new Float64Array(neon.size).fill(2) };
        store.dispatch(solveSucceeded({
            ...neon, relativity: 'spinOrbit',
            subshells: [...neon.subshells.filter(s => s.l === 0).map(s => ({ ...s, j: 0.5 })), pHalf, pThreeHalves],
        }));
        store.dispatch(drillToShell(2));
        store.dispatch(drillToSubshell(2, 1, 1.5));
        const job = cubeJobFor(store.getState());
        expect(job.type === 'radialCube' && job.curve.D).toBe(pThreeHalves.curve);
        expect(job).toMatchObject({ description: expect.stringContaining('2p j = 3/2 subshell') });
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

    // Task 12b (ruling C7, Task 10 carry M4): a j-level's curve already
    // holds G^2 + F^2 (both Dirac radial components), not the plain |R|^2
    // an off/scalar subshell's curve holds -- the cube file says so.
    describe('Task 12b: a j-level cube names its own density, and a spin–orbit orbital its large component', () => {
        it('says a j-level subshell cube is that j-level\'s own density, G^2 + F^2', () => {
            const store = goldStore('spinOrbit', { j: true });
            store.dispatch(drillToSubshell(6, 1, 1.5));
            const job = cubeJobFor(store.getState());
            expect(job.type).toBe('radialCube');
            if (job.type === 'radialCube') expect(job.description).toContain('j-level density, G^2 + F^2');
        });

        // Final review M4: a scalar-relativistic state has a small component
        // too, and its curves count it (atom_profile's subshellCurveOf), so
        // a scalar cube is G^2 + F^2 as well -- just not a j-level's.
        it('says a scalar subshell or shell cube counts the small component too, without calling it a j-level', () => {
            const store = goldStore('scalar');
            store.dispatch(drillToSubshell(6, 1));
            const subshell = cubeJobFor(store.getState());
            if (subshell.type !== 'radialCube') throw new Error('expected a radial cube');
            expect(subshell.description).toContain('density with the small component, G^2 + F^2');
            expect(subshell.description).not.toContain('j-level density');
            const shell = goldStore('scalar');
            shell.dispatch(drillToShell(6));
            const shellJob = cubeJobFor(shell.getState());
            if (shellJob.type === 'radialCube') expect(shellJob.description).toContain('density with the small component, G^2 + F^2');
        });

        it('adds no small-component note without relativity', () => {
            const store = neonStore();
            store.dispatch(drillToSubshell(2, 1));
            const job = cubeJobFor(store.getState());
            if (job.type === 'radialCube') expect(job.description).not.toContain('G^2');
        });

        // Same setup as the M4 test above ("carries the SCF profile's own Z
        // and numerical R(r) for an atom-mode orbital"), on a j-level
        // subshell: the orbital-level cube is still R(r) times the plain
        // l-basis real spherical harmonic (Task 9/10), never the true
        // |j, m_j> angular shape, which the file must say rather than imply.
        it('says a spin–orbit orbital-level cube is the large component only, l-basis angular part', () => {
            const store = goldStore('spinOrbit', { j: true });
            store.dispatch(drillToOrbital(6, 1, 0, 1.5));
            const profile = store.getState().atom.profile!;
            const subshell = profile.subshells.find(s => s.n === 6 && s.l === 1 && s.j === 1.5)!;
            const radialSamples = { R: subshell.R, rMin: profile.rMin, dx: profile.dx, size: profile.size };
            store.dispatch(startOrbitalCalculation({
                n: 6, l: 1, ml: 0, Z: profile.Z, resolution: 64, rMax: subshell.samplingRadius,
                enclosedFraction: 0.9, radialSamples,
            }));
            const job = cubeJobFor(store.getState());
            expect(job.type).toBe('fieldCube');
            if (job.type === 'fieldCube') expect(job.description).toContain('large component, l-basis angular part');
        });

        it('notes a scalar orbital is the large component, without the l-basis caveat (it is a genuine l state)', () => {
            const store = goldStore('scalar');
            store.dispatch(drillToOrbital(6, 1, 0));
            const profile = store.getState().atom.profile!;
            const subshell = profile.subshells.find(s => s.n === 6 && s.l === 1)!;
            const radialSamples = { R: subshell.R, rMin: profile.rMin, dx: profile.dx, size: profile.size };
            store.dispatch(startOrbitalCalculation({
                n: 6, l: 1, ml: 0, Z: profile.Z, resolution: 64, rMax: subshell.samplingRadius,
                enclosedFraction: 0.9, radialSamples,
            }));
            const job = cubeJobFor(store.getState());
            if (job.type === 'fieldCube') {
                expect(job.description).toContain('large component');
                expect(job.description).not.toContain('l-basis');
            }
        });
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
