import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../src/store';

jest.mock('../src/workers/createShellCompositionWorker', () => ({ createShellCompositionWorker: jest.fn() }));
jest.mock('../src/orbital_visualizer', () => ({
    initVisualizer: jest.fn(() => ({
        requestCounter: 0,
        controls: { addEventListener: jest.fn(), removeEventListener: jest.fn(), update: jest.fn(), target: {} },
        // A truthy framedRMax and a camera stand-in: enough for the reset and
        // restore-camera effects (below) to actually run their mocked calls.
        framedRMax: 5,
        camera: {},
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
// Only applyCameraAngles is mocked (as a spy to record call order); the rest
// of the module -- isCanonicalAngles etc., which orbitalSlice's own reducers
// use for real -- stays the genuine implementation.
jest.mock('../src/camera_angles', () => ({
    ...jest.requireActual('../src/camera_angles'),
    applyCameraAngles: jest.fn(),
    // The mocked context's camera is a bare stand-in, so the angle it
    // reports is fixed here.
    cameraAnglesOf: jest.fn(() => ({ azimuth: 40, elevation: 20 })),
}));

import OrbitalViewer from '../src/components/OrbitalViewer';
import {
    startFieldCalculation, startOrbitalCalculation, clearPicture, resetView, restoreCamera,
} from '../src/store/orbitalSlice';
import { setMode, setElement, solveSucceeded, drillToShell, goToLevel } from '../src/store/atomSlice';
import { createShellCompositionWorker } from '../src/workers/createShellCompositionWorker';
import { clearShellMeshCacheForTests } from '../src/atom/shell_mesh_cache';
import { neonProfile } from './export/fixtures';
import { initVisualizer, attachShellCompositionLobes } from '../src/orbital_visualizer';
import type { VisualizerContext } from '../src/orbital_visualizer';
import { fieldRequestFor } from '../src/combinations';
import { basicOrbitalParams } from '../src/orbital_presets';
import { updateFieldInScene, cancelPendingRender, clearScene, frameOrbital } from '../src/orbital_visualizer';
import { applyCameraAngles, cameraAnglesOf } from '../src/camera_angles';

const request = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }, 0.9)!;

// The viewer logs its own lifecycle (initialising, cleaning up) as a
// debugging aid; muted here so the run stays readable. Warnings and errors
// still print.
beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { (console.log as jest.Mock).mockRestore(); });

function renderViewer() {
    const store = createAppStore();
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

// Review finding: Task 5's URL decoder batches resetView with
// restoreCamera(angles) into one store commit (the same way picking an
// element batches setElement with resetView today). Effects run in
// declaration order, so whichever of frameOrbital/applyCameraAngles is
// wired to run second is the one that wins the screen -- this pins that the
// restore wins, not the reset.
describe('OrbitalViewer: reset and restore in the same commit', () => {
    it('applies the restored camera angle after the reset effect runs, not before', () => {
        const store = renderViewer();
        const order: string[] = [];
        (frameOrbital as jest.Mock).mockImplementation(() => { order.push('frameOrbital'); });
        (applyCameraAngles as jest.Mock).mockImplementation(() => { order.push('applyCameraAngles'); });

        act(() => {
            store.dispatch(resetView());
            store.dispatch(restoreCamera({ azimuth: 70, elevation: -15 }));
        });

        expect(order).toEqual(['frameOrbital', 'applyCameraAngles']);
    });
});

/** Stands in for the composition worker: records what was posted, replies when told to. */
function fakeCompositionWorker() {
    return {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null as ((e: { data: unknown }) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
    };
}

/** Neon solved and opened at its n = 2 shell, so the viewer builds that shell's lobes. */
function renderNeonShell() {
    clearShellMeshCacheForTests();
    const worker = fakeCompositionWorker();
    (createShellCompositionWorker as jest.Mock).mockReturnValue(worker);
    const store = createAppStore();
    act(() => {
        store.dispatch(setElement(10));
        store.dispatch(solveSucceeded(neonProfile()));
    });
    const view = render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
    act(() => { store.dispatch(drillToShell(2)); });
    return { store, worker, view };
}

// Final review I2: the lobes arrive after the shell view, with no orbital
// request in flight, so the viewer reports the build for export to wait on.
describe('OrbitalViewer: the shell-lobe build in the store', () => {
    it('is busy from the moment the build is posted until the lobes land', () => {
        const { store, worker } = renderNeonShell();
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        expect(store.getState().orbital.compositionBusy).toBe(true);
        act(() => { worker.onmessage!({ data: { type: 'success', meshes: [], requestId: 1 } }); });
        expect(attachShellCompositionLobes).toHaveBeenCalledTimes(1);
        expect(store.getState().orbital).toMatchObject({ compositionBusy: false, compositionFailed: false });
    });

    it('shows a failed build as the app\'s error and records it, without the console', () => {
        const { store, worker } = renderNeonShell();
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            act(() => { worker.onmessage!({ data: { type: 'error', message: 'out of memory', requestId: 1 } }); });
            expect(consoleError).not.toHaveBeenCalled();
        } finally {
            consoleError.mockRestore();
        }
        expect(store.getState().orbital).toMatchObject({ compositionBusy: false, compositionFailed: true });
        expect(store.getState().orbital.error).toMatch(/out of memory/);
    });

    it('treats a worker that dies outright as a failure too', () => {
        const { store, worker } = renderNeonShell();
        act(() => { worker.onerror!(new Event('error')); });
        expect(store.getState().orbital.compositionFailed).toBe(true);
        expect(store.getState().orbital.error).toBeTruthy();
    });

    it('is no longer busy once the build is abandoned: another level, or the viewer gone', () => {
        const { store, worker, view } = renderNeonShell();
        act(() => { store.dispatch(goToLevel('atom')); });
        expect(worker.terminate).toHaveBeenCalled();
        expect(store.getState().orbital.compositionBusy).toBe(false);

        act(() => { store.dispatch(drillToShell(2)); });
        expect(store.getState().orbital.compositionBusy).toBe(true);
        view.unmount();
        expect(store.getState().orbital.compositionBusy).toBe(false);
    });
});

// Final review M9: the visualizer reports a running level transition; the
// viewer passes it to the store, and drops it when it goes away.
describe('OrbitalViewer: level transitions in the store', () => {
    it('records a transition the visualizer reports, and clears it on unmount', () => {
        const store = createAppStore();
        const view = render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        const context = (initVisualizer as jest.Mock).mock.results.at(-1)!.value as VisualizerContext;
        act(() => { context.onTransitionChange!(true); });
        expect(store.getState().orbital.levelTransition).toBe(true);
        view.unmount();
        expect(store.getState().orbital.levelTransition).toBe(false);
    });
});

// Task 2's deferred minor (final review T2): OrbitalControls fires 'change'
// on every damped frame while the camera eases to a stop; the store must
// hear the direction once, after it has settled, not once per frame.
describe('OrbitalViewer: reporting the camera', () => {
    it('reports the direction once, 300 ms after the last change', () => {
        jest.useFakeTimers();
        try {
            const store = createAppStore();
            render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
            const context = (initVisualizer as jest.Mock).mock.results.at(-1)!.value as VisualizerContext;
            const listeners = (context.controls.addEventListener as jest.Mock).mock.calls
                .filter(([type]) => type === 'change')
                .map(([, listener]) => listener as () => void);
            const change = () => listeners.forEach(listener => listener());
            (cameraAnglesOf as jest.Mock).mockClear();

            // A drag, then damping: a change every frame for a while.
            for (let frame = 0; frame < 20; frame++) {
                act(() => { change(); jest.advanceTimersByTime(16); });
            }
            act(() => { change(); });
            expect(cameraAnglesOf).not.toHaveBeenCalled();
            expect(store.getState().orbital.cameraAngles).toBeNull();

            act(() => { jest.advanceTimersByTime(299); });
            expect(cameraAnglesOf).not.toHaveBeenCalled();
            act(() => { jest.advanceTimersByTime(1); });
            expect(cameraAnglesOf).toHaveBeenCalledTimes(1);
            expect(store.getState().orbital.cameraAngles).toEqual({ azimuth: 40, elevation: 20 });

            act(() => { jest.advanceTimersByTime(1000); });
            expect(cameraAnglesOf).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });
});
