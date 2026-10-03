import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../../src/store';
import { setElement, setCharge, setMode, solveStarted, solveSucceeded, solveUnbound, solveFailed, setRelativity } from '../../src/store/atomSlice';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';
import { clearEnergiesCacheForTests, getCachedEnergies, setCachedEnergies } from '../../src/atom/energies_cache';

// See use_atom_solver.test.tsx: createAtomWorker.ts holds `import.meta.url`,
// which this CommonJS ts-jest setup cannot parse; every test injects a fake.
jest.mock('../../src/workers/createAtomWorker', () => ({ createAtomWorker: jest.fn() }));
import { useDeltaScfEnergies } from '../../src/atom/useDeltaScfEnergies';
import { AtomWorkerHandle } from '../../src/atom/useAtomSolver';

// energies_cache.ts is module-level state; see use_atom_solver.test.tsx's profile cache note.
beforeEach(() => { clearEnergiesCacheForTests(); });

type FakeWorker = AtomWorkerHandle & { postMessage: jest.Mock; terminate: jest.Mock };
const fake = (): FakeWorker => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null });

/** The picture for one species -- only its key matters to this hook (ruling C15). */
function pictureOf(Z: number, speciesKey: string): SerialisedAtomProfile {
    return {
        Z, converged: true, speciesKey,
        rMin: 1e-4, dx: 0.01, size: 3,
        total: new Float32Array(3), totalEmphasis: new Float32Array(3),
        contourRadius: 1, valencePeakRadius: 0.8, displayRadius: 1.2,
        shellPeaks: new Float64Array(0), shellIndexAtR: new Float32Array(3),
        shells: [], subshells: [],
    };
}

function mount(store: ReturnType<typeof createAppStore>) {
    const workers: FakeWorker[] = [];
    const view = renderHook(() => useDeltaScfEnergies(() => { const w = fake(); workers.push(w); return w; }), {
        wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });
    return { workers, ...view };
}

const sodium = { valueEv: 5.37, fromLabel: 'Na', toLabel: 'Na⁺' };

const requestIdOf = (worker: FakeWorker) => (worker.postMessage.mock.calls[0][0] as { requestId: number }).requestId;

