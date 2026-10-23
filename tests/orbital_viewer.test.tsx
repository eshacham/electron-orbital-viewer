import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createAppStore } from '../src/store';

jest.mock('../src/workers/createShellCompositionWorker', () => ({ createShellCompositionWorker: jest.fn() }));
// The Molecules hook (Phase 6) meshes grids in its own worker; import.meta.url does not load under ts-jest (D16).
jest.mock('../src/workers/createGridMeshWorker', () => ({ createGridMeshWorker: jest.fn() }));
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
    setReferenceRing: jest.fn(),
    presentFieldMesh: jest.fn(),
    clearFieldMesh: jest.fn(),
    setMoleculeOverlay: jest.fn(),
    pointerRaycaster: jest.fn(),
    setAppearance: jest.fn(),
    attachThumbnails: jest.fn(),
    // Task 5 (preflight D1): OrbitalViewer now passes this through to the
    // (also mocked) applyCameraAngles; a fixed stand-in is enough for every
    // test here except the one below that overrides it to check the wiring.
    standardViewDirection: jest.fn(() => [0.75, 0.42, 0.5]),
    // Fix round 1: cameraMoved's dispatch now needs this (the axis the
    // settled angle is folded against); 'none' matches every existing
    // test's expectation that the standard view is the plain canonical one.
    standardViewAxis: jest.fn(() => 'none'),
    // Task 14 (ruling P9): Molecules' labels listen after each frame; and frame what a structure-only view draws (T13).
    addAfterFrameListener: jest.fn(() => () => {}),
    frameStructure: jest.fn(),
}));
// Ruling T14-M1: what the export handle hands the PNG painter is checked, not the painting (tests/export/png.test.ts).
jest.mock('../src/export/png', () => ({
    ...jest.requireActual('../src/export/png'),
    captureViewPng: jest.fn(async () => new Blob(['png'], { type: 'image/png' })),
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
import { setMode, setElement, setCharge, solveSucceeded, solveUnbound, drillToShell, drillToSubshell, goToLevel, setRelativity } from '../src/store/atomSlice';
import { createShellCompositionWorker } from '../src/workers/createShellCompositionWorker';
import { clearShellMeshCacheForTests, setCachedShellMeshes, shellMeshCacheKey } from '../src/atom/shell_mesh_cache';
import { COMPOSITE_ORBITAL_RESOLUTION } from '../src/atom/shell_composition';
import { neonProfile } from './export/fixtures';
import { framingRadiusFor } from '../src/atom/framing';
import { initVisualizer, cleanupVisualizer, setAppearance, attachShellCompositionLobes, attachThumbnails, standardViewDirection, standardViewAxis } from '../src/orbital_visualizer';
import { themeChoicePref } from '../src/design/theme_storage';
import { GLOW_SETTLE_MS, setGlowKnob } from '../src/design/glow_pref';
import { DEFAULT_DISPLAY, DEFAULT_RENDER, displayPref, renderPref, hintPref } from '../src/design/presentation';
import { metaLoaded, selectMolecule, setSurface } from '../src/store/moleculeSlice';
import { captureViewPng } from '../src/export/png';
import { TOKENS } from '../src/design/tokens';
import { overlayInk } from '../src/design/science';
import type { ViewerExportHandle } from '../src/export/handle';
import { waterMeta } from './molecules/fixtures';
import type { VisualizerContext } from '../src/orbital_visualizer';
import { fieldRequestFor } from '../src/combinations';
import { basicOrbitalParams } from '../src/orbital_presets';
import { updateFieldInScene, cancelPendingRender, clearScene, frameOrbital, updateAtomViewInScene, setReferenceRing, getScaleBar, clearFieldMesh, handleResize } from '../src/orbital_visualizer';
import { applyCameraAngles, cameraAnglesOf, standardCameraAngles } from '../src/camera_angles';
import { encodeStateOf, registerBuiltInUrlKeys, resetUrlKeysForTests } from '../src/url_state';

const request = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }, 0.9)!;

// The viewer logs its own lifecycle (initialising, cleaning up) as a
// debugging aid; muted here so the run stays readable. Warnings and errors
// still print.
beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { (console.log as jest.Mock).mockRestore(); });
// Task 14's appearance test changes the theme and render prefs and resets
// them only on its last line; a failure there would leak into every test
// after it, so they are reset after each test here.
afterEach(() => {
    act(() => {
        themeChoicePref.set('system');
        renderPref.set(DEFAULT_RENDER);
    });
    window.localStorage.clear();
});

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

    // D6: Molecules mode draws outside the orbital slice, so "nothing asked
    // for" is its normal state -- clearScene there would kill its MO worker.
    it('leaves the scene to the molecule hook in Molecules mode', () => {
        const store = renderViewer();
        act(() => { store.dispatch(startFieldCalculation(request)); });
        act(() => { store.dispatch(setMode('molecule')); });
        expect(clearScene).not.toHaveBeenCalled();
        // No molecule chosen yet: the hook itself takes the old picture down.
        expect(clearFieldMesh).toHaveBeenCalled();
        expect(updateFieldInScene).toHaveBeenCalledTimes(1);
    });

    it('does nothing of the kind while something is requested', () => {
        const store = renderViewer();
        act(() => { store.dispatch(startFieldCalculation(request)); });
        act(() => { store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9))); });
        expect(clearScene).not.toHaveBeenCalled();
        expect(cancelPendingRender).not.toHaveBeenCalled();
    });
});

