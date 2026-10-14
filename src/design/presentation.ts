import { createPref } from './local_pref';

/**
 * How the 3D view is drawn, as the viewer's own preference (spec §6.7):
 * localStorage only, never in a link. Ruling R1: the link keeps `surf`
 * (solid or wireframe) as today; Glow is a finish of the solid surface, so
 * a link opens in the receiver's own finish.
 */
export type Finish = 'glow' | 'solid';
export type ColourScheme = 'phase' | 'density' | 'classic';
export interface RenderPrefs { finish: Finish; scheme: ColourScheme }

export const RENDER_KEY = 'eov.render';
export const DEFAULT_RENDER: RenderPrefs = { finish: 'glow', scheme: 'phase' };
const SCHEMES: readonly ColourScheme[] = ['phase', 'density', 'classic'];

function parse(raw: string | null): Record<string, unknown> {
    try {
        const value = JSON.parse(raw ?? '');
        return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

export function decodeRender(raw: string | null): RenderPrefs {
    const value = parse(raw);
    return {
        finish: value.finish === 'solid' ? 'solid' : 'glow',
        scheme: SCHEMES.includes(value.scheme as ColourScheme) ? value.scheme as ColourScheme : DEFAULT_RENDER.scheme,
    };
}

export const renderPref = createPref<RenderPrefs>(RENDER_KEY, { decode: decodeRender, encode: value => JSON.stringify(value) });

/** The inspector's plot tabs (spec §9.1): R(r), |R(r)|², today's radial distribution, ρ(r). */
export type PlotTabId = 'wave' | 'density' | 'distribution' | 'rho';
export interface DisplayPrefs {
    showAxes: boolean;
    plotTab: PlotTabId;
    /** The inspector's Display section is expanded (ruling T20b-display-header). */
    displayOpen: boolean;
}

export const DISPLAY_KEY = 'eov.display';
export const DEFAULT_DISPLAY: DisplayPrefs = { showAxes: true, plotTab: 'distribution', displayOpen: true };
const PLOT_TABS: readonly PlotTabId[] = ['wave', 'density', 'distribution', 'rho'];

export function decodeDisplay(raw: string | null): DisplayPrefs {
    const value = parse(raw);
    return {
        showAxes: typeof value.showAxes === 'boolean' ? value.showAxes : DEFAULT_DISPLAY.showAxes,
        plotTab: PLOT_TABS.includes(value.plotTab as PlotTabId) ? value.plotTab as PlotTabId : DEFAULT_DISPLAY.plotTab,
        displayOpen: typeof value.displayOpen === 'boolean' ? value.displayOpen : DEFAULT_DISPLAY.displayOpen,
    };
}

export const displayPref = createPref<DisplayPrefs>(DISPLAY_KEY, { decode: decodeDisplay, encode: value => JSON.stringify(value) });
