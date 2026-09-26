import { configureStore } from '@reduxjs/toolkit';
import reducer, {
    startOrbitalCalculation, startFieldCalculation, finishOrbitalCalculation, clearPicture,
    setBasicSelection, setEnclosedFraction, setCombination, requestBasicRender, selectShownBasicOrbital,
    DEFAULT_BASIC_SELECTION,
} from '../src/store/orbitalSlice';
import orbitalReducer from '../src/store/orbitalSlice';
import { setMode } from '../src/store/atomSlice';
import atomReducer from '../src/store/atomSlice';
import { fieldRequestFor, NO_COMBINATION } from '../src/combinations';
import { basicOrbitalParams, DEFAULT_ENCLOSED_FRACTION } from '../src/orbital_presets';

const makeStore = () => configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });

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