// Review finding: picking an element dispatches resetView, and a link's
// restoreCamera can land in the same React commit (no URL decoder
// dispatches resetView itself). Effects run in declaration order, so
// whichever of frameOrbital/applyCameraAngles is wired to run second is the
// one that wins the screen -- this pins that the restore wins, not the reset.
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

// Task 16d item 2: Molecules frames about the molecule's own centre; Reset View re-frames about the same point.
describe('OrbitalViewer: Reset View keeps the centre the view was framed about', () => {
    it('hands frameOrbital the framed centre (none outside Molecules)', () => {
        const base = (initVisualizer as jest.Mock).getMockImplementation()!();
        (initVisualizer as jest.Mock).mockReturnValueOnce({ ...base, framedCentre: [3.5, 0, 1.5] });
        const store = renderViewer();
        act(() => { store.dispatch(resetView()); });
        expect(frameOrbital).toHaveBeenLastCalledWith(expect.anything(), 5, true, [3.5, 0, 1.5]);
    });
    it('passes no centre when the view was framed about the origin', () => {
        const store = renderViewer();
        act(() => { store.dispatch(resetView()); });
        expect(frameOrbital).toHaveBeenLastCalledWith(expect.anything(), 5, true, undefined);
    });
});

// Preflight D1: a share link with a cut but no saved angle (url_state.ts's
// decodeViewKeys always dispatches restoreCamera, null when there is no cam
// key) must still open facing the cut face, not the plain canonical angle --
// so the context's own standard direction, not a fixed default, is what
// reaches applyCameraAngles.
describe('OrbitalViewer: a restored link with no saved angle still faces an active cut (preflight D1)', () => {
    it('passes the context\'s own standard direction through to applyCameraAngles', () => {
        const store = renderViewer();
        (standardViewDirection as jest.Mock).mockReturnValue([0.1, 0.2, 0.3]);

        act(() => { store.dispatch(restoreCamera(null)); });

        expect(standardViewDirection).toHaveBeenCalledWith(expect.objectContaining({ camera: expect.anything() }));
        expect(applyCameraAngles).toHaveBeenCalledWith(expect.anything(), expect.anything(), null, [0.1, 0.2, 0.3]);
    });

    it('a saved angle still wins outright -- the standard direction is only the null-angle fallback', () => {
        const store = renderViewer();
        (standardViewDirection as jest.Mock).mockReturnValue([0.1, 0.2, 0.3]);

        act(() => { store.dispatch(restoreCamera({ azimuth: 12, elevation: 8 })); });

        expect(applyCameraAngles).toHaveBeenCalledWith(
            expect.anything(), expect.anything(), { azimuth: 12, elevation: 8 }, [0.1, 0.2, 0.3]
        );
    });
});

