import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer, {
    setEnclosedFraction, setBasicSelection, setSurfaceStyle, setCombination, cameraMoved,
    startOrbitalCalculation, selectShownBasicOrbital,
} from '../src/store/orbitalSlice';
import atomReducer, { setMode, setElement, solveSucceeded, drillToShell, drillToSubshell, drillToOrbital } from '../src/store/atomSlice';
import {
    registerUrlKeys, resetUrlKeysForTests, encodeStateOf, applyStateTo, encodeState, applyState,
    bindUrlStateStore, hasSharedView, urlModeOf, ANY_MODE, registerBuiltInUrlKeys,
} from '../src/url_state';
import { basicOrbitalParams, ENCLOSED_FRACTIONS } from '../src/orbital_presets';
import { CombinationSelection, selectionProblem, fieldRequestFor } from '../src/combinations';
import type { RootState } from '../src/store';
import type { SerialisedAtomProfile } from '../src/workers/atomWorker';

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


/** Every shell up to maxN, every subshell up to f: any view is reachable. */
function profileFor(Z: number, maxN = 7): SerialisedAtomProfile {
    const shells: SerialisedAtomProfile['shells'] = [];
    const subshells: SerialisedAtomProfile['subshells'] = [];
    for (let n = 1; n <= maxN; n++) {
        shells.push({ n, electrons: 2, contourRadius: n, curve: new Float64Array(3), emphasis: new Float32Array(3) });
        for (let l = 0; l <= Math.min(3, n - 1); l++) {
            subshells.push({ n, l, electrons: 2, energy: -1 / n, curve: new Float64Array(3), R: new Float64Array(3), samplingRadius: n, compositeSamplingRadius: n });
        }
    }
    return {
        Z, converged: true, rMin: 1e-3, dx: 0.1, size: 3, total: new Float32Array(3), totalEmphasis: new Float32Array(3),
        contourRadius: maxN, valencePeakRadius: maxN, displayRadius: maxN, shellPeaks: new Float64Array([1]),
        shellIndexAtR: new Float32Array(3), shells, subshells,
    };
}

/** Applies a link to a fresh store and, in atom mode, lands the solve it asked for. */
function restore(hash: string, maxN = 7) {
    const store = makeStore();
    applyStateTo(hash, store.dispatch);
    const { atom } = store.getState();
    if (atom.mode === 'atom' && atom.pendingView) store.dispatch(solveSucceeded(profileFor(atom.Z, maxN)));
    return store;
}

