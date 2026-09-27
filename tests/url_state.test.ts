import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer, { setEnclosedFraction } from '../src/store/orbitalSlice';
import atomReducer, { setMode } from '../src/store/atomSlice';
import {
    registerUrlKeys, resetUrlKeysForTests, encodeStateOf, applyStateTo, encodeState, applyState,
    bindUrlStateStore, hasSharedView, urlModeOf, ANY_MODE,
} from '../src/url_state';

const makeStore = () => configureStore({ reducer: { orbital: orbitalReducer, atom: atomReducer } });
const noop = () => {};

describe('url_state registry', () => {
    beforeEach(() => { resetUrlKeysForTests(); bindUrlStateStore(null); });

    it('writes the mode, then its keys, then the shared keys', () => {
        registerUrlKeys(ANY_MODE, s => ({ frac: String(s.orbital.enclosedFraction) }), noop);
        registerUrlKeys('atom', s => ({ Z: String(s.atom.Z) }), noop);
        expect(encodeStateOf(makeStore().getState())).toBe('mode=atom&Z=1&frac=0.9');
    });

    it('calls Basic Orbitals "basic", and leaves the mode out when nothing is registered for it', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        expect(urlModeOf(store.getState())).toBe('basic');
        registerUrlKeys(ANY_MODE, () => ({ op: '1' }), noop);
        expect(encodeStateOf(store.getState())).toBe('op=1');
    });

    it('merges groups for one mode in order, and decodes shared keys first', () => {
        const calls: string[] = [];
        registerUrlKeys('atom', () => ({ a: '1' }), () => calls.push('first'));
        registerUrlKeys('atom', () => ({ b: '2' }), () => calls.push('second'));
        registerUrlKeys(ANY_MODE, () => ({}), () => calls.push('shared'));
        expect(encodeStateOf(makeStore().getState())).toBe('mode=atom&a=1&b=2');
        applyStateTo('#mode=atom', makeStore().dispatch);
        expect(calls).toEqual(['shared', 'first', 'second']);
    });

    it('keeps ":" and "," readable and escapes what URLSearchParams would mangle', () => {
        registerUrlKeys('atom', () => ({ cut: 'x:0.5', cam: '10,-20', odd: 'a+b c&d' }), noop);
        const hash = encodeStateOf(makeStore().getState());
        expect(hash).toBe('mode=atom&cut=x:0.5&cam=10,-20&odd=a%2Bb%20c%26d');
        expect(new URLSearchParams(hash).get('odd')).toBe('a+b c&d');
    });

    it('ignores an unknown mode, and one failing decoder does not stop the rest', () => {
        const seen: string[] = [];
        registerUrlKeys('atom', () => ({}), () => { throw new Error('bad'); });
        registerUrlKeys('atom', () => ({}), p => { seen.push(p.get('Z') ?? ''); });
        const warn = jest.spyOn(console, 'warn').mockImplementation(noop);
        applyStateTo('#mode=molecule&Z=3', makeStore().dispatch);
        expect(seen).toEqual([]);
        applyStateTo('#mode=atom&Z=3', makeStore().dispatch);
        expect(seen).toEqual(['3']);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('does nothing for an empty hash', () => {
        const decoder = jest.fn();
        registerUrlKeys(ANY_MODE, () => ({}), decoder);
        applyStateTo('', makeStore().dispatch);
        applyStateTo('#', makeStore().dispatch);
        expect(decoder).not.toHaveBeenCalled();
    });

    it('recognises a shared view only for a registered mode', () => {
        registerUrlKeys('atom', () => ({}), noop);
        expect(hasSharedView('#mode=atom&Z=26')).toBe(true);
        expect(hasSharedView('#mode=molecule')).toBe(false);
        expect(hasSharedView('')).toBe(false);
    });

    it('encodeState and applyState work on the bound store, and say so when there is none', () => {
        expect(() => encodeState()).toThrow(/bindUrlStateStore/);
        const store = makeStore();
        bindUrlStateStore(store);
        registerUrlKeys(ANY_MODE, s => ({ frac: String(s.orbital.enclosedFraction) }), (p, dispatch) => {
            const f = Number(p.get('frac'));
            if (f > 0) dispatch(setEnclosedFraction(f));
        });
        applyState('#frac=0.5');
        expect(store.getState().orbital.enclosedFraction).toBe(0.5);
        expect(encodeState()).toBe('frac=0.5');
    });
});