// Task 5 (ruling P17): the hint's "drag to rotate" dismissal must fire from
// an actual pointer drag, never from the app's own camera placement -- a
// live check caught exactly this: P17's fix makes the standard view
// non-canonical whenever a cut is active, so a naive "cameraAngles changed"
// watch (tried first, in App.tsx) dismissed the hint on first paint of every
// cut-away Atoms scene, before the viewer had touched anything. OrbitControls
// only fires 'start' from a real pointer-down-then-move, never from
// frameOrbital/applyCameraAngles setting the camera directly, so that event
// is what this listens for instead.
describe('OrbitalViewer: a real drag dismisses the first-view hint (Task 5, ruling P17)', () => {
    it('dismisses on the controls\' own "start" event', () => {
        const store = createAppStore();
        act(() => { store.dispatch(setMode('hydrogenic')); });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);

        const results = (initVisualizer as jest.Mock).mock.results;
        const context = results[results.length - 1].value;
        const startCalls = (context.controls.addEventListener as jest.Mock).mock.calls;
        const onStart = startCalls.find(([event]: [string, unknown]) => event === 'start')[1];

        expect(hintPref.get().rotateDismissed).toBe(false);
        act(() => { onStart(); });
        expect(hintPref.get().rotateDismissed).toBe(true);
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

// Review (fix round 1, finding 1): the settle above reports whatever the
// camera is actually at, including the app's own placement at the active
// cut's standard view (ruling P17) -- not a drag. Before the fix, only the
// plain canonical angle folded back to null, so an untouched cut-active load
// wrote a real, non-canonical cameraAngles and therefore cam= into the share
// link. "As close as the existing harness allows" to a true end-to-end
// check: the real OrbitalViewer, its real 'change'/debounce wiring and the
// real encodeStateOf/cameraMoved, with only the context/controls (already
// mocked throughout this file) standing in for three.js and OrbitControls.
describe('OrbitalViewer: an untouched cut-active load writes no cam= (fix round 1, review finding 1)', () => {
    beforeEach(() => { registerBuiltInUrlKeys(); });
    afterEach(() => {
        resetUrlKeysForTests();
        (standardViewAxis as jest.Mock).mockReturnValue('none');
        (cameraAnglesOf as jest.Mock).mockReturnValue({ azimuth: 40, elevation: 20 });
    });

    /** Mounts, drives the real 'change'->debounce path once, and returns the store. */
    function settleOnce(axis: 'none' | 'x' | 'y' | 'z', angles: { azimuth: number; elevation: number }) {
        const store = createAppStore();
        act(() => { store.dispatch(setMode('atom')); });
        (standardViewAxis as jest.Mock).mockReturnValue(axis);
        (cameraAnglesOf as jest.Mock).mockReturnValue(angles);

        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        const context = (initVisualizer as jest.Mock).mock.results.at(-1)!.value as VisualizerContext;
        const onChange = (context.controls.addEventListener as jest.Mock).mock.calls
            .find(([type]) => type === 'change')![1] as () => void;

        act(() => { onChange(); jest.advanceTimersByTime(301); });
        return store;
    }

    it('leaves cameraAngles null, and the share link carries no cam=, when the settle lands on the active cut\'s own standard angle', () => {
        jest.useFakeTimers();
        try {
            const store = settleOnce('x', standardCameraAngles('x'));
            expect(store.getState().orbital.cameraAngles).toBeNull();
            expect(encodeStateOf(store.getState())).not.toMatch(/[&?]cam=/);
        } finally {
            jest.useRealTimers();
        }
    });

    it('still records, and still shares, a real drag away from the standard view', () => {
        jest.useFakeTimers();
        try {
            const store = settleOnce('x', { azimuth: 5, elevation: 5 });
            expect(store.getState().orbital.cameraAngles).toEqual({ azimuth: 5, elevation: 5 });
            expect(encodeStateOf(store.getState())).toMatch(/[&?]cam=5,5(&|$)/);
        } finally {
            jest.useRealTimers();
        }
    });
});

/** Ne⁺ as the worker would serialise it: its own species key, and the neutral's radii for the ring. */
function neonIonProfile() {
    return { ...neonProfile(), speciesKey: '10+1', displayRadius: 1.6, reference: { displayRadius: 2, contourRadius: 2.1, framingRadius: 1.7 } };
}

// Phase 3 Task 12: an ion's whole-atom view carries the neutral atom's edge
// as a dashed ring, and the camera is framed to keep that edge on screen.
describe('OrbitalViewer: ions', () => {
    beforeEach(() => { clearShellMeshCacheForTests(); jest.clearAllMocks(); });

    const ionStore = () => {
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(setCharge(1));
            store.dispatch(solveSucceeded(neonIonProfile()));
        });
        return store;
    };

    it('rings the neutral atom\'s drawn radius at the whole-atom level, and frames on it', () => {
        const store = ionStore();
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        // Floored at the neutral's own framing radius (1.7), not its drawn
        // radius (2): the camera stays where the neutral atom's view put it.
        expect(updateAtomViewInScene).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ contourRadius: 1.6, framingFloor: 1.7 }), expect.anything());
        expect(setReferenceRing).toHaveBeenLastCalledWith(expect.anything(), 2);

        (createShellCompositionWorker as jest.Mock).mockReturnValue(fakeCompositionWorker());
        act(() => { store.dispatch(drillToShell(2)); });
        expect(setReferenceRing).toHaveBeenLastCalledWith(expect.anything(), null);
    });

    it('draws no ring for a neutral atom, which is its own reference', () => {
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(solveSucceeded(neonProfile()));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        expect((updateAtomViewInScene as jest.Mock).mock.calls.at(-1)![1].framingFloor).toBeUndefined();
        expect(setReferenceRing).toHaveBeenCalled();
        expect((setReferenceRing as jest.Mock).mock.calls.every(([, radius]) => radius === null)).toBe(true);
    });

    it('takes the ring down on a switch to Basic Orbitals, and on picking another element', () => {
        const store = ionStore();
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        expect(setReferenceRing).toHaveBeenLastCalledWith(expect.anything(), 2);
        act(() => { store.dispatch(setMode('hydrogenic')); });
        expect(setReferenceRing).toHaveBeenLastCalledWith(expect.anything(), null);

        act(() => { store.dispatch(setMode('atom')); });
        expect(setReferenceRing).toHaveBeenLastCalledWith(expect.anything(), 2);
        act(() => { store.dispatch(setElement(11)); });
        expect(setReferenceRing).toHaveBeenLastCalledWith(expect.anything(), null);
    });

    // Na and Na⁺ share a Z but not a grid: the in-place reshaping fade
    // would morph one curve into another sampled somewhere else.
    it('does not fade between a neutral atom and its ion', () => {
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(solveSucceeded(neonProfile()));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        act(() => {
            store.dispatch(setCharge(1));
            store.dispatch(solveSucceeded(neonIonProfile()));
        });
        expect(updateAtomViewInScene).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ contourRadius: 1.6 }), { animate: false });
    });

    it('builds an ion\'s shell lobes for the ion, not from the neutral atom\'s cached ones', () => {
        setCachedShellMeshes(shellMeshCacheKey(10, 2, COMPOSITE_ORBITAL_RESOLUTION, 0.9, null), []);
        const worker = fakeCompositionWorker();
        (createShellCompositionWorker as jest.Mock).mockReturnValue(worker);
        const store = ionStore();
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        act(() => { store.dispatch(drillToShell(2)); });
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        expect(attachShellCompositionLobes).not.toHaveBeenCalled();
    });

    // Fix round 1, M1: a scale bar over an empty canvas measures nothing.
    it('hides the scale bar while an anion is unbound, and brings it back with a picture', () => {
        (getScaleBar as jest.Mock).mockReturnValue({ lengthBohr: 2, pixels: 100 });
        try {
            const store = createAppStore();
            act(() => {
                store.dispatch(setElement(17));
                store.dispatch(solveSucceeded({ ...neonProfile(), Z: 17 }));
            });
            const { container } = render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
            expect(container.querySelector('.scale-readout')).not.toBeNull();
            act(() => { store.dispatch(solveUnbound('LDA does not bind this anion: its 3p electron is not bound.')); });
            expect(container.querySelector('.scale-readout')).toBeNull();
            act(() => { store.dispatch(setElement(17)); store.dispatch(solveSucceeded({ ...neonProfile(), Z: 17 })); });
            expect(container.querySelector('.scale-readout')).not.toBeNull();
        } finally {
            (getScaleBar as jest.Mock).mockReturnValue(null);
        }
    });

    // Spec §3.5: not even the previous species' picture stays up.
    it('empties the view for an anion LDA does not bind', () => {
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(solveSucceeded(neonProfile()));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        expect(clearScene).not.toHaveBeenCalled();
        act(() => { store.dispatch(solveUnbound('LDA does not bind this anion: its 2p electron is not bound.')); });
        expect(clearScene).toHaveBeenCalledTimes(1);
    });
});

