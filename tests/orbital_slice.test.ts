import { createAppStore } from '../src/store';
import reducer, {
    startOrbitalCalculation, startFieldCalculation, finishOrbitalCalculation, clearPicture,
    setBasicSelection, setEnclosedFraction, setCombination, requestBasicRender, selectShownBasicOrbital,
    DEFAULT_BASIC_SELECTION, cameraMoved, restoreCamera, resetView,
    requestCut, clearPendingCut, startCompositionBuild, endCompositionBuild, failCompositionBuild, setLevelTransition,
    dismissOrbitalError,
} from '../src/store/orbitalSlice';
import { setMode } from '../src/store/atomSlice';
import { fieldRequestFor, NO_COMBINATION } from '../src/combinations';
import { basicOrbitalParams, DEFAULT_ENCLOSED_FRACTION } from '../src/orbital_presets';
import { CANONICAL_CAMERA_ANGLES } from '../src/camera_angles';

const makeStore = () => createAppStore();

const request = fieldRequestFor({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }, 0.9)!;

describe('orbitalSlice field requests', () => {
    it('starts with nothing requested', () => {
        expect(reducer(undefined, { type: '@@init' }).currentField).toBeNull();
    });

    it('holds exactly one of an orbital and a field', () => {
        let state = reducer(undefined, startOrbitalCalculation(basicOrbitalParams(3, 2, 0, 0.9)));
        state = reducer(state, startFieldCalculation(request));
        expect(state.currentField).toEqual(request);
        expect(state.currentParams).toBeNull();
        expect(state.isLoading).toBe(true);

        state = reducer(state, startOrbitalCalculation(basicOrbitalParams(2, 1, 0, 0.9)));
        expect(state.currentField).toBeNull();
        expect(state.currentParams).toMatchObject({ n: 2, l: 1 });
    });

    // Review Focus 2: a hybrid must not be drawn over atom mode.
    it('forgets the field request when atom mode is chosen', () => {
        let state = reducer(undefined, startFieldCalculation(request));
        state = reducer(state, setMode('hydrogenic'));
        expect(state.currentField).toEqual(request);
        state = reducer(state, setMode('atom'));
        expect(state.currentField).toBeNull();
        expect(state.isLoading).toBe(false);
    });

    // Final review: a selection with a problem (a field above the bound limit,
    // reachable once Phase 2 decodes URLs) must not leave the previous
    // picture standing under the new selection's title (spec §3.5).
    it('asks for nothing at all when a selection is refused', () => {
        let state = reducer(undefined, startFieldCalculation(request));
        state = reducer(state, finishOrbitalCalculation({ isoLevel: 1e-3 }));
        state = reducer(state, clearPicture());
        expect(state.currentField).toBeNull();
        expect(state.currentParams).toBeNull();
        expect(state.isLoading).toBe(false);
        expect(state.isoLevel).toBeNull();

        state = reducer(state, startOrbitalCalculation(basicOrbitalParams(3, 2, 0, 0.9)));
        state = reducer(state, clearPicture());
        expect(state.currentParams).toBeNull();
    });
});

describe('orbitalSlice: Basic Orbitals view state', () => {
    it('starts at 3d_z², the default fraction and no combination', () => {
        const { orbital } = makeStore().getState();
        expect(orbital.basicSelection).toEqual({ n: 3, l: 2, ml: 0 });
        expect(orbital.enclosedFraction).toBe(DEFAULT_ENCLOSED_FRACTION);
        expect(orbital.combination).toEqual(NO_COMBINATION);
    });

    it('merges partial selections and stores the fraction and combination', () => {
        const store = makeStore();
        store.dispatch(setBasicSelection({ n: 4 }));
        store.dispatch(setBasicSelection({ l: 3, ml: -2 }));
        store.dispatch(setEnclosedFraction(0.75));
        store.dispatch(setCombination({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }));
        const { orbital } = store.getState();
        expect(orbital.basicSelection).toEqual({ n: 4, l: 3, ml: -2 });
        expect(orbital.enclosedFraction).toBe(0.75);
        expect(orbital.combination).toEqual({ kind: 'hybrid', hybrid: 'sp3', member: 'all' });
    });

    it('asks for a Basic Orbitals render on switching to it, and on request', () => {
        const store = makeStore();
        store.dispatch(setMode('atom'));
        expect(store.getState().orbital.basicRenderNonce).toBe(0);
        store.dispatch(setMode('hydrogenic'));
        expect(store.getState().orbital.basicRenderNonce).toBe(1);
        store.dispatch(requestBasicRender());
        expect(store.getState().orbital.basicRenderNonce).toBe(2);
    });

    it('reports the orbital drawn, not an unsubmitted selection', () => {
        const store = makeStore();
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(2, 1, 1, 0.9)));
        store.dispatch(setBasicSelection({ n: 5 }));
        expect(selectShownBasicOrbital(store.getState())).toEqual({ n: 2, l: 1, ml: 1 });
    });

    it('falls back to the selection when the drawn orbital is an atom-mode one', () => {
        const store = makeStore();
        store.dispatch(startOrbitalCalculation({
            ...basicOrbitalParams(2, 1, 0, 0.9), Z: 18,
            radialSamples: { R: new Float64Array(3), rMin: 1e-3, dx: 0.1, size: 3 },
        }));
        expect(selectShownBasicOrbital(store.getState())).toEqual(DEFAULT_BASIC_SELECTION);
    });
});

