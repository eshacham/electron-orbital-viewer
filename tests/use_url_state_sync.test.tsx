import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer, { setEnclosedFraction } from '../src/store/orbitalSlice';
import atomReducer from '../src/store/atomSlice';
import { resetUrlKeysForTests, registerBuiltInUrlKeys } from '../src/url_state';
import { useUrlStateSync } from '../src/useUrlStateSync';

const makeStore = () => configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });
const mount = (store: ReturnType<typeof makeStore>) => renderHook(() => useUrlStateSync(window, 50), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
});

describe('useUrlStateSync', () => {
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); window.history.replaceState(null, '', '/'); });
    afterEach(() => { jest.useRealTimers(); resetUrlKeysForTests(); window.history.replaceState(null, '', '/'); });

    it('writes the view into the hash on mount, without a history entry', () => {
        const before = window.history.length;
        mount(makeStore());
        expect(window.location.hash).toBe('#mode=atom&Z=1&level=atom&frac=0.9&cut=none&op=1&surf=solid');
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
});