// Fix round 1, I1: the lobes are a function of the mode too (ruling C2).
describe('OrbitalViewer: shell lobes and the relativistic mode', () => {
    beforeEach(() => { clearShellMeshCacheForTests(); });

    function shellOf(profile: ReturnType<typeof neonProfile>, relativity: 'off' | 'scalar' | 'spinOrbit') {
        const worker = fakeCompositionWorker();
        (createShellCompositionWorker as jest.Mock).mockReturnValue(worker);
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(setRelativity(relativity));
            store.dispatch(solveSucceeded(profile));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        act(() => { store.dispatch(drillToShell(2)); });
        return { store, worker };
    }

    it('builds a scalar profile\'s lobes rather than serving the off ones of the same species', () => {
        setCachedShellMeshes(shellMeshCacheKey(10, 2, COMPOSITE_ORBITAL_RESOLUTION, 0.9, null), []);
        const { worker } = shellOf({ ...neonProfile(), relativity: 'scalar' }, 'scalar');
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        expect(attachShellCompositionLobes).not.toHaveBeenCalled();
        act(() => { worker.onmessage!({ data: { type: 'success', meshes: [], requestId: 1 } }); });
        expect(shellMeshCacheKey(10, 2, COMPOSITE_ORBITAL_RESOLUTION, 0.9, null, 'scalar')).not.toBe(shellMeshCacheKey(10, 2, COMPOSITE_ORBITAL_RESOLUTION, 0.9, null));
    });

    // Each j-level's lobes are drawn with its own R(r), never its partner's.
    it('samples each j-level with its own radial function, and isolates by j', () => {
        const base = neonProfile();
        const p = base.subshells.find(s => s.l === 1)!;
        const pHalf = { ...p, j: 0.5, R: new Float64Array(base.size).fill(1) };
        const pThreeHalves = { ...p, j: 1.5, R: new Float64Array(base.size).fill(2) };
        const profile = {
            ...base, relativity: 'spinOrbit' as const,
            subshells: [...base.subshells.filter(s => s.l === 0).map(s => ({ ...s, j: 0.5 })), pHalf, pThreeHalves],
        };
        const { store, worker } = shellOf(profile, 'spinOrbit');
        type Posted = { orbitals: Array<{ l: number; radialSamples: { R: Float64Array } }> };
        const pOrbitals = (worker.postMessage.mock.calls[0][0] as Posted).orbitals.filter(o => o.l === 1);
        expect(pOrbitals.map(o => o.radialSamples.R[0])).toEqual([1, 1, 1, 2, 2, 2]);

        const isolated = fakeCompositionWorker();
        (createShellCompositionWorker as jest.Mock).mockReturnValue(isolated);
        act(() => { store.dispatch(drillToSubshell(2, 1, 1.5)); });
        const posted = (isolated.postMessage.mock.calls[0][0] as Posted).orbitals;
        expect(posted.map(o => o.radialSamples.R[0])).toEqual([2, 2, 2]);
    });
});