describe('orbitalSlice: camera', () => {
    it('records a settled camera and forgets it at the canonical view', () => {
        const store = makeStore();
        store.dispatch(cameraMoved({ azimuth: 120, elevation: -10 }));
        expect(store.getState().orbital.cameraAngles).toEqual({ azimuth: 120, elevation: -10 });
        store.dispatch(cameraMoved(CANONICAL_CAMERA_ANGLES));
        expect(store.getState().orbital.cameraAngles).toBeNull();
    });

    it('bumps the restore nonce so the viewer turns the camera', () => {
        const store = makeStore();
        store.dispatch(restoreCamera({ azimuth: 45, elevation: 20 }));
        expect(store.getState().orbital).toMatchObject({ cameraAngles: { azimuth: 45, elevation: 20 }, cameraRestoreNonce: 1 });
        store.dispatch(restoreCamera(null));
        expect(store.getState().orbital).toMatchObject({ cameraAngles: null, cameraRestoreNonce: 2 });
    });

    // Review finding: Reset View (and picking an element, which dispatches
    // it) swings the camera back to the canonical direction. The store must
    // say so too, or it goes on reporting a stale non-canonical angle while
    // the screen sits at canonical.
    it('clears the camera angle on a view reset', () => {
        const store = makeStore();
        store.dispatch(cameraMoved({ azimuth: 120, elevation: -10 }));
        store.dispatch(resetView());
        expect(store.getState().orbital.cameraAngles).toBeNull();
    });

    // A restored link's resetView + restoreCamera land in the same commit
    // (Task 5's URL decoder). Whichever the effects apply last must be the
    // restored angle, not the reset -- this pins the reducer side of that;
    // OrbitalViewer's effect order is pinned separately.
    it('leaves the restored angle in place when resetView precedes restoreCamera', () => {
        const store = makeStore();
        store.dispatch(resetView());
        store.dispatch(restoreCamera({ azimuth: 70, elevation: -15 }));
        expect(store.getState().orbital.cameraAngles).toEqual({ azimuth: 70, elevation: -15 });
    });
});

describe('orbitalSlice: a restored cut', () => {
    it('is applied at once and remembered until cleared', () => {
        const store = makeStore();
        store.dispatch(requestCut({ clipAxis: 'y', clipPosition: 0.5 }));
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'y', clipPosition: 0.5 });
        expect(store.getState().orbital.pendingCut).toEqual({ clipAxis: 'y', clipPosition: 0.5 });
        store.dispatch(clearPendingCut());
        expect(store.getState().orbital.pendingCut).toBeNull();
    });
});

// Final review I2/M9: the shell's lobes and the level-transition animation
// change the picture with no orbital request in flight, so the store needs
// to hear about them for the export menu to wait.
describe('orbitalSlice: the shell-lobe build and level transitions', () => {
    it('marks a lobe build busy until it ends, and clears an earlier failure when a new one starts', () => {
        let state = reducer(undefined, startCompositionBuild());
        expect(state).toMatchObject({ compositionBusy: true, compositionFailed: false });
        state = reducer(state, endCompositionBuild());
        expect(state).toMatchObject({ compositionBusy: false, compositionFailed: false });
        state = reducer(reducer(state, startCompositionBuild()), failCompositionBuild('worker crashed'));
        expect(state).toMatchObject({ compositionBusy: false, compositionFailed: true });
        state = reducer(state, startCompositionBuild());
        expect(state.compositionFailed).toBe(false);
    });

    it('shows a failed lobe build through the app\'s error message, which outlives dismissing it', () => {
        let state = reducer(undefined, failCompositionBuild('worker crashed'));
        expect(state.error).toMatch(/orbital lobes.*worker crashed/);
        state = reducer(state, dismissOrbitalError());
        expect(state.error).toBeNull();
        expect(state.compositionFailed).toBe(true);
        expect(reducer(state, endCompositionBuild()).compositionFailed).toBe(false);
    });

    it('records whether a level transition is running', () => {
        const state = reducer(undefined, setLevelTransition(true));
        expect(state.levelTransition).toBe(true);
        expect(reducer(state, setLevelTransition(false)).levelTransition).toBe(false);
    });
});
