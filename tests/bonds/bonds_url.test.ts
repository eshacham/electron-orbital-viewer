import { configureStore } from '@reduxjs/toolkit';
jest.mock('../../src/url_state', () => ({ registerUrlKeys: jest.fn() }));
import { registerUrlKeys } from '../../src/url_state';
import atomReducer from '../../src/store/atomSlice';
import orbitalReducer from '../../src/store/orbitalSlice';
import bondsReducer, { selectBondsSystem, setScanPoint, setBondsView, setH2PlusR } from '../../src/store/bondsSlice';
import { encodeBondsUrl, decodeBondsUrl, registerBondsUrlKeys } from '../../src/bonds/bonds_url';
import type { RootState } from '../../src/store';

const makeStore = () => configureStore({ reducer: { atom: atomReducer, orbital: orbitalReducer, bonds: bondsReducer } });

function roundTrip(prepare: (s: ReturnType<typeof makeStore>) => void) {
    const from = makeStore();
    prepare(from);
    const to = makeStore();
    decodeBondsUrl(new URLSearchParams(encodeBondsUrl(from.getState() as RootState)), to.dispatch);
    return { from: from.getState().bonds, to: to.getState().bonds };
}

describe('Bonds URL keys', () => {
    it('registers under mode "bonds"', () => {
        registerBondsUrlKeys();
        expect(registerUrlKeys).toHaveBeenCalledWith('bonds', encodeBondsUrl, decodeBondsUrl);
    });

    it('round-trips H2+ at any R and state', () => {
        const { from, to } = roundTrip(s => { s.dispatch(setH2PlusR(3.456)); s.dispatch(setBondsView({ kind: 'h2plus', state: '1sigma_u' })); });
        expect(to).toEqual(from);
    });

    // D16: 2.3265 is a half-way decimal whose nearest double rounds down under
    // toFixed(3) ("2.326", not "2.327") -- not a bug in encodeBondsUrl, just
    // how that literal happens to land in binary. 2.3266 rounds unambiguously.
    it('round-trips a molecule orbital, leaving R for the scan to snap', () => {
        const { to } = roundTrip(s => {
            s.dispatch(selectBondsSystem('o2'));
            s.dispatch(setScanPoint({ index: 9, RBohr: 2.3266 }));
            s.dispatch(setBondsView({ kind: 'mo', label: '1πg*', spin: 'alpha', component: 1 }));
        });
        expect(to).toMatchObject({ system: 'o2', R: 2.327, scanIndex: null, view: { kind: 'mo', label: '1πg*', spin: 'alpha', component: 1 } });
    });

    // Review Focus 4.
    it.each([
        ['system=xx&R=2', 'h2plus', 2],
        ['system=h2plus&R=0.01', 'h2plus', 0.5],
        ['system=h2plus&R=1e6', 'h2plus', 10],
        ['system=h2plus&R=abc', 'h2plus', 2],
    ])('never throws on %s', (hash, system, R) => {
        const store = makeStore();
        expect(() => decodeBondsUrl(new URLSearchParams(hash as string), store.dispatch)).not.toThrow();
        expect(store.getState().bonds).toMatchObject({ system, R });
    });

    it('ignores a malformed state', () => {
        const store = makeStore();
        decodeBondsUrl(new URLSearchParams('system=n2&state=mo:garbage'), store.dispatch);
        expect(store.getState().bonds).toMatchObject({ system: 'n2', view: { kind: 'density' }, densityIso: 0.002 });
        decodeBondsUrl(new URLSearchParams('system=n2&state=density:7'), store.dispatch);
        expect(store.getState().bonds.densityIso).toBe(0.002);
    });

    it('uses exactly the keys Phase 7 lessons write', () => {
        const store = makeStore();
        store.dispatch(selectBondsSystem('n2'));
        store.dispatch(setScanPoint({ index: 7, RBohr: 2.0743 }));
        expect(encodeBondsUrl(store.getState() as RootState)).toEqual({ system: 'n2', R: '2.074', state: 'density:0.002' });
        const lesson = makeStore();
        decodeBondsUrl(new URLSearchParams('system=h2plus&R=2&state=1sigma_u'), lesson.dispatch);
        expect(lesson.getState().bonds).toMatchObject({ system: 'h2plus', R: 2, view: { kind: 'h2plus', state: '1sigma_u' } });
        expect(lesson.getState().atom.mode).toBe('bonds');
    });
});