// Ruling C14: switching relativity must not re-zoom the camera onto the
// contracted atom -- that would hide the very contraction the switch is
// there to show. A relativistic picture is framed on at least where its own
// non-relativistic solve was framed, so off -> scalar -> spin–orbit leaves
// the camera (and the scale bar) where it was.
describe('OrbitalViewer: framing across a relativity switch', () => {
    beforeEach(() => { clearShellMeshCacheForTests(); jest.clearAllMocks(); });

    /** A relativistic neon whose non-relativistic comparison was framed at 2.4 a₀, with an n = 2 contour of 2.2. */
    function contracted(relativity: 'scalar' | 'spinOrbit') {
        const base = neonProfile();
        return {
            ...base, relativity,
            nonRelativistic: {
                framingRadius: 2.4,
                shells: base.shells.map(s => ({ n: s.n, contourRadius: s.n === 2 ? 2.2 : s.contourRadius, curve: s.curve })),
                subshells: [],
            },
        };
    }

    it('frames a relativistic whole atom on its non-relativistic framing at least', () => {
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(setRelativity('scalar'));
            store.dispatch(solveSucceeded(contracted('scalar')));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        expect(updateAtomViewInScene).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ framingFloor: 2.4 }), expect.anything());
    });

    // The ring's floor is the neutral in the ion's own mode (1.7 here); the
    // comparison's is the larger of the ion's own off framing and the off
    // neutral's (2.4, as the worker builds it -- fix round 1, I1). The
    // viewer takes the larger of the two.
    it('takes the larger of an ion\'s two floors', () => {
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(setCharge(1));
            store.dispatch(setRelativity('scalar'));
            store.dispatch(solveSucceeded({ ...contracted('scalar'), speciesKey: '10+1', reference: { displayRadius: 2, contourRadius: 2.1, framingRadius: 1.7 } }));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        expect(updateAtomViewInScene).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ framingFloor: 2.4 }), expect.anything());
    });

    // Fix round 1, I1, with gold's own numbers: Au⁺ off is framed on the off
    // neutral (3.354 a₀); scalar draws a smaller ion, rings the scalar
    // neutral (2.886) and floors on the comparison, which carries the off
    // neutral's 3.354. Both views end up framed on the same radius.
    it('frames an Au⁺-like cation identically off and scalar', () => {
        const framedOn = () => {
            const [, params] = (updateAtomViewInScene as jest.Mock).mock.calls.at(-1)!;
            return Math.max(framingRadiusFor(params.contourRadius, params.outermostFeatureR), params.framingFloor ?? 0);
        };
        const base = { ...neonProfile(), Z: 79, speciesKey: '79+1', charge: 1 };
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(79));
            store.dispatch(setCharge(1));
            store.dispatch(setRelativity('off'));
            store.dispatch(solveSucceeded({ ...base, displayRadius: 3.1, reference: { displayRadius: 3.6, contourRadius: 4, framingRadius: 3.354 } }));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        const off = framedOn();
        act(() => {
            store.dispatch(setRelativity('scalar'));
            store.dispatch(solveSucceeded({
                ...base, displayRadius: 2.7, relativity: 'scalar',
                reference: { displayRadius: 3.1, contourRadius: 3.5, framingRadius: 2.886 },
                nonRelativistic: { framingRadius: 3.354, displayRadius: 3.354, shells: [], subshells: [] },
            }));
        });
        expect(framedOn()).toBe(off);
        expect(off).toBe(3.354);
    });

    // setRelativity keeps an open shell (off <-> scalar), so the shell view
    // holds the same way: on the non-relativistic shell's contour.
    it('frames an open shell on its non-relativistic contour at least', () => {
        (createShellCompositionWorker as jest.Mock).mockReturnValue(fakeCompositionWorker());
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(setRelativity('scalar'));
            store.dispatch(solveSucceeded(contracted('scalar')));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        act(() => { store.dispatch(drillToShell(2)); });
        expect(updateAtomViewInScene).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ contourRadius: 2, framingFloor: 2.2 }), expect.anything());
    });

    it('sets no floor on a non-relativistic shell view', () => {
        (createShellCompositionWorker as jest.Mock).mockReturnValue(fakeCompositionWorker());
        const store = createAppStore();
        act(() => {
            store.dispatch(setElement(10));
            store.dispatch(solveSucceeded(neonProfile()));
        });
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        act(() => { store.dispatch(drillToShell(2)); });
        expect((updateAtomViewInScene as jest.Mock).mock.calls.at(-1)![1].framingFloor).toBeUndefined();
    });
});