function mulberry32(seed: number): () => number {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type Shape = 'atom' | 'shell' | 'subshell' | 'orbital' | 'basic' | 'hybrid' | 'field';

function randomView(rand: () => number, shape: Shape) {
    const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
    const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
    const store = makeStore();
    if (shape === 'basic' || shape === 'hybrid' || shape === 'field') {
        store.dispatch(setMode('hydrogenic'));
        const n = int(1, 9), l = int(0, n - 1), ml = int(-l, l);
        store.dispatch(setBasicSelection({ n, l, ml }));
        if (shape === 'basic') store.dispatch(startOrbitalCalculation(basicOrbitalParams(n, l, ml, 0.9)));
        const combination: CombinationSelection = shape === 'hybrid'
            ? { kind: 'hybrid', hybrid: pick(['sp', 'sp2', 'sp3'] as const), member: rand() < 0.5 ? 'all' : int(0, 1) }
            : shape === 'field'
                ? { kind: 'field', level: pick([1, 2] as const), field: int(0, 50) / 1000, stark: pick(['lower', 'upper', 'both'] as const) }
                : { kind: 'none' };
        store.dispatch(setCombination(combination));
    } else {
        const Z = int(1, 118);
        store.dispatch(setElement(Z));
        store.dispatch(solveSucceeded(profileFor(Z)));
        const n = int(1, 7), l = int(0, Math.min(3, n - 1)), ml = int(-l, l);
        if (shape === 'shell') store.dispatch(drillToShell(n));
        if (shape === 'subshell') store.dispatch(drillToSubshell(n, l));
        if (shape === 'orbital') store.dispatch(drillToOrbital(n, l, ml));
    }
    store.dispatch(setEnclosedFraction(pick(ENCLOSED_FRACTIONS)));
    store.dispatch(setSurfaceStyle({
        opacity: int(1, 20) * 0.05,
        mode: pick(['solid', 'wireframe'] as const),
        clipAxis: pick(['none', 'x', 'y', 'z'] as const),
        clipPosition: 1 - int(0, 100) / 50,
    }));
    if (rand() < 0.7) store.dispatch(cameraMoved({ azimuth: int(-179, 180), elevation: int(-89, 89) }));
    return store;
}

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;

/** What a link promises to restore. */
function viewOf(state: RootState) {
    const { atom, orbital } = state;
    const style = orbital.surfaceStyle;
    return {
        mode: atom.mode,
        atom: atom.mode === 'atom'
            ? { Z: atom.Z, level: atom.level, shell: atom.selectedShell, subshell: atom.selectedSubshell, orbital: atom.selectedOrbital }
            : null,
        basic: atom.mode === 'hydrogenic' ? { orbital: selectShownBasicOrbital(state), combination: orbital.combination } : null,
        frac: orbital.enclosedFraction,
        opacity: round2(style.opacity),
        surface: style.mode,
        clipAxis: style.clipAxis,
        clipPosition: style.clipAxis === 'none' ? null : round2(style.clipPosition),
        camera: orbital.cameraAngles,
    };
}

describe('built-in URL keys', () => {
    beforeEach(() => { resetUrlKeysForTests(); registerBuiltInUrlKeys(); });

    // Spec §5 Phase 2: "URL round-trip property test over every mode and level".
    it.each<Shape>(['atom', 'shell', 'subshell', 'orbital', 'basic', 'hybrid', 'field'])(
        'round-trips random %s views',
        shape => {
            const rand = mulberry32(shape.length * 7919);
            for (let i = 0; i < 60; i++) {
                const original = randomView(rand, shape);
                const hash = encodeStateOf(original.getState());
                const restored = restore(hash);
                expect(encodeStateOf(restored.getState())).toBe(hash);
                expect(viewOf(restored.getState())).toEqual(viewOf(original.getState()));
            }
        },
    );

    it('restores the spec example: iron 3d_z², cut along x through the nucleus', () => {
        const hash = 'mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&frac=0.9&cut=x:0.5&op=1&surf=solid';
        const store = restore(hash);
        expect(store.getState().atom).toMatchObject({ Z: 26, level: 'orbital', selectedOrbital: { n: 3, l: 2, ml: 0 } });
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'x', clipPosition: 0 });
        expect(encodeStateOf(store.getState())).toBe(hash);
    });

    // Ruling C11: the spec's own §4.3 literal example link, copied exactly
    // (its key order differs from what this module encodes — no op/surf keys,
    // frac after cut — so only the restored view is checked, not a round trip).
    it('restores the spec §4.3 literal example link', () => {
        const hash = '#mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&cut=x:0.5&frac=0.9';
        const store = restore(hash);
        expect(store.getState().atom).toMatchObject({ Z: 26, level: 'orbital', selectedOrbital: { n: 3, l: 2, ml: 0 } });
        expect(store.getState().orbital.surfaceStyle).toMatchObject({ clipAxis: 'x', clipPosition: 0 });
        expect(store.getState().orbital.enclosedFraction).toBe(0.9);
    });

    it('writes a combination with the keys Phase 1 expects', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        store.dispatch(setCombination({ kind: 'field', level: 2, field: 0.0039, stark: 'both' }));
        expect(encodeStateOf(store.getState())).toMatch(/^mode=basic&n=3&l=2&ml=0&combo=field&level=2&F=0.0039&stark=both&/);
        store.dispatch(setCombination({ kind: 'hybrid', hybrid: 'sp3', member: 1 }));
        expect(encodeStateOf(store.getState())).toMatch(/^mode=basic&n=3&l=2&ml=0&combo=sp3&member=1&/);
        store.dispatch(setCombination({ kind: 'none' }));
        expect(encodeStateOf(store.getState())).toMatch(/^mode=basic&n=3&l=2&ml=0&combo=none&/);
    });

    // Phase 1 Review Focus 3: out of range is refused with a message, never clamped.
    it('decodes an out-of-range field or member into Phase 1\'s refused state', () => {
        const refused: Array<[string, CombinationSelection]> = [
            ['#mode=basic&combo=field&level=1&F=0.08', { kind: 'field', level: 1, field: 0.08, stark: 'lower' }],
            ['#mode=basic&combo=field&level=2&F=0.01&stark=upper', { kind: 'field', level: 2, field: 0.01, stark: 'upper' }],
            ['#mode=basic&combo=sp&member=5', { kind: 'hybrid', hybrid: 'sp', member: 5 }],
        ];
        for (const [hash, expected] of refused) {
            const store = makeStore();
            applyStateTo(hash, store.dispatch);
            expect(store.getState().orbital.combination).toEqual(expected);
            expect(selectionProblem(store.getState().orbital.combination)).not.toBeNull();
            expect(fieldRequestFor(store.getState().orbital.combination, 0.9)).toBeNull();
        }
    });

    // Review Focus 1.
    it('ignores what it cannot use', () => {
        const cases: Array<[string, (s: RootState) => void]> = [
            ['#mode=atom&Z=abc&level=orbital', s => expect(s.atom).toMatchObject({ mode: 'atom', Z: 1, pendingView: null })],
            ['#mode=atom&Z=26&level=orbital&n=9&l=2&ml=0', s => expect(s.atom.pendingView?.level).toBe('atom')],
            ['#mode=atom&Z=26&level=orbital&n=3&l=2&ml=5', s => expect(s.atom.pendingView).toMatchObject({ level: 'shell', subshell: { n: 3, l: 2 }, orbital: null })],
            ['#mode=basic&n=2&l=2&ml=0', s => expect(s.orbital.basicSelection).toEqual({ n: 3, l: 2, ml: 0 })],
            ['#mode=basic&combo=sp4&member=1', s => expect(s.orbital.combination).toEqual({ kind: 'none' })],
            ['#mode=basic&combo=field&level=3&F=abc&stark=sideways', s => expect(s.orbital.combination).toEqual({ kind: 'field', level: 1, field: 0.03, stark: 'lower' })],
            ['#frac=0.42&op=7&surf=glass&cut=w:0.5&cam=400,0&bogus=1', s => {
                expect(s.orbital.enclosedFraction).toBe(0.9);
                expect(s.orbital.surfaceStyle).toMatchObject({ opacity: 1, mode: 'solid', clipAxis: 'none' });
                expect(s.orbital.cameraAngles).toBeNull();
            }],
            ['#mode=molecule&id=h2o', s => expect(s.atom.mode).toBe('atom')],
            ['#op=&cut=&Z=', s => expect(s.orbital.surfaceStyle.opacity).toBe(1)],
        ];
        for (const [hash, check] of cases) {
            const store = makeStore();
            expect(() => applyStateTo(hash, store.dispatch)).not.toThrow();
            check(store.getState());
        }
    });

    // Review Focus 2.
    it('a link to an orbital the element lacks opens the whole atom', () => {
        const store = restore('#mode=atom&Z=1&level=orbital&n=3&l=2&ml=0', 1);
        expect(store.getState().atom).toMatchObject({ level: 'atom', pendingView: null });
    });

    // Review Focus 3.
    it('a link copied mid-solve carries the view that was asked for', () => {
        const store = makeStore();
        applyStateTo('#mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&cut=none', store.dispatch);
        expect(store.getState().atom.level).toBe('atom');
        expect(encodeStateOf(store.getState())).toMatch(/^mode=atom&Z=26&level=orbital&n=3&l=2&ml=0&frac=0.9&cut=none&/);
    });
});
