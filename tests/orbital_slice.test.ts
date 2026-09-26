import reducer, { startOrbitalCalculation, startFieldCalculation } from '../src/store/orbitalSlice';
import { setMode } from '../src/store/atomSlice';
import { fieldRequestFor } from '../src/combinations';
import { basicOrbitalParams } from '../src/orbital_presets';

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
});
