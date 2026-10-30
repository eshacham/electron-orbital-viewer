import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../src/store';
import { setEnclosedFraction } from '../src/store/orbitalSlice';
import { resetUrlKeysForTests, registerBuiltInUrlKeys } from '../src/url_state';
import { useUrlStateSync } from '../src/useUrlStateSync';
import { visitLevel, clearVisit } from '../src/levels/level_pref';
import { linkCorrections, clearLinkCorrections } from '../src/link_corrections';

// createAppStore(), not a bare configureStore: it carries production's
// serializableCheck exceptions, so a store built here stays pristine when a
// test dispatches solveSucceeded/startOrbitalCalculation (ruling T5/I1).
const makeStore = () => createAppStore();
const mount = (store: ReturnType<typeof makeStore>) => renderHook(() => useUrlStateSync(window, 50), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
});

describe('useUrlStateSync', () => {
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); window.history.replaceState(null, '', '/'); });
    afterEach(() => { jest.useRealTimers(); resetUrlKeysForTests(); window.history.replaceState(null, '', '/'); clearVisit(); clearLinkCorrections(); });

    it('writes the view into the hash on mount, without a history entry', () => {
        const before = window.history.length;
        mount(makeStore());
        // Ruling R20a-2: the link carries a fresh session's default opacity; R24-1 (owner) made it 0.9 (was 0.7).
        expect(window.location.hash).toBe('#mode=atom&Z=1&level=atom&frac=0.9&cut=none&op=0.9&surf=solid');
        expect(window.history.length).toBe(before);
    });

    it('follows later changes after a short delay, still without history entries', () => {
        jest.useFakeTimers();
        const store = makeStore();
        const before = window.history.length;
        mount(store);
        act(() => { store.dispatch(setEnclosedFraction(0.5)); });
        expect(window.location.hash).toContain('frac=0.9');
        act(() => { jest.advanceTimersByTime(60); });
        expect(window.location.hash).toContain('frac=0.5');
        expect(window.history.length).toBe(before);
    });

    it('applies a hash typed into the address bar', async () => {
        const store = makeStore();
        mount(store);
        act(() => { window.location.hash = '#mode=basic&n=2&l=1&ml=0'; });
        await waitFor(() => expect(store.getState().atom.mode).toBe('hydrogenic'));
        expect(store.getState().orbital.basicSelection).toEqual({ n: 2, l: 1, ml: 0 });
    });

    // Fix round 1: the hashchange handler now goes through the same
    // applyLevelForHash helper as main.tsx's boot read and Cognito-return
    // callback (Important #2) -- this confirms the extraction kept its
    // behaviour, not just its call sites.
    it('raises the visit level for a typed hash that itself needs Advanced', async () => {
        const store = makeStore();
        mount(store);
        act(() => { window.location.hash = '#mode=atom&Z=26&charge=2'; });
        await waitFor(() => expect(store.getState().atom.charge).toBe(2));
        expect(visitLevel()).toBe('advanced');
    });

    // Final polish F1: a typed hash's corrections reach the notice, and the next link's replace them.
    it('hands a typed hash\'s corrections to the notice, and the next link in range takes them away', async () => {
        const store = makeStore();
        mount(store);
        act(() => { window.location.hash = '#mode=atom&Z=200'; });
        await waitFor(() => expect(linkCorrections().corrections).toEqual([{ field: 'Z', asked: '200', used: 'hydrogen (Z = 1)' }]));
        act(() => { window.location.hash = '#mode=atom&Z=6'; });
        await waitFor(() => expect(store.getState().atom.Z).toBe(6));
        expect(linkCorrections().corrections).toEqual([]);
    });

    // Fix round 1, M4: the timer guard (`if (timer === null) ...`) exists
    // specifically so a burst of dispatches -- a slider drag reports on
    // every pointer move -- coalesces into one write, not one per dispatch.
    it('writes once for a burst of dispatches, with the latest state', () => {
        jest.useFakeTimers();
        const store = makeStore();
        mount(store);
        const replaceState = jest.spyOn(window.history, 'replaceState');
        // The mount-time write above already happened; only the burst below counts.
        replaceState.mockClear();

        act(() => {
            store.dispatch(setEnclosedFraction(0.5));
            store.dispatch(setEnclosedFraction(0.6));
            store.dispatch(setEnclosedFraction(0.7));
        });
        act(() => { jest.advanceTimersByTime(60); });

        expect(replaceState).toHaveBeenCalledTimes(1);
        expect(window.location.hash).toContain('frac=0.7');
        replaceState.mockRestore();
    });

    // Fix round 1, M4: the write() guard (`hash !== next`) exists so a hash
    // that already reads as the current state -- e.g. one this same hook
    // just wrote -- is not rewritten to an identical value on every mount.
    it('does not write when the hash already equals the encoded state', () => {
        // Ruling R24-1: the fresh store's state now encodes op=0.9 (was op=0.7, R20a-2).
        window.history.replaceState(null, '', '/#mode=atom&Z=1&level=atom&frac=0.9&cut=none&op=0.9&surf=solid');
        const replaceState = jest.spyOn(window.history, 'replaceState');

        mount(makeStore());

        expect(replaceState).not.toHaveBeenCalled();
        replaceState.mockRestore();
    });
});
