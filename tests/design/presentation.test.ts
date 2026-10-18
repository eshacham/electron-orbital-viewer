import { decodeDisplay, decodeRender, DEFAULT_DISPLAY, DEFAULT_RENDER, displayPref, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('presentation preferences (spec §6.7)', () => {
    // Ruling T20b-display-header adds displayOpen (the inspector's Display section) to these.
    // Ruling P16 (owner) overrides the plain `true` default: until the viewer
    // chooses, displayOpen is null and the window's own height decides.
    // Ruling R22a (owner): no colour scheme any more -- the finish is eov.render's only field.
    it('default to Glow, axes shown, the radial distribution tab and no stored Display choice', () => {
        expect(renderPref.get()).toEqual({ finish: 'glow' });
        expect(displayPref.get()).toEqual({ showAxes: true, plotTab: 'distribution', displayOpen: null });
    });

    it('store JSON under eov.render and eov.display', () => {
        // Ruling R22a: the stored value carries no scheme.
        renderPref.set({ finish: 'solid' });
        displayPref.set({ showAxes: false, plotTab: 'wave', displayOpen: false });
        expect(JSON.parse(window.localStorage.getItem('eov.render')!)).toEqual({ finish: 'solid' });
        expect(JSON.parse(window.localStorage.getItem('eov.display')!)).toEqual({ showAxes: false, plotTab: 'wave', displayOpen: false });
    });

    it('read anything malformed as the defaults, field by field', () => {
        expect(decodeRender('not json')).toEqual(DEFAULT_RENDER);
        // Ruling R22a: a stored scheme is no longer a field -- ignored.
        expect(decodeRender('{"finish":"chrome","scheme":"density"}')).toEqual({ finish: 'glow' });
        // Ruling P16: a non-boolean displayOpen is not a real choice -- stays null.
        expect(decodeDisplay('{"showAxes":"yes","plotTab":"rho","displayOpen":0}')).toEqual({ showAxes: true, plotTab: 'rho', displayOpen: null });
        // A value stored before displayOpen existed reads as unset -- the window decides (P16).
        expect(decodeDisplay('{"showAxes":false,"plotTab":"wave"}')).toEqual({ showAxes: false, plotTab: 'wave', displayOpen: null });
        expect(decodeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    });

    // Ruling P16 (owner): displayOpen is kept only when it is a real boolean --
    // anything else (never stored, or malformed) stays null, so InspectorDisplay
    // falls back to the window's own height instead of a single fixed default.
    it('decodeDisplay keeps displayOpen only when it is a real boolean', () => {
        expect(decodeDisplay(null).displayOpen).toBeNull();
        expect(decodeDisplay('{"displayOpen":false}').displayOpen).toBe(false);
        expect(decodeDisplay('{"displayOpen":"x"}').displayOpen).toBeNull();
    });

    // Ruling R22a (owner): a returning user's eov.render from before the scheme went keeps its finish.
    it('read an old stored value that still names a scheme as its finish alone', () => {
        expect(decodeRender('{"finish":"solid","scheme":"classic"}')).toEqual({ finish: 'solid' });
        expect(decodeRender('{"finish":"glow","scheme":"density"}')).toEqual({ finish: 'glow' });
        window.localStorage.setItem('eov.render', '{"finish":"solid","scheme":"classic"}');
        expect(renderPref.get()).toEqual({ finish: 'solid' });
    });
});