// Spec §7, §8.5: the viewport is a grid cell now, resized by the layout without a window resize.
describe('OrbitalViewer: the grid cell', () => {
    it('resizes the renderer when its grid cell changes size without a window resize', () => {
        const callbacks: Array<() => void> = [];
        const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
            constructor(callback: () => void) { callbacks.push(callback); }
            observe() {}
            disconnect() {}
        };
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(700);
        const height = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
        try {
            renderViewer();
            act(() => callbacks.forEach(callback => callback()));
            expect(handleResize).toHaveBeenCalledWith(expect.anything(), 700, 500);
        } finally {
            width.mockRestore();
            height.mockRestore();
            (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
        }
    });

    // Task 20c, bug 1: mid desktop -> phone swap the cell is 0 px wide; sizing the renderer to it misframed the camera.
    it('does not resize the renderer to a cell the layout has collapsed to 0 px on a window resize', () => {
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0);
        const height = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(764);
        try {
            renderViewer();
            act(() => { window.dispatchEvent(new Event('resize')); });
            expect(handleResize).not.toHaveBeenCalled();
            width.mockReturnValue(390);
            height.mockReturnValue(844);
            act(() => { window.dispatchEvent(new Event('resize')); });
            expect(handleResize).toHaveBeenCalledWith(expect.anything(), 390, 844);
        } finally {
            width.mockRestore();
            height.mockRestore();
        }
    });
});

