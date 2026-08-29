import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import atomReducer, { setElement, drillToShell } from '../../src/store/atomSlice';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';

// useAtomSolver's default worker factory imports createAtomWorker.ts, which
// contains `import.meta.url` -- unparseable by this project's Babel-less
// ts-jest under CommonJS. Every test below injects its own fake factory
// anyway, so the real one is never needed; mocking it out is what makes
// importing useAtomSolver.ts possible at all (see createAtomWorker.ts's own
// doc comment, and orbital_visualizer's identical createOrbitalWorker.ts).
jest.mock('../../src/workers/createAtomWorker', () => ({
    createAtomWorker: jest.fn(),
}));

import { useAtomSolver, AtomWorkerHandle } from '../../src/atom/useAtomSolver';

/** A fake worker the hook can drive without a real DOM Worker/postMessage boundary. */
function fakeWorker(): AtomWorkerHandle & { postMessage: jest.Mock; terminate: jest.Mock } {
    return {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null,
        onerror: null,
    };
}

function minimalProfile(overrides: Partial<SerialisedAtomProfile> = {}): SerialisedAtomProfile {
    return {
        Z: 6,
        converged: true,
        rMin: 1e-4,
        dx: 0.01,
        size: 3,
        total: new Float32Array([1, 2, 1]),
        contourRadius: 1,
        shellPeaks: new Float64Array([1]),
        shells: [],
        subshells: [],
        ...overrides,
    };
}

function buildStore() {
    return configureStore({ reducer: { atom: atomReducer } });
}

describe('useAtomSolver', () => {
    it('does nothing in hydrogenic mode: no worker is created', () => {
        const store = buildStore();
        store.dispatch({ type: 'atom/setMode', payload: 'hydrogenic' });
        const createWorker = jest.fn(fakeWorker);

        renderHook(() => useAtomSolver(0.9, createWorker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });

        expect(createWorker).not.toHaveBeenCalled();
        expect(store.getState().atom.isSolving).toBe(false);
    });

    it('in atom mode, starts a solve on mount: dispatches solveStarted and posts {Z, enclosedFraction} to a fresh worker', () => {
        const store = buildStore();
        const worker = fakeWorker();
        const createWorker = jest.fn(() => worker);

        renderHook(() => useAtomSolver(0.9, createWorker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });

        expect(store.getState().atom.isSolving).toBe(true);
        expect(createWorker).toHaveBeenCalledTimes(1);
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'solve', Z: 1, enclosedFraction: 0.9 });
    });

    it('on a converged success message, dispatches solveSucceeded with the profile', () => {
        const store = buildStore();
        const worker = fakeWorker();
        renderHook(() => useAtomSolver(0.9, () => worker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });

        const profile = minimalProfile({ converged: true });
        act(() => {
            worker.onmessage!({ data: { type: 'success', profile } } as MessageEvent);
        });

        expect(store.getState().atom.profile).toEqual(profile);
        expect(store.getState().atom.isSolving).toBe(false);
        expect(store.getState().atom.error).toBeNull();
    });

    // Ruling R17: a converged:false payload must surface as an explicit
    // error, never as a rendered (wrong) profile.
    it('on a converged:false success message, dispatches solveFailed instead of solveSucceeded', () => {
        const store = buildStore();
        const worker = fakeWorker();
        renderHook(() => useAtomSolver(0.9, () => worker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });

        const profile = minimalProfile({ converged: false });
        act(() => {
            worker.onmessage!({ data: { type: 'success', profile } } as MessageEvent);
        });

        expect(store.getState().atom.profile).toBeNull();
        expect(store.getState().atom.isSolving).toBe(false);
        expect(store.getState().atom.error).toMatch(/did not converge/i);
    });

    it('on an error message, dispatches solveFailed with the worker\'s message', () => {
        const store = buildStore();
        const worker = fakeWorker();
        renderHook(() => useAtomSolver(0.9, () => worker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });

        act(() => {
            worker.onmessage!({ data: { type: 'error', message: 'boom' } } as MessageEvent);
        });

        expect(store.getState().atom.error).toBe('boom');
        expect(store.getState().atom.isSolving).toBe(false);
    });

    it('on worker.onerror, dispatches solveFailed', () => {
        const store = buildStore();
        const worker = fakeWorker();
        renderHook(() => useAtomSolver(0.9, () => worker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });

        act(() => {
            worker.onerror!({ message: 'worker crashed' } as ErrorEvent);
        });

        expect(store.getState().atom.error).toBe('worker crashed');
    });

    it('starts a fresh solve (terminating the old worker) when Z changes via setElement', () => {
        const store = buildStore();
        const workers = [fakeWorker(), fakeWorker()];
        const createWorker = jest.fn(() => workers.shift()!);

        renderHook(() => useAtomSolver(0.9, createWorker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });
        const firstWorker = createWorker.mock.results[0].value;

        act(() => {
            store.dispatch(setElement(6));
        });

        expect(firstWorker.terminate).toHaveBeenCalled();
        expect(createWorker).toHaveBeenCalledTimes(2);
        expect(createWorker.mock.results[1].value.postMessage).toHaveBeenCalledWith({
            type: 'solve', Z: 6, enclosedFraction: 0.9,
        });
    });

    // Ruling R28: navigation never re-solves.
    it('does not start a new solve for pure navigation (drillToShell)', () => {
        const store = buildStore();
        store.dispatch({ type: 'atom/solveSucceeded', payload: minimalProfile({
            shells: [{ n: 1, electrons: 2, contourRadius: 0.5, curve: new Float64Array(3) }],
        }) });
        const createWorker = jest.fn(fakeWorker);

        renderHook(() => useAtomSolver(0.9, createWorker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });
        const callsAfterMount = createWorker.mock.calls.length;

        act(() => {
            store.dispatch(drillToShell(1));
        });

        expect(createWorker.mock.calls.length).toBe(callsAfterMount);
    });

    it('starts a fresh solve when only enclosedFraction changes', () => {
        const store = buildStore();
        const workers = [fakeWorker(), fakeWorker()];
        const createWorker = jest.fn(() => workers.shift()!);

        const { rerender } = renderHook(
            ({ fraction }) => useAtomSolver(fraction, createWorker),
            {
                initialProps: { fraction: 0.9 },
                wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
            }
        );

        rerender({ fraction: 0.5 });

        expect(createWorker).toHaveBeenCalledTimes(2);
        expect(createWorker.mock.results[1].value.postMessage).toHaveBeenCalledWith({
            type: 'solve', Z: 1, enclosedFraction: 0.5,
        });
    });
});
