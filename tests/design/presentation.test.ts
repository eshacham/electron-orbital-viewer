import { decodeDisplay, decodeRender, DEFAULT_DISPLAY, DEFAULT_RENDER, displayPref, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('presentation preferences (spec §6.7)', () => {
    // Ruling T20b-display-header adds displayOpen (the inspector's Display section, expanded by default) to these.
    it('default to Glow, the phase scheme, axes shown, the radial distribution tab and Display expanded', () => {
        expect(renderPref.get()).toEqual({ finish: 'glow', scheme: 'phase' });
        expect(displayPref.get()).toEqual({ showAxes: true, plotTab: 'distribution', displayOpen: true });
    });

    it('store JSON under eov.render and eov.display', () => {
        renderPref.set({ finish: 'solid', scheme: 'classic' });
        displayPref.set({ showAxes: false, plotTab: 'wave', displayOpen: false });
        expect(JSON.parse(window.localStorage.getItem('eov.render')!)).toEqual({ finish: 'solid', scheme: 'classic' });
        expect(JSON.parse(window.localStorage.getItem('eov.display')!)).toEqual({ showAxes: false, plotTab: 'wave', displayOpen: false });
    });

    it('read anything malformed as the defaults, field by field', () => {
        expect(decodeRender('not json')).toEqual(DEFAULT_RENDER);
        expect(decodeRender('{"finish":"chrome","scheme":"density"}')).toEqual({ finish: 'glow', scheme: 'density' });
        expect(decodeDisplay('{"showAxes":"yes","plotTab":"rho","displayOpen":0}')).toEqual({ showAxes: true, plotTab: 'rho', displayOpen: true });
        // A value stored before displayOpen existed reads as expanded.
        expect(decodeDisplay('{"showAxes":false,"plotTab":"wave"}')).toEqual({ showAxes: false, plotTab: 'wave', displayOpen: true });
        expect(decodeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    });
});