// Spec §3.2, §6.6: a theme or finish change restyles the scene; the renderer is never rebuilt.
describe('OrbitalViewer: appearance', () => {
    // Ruling R22a: the finish (was the scheme) is the preference changed here -- there is no scheme.
    it('restyles in place on a theme or finish change -- one renderer for the session (spec §3.2)', () => {
        renderViewer();
        act(() => { themeChoicePref.set('light'); });
        act(() => { renderPref.set({ finish: 'solid' }); });
        expect(initVisualizer).not.toHaveBeenCalled();
        expect(cleanupVisualizer).not.toHaveBeenCalled();
        expect(setAppearance).toHaveBeenLastCalledWith(expect.anything(),
            expect.objectContaining({ theme: 'light', finish: 'solid' }));
        window.localStorage.clear();
    });

    // Ruling R22a (owner): a returning user's eov.render still names Classic; it keeps their
    // finish, and the renderer is told no scheme at all -- it draws the phase colours.
    it('reads an old stored Classic choice as its finish alone', () => {
        window.localStorage.setItem('eov.render', '{"finish":"solid","scheme":"classic"}');
        jest.clearAllMocks();
        render(<Provider store={createAppStore()}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        const appearance = (setAppearance as jest.Mock).mock.calls.at(-1)![1];
        expect(appearance).toMatchObject({ finish: 'solid' });
        expect(Object.keys(appearance).sort()).toEqual(['finish', 'lowPower', 'showAxes', 'theme']);
        window.localStorage.clear();
    });
});

// Task 16b ("Advanced appearance"): the viewer's own Glow values reach the main view at once -- an appearance
// with only `glow` changed -- and the thumbnails' appearance only once the sliders rest, as the strip's key does.
describe('OrbitalViewer: the viewer\'s own Glow values (Task 16b)', () => {
    it('hands them to the renderer live, and to the thumbnail host once they have settled', async () => {
        act(() => { themeChoicePref.set('dark'); });
        jest.clearAllMocks();
        render(<Provider store={createAppStore()}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        const host = (attachThumbnails as jest.Mock).mock.calls.at(-1)![2] as { appearance(): { glow?: unknown } };
        expect((setAppearance as jest.Mock).mock.calls.at(-1)![1]).not.toHaveProperty('glow');
        act(() => { setGlowKnob('dark', 'rimStrength', 1.1); });
        act(() => { setGlowKnob('dark', 'rimStrength', 1.2); });
        expect(setAppearance).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ theme: 'dark', glow: { rimStrength: 1.2 } }));
        expect(host.appearance().glow).toBeUndefined();
        await act(async () => { await new Promise(resolve => setTimeout(resolve, GLOW_SETTLE_MS + 50)); });
        expect(host.appearance().glow).toEqual({ rimStrength: 1.2 });
        // The other theme's values are its own: Light Clean has none.
        act(() => { themeChoicePref.set('light'); });
        expect((setAppearance as jest.Mock).mock.calls.at(-1)![1]).not.toHaveProperty('glow');
        expect(host.appearance().glow).toBeUndefined();
    });
});

