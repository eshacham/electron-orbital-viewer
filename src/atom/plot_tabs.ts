import type { SerialisedAtomProfile } from '../workers/atomWorker';
import type { ViewLevel } from '../store/atomSlice';
import type { RadialCurve } from '../components/RadialPlot';
import type { PlotTabId } from '../design/presentation';
import { radialWaveFunction } from '../quantum_functions';
import { radialProfile, PLOT_SAMPLE_COUNT } from '../radial_distribution';
import { subshellLabel } from './configurations';

/**
 * The inspector's plot tabs (spec §9.1). Ruling R2: "Radial distribution"
 * keeps today's curves, title and CSV exactly; the other tabs carry exact
 * axis titles. Under scalar or spin–orbit relativity R(r) is the large
 * component (radial_solver/relativistic_solver: R = u/r, R = G/r), and says so.
 */
export interface PlotTab {
    id: PlotTabId;
    /** The tab's visible label: the curve's symbol, so three tabs share one line at 256 px (ruling T13-tablabels). */
    label: string;
    /** The tab's accessible name, which contains the visible label (WCAG 2.5.3). */
    name: string;
    title: string;
    caption: string | null;
    signed: boolean;
    /** The CSV's quantity line; null keeps today's D(r) statement. */
    csvQuantity: string | null;
}

const DISTRIBUTION: PlotTab = {
    id: 'distribution', label: 'D(r)', name: 'Radial distribution D(r)', title: 'Radial distribution D(r) = 4πr²ρ(r)', caption: null, signed: false, csvQuantity: null,
};

export function plotTabsFor(level: ViewLevel, isolatedSubshell: boolean, relativistic: boolean): PlotTab[] {
    if (level === 'orbital' || (level === 'shell' && isolatedSubshell)) {
        return [
            {
                id: 'wave', label: 'R(r)', name: 'Wave function R(r)', signed: true, caption: null,
                title: relativistic ? 'Wave function R(r), large component (a₀⁻³ᐟ²)' : 'Wave function R(r) (a₀⁻³ᐟ²)',
                csvQuantity: relativistic ? 'R(r), the radial wave function (large component), bohr^-3/2' : 'R(r), the radial wave function, bohr^-3/2',
            },
            // Under relativity R is the large component, so its square is not
            // the radial factor of |ψ|² (the small component is left out) and
            // says so, as the wave function tab does (ruling T13-relR2).
            relativistic ? {
                id: 'density', label: '|R|²', name: 'Probability density |R|²', signed: false,
                caption: 'large component only, not the whole |ψ|²',
                title: 'Probability density |R(r)|², large component (a₀⁻³)',
                csvQuantity: '|R(r)|^2 of the large component (the small component is not included), bohr^-3',
            } : {
                id: 'density', label: '|R|²', name: 'Probability density |R|²', signed: false, caption: 'radial factor of |ψ|²',
                title: 'Probability density |R(r)|² (a₀⁻³)', csvQuantity: '|R(r)|^2, the radial factor of |psi|^2, bohr^-3',
            },
            DISTRIBUTION,
        ];
    }
    return [
        {
            id: 'rho', label: 'ρ(r)', name: 'Density ρ(r)', signed: false, caption: null, title: 'Density ρ(r) = D(r)/4πr² (e/a₀³)',
            csvQuantity: 'rho(r) = D(r)/(4*pi*r^2), electrons per bohr^3',
        },
        DISTRIBUTION,
    ];
}

export function resolvePlotTab(tabs: PlotTab[], preferred: PlotTabId): PlotTab {
    return tabs.find(tab => tab.id === preferred) ?? tabs.find(tab => tab.id === 'distribution') ?? tabs[0];
}

/**
 * The plot's spoken names on a tab (ruling DC8): every tab but the radial
 * distribution is named for its own curve; that one keeps RadialPlot's
 * own names ("radial distribution", "probability against radius").
 */
export function plotAriaLabel(tab: PlotTab): { plot: string; image: string } | undefined {
    if (tab.id === 'distribution') return undefined;
    return { plot: `${tab.name} plot`, image: `${tab.title} against radius` };
}

