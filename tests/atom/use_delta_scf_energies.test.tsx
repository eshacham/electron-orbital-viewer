import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../../src/store';
import { setElement, setCharge, solveStarted, solveSucceeded, solveUnbound } from '../../src/store/atomSlice';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';

// See use_atom_solver.test.tsx: createAtomWorker.ts holds `import.meta.url`,
// which this CommonJS ts-jest setup cannot parse; every test injects a fake.
jest.mock('../../src/workers/createAtomWorker', () => ({ createAtomWorker: jest.fn() }));
import { useDeltaScfEnergies } from '../../src/atom/useDeltaScfEnergies';
import { AtomWorkerHandle } from '../../src/atom/useAtomSolver';

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
});