// Spec §12: thumbnails borrow the one renderer; there is never a second WebGL context.
describe('OrbitalViewer: thumbnails', () => {
    it('lends the one renderer to the thumbnail service once, on mount (spec §12)', () => {
        // Ruling DC10: earlier describes render without clearing, so the counts start clean here.
        jest.clearAllMocks();
        const store = createAppStore();
        render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} /></Provider>);
        expect(initVisualizer).toHaveBeenCalledTimes(1);
        expect(attachThumbnails).toHaveBeenCalledTimes(1);
    });
});

// Task 14 fix round 1 (review M5, ruling T14-M1): the labels overlay is Molecules' only, beside the canvas
// host inside the viewport cell, and the PNG export is handed what it shows.
describe('OrbitalViewer: Molecules\' bond labels', () => {
    function renderWithLabels(labels: boolean) {
        const store = createAppStore();
        act(() => { displayPref.set({ ...DEFAULT_DISPLAY, moleculeLabels: labels }); });
        // The molecule hook's picking listens on the canvas: this context carries one.
        const base = (initVisualizer as jest.Mock).getMockImplementation()!();
        (initVisualizer as jest.Mock).mockReturnValueOnce({ ...base, renderer: { domElement: document.createElement('canvas') } });
        const handle: React.MutableRefObject<ViewerExportHandle | null> = { current: null };
        const { container } = render(<Provider store={store}><OrbitalViewer enclosedFraction={0.9} exportHandleRef={handle} /></Provider>);
        const water = () => act(() => {
            store.dispatch(setMode('molecule'));
            // No surface: nothing to fetch or mesh here -- the structure alone.
            store.dispatch(setSurface({ kind: 'none' }));
            store.dispatch(selectMolecule({ id: 'h2o' }));
            store.dispatch(metaLoaded({ id: 'h2o', meta: waterMeta() }));
        });
        return { store, container, handle, water };
    }
    afterEach(() => { act(() => { displayPref.set(DEFAULT_DISPLAY); }); });

    it('mounts the overlay beside the canvas host in Molecules mode only', () => {
        const { store, container, water } = renderWithLabels(true);
        expect(container.querySelector('.model-labels')).toBeNull();
        water();
        const overlay = container.querySelector('.model-labels');
        expect(overlay).not.toBeNull();
        expect(overlay!.previousElementSibling?.id).toBe('orbital-canvas-host');
        act(() => { store.dispatch(setMode('atom')); });
        expect(container.querySelector('.model-labels')).toBeNull();
    });

    it('hands the PNG export the labels shown, with the theme\'s arc colour -- and none when they are off', async () => {
        const on = renderWithLabels(true);
        on.water();
        await act(async () => { await on.handle.current!.capturePng({ caption: [], phaseLegend: false }); });
        const overlays = (captureViewPng as jest.Mock).mock.calls.at(-1)![2];
        expect(overlays.modelLabels).toEqual({ pills: [], arcs: [], arcColour: TOKENS.dark['selected-edge'] });
        // PNG plain asks for no overlays at all, so no labels either.
        await act(async () => { await on.handle.current!.capturePng(null); });
        expect((captureViewPng as jest.Mock).mock.calls.at(-1)![2]).toBeNull();
    });

    // Task 16d item 1: the scale bar is painted in the theme's ink, so a Light Clean PNG shows it.
    it('hands the export the theme\'s ink for the marks painted on the bare canvas', async () => {
        const on = renderWithLabels(true);
        on.water();
        act(() => { themeChoicePref.set('dark'); });
        await act(async () => { await on.handle.current!.capturePng({ caption: [], phaseLegend: false }); });
        expect((captureViewPng as jest.Mock).mock.calls.at(-1)![2].ink).toBe(overlayInk('dark'));
        act(() => { themeChoicePref.set('light'); });
        await act(async () => { await on.handle.current!.capturePng({ caption: [], phaseLegend: false }); });
        expect((captureViewPng as jest.Mock).mock.calls.at(-1)![2].ink).toBe(overlayInk('light'));
        expect(overlayInk('light')).not.toBe(overlayInk('dark'));
    });

    it('hands the export no labels while the switch is off', async () => {
        const off = renderWithLabels(false);
        off.water();
        await act(async () => { await off.handle.current!.capturePng({ caption: [], phaseLegend: false }); });
        expect((captureViewPng as jest.Mock).mock.calls.at(-1)![2].modelLabels).toBeNull();
    });
});
