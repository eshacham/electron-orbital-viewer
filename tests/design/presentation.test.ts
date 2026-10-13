import { decodeDisplay, decodeRender, DEFAULT_DISPLAY, DEFAULT_RENDER, displayPref, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('presentation preferences (spec §6.7)', () => {
    it('default to Glow, the phase scheme, axes shown and the radial distribution tab', () => {
        expect(renderPref.get()).toEqual({ finish: 'glow', scheme: 'phase' });
        expect(displayPref.get()).toEqual({ showAxes: true, plotTab: 'distribution' });
    });

    it('store JSON under eov.render and eov.display', () => {
        renderPref.set({ finish: 'solid', scheme: 'classic' });
        displayPref.set({ showAxes: false, plotTab: 'wave' });
        expect(JSON.parse(window.localStorage.getItem('eov.render')!)).toEqual({ finish: 'solid', scheme: 'classic' });
        expect(JSON.parse(window.localStorage.getItem('eov.display')!)).toEqual({ showAxes: false, plotTab: 'wave' });
    });

    it('read anything malformed as the defaults, field by field', () => {
        expect(decodeRender('not json')).toEqual(DEFAULT_RENDER);
        expect(decodeRender('{"finish":"chrome","scheme":"density"}')).toEqual({ finish: 'glow', scheme: 'density' });
        expect(decodeDisplay('{"showAxes":"yes","plotTab":"rho"}')).toEqual({ showAxes: true, plotTab: 'rho' });
        expect(decodeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    });
});
