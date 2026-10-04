import reducer, { selectBondsSystem, setH2PlusR, setScanPoint, setBondsView, setDensityIso, restoreBonds } from '../../src/store/bondsSlice';
import orbitalReducer, { startFieldCalculation, startOrbitalCalculation } from '../../src/store/orbitalSlice';
import { setMode } from '../../src/store/atomSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { isBondsSystemId, nearestScanIndex, pointId, systemFormula, BONDS_SYSTEMS, DIATOMIC_IDS } from '../../src/bonds/systems';
import { ScanPoint } from '../../src/molecules/types';

const initial = reducer(undefined, { type: '@@init' });

describe('bondsSlice', () => {
    it('starts on H2+ at 2 a0, bonding orbital', () => {
        expect(initial).toEqual({ system: 'h2plus', R: 2, scanIndex: null, view: { kind: 'h2plus', state: '1sigma_g' }, densityIso: 0.002 });
    });

    it('clamps H2+ R to the slider range and ignores nonsense', () => {
        expect(reducer(initial, setH2PlusR(0.01)).R).toBe(0.5);
        expect(reducer(initial, setH2PlusR(1e6)).R).toBe(10);
        expect(reducer(initial, setH2PlusR(Number.NaN)).R).toBe(2);
        expect(reducer(initial, setH2PlusR(Number.POSITIVE_INFINITY)).R).toBe(2);
        expect(reducer(initial, setH2PlusR(-3)).R).toBe(0.5);
    });

    // Ruling C14: a link stores R to 3 decimals and a curve click gives any
    // float, so R is held on the slider's own 0.01 step.
    it('rounds H2+ R to the slider step', () => {
        expect(reducer(initial, setH2PlusR(2.3456)).R).toBe(2.35);
        expect(reducer(initial, setH2PlusR(1.997)).R).toBe(2);
    });

    it('a molecule starts on its density with R pending until its scan loads', () => {
        const state = reducer(initial, selectBondsSystem('n2'));
        expect(state).toMatchObject({ system: 'n2', R: null, scanIndex: null, view: { kind: 'density' } });
        expect(reducer(state, setH2PlusR(3)).R).toBeNull();
        const snapped = reducer(state, setScanPoint({ index: 7, RBohr: 2.074 }));
        expect(snapped).toMatchObject({ scanIndex: 7, R: 2.074 });
    });

    it('ignores a scan point for H2+, a malformed one, or one from another molecule', () => {
        expect(reducer(initial, setScanPoint({ index: 3, RBohr: 2.1 }))).toEqual(initial);
        const n2 = reducer(initial, selectBondsSystem('n2'));
        expect(reducer(n2, setScanPoint({ index: -1, RBohr: 2.1 }))).toEqual(n2);
        expect(reducer(n2, setScanPoint({ index: 1.5, RBohr: 2.1 }))).toEqual(n2);
        expect(reducer(n2, setScanPoint({ index: 2, RBohr: Number.NaN }))).toEqual(n2);
        // A scan that lands after the user has moved on must not snap the new molecule.
        expect(reducer(n2, setScanPoint({ system: 'o2', index: 2, RBohr: 2.3 }))).toEqual(n2);
        expect(reducer(n2, setScanPoint({ system: 'n2', index: 2, RBohr: 2.0 }))).toMatchObject({ scanIndex: 2, R: 2.0 });
    });

    it('back to H2+ from a molecule keeps its R on the slider', () => {
        const n2 = reducer(reducer(initial, selectBondsSystem('n2')), setScanPoint({ index: 7, RBohr: 2.074 }));
        expect(reducer(n2, selectBondsSystem('h2plus'))).toEqual({ ...initial, R: 2.07 });
        expect(reducer(reducer(initial, selectBondsSystem('n2')), selectBondsSystem('h2plus')).R).toBe(2);
    });

    it('accepts only views that belong to the system', () => {
        expect(reducer(initial, setBondsView({ kind: 'density' })).view).toEqual(initial.view);
        expect(reducer(initial, setBondsView({ kind: 'h2plus', state: '1sigma_u' })).view).toEqual({ kind: 'h2plus', state: '1sigma_u' });
        expect(reducer(initial, setBondsView({ kind: 'h2plus', state: 'bogus' as never })).view).toEqual(initial.view);
        const n2 = reducer(initial, selectBondsSystem('n2'));
        expect(reducer(n2, setBondsView({ kind: 'h2plus', state: '1sigma_u' })).view).toEqual({ kind: 'density' });
        const mo = { kind: 'mo', label: '3σg', spin: 'restricted', component: 0 } as const;
        expect(reducer(n2, setBondsView(mo)).view).toEqual(mo);
        expect(reducer(n2, setBondsView({ ...mo, component: -1 })).view).toEqual({ kind: 'density' });
        expect(reducer(n2, setDensityIso(0.05)).densityIso).toBe(0.05);
        expect(reducer(n2, setDensityIso(0.3)).densityIso).toBe(0.002);
        expect(reducer(initial, selectBondsSystem('xx' as never))).toEqual(initial);
    });

    it('restores a whole selection, keeping R for the scan to snap to', () => {
        const state = reducer(initial, restoreBonds({ system: 'o2', R: 2.3, view: { kind: 'density' }, densityIso: 0.05 }));
        expect(state).toMatchObject({ system: 'o2', R: 2.3, scanIndex: null, densityIso: 0.05 });
    });

    it('restores H2+ on the slider, never past it, and ignores what does not fit', () => {
        expect(reducer(initial, restoreBonds({ system: 'h2plus', R: 250, view: { kind: 'h2plus', state: '1sigma_u' } })))
            .toEqual({ ...initial, R: 10, view: { kind: 'h2plus', state: '1sigma_u' } });
        expect(reducer(initial, restoreBonds({ system: 'h2plus', R: 2.3266 })).R).toBe(2.33);
        expect(reducer(initial, restoreBonds({ system: 'h2plus', R: -1 })).R).toBe(2);
        expect(reducer(initial, restoreBonds({ system: 'n2', R: null, view: { kind: 'h2plus', state: '1sigma_g' }, densityIso: 7 })))
            .toEqual({ system: 'n2', R: null, scanIndex: null, view: { kind: 'density' }, densityIso: 0.002 });
        expect(reducer(initial, restoreBonds({ system: 'zz' as never, R: 2 }))).toEqual(initial);
    });
});

