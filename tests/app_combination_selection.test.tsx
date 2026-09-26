import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { CombinationSelection } from '../src/combinations';

jest.mock('../src/components/OrbitalViewer', () => ({
    __esModule: true,
    default: () => <div data-testid="orbital-viewer" />,
}));
jest.mock('../src/orbital_visualizer', () => ({}));
jest.mock('../src/workers/createAtomWorker', () => ({
    createAtomWorker: jest.fn(() => ({ postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null })),
}));
// The picker's controls cannot reach a refused selection (the slider is
// clamped); Phase 2's URL state will. This stands in for it: any selection
// can be typed in, and the real picker still renders beside it, Alert and all.
jest.mock('../src/components/CombinationControls', () => {
    const Actual = jest.requireActual('../src/components/CombinationControls').default;
    return {
        __esModule: true,
        default: (props: { selection: CombinationSelection; onChange: (s: CombinationSelection) => void }) => (
            <>
                <input aria-label="selection" onChange={e => props.onChange(JSON.parse(e.target.value))} />
                <Actual {...props} />
            </>
        ),
    };
});

import App from '../src/App';
import orbitalReducer from '../src/store/orbitalSlice';
import atomReducer from '../src/store/atomSlice';

function renderBasicOrbitals() {
    const store = configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });
    render(<Provider store={store}><App /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: /basic orbitals mode/i }));
    return store;
}

function select(selection: CombinationSelection) {
    fireEvent.change(screen.getByLabelText('selection'), { target: { value: JSON.stringify(selection) } });
}

const field = (level: 1 | 2, F: number, stark: 'lower' | 'upper' | 'both' = 'lower'): CombinationSelection =>
    ({ kind: 'field', level, field: F, stark });

describe('App: a refused combination', () => {
    // Final review (spec §3.5): never a silently wrong picture.
    it('takes the previous picture down, says it is not drawn, and keeps the reason', () => {
        const store = renderBasicOrbitals();
        select({ kind: 'hybrid', hybrid: 'sp3', member: 'all' });
        expect(store.getState().orbital.currentField).not.toBeNull();
        expect(screen.getByLabelText('combination colour key')).toBeInTheDocument();

        select(field(2, 0.01));
        const { currentField, currentParams, isLoading } = store.getState().orbital;
        expect(currentField).toBeNull();
        expect(currentParams).toBeNull();
        expect(isLoading).toBe(false);
        expect(screen.getByRole('alert')).toHaveTextContent(/not bound/);
        expect(document.getElementById('orbital-name')).toHaveTextContent(/not drawn/);
        expect(screen.queryByLabelText('combination colour key')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('surface colour key')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('radial distribution')).not.toBeInTheDocument();
    });

    it('draws again once the selection is fixed', () => {
        const store = renderBasicOrbitals();
        select(field(1, -1));
        expect(store.getState().orbital.currentField).toBeNull();
        expect(screen.getByRole('alert')).toHaveTextContent(/must be between 0 and 0\.05/);

        select(field(1, 0.02));
        expect(store.getState().orbital.currentField?.sources[0].recipe).toEqual({ type: 'polarized1s', field: 0.02 });
        expect(document.getElementById('orbital-name')).not.toHaveTextContent(/not drawn/);
    });
});
