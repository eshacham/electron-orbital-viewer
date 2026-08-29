import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import atomReducer, { setElement, setMode, drillToShell } from '../../src/store/atomSlice';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';
import { clearProfileCacheForTests } from '../../src/atom/profile_cache';

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

// Task 20's main-thread profile cache (profile_cache.ts) is module-level
// state, shared by every test in this file since jest only resets module
// state between test *files*, not between `it` blocks. Without clearing it,
// a converged profile cached by one test would silently short-circuit a
// later test's own worker request.
beforeEach(() => { clearProfileCacheForTests(); });

/** A fake worker the hook can drive without a real DOM Worker/postMessage boundary. */
function fakeWorker(): AtomWorkerHandle & { postMessage: jest.Mock; terminate: jest.Mock } {
    return {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null,
        onerror: null,
    };
}

/** The requestId the hook posted with its most recent postMessage call on this worker. */
function lastRequestId(worker: { postMessage: jest.Mock }): number {
    const calls = worker.postMessage.mock.calls;
    return (calls[calls.length - 1][0] as { requestId: number }).requestId;
}

function minimalProfile(overrides: Partial<SerialisedAtomProfile> = {}): SerialisedAtomProfile {
    return {
        Z: 6,
        converged: true,
        rMin: 1e-4,
        dx: 0.01,
        size: 3,
        total: new Float32Array([1, 2, 1]),
        totalEmphasis: new Float32Array([1, 1, 1]),
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
        expect(worker.postMessage).toHaveBeenCalledWith({
            type: 'solve', Z: 1, enclosedFraction: 0.9, requestId: expect.any(Number),
        });
    });

    it('on a converged success message, dispatches solveSucceeded with the profile', () => {
        const store = buildStore();
        const worker = fakeWorker();
        renderHook(() => useAtomSolver(0.9, () => worker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });

        const profile = minimalProfile({ converged: true });
        act(() => {
            worker.onmessage!({ data: { type: 'success', profile, requestId: lastRequestId(worker) } } as MessageEvent);
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
            worker.onmessage!({ data: { type: 'success', profile, requestId: lastRequestId(worker) } } as MessageEvent);
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
            worker.onmessage!({ data: { type: 'error', message: 'boom', requestId: lastRequestId(worker) } } as MessageEvent);
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

    // Task 20 fix: the old behaviour created a fresh worker (and terminated
    // the previous one) on every request, which reset atomWorker.ts's
    // module-scope solveAtom cache every time -- the cache had never once
    // survived a real request boundary. The worker is now created once and
    // reused; a stale reply from a superseded request is instead recognised
    // and dropped via the echoed requestId (see the "supersedes a stale
    // reply" test below).
    it('reuses the same worker (never terminating it) when Z changes via setElement', () => {
        const store = buildStore();
        const worker = fakeWorker();
        const createWorker = jest.fn(() => worker);

        renderHook(() => useAtomSolver(0.9, createWorker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });

        act(() => {
            store.dispatch(setElement(6));
        });

        expect(worker.terminate).not.toHaveBeenCalled();
        expect(createWorker).toHaveBeenCalledTimes(1);
        expect(worker.postMessage).toHaveBeenLastCalledWith({
            type: 'solve', Z: 6, enclosedFraction: 0.9, requestId: expect.any(Number),
        });
    });

    // Replaces what terminate() used to guarantee (see scf.ts's ruling R28
    // doc comment and Task 20): a reply belonging to a request this hook has
    // already moved past must never be applied over a newer, already-settled
    // request's result -- even though the worker itself is never torn down.
    it('drops a stale reply from a superseded request instead of overwriting the current profile', () => {
        const store = buildStore();
        const worker = fakeWorker();

        renderHook(() => useAtomSolver(0.9, () => worker), {
            wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
        });
        const staleRequestId = lastRequestId(worker);

        act(() => {
            store.dispatch(setElement(6));
        });
        const currentRequestId = lastRequestId(worker);
        expect(currentRequestId).not.toBe(staleRequestId);

        // The superseded (Z=1) request's reply arrives late.
        act(() => {
            worker.onmessage!({
                data: { type: 'success', profile: minimalProfile({ Z: 1 }), requestId: staleRequestId },
            } as MessageEvent);
        });
        expect(store.getState().atom.profile).toBeNull();
        expect(store.getState().atom.isSolving).toBe(true);

        // The current (Z=6) request's own reply lands and is applied.
        const currentProfile = minimalProfile({ Z: 6 });
        act(() => {
            worker.onmessage!({
                data: { type: 'success', profile: currentProfile, requestId: currentRequestId },
            } as MessageEvent);
        });
        expect(store.getState().atom.profile).toEqual(currentProfile);
    });

    // Ruling R28: navigation never re-solves.
    it('does not start a new solve for pure navigation (drillToShell)', () => {
        const store = buildStore();
        store.dispatch({ type: 'atom/solveSucceeded', payload: minimalProfile({
            shells: [{ n: 1, electrons: 2, contourRadius: 0.5, curve: new Float64Array(3), emphasis: new Float32Array(3) }],
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

    it('starts a fresh solve when only enclosedFraction changes, reusing the same worker', () => {
        const store = buildStore();
        const worker = fakeWorker();
        const createWorker = jest.fn(() => worker);

        const { rerender } = renderHook(
            ({ fraction }) => useAtomSolver(fraction, createWorker),
            {
                initialProps: { fraction: 0.9 },
                wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
            }
        );

        rerender({ fraction: 0.5 });

        expect(createWorker).toHaveBeenCalledTimes(1);
        expect(worker.postMessage).toHaveBeenLastCalledWith({
            type: 'solve', Z: 1, enclosedFraction: 0.5, requestId: expect.any(Number),
        });
    });

    // The regression test for Task 20's actual bug: through the exact path
    // the app uses (a converged reply populates the main-thread cache,
    // profile_cache.ts), a mode switch away and back, and re-selecting a
    // previously-solved element, must dispatch no solve requests beyond the
    // ones a genuinely new (Z, enclosedFraction) requires -- not one for
    // every navigation, which is what "the cache has never had a hit in the
    // running app" looked like from here (an ~8.6s-for-uranium solve on
    // every trip back to atom mode).
    it('mode switch and re-selecting a previously solved element hit the cache: no extra solve requests', () => {
        const store = buildStore(); // starts at the default element, Z=1
        const worker = fakeWorker();
        const createWorker = jest.fn(() => worker);

        const { rerender } = renderHook(
            () => useAtomSolver(0.9, createWorker),
            { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> }
        );

        // Mount-time solve for the default element.
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        act(() => {
            worker.onmessage!({
                data: { type: 'success', profile: minimalProfile({ Z: 1 }), requestId: lastRequestId(worker) },
            } as MessageEvent);
        });

        // Selecting a different element is a genuine solve.
        act(() => { store.dispatch(setElement(6)); });
        rerender();
        expect(worker.postMessage).toHaveBeenCalledTimes(2);
        act(() => {
            worker.onmessage!({
                data: { type: 'success', profile: minimalProfile({ Z: 6 }), requestId: lastRequestId(worker) },
            } as MessageEvent);
        });

        // Switching mode away and back must not re-solve Z=6.
        act(() => { store.dispatch(setMode('hydrogenic')); });
        rerender();
        act(() => { store.dispatch(setMode('atom')); });
        rerender();
        expect(worker.postMessage).toHaveBeenCalledTimes(2); // unchanged
        expect(store.getState().atom.profile).toEqual(minimalProfile({ Z: 6 }));

        // Re-selecting a previously-solved element (Z=1, seen at mount)
        // also needs no new request.
        act(() => { store.dispatch(setElement(1)); });
        rerender();
        expect(worker.postMessage).toHaveBeenCalledTimes(2); // still unchanged
        expect(store.getState().atom.profile).toEqual(minimalProfile({ Z: 1 }));
        expect(store.getState().atom.isSolving).toBe(false);
    });
});