describe('Bonds systems', () => {
    it('names every system, H2+ first', () => {
        expect(BONDS_SYSTEMS.map(s => s.id)).toEqual(['h2plus', ...DIATOMIC_IDS]);
        expect(systemFormula('h2plus')).toBe('H₂⁺');
        expect(systemFormula('co')).toBe('CO');
        expect(isBondsSystemId('hf')).toBe(true);
        expect(isBondsSystemId('be2')).toBe(false);
        expect(isBondsSystemId(undefined)).toBe(false);
    });

    it('names a scan point as the shipped files do', () => {
        expect(pointId('n2', 7)).toBe('n2@07');
        expect(pointId('o2', 12)).toBe('o2@12');
    });

    it('snaps an R to the nearest shipped scan point, never beyond the ends', () => {
        const points = [1.8, 2.0, 2.1, 2.4].map((RBohr, index) => ({ index, RBohr } as ScanPoint));
        expect(nearestScanIndex(points, 2.06)).toBe(2);
        expect(nearestScanIndex(points, 0.1)).toBe(0);
        expect(nearestScanIndex(points, 40)).toBe(3);
        expect(nearestScanIndex([], 2)).toBe(-1);
    });
});

// Review Focus 1.
describe('orbitalSlice on entering Bonds', () => {
    it('setMode("bonds") drops a Basic Orbitals field request', () => {
        const request = { sources: [], colors: [], memberLabels: ['sp3'], resolution: 32, enclosedFraction: 0.9, label: 'sp3' };
        let state = orbitalReducer(undefined, startFieldCalculation(request));
        state = orbitalReducer(state, setMode('bonds'));
        expect(state.currentField).toBeNull();
        expect(state.isLoading).toBe(false);
    });

    // Bonds draws only its own requests: a hydrogen orbital left in the store
    // (Basic Orbitals, or atom mode's level 3) would be redrawn by the viewer
    // the moment the mode changes.
    it('setMode("bonds") drops a plain orbital request too, and its failure', () => {
        let state = orbitalReducer(undefined, startOrbitalCalculation(basicOrbitalParams(3, 2, 0, 0.9)));
        state = { ...state, error: 'worker crashed', renderFailed: true, isoLevel: 0.01 };
        state = orbitalReducer(state, setMode('bonds'));
        expect(state).toMatchObject({ currentParams: null, currentField: null, isLoading: false, error: null, renderFailed: false, isoLevel: null });
    });

    it('leaving Bonds for Basic Orbitals still asks for a Basic render', () => {
        let state = orbitalReducer(undefined, setMode('bonds'));
        const nonce = state.basicRenderNonce;
        state = orbitalReducer(state, setMode('hydrogenic'));
        expect(state.basicRenderNonce).toBe(nonce + 1);
    });

    it('entering atom mode drops only a combination, as before', () => {
        const params = basicOrbitalParams(3, 2, 0, 0.9);
        const state = orbitalReducer(orbitalReducer(undefined, startOrbitalCalculation(params)), setMode('atom'));
        expect(state.currentParams).toEqual(params);
    });
});
