import { decodeDisplay, decodeRender, DEFAULT_DISPLAY, DEFAULT_RENDER, displayPref, INSPECTOR_ALL_FOLDED, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('presentation preferences (spec §6.7)', () => {
    // Ruling R24-3 replaces displayOpen (T20b-display-header, P16) with inspectorOpen: which titled section is
    // open, null until the viewer chooses (the mode's content section then opens).
    // Ruling R22a (owner): no colour scheme any more -- the finish is eov.render's only field.
    // Ruling P9: moleculeLabels joins eov.display, off by default.
    it('default to Glow, axes shown, the radial distribution tab, no stored inspector section and no molecule labels', () => {
        expect(renderPref.get()).toEqual({ finish: 'glow' });
        expect(displayPref.get()).toEqual({ showAxes: true, plotTab: 'distribution', inspectorOpen: null, moleculeLabels: false });
    });

    it('store JSON under eov.render and eov.display', () => {
        // Ruling R22a: the stored value carries no scheme.
        renderPref.set({ finish: 'solid' });
        // Ruling R24-3: inspectorOpen (a section key) replaces displayOpen.
        // Ruling P9: moleculeLabels is stored with the rest.
        displayPref.set({ showAxes: false, plotTab: 'wave', inspectorOpen: 'display', moleculeLabels: true });
        expect(JSON.parse(window.localStorage.getItem('eov.render')!)).toEqual({ finish: 'solid' });
        expect(JSON.parse(window.localStorage.getItem('eov.display')!)).toEqual({ showAxes: false, plotTab: 'wave', inspectorOpen: 'display', moleculeLabels: true });
    });

    it('read anything malformed as the defaults, field by field', () => {
        expect(decodeRender('not json')).toEqual(DEFAULT_RENDER);
        // Ruling R22a: a stored scheme is no longer a field -- ignored.
        expect(decodeRender('{"finish":"chrome","scheme":"density"}')).toEqual({ finish: 'glow' });
        // Ruling R24-3: a non-string inspectorOpen (or a non-true displayOpen) is not a choice -- stays null.
        // Ruling P9: a non-boolean moleculeLabels is not a choice either -- off.
        expect(decodeDisplay('{"showAxes":"yes","plotTab":"rho","inspectorOpen":0,"displayOpen":0,"moleculeLabels":"yes"}'))
            .toEqual({ showAxes: true, plotTab: 'rho', inspectorOpen: null, moleculeLabels: false });
        // A value stored before either existed reads as unset -- the content section opens (R24-3); labels off (P9).
        expect(decodeDisplay('{"showAxes":false,"plotTab":"wave"}')).toEqual({ showAxes: false, plotTab: 'wave', inspectorOpen: null, moleculeLabels: false });
        expect(decodeDisplay('{"moleculeLabels":true}').moleculeLabels).toBe(true);
        expect(decodeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    });

    // Ruling R24-3 (replacing P16's displayOpen test): a stored section key is kept as it is, the
    // all-folded choice included; an old displayOpen migrates -- true kept Display open, false had the
    // plot showing, which is the new default (null). Never written back as displayOpen.
    it('decodeDisplay keeps a stored section and migrates an old displayOpen', () => {
        expect(decodeDisplay(null).inspectorOpen).toBeNull();
        expect(decodeDisplay('{"inspectorOpen":"plot"}').inspectorOpen).toBe('plot');
        expect(decodeDisplay(`{"inspectorOpen":"${INSPECTOR_ALL_FOLDED}"}`).inspectorOpen).toBe(INSPECTOR_ALL_FOLDED);
        expect(decodeDisplay('{"displayOpen":true}').inspectorOpen).toBe('display');
        expect(decodeDisplay('{"displayOpen":false}').inspectorOpen).toBeNull();
        expect(decodeDisplay('{"displayOpen":"x"}').inspectorOpen).toBeNull();
        // A newer choice wins over a leftover old field.
        expect(decodeDisplay('{"displayOpen":true,"inspectorOpen":"plot"}').inspectorOpen).toBe('plot');
        window.localStorage.setItem('eov.display', '{"showAxes":true,"plotTab":"rho","displayOpen":true}');
        // Ruling P9: widened with moleculeLabels (off: the old value has none).
        expect(displayPref.get()).toEqual({ showAxes: true, plotTab: 'rho', inspectorOpen: 'display', moleculeLabels: false });
        displayPref.set(displayPref.get());
        expect(JSON.parse(window.localStorage.getItem('eov.display')!)).not.toHaveProperty('displayOpen');
    });

    // Ruling R22a (owner): a returning user's eov.render from before the scheme went keeps its finish.
    it('read an old stored value that still names a scheme as its finish alone', () => {
        expect(decodeRender('{"finish":"solid","scheme":"classic"}')).toEqual({ finish: 'solid' });
        expect(decodeRender('{"finish":"glow","scheme":"density"}')).toEqual({ finish: 'glow' });
        window.localStorage.setItem('eov.render', '{"finish":"solid","scheme":"classic"}');
        expect(renderPref.get()).toEqual({ finish: 'solid' });
    });
});
