import { createPref } from './local_pref';

/**
 * How the 3D view is drawn, as the viewer's own preference (spec §6.7):
 * localStorage only, never in a link. Ruling R1: the link keeps `surf`
 * (solid or wireframe) as today; Glow is a finish of the solid surface, so
 * a link opens in the receiver's own finish.
 */
export type Finish = 'glow' | 'solid';
/**
 * Ruling R22a (owner): the surface is always coloured by the sign of ψ --
 * there is no colour-scheme choice, so the finish is the only preference.
 */
export interface RenderPrefs { finish: Finish }

export const RENDER_KEY = 'eov.render';
export const DEFAULT_RENDER: RenderPrefs = { finish: 'glow' };

function parse(raw: string | null): Record<string, unknown> {
    try {
        const value = JSON.parse(raw ?? '');
        return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

/** A value stored before ruling R22a may still carry `scheme`; it is ignored, and the finish kept. */
export function decodeRender(raw: string | null): RenderPrefs {
    const value = parse(raw);
    return { finish: value.finish === 'solid' ? 'solid' : 'glow' };
}

export const renderPref = createPref<RenderPrefs>(RENDER_KEY, { decode: decodeRender, encode: value => JSON.stringify(value) });

/** The inspector's plot tabs (spec §9.1): R(r), |R(r)|², today's radial distribution, ρ(r). */
export type PlotTabId = 'wave' | 'density' | 'distribution' | 'rho';
export interface DisplayPrefs {
    showAxes: boolean;
    plotTab: PlotTabId;
    /**
     * Whether the inspector's Display section is expanded (ruling
     * T20b-display-header). `null` means the viewer has never chosen --
     * ruling P16 (owner) then opens it by the window's own height (short
     * windows start folded so the plot comes up without scrolling), rather
     * than pinning a single default for every window size.
     */
    displayOpen: boolean | null;
}

export const DISPLAY_KEY = 'eov.display';
export const DEFAULT_DISPLAY: DisplayPrefs = { showAxes: true, plotTab: 'distribution', displayOpen: null };
const PLOT_TABS: readonly PlotTabId[] = ['wave', 'density', 'distribution', 'rho'];

export function decodeDisplay(raw: string | null): DisplayPrefs {
    const value = parse(raw);
    return {
        showAxes: typeof value.showAxes === 'boolean' ? value.showAxes : DEFAULT_DISPLAY.showAxes,
        plotTab: PLOT_TABS.includes(value.plotTab as PlotTabId) ? value.plotTab as PlotTabId : DEFAULT_DISPLAY.plotTab,
        // Only a real boolean is a viewer's stored choice; anything else (never
        // set, or malformed) stays null so the window's height decides (P16).
        displayOpen: typeof value.displayOpen === 'boolean' ? value.displayOpen : DEFAULT_DISPLAY.displayOpen,
    };
}

export const displayPref = createPref<DisplayPrefs>(DISPLAY_KEY, { decode: decodeDisplay, encode: value => JSON.stringify(value) });

/**
 * Atoms mode's one-time "Drag to rotate" hint (Task 5, ruling P17): seen
 * once, then never again -- localStorage only, never in a link (spec §6.7).
 */
export interface HintPrefs { rotateDismissed: boolean }

export const HINT_KEY = 'eov.hint';
export const DEFAULT_HINT: HintPrefs = { rotateDismissed: false };

export function decodeHint(raw: string | null): HintPrefs {
    const value = parse(raw);
    return { rotateDismissed: value.rotateDismissed === true };
}

export const hintPref = createPref<HintPrefs>(HINT_KEY, { decode: decodeHint, encode: value => JSON.stringify(value) });
