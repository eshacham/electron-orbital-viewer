import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('../src/workers/createShellCompositionWorker', () => ({ createShellCompositionWorker: jest.fn() }));
jest.mock('../src/orbital_visualizer', () => ({
    initVisualizer: jest.fn(() => ({
        requestCounter: 0,
        controls: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
    })),
    cleanupVisualizer: jest.fn(),
    updateOrbitalInScene: jest.fn(() => new Promise(() => {})),
    updateFieldInScene: jest.fn(() => new Promise(() => {})),
    updateAtomViewInScene: jest.fn(),
    cancelPendingRender: jest.fn(),
    clearScene: jest.fn(),
    frameOrbital: jest.fn(),
    setSurfaceStyle: jest.fn(),
    setHoverRadius: jest.fn(),
    getScaleBar: jest.fn(() => null),
    handleResize: jest.fn(),
    setViewInsets: jest.fn(),
    clearShellCompositionLobes: jest.fn(),
    attachShellCompositionLobes: jest.fn(),
}));

import OrbitalViewer from '../src/components/OrbitalViewer';
import orbitalReducer, { startFieldCalculation, startOrbitalCalculation, clearPicture } from '../src/store/orbitalSlice';
import atomReducer, { setMode } from '../src/store/atomSlice';
import { fieldRequestFor } from '../src/combinations';
import { basicOrbitalParams } from '../src/orbital_presets';
import { updateFieldInScene, cancelPendingRender, clearScene } from '../src/orbital_visualizer';

const request = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }, 0.9)!;

function renderViewer() {
    const store = configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });
    act(() => { store.dispatch(setMode('hydrogenic')); });
    render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
    jest.clearAllMocks();
    return store;
}

// Final review: the viewer owns the worker, so it is what has to act when
// the store stops asking for a picture.
describe('OrbitalViewer with nothing requested', () => {
    it('takes the picture down when a combination is refused', () => {
        const store = renderViewer();
        act(() => { store.dispatch(startFieldCalculation(request)); });
        expect(updateFieldInScene).toHaveBeenCalledTimes(1);

        act(() => { store.dispatch(clearPicture()); });
        expect(clearScene).toHaveBeenCalledTimes(1);
        expect(updateFieldInScene).toHaveBeenCalledTimes(1);
    });

    it('stops a field worker in flight on the way to atom mode, without clearing atom mode\'s view', () => {
        const store = renderViewer();
        act(() => { store.dispatch(startFieldCalculation(request)); });

        act(() => { store.dispatch(setMode('atom')); });
        expect(cancelPendingRender).toHaveBeenCalledTimes(1);
        expect(clearScene).not.toHaveBeenCalled();
    });

    it('does nothing of the kind while something is requested', () => {
        const store = renderViewer();
        act(() => { store.dispatch(startFieldCalculation(request)); });
        act(() => { store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9))); });
        expect(clearScene).not.toHaveBeenCalled();
        expect(cancelPendingRender).not.toHaveBeenCalled();
    });
});
