import { decodeGlow, DEFAULT_GLOW, encodeGlow, GLOW_KEY, GLOW_SETTLE_MS, glowOverridesOf, glowPref, resetGlow, setGlowKnob, settledGlowPref } from '../../src/design/glow_pref';
import { createPref, settledView } from '../../src/design/local_pref';
import { GLOW_CAPS, GLOW_KNOBS, GLOW_TUNING } from '../../src/orbital_glow';
import { createAppStore } from '../../src/store';
import { setMode } from '../../src/store/atomSlice';
import { encodeStateOf, registerBuiltInUrlKeys, resetUrlKeysForTests } from '../../src/url_state';

afterEach(() => { jest.useRealTimers(); window.localStorage.clear(); });

// Task 16b ("Advanced appearance", owner R24-adv): the viewer's own Glow values, per theme, in eov.glow.
describe('eov.glow (Task 16b)', () => {
    it('is empty for both themes when nothing is stored, or something unreadable is', () => {
        expect(glowPref.get()).toEqual({ dark: {}, light: {} });
        expect(decodeGlow('not json')).toEqual(DEFAULT_GLOW);
        expect(decodeGlow('[1,2]')).toEqual(DEFAULT_GLOW);
        expect(decodeGlow('{"dark":"bright"}')).toEqual(DEFAULT_GLOW);
    });

    it('drops unknown themes and keys, non-numbers, the knobs a theme never reads, and values equal to the default', () => {
        const raw = JSON.stringify({
            dark: { rimStrength: 1.2, tint: 0.3, wash: 0.5, emissive: '0.2', halo: 0.3, haloOpacity: 0.2, ownRimWhiten: GLOW_TUNING.dark.ownRimWhiten },
            light: { linesOpacity: 0.1, haloOpacity: 0.2, ownRimWhiten: 0.4, rimPower: Number.NaN },
            sepia: { rimStrength: 1 },
        });
        // Body tint and edge wash are not knobs (they whiten the science colours); light has no halo and no own-rim whitening.
        expect(decodeGlow(raw)).toEqual({ dark: { rimStrength: 1.2, haloOpacity: 0.2 }, light: { linesOpacity: 0.1 } });
    });

    it('clamps every stored value to the caps and onto its step', () => {
        const above = Object.fromEntries(GLOW_KNOBS.map(knob => [knob, 99]));
        const below = Object.fromEntries(GLOW_KNOBS.map(knob => [knob, -99]));
        expect(decodeGlow(JSON.stringify({ dark: above })).dark).toEqual(Object.fromEntries(GLOW_KNOBS.map(knob => [knob, GLOW_CAPS[knob].max])));
        expect(decodeGlow(JSON.stringify({ dark: below })).dark).toEqual(Object.fromEntries(GLOW_KNOBS.map(knob => [knob, GLOW_CAPS[knob].min])));
        expect(decodeGlow('{"dark":{"rimStrength":0.123456,"rimPower":2.04,"linesOpacity":0.0312}}').dark)
            .toEqual({ rimStrength: 0.12, rimPower: 2, linesOpacity: 0.03 });
    });

    it('round-trips each theme on its own, under eov.glow, and stores overrides only', () => {
        setGlowKnob('dark', 'rimStrength', 1.2);
        setGlowKnob('dark', 'haloOpacity', 0.25);
        expect(JSON.parse(window.localStorage.getItem(GLOW_KEY)!)).toEqual({ dark: { rimStrength: 1.2, haloOpacity: 0.25 } });
        setGlowKnob('light', 'emissive', 0.3);
        expect(glowPref.get()).toEqual({ dark: { rimStrength: 1.2, haloOpacity: 0.25 }, light: { emissive: 0.3 } });
        expect(decodeGlow(encodeGlow(glowPref.get()))).toEqual(glowPref.get());
        // Back to the owner's value is no override at all.
        setGlowKnob('dark', 'rimStrength', GLOW_TUNING.dark.rimStrength);
        expect(glowPref.get().dark).toEqual({ haloOpacity: 0.25 });
        // A slider past its cap is held at it.
        setGlowKnob('light', 'emissive', 2);
        expect(glowPref.get().light).toEqual({ emissive: GLOW_CAPS.emissive.max });
        expect(glowOverridesOf(glowPref.get(), 'light')).toEqual({ emissive: GLOW_CAPS.emissive.max });
    });

    it('resets one theme to the owner\'s values, keeping the other, and removes the key once both are default', () => {
        setGlowKnob('dark', 'rimStrength', 1.2);
        setGlowKnob('light', 'rimPower', 2.5);
        resetGlow('dark');
        expect(glowPref.get()).toEqual({ dark: {}, light: { rimPower: 2.5 } });
        expect(glowOverridesOf(glowPref.get(), 'dark')).toBeUndefined();
        resetGlow('light');
        expect(window.localStorage.getItem(GLOW_KEY)).toBeNull();
    });

    // Spec §6.5 / §6.7: a presentation preference is never in a link -- the receiver sees their own settings.
    it('is never in a link: the share state is byte-identical with and without overrides', () => {
        resetUrlKeysForTests();
        registerBuiltInUrlKeys();
        try {
            const store = createAppStore();
            store.dispatch(setMode('hydrogenic'));
            const before = encodeStateOf(store.getState());
            for (const knob of GLOW_KNOBS) setGlowKnob('dark', knob, GLOW_CAPS[knob].max);
            setGlowKnob('light', 'emissive', 0.3);
            const after = encodeStateOf(store.getState());
            expect(after).toBe(before);
            expect(after).not.toMatch(/glow|rim|halo|emissive/i);
        } finally {
            resetUrlKeysForTests();
        }
    });
});

describe('settledView (Task 16b)', () => {
    it('keeps the value from before a burst of changes, and tells its readers once, the given time after the last', () => {
        jest.useFakeTimers();
        const source = createPref<number>('test.settled', { decode: raw => Number(raw ?? 0), encode: value => String(value) });
        const settled = settledView(source, 300);
        const listener = jest.fn();
        expect(settled.get()).toBe(0);
        const unsubscribe = settled.subscribe(listener);
        source.set(1);
        jest.advanceTimersByTime(200);
        source.set(2);
        jest.advanceTimersByTime(200);
        source.set(3);
        expect(settled.get()).toBe(0);
        expect(listener).not.toHaveBeenCalled();
        jest.advanceTimersByTime(299);
        expect(listener).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(settled.get()).toBe(3);
        // Its last reader gone, no timer is left behind; unread, it is simply the source.
        source.set(4);
        unsubscribe();
        expect(jest.getTimerCount()).toBe(0);
        expect(settled.get()).toBe(4);
    });

    it('is what settledGlowPref does to eov.glow, after GLOW_SETTLE_MS', () => {
        jest.useFakeTimers();
        const listener = jest.fn();
        expect(settledGlowPref.get()).toEqual({ dark: {}, light: {} });
        const unsubscribe = settledGlowPref.subscribe(listener);
        [0.8, 0.9, 1.0].forEach(value => setGlowKnob('dark', 'rimStrength', value));
        expect(settledGlowPref.get().dark).toEqual({});
        jest.advanceTimersByTime(GLOW_SETTLE_MS);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(settledGlowPref.get().dark).toEqual({ rimStrength: 1 });
        unsubscribe();
    });
});
