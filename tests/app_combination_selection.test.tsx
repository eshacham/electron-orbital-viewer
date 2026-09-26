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

describe('App: the n = 2 field slider', () => {
    // Final review: at n = 2 the drawn shapes do not depend on F, so a new
    // F must not recompute them -- only the energies change.
    it('does not re-request an identical picture, while the energies follow F', () => {
        const store = renderBasicOrbitals();
        select(field(2, 0.001));
        const drawn = store.getState().orbital.currentField;
        expect(drawn?.sources.map(s => s.id)).toEqual(['stark:n2:lower']);
        expect(screen.getByText(/ΔE = −3F = −0\.0030 Ha/)).toBeInTheDocument();

        select(field(2, 0.002));
        expect(store.getState().orbital.currentField).toBe(drawn);
        expect(screen.getByText(/ΔE = −3F = −0\.0060 Ha/)).toBeInTheDocument();
    });

    it('still redraws when the states or the enclosed fraction change', () => {
        const store = renderBasicOrbitals();
        select(field(2, 0.001));
        select(field(2, 0.002, 'both'));
        expect(store.getState().orbital.currentField?.sources.map(s => s.id)).toEqual(['stark:n2:lower', 'stark:n2:upper']);

        fireEvent.mouseDown(screen.getByRole('combobox', { name: /electron enclosed/i }));
        fireEvent.click(within(screen.getByRole('listbox')).getByText('75%'));
        expect(store.getState().orbital.currentField?.enclosedFraction).toBe(0.75);
    });
});