export interface PlotCurveInputs {
    profile: SerialisedAtomProfile;
    selectedSubshell: { n: number; l: number; j?: number } | null;
    rGrid: number[];
    /** Today's curves (App's atomCurves): the distribution tab, and the colours and labels the others reuse. */
    distribution: RadialCurve[];
}

export function tabCurves(tab: PlotTabId, inputs: PlotCurveInputs): RadialCurve[] {
    const { profile, selectedSubshell, rGrid, distribution } = inputs;
    if (tab === 'distribution') return distribution;
    if (tab === 'rho') {
        return distribution.filter(curve => !curve.dashed).map(curve => ({
            ...curve,
            label: `${curve.label} · ρ(r)`,
            ...(curve.spokenLabel ? { spokenLabel: `${curve.spokenLabel}, rho` } : {}),
            points: curve.points.map(point => ({ r: point.r, value: point.r > 0 ? point.value / (4 * Math.PI * point.r * point.r) : 0 })),
        }));
    }
    const sub = selectedSubshell && profile.subshells.find(s => s.n === selectedSubshell.n && s.l === selectedSubshell.l && s.j === selectedSubshell.j);
    if (!sub) return [];
    const base = distribution.find(curve => !curve.dashed) ?? distribution[0];
    const square = tab === 'density';
    return [{
        label: `${base?.label ?? ''} · ${square ? '|R(r)|²' : 'R(r)'}`,
        ...(base?.spokenLabel ? { spokenLabel: `${base.spokenLabel}, ${square ? 'R squared' : 'R'}` } : {}),
        color: base?.color ?? '#4da3ff',
        points: rGrid.map((r, j) => ({ r, value: square ? sub.R[j] * sub.R[j] : sub.R[j] })),
    }];
}

/** Basic Orbitals' plot tabs (spec §9.2: "Plot tabs as §9.1"), always the orbital set, never relativistic. */
export const BASIC_PLOT_TABS: PlotTab[] = plotTabsFor('orbital', false, false);

export interface HydrogenicCurveInputs {
    n: number;
    l: number;
    /** Basic Orbitals mode is always hydrogen-like (orbital_presets.ts's BASIC_ORBITALS_Z). */
    Z: 1;
    rMax: number;
    /** The curve's colour, raw (not yet themed) -- the caller themes it exactly as every other curve (App.tsx's `themed`). */
    colour: string;
}

/**
 * The inspector's plot-tab curves for a single hydrogenic orbital (Basic
 * Orbitals mode). Unlike `tabCurves` above there is no solved SCF profile to
 * draw from: R(r) comes straight from the analytic `radialWaveFunction`, so
 * this needs only n, l and Z (mₗ does not affect the radial part). The
 * distribution tab reuses `radialProfile` -- today's curve exactly (ruling
 * R2) -- just reshaped into a `RadialCurve` so all three tabs share one
 * rendering path (spec §9.2).
 */
export function hydrogenicTabCurves(tab: PlotTabId, inputs: HydrogenicCurveInputs): RadialCurve[] {
    const { n, l, Z, rMax, colour } = inputs;
    const label = subshellLabel(n, l);
    if (tab === 'distribution') {
        return [{
            label: `${label} · D(r)`,
            color: colour,
            points: radialProfile(n, l, Z, rMax, PLOT_SAMPLE_COUNT).map(point => ({ r: point.r, value: point.probability })),
        }];
    }
    if (tab !== 'wave' && tab !== 'density') return [];
    const square = tab === 'density';
    const points = Array.from({ length: PLOT_SAMPLE_COUNT + 1 }, (_, i) => {
        const r = (rMax * i) / PLOT_SAMPLE_COUNT;
        const R = radialWaveFunction(n, l, r, Z);
        return { r, value: square ? R * R : R };
    });
    return [{ label: `${label} · ${square ? '|R(r)|²' : 'R(r)'}`, color: colour, points }];
}