describe('useDeltaScfEnergies', () => {
    it('asks a fresh worker for the current species once its picture lands, and terminates it when the species changes', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers } = mount(store);
        // Ruling C15: nothing competes with the picture's own solve.
        expect(workers).toHaveLength(0);

        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        expect(workers[0].postMessage).toHaveBeenCalledWith({ type: 'energies', Z: 11, charge: 0, excitation: null, requestId: expect.any(Number) });
        expect(store.getState().atom.energies).toMatchObject({ status: 'computing', speciesKey: '11' });

        act(() => { store.dispatch(setCharge(1)); });
        expect(workers[0].terminate).toHaveBeenCalled();
        expect(workers).toHaveLength(1);

        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11+1'))); });
        expect(workers[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ Z: 11, charge: 1 }));

        act(() => {
            workers[1].onmessage!({ data: { type: 'energies', speciesKey: '11+1', ionisation: null, excitation: null, requestId: requestIdOf(workers[1]) } } as MessageEvent);
        });
        expect(store.getState().atom.energies).toMatchObject({ status: 'done', speciesKey: '11+1', ionisation: null });
        expect(workers[1].terminate).toHaveBeenCalled();
        // Landing as done re-runs the effect; it must not ask again.
        expect(workers).toHaveLength(2);
    });

    it('keeps energies already done across a mode switch away and back', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        act(() => {
            workers[0].onmessage!({ data: { type: 'energies', speciesKey: '11', ionisation: sodium, excitation: null, requestId: requestIdOf(workers[0]) } } as MessageEvent);
        });
        // Not the cache that keeps them: the store's own 'done' does.
        clearEnergiesCacheForTests();
        act(() => { store.dispatch(setMode('hydrogenic')); });
        act(() => { store.dispatch(setMode('atom')); });
        expect(workers).toHaveLength(1);
        expect(store.getState().atom.energies).toMatchObject({ status: 'done', speciesKey: '11', ionisation: sodium });
    });

    it('serves a species computed earlier from the cache: Na -> Na⁺ -> Na asks no worker the second time', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        act(() => {
            workers[0].onmessage!({ data: { type: 'energies', speciesKey: '11', ionisation: sodium, excitation: null, requestId: requestIdOf(workers[0]) } } as MessageEvent);
        });
        expect(getCachedEnergies('11')).toEqual({ ionisation: sodium, excitation: null });

        act(() => { store.dispatch(setCharge(1)); });
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11+1'))); });
        expect(workers).toHaveLength(2);

        act(() => { store.dispatch(setCharge(0)); });
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        expect(workers).toHaveLength(2);
        expect(store.getState().atom.energies).toMatchObject({ status: 'done', speciesKey: '11', ionisation: sodium });
    });

    it('a cache hit lands under the selected species key with no worker at all', () => {
        const excited = { valueEv: 2.185, fromLabel: 'Na 3s', toLabel: 'Na 3p' };
        setCachedEnergies('11:3s>3p', { ionisation: null, excitation: excited });
        const store = createAppStore();
        store.dispatch(setElement(11));
        store.dispatch({ type: 'atom/setExcitation', payload: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } });
        const { workers } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11:3s>3p'))); });
        expect(workers).toHaveLength(0);
        expect(store.getState().atom.energies).toEqual({ speciesKey: '11:3s>3p', status: 'done', ionisation: null, excitation: excited, message: null });
    });

    it('does not cache a failure', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        act(() => {
            workers[0].onmessage!({ data: { type: 'error', message: 'did not converge', requestId: requestIdOf(workers[0]) } } as MessageEvent);
        });
        expect(getCachedEnergies('11')).toBeUndefined();
    });

    it('does not restart for a re-solve of the same species (an enclosed-fraction change)', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        act(() => { store.dispatch(solveStarted()); });
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        expect(workers).toHaveLength(1);
        expect(workers[0].terminate).not.toHaveBeenCalled();
    });

    it('reports a worker error reply, or a crashed worker, as energiesFailed', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        act(() => {
            workers[0].onmessage!({ data: { type: 'error', message: 'did not converge', requestId: requestIdOf(workers[0]) } } as MessageEvent);
        });
        expect(store.getState().atom.energies).toMatchObject({ status: 'failed', speciesKey: '11', message: 'did not converge' });

        act(() => { store.dispatch(setElement(17)); });
        act(() => { store.dispatch(solveSucceeded(pictureOf(17, '17'))); });
        act(() => { workers[1].onerror!({ message: 'worker crashed' } as ErrorEvent); });
        expect(store.getState().atom.energies).toMatchObject({ status: 'failed', speciesKey: '17', message: 'worker crashed' });
    });

    it('never starts for an anion LDA does not bind: no picture lands', () => {
        const store = createAppStore();
        store.dispatch(setElement(17));
        store.dispatch(setCharge(-1));
        const { workers } = mount(store);
        act(() => { store.dispatch(solveUnbound('LDA does not bind this anion: …')); });
        expect(workers).toHaveLength(0);
        expect(store.getState().atom.energies.status).toBe('idle');
    });

    it('terminates its worker on unmount', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers, unmount } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        unmount();
        expect(workers[0].terminate).toHaveBeenCalled();
    });

    it('does nothing in Basic Orbitals mode', () => {
        const store = createAppStore();
        store.dispatch({ type: 'atom/setMode', payload: 'hydrogenic' });
        store.dispatch(solveSucceeded(pictureOf(1, '1')));
        const create = jest.fn(fake);
        renderHook(() => useDeltaScfEnergies(create), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> });
        expect(create).not.toHaveBeenCalled();
    });

    // Ruling C6: ΔSCF energies are the same whichever mode draws the
    // picture, so a mode switch must not throw away a computation in flight.
    it('keeps computing across a mode switch, and is not left computing when the new mode fails', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        expect(store.getState().atom.energies.status).toBe('computing');

        act(() => { store.dispatch(setRelativity('scalar')); store.dispatch(solveStarted()); });
        expect(workers[0].terminate).not.toHaveBeenCalled();
        expect(workers).toHaveLength(1);

        act(() => { store.dispatch(solveFailed('Scalar-relativistic SCF for Sodium did not converge.')); });
        expect(store.getState().atom.energies.status).not.toBe('computing');
        expect(workers[0].terminate).toHaveBeenCalled();

        // Back to off: the old picture comes back, and the energies with it.
        act(() => { store.dispatch(setRelativity(null)); store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        expect(workers).toHaveLength(2);
        expect(store.getState().atom.energies).toMatchObject({ status: 'computing', speciesKey: '11' });
    });

    it('lets a reply already in flight land after a mode switch', () => {
        const store = createAppStore();
        store.dispatch(setElement(11));
        const { workers } = mount(store);
        act(() => { store.dispatch(solveSucceeded(pictureOf(11, '11'))); });
        act(() => { store.dispatch(setRelativity('scalar')); });
        act(() => {
            workers[0].onmessage!({ data: { type: 'energies', speciesKey: '11', ionisation: sodium, excitation: null, requestId: requestIdOf(workers[0]) } } as MessageEvent);
        });
        expect(store.getState().atom.energies).toMatchObject({ status: 'done', ionisation: sodium });
    });
});
