import { createPref } from './local_pref';

/**
 * How the 3D view is drawn, as the viewer's own preference (spec §6.7):
 * localStorage only, never in a link. Glow is a finish of the solid surface,
 * so a link opens in the receiver's own finish. (Ruling R1 kept Wireframe in
 * the link's `surf`; owner R25-B1 removed the Wireframe option, so `surf`
 * always reads solid.)
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
     * Which inspector section is open (ruling R24-3: titled sections, one
     * open at a time) -- a section key ('display', 'plot', ...), or
     * INSPECTOR_ALL_FOLDED once the viewer has folded the open one. `null`
     * means the viewer has never chosen: the mode's content section opens
     * (Plot and data; Display where it is the only one). Supersedes
     * `displayOpen` (T20b-display-header, P16), which decodeDisplay migrates.
     */
    inspectorOpen: string | null;
    /** Ruling P9 (spec §9.4.1): bond lengths and angles drawn on the molecule; off by default, never in a link. */
    moleculeLabels: boolean;
}

/** inspectorOpen when the viewer has folded the open section and left every one folded (R24-3). */
export const INSPECTOR_ALL_FOLDED = '';

export const DISPLAY_KEY = 'eov.display';
export const DEFAULT_DISPLAY: DisplayPrefs = { showAxes: true, plotTab: 'distribution', inspectorOpen: null, moleculeLabels: false };
const PLOT_TABS: readonly PlotTabId[] = ['wave', 'density', 'distribution', 'rho'];

export function decodeDisplay(raw: string | null): DisplayPrefs {
    const value = parse(raw);
    return {
        showAxes: typeof value.showAxes === 'boolean' ? value.showAxes : DEFAULT_DISPLAY.showAxes,
        plotTab: PLOT_TABS.includes(value.plotTab as PlotTabId) ? value.plotTab as PlotTabId : DEFAULT_DISPLAY.plotTab,
        inspectorOpen: decodeInspectorOpen(value),
        moleculeLabels: value.moleculeLabels === true,
    };
}

/**
 * Ruling R24-3: a stored section key is the viewer's choice. A value stored
 * before it may carry `displayOpen` instead: true (Display kept open) is
 * 'display'; false (Display folded, the plot showing) is null -- the default,
 * which opens the content section, i.e. what that viewer saw.
 */
function decodeInspectorOpen(value: Record<string, unknown>): string | null {
    if (typeof value.inspectorOpen === 'string') return value.inspectorOpen;
    return value.displayOpen === true ? 'display' : DEFAULT_DISPLAY.inspectorOpen;
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
