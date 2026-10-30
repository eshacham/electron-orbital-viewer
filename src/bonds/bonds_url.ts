import { registerUrlKeys } from '../url_state';
import type { AppDispatch, RootState } from '../store';
import { setMode } from '../store/atomSlice';
import { BondsView, restoreBonds } from '../store/bondsSlice';
import { OrbitalSpin } from '../molecules/types';
import { isBondsSystemId, snapH2PlusR } from './systems';
import { H2PLUS_R_RANGE } from './h2plus';
import type { LinkCorrection } from '../link_corrections';

/**
 * Bonds mode in the URL (spec §4.3): `system`, `R` (bohr) and `state` --
 * exactly the keys Phase 7's lessons write, e.g.
 * `#mode=bonds&system=h2plus&R=2&state=1sigma_u`. The density's contour
 * rides inside `state` (`density:0.05`) rather than adding a fourth key.
 */
const MO_LABEL = /^\d+[σπδ][gu]?\*?$/;
const SPINS: readonly OrbitalSpin[] = ['restricted', 'alpha', 'beta'];

function stateToken(view: BondsView, densityIso: number): string {
    if (view.kind === 'h2plus') return view.state;
    if (view.kind === 'density') return `density:${densityIso}`;
    return `mo:${view.spin}:${view.label}:${view.component}`;
}

function parseState(token: string | null): { view?: BondsView; densityIso?: number } {
    if (token === '1sigma_g' || token === '1sigma_u') return { view: { kind: 'h2plus', state: token } };
    if (token === 'density') return { view: { kind: 'density' } };
    const parts = token?.split(':') ?? [];
    if (parts.length === 2 && parts[0] === 'density') {
        const iso = Number(parts[1]);
        return { view: { kind: 'density' }, densityIso: Number.isFinite(iso) ? iso : undefined };
    }
    if (parts.length !== 4 || parts[0] !== 'mo') return {};
    const [, spin, label, component] = parts;
    if (!SPINS.includes(spin as OrbitalSpin) || !MO_LABEL.test(label) || !/^[01]$/.test(component)) return {};
    return { view: { kind: 'mo', spin: spin as OrbitalSpin, label, component: Number(component) } };
}

export function encodeBondsUrl(state: RootState): Record<string, string> {
    const { system, R, view, densityIso } = state.bonds;
    // Insertion order is the hash's own key order (url_state's encodeStateOf
    // just walks Object.entries): system, R, state, matching the doc comment
    // above and the literal links this module's own tests and the brief's
    // live-verify step read.
    const keys: Record<string, string> = { system };
    if (R !== null) keys.R = R.toFixed(3);
    keys.state = stateToken(view, densityIso);
    return keys;
}

/**
 * Unknown or invalid keys are ignored (spec §4.3); the slice clamps R and checks every view. Final polish F1: an H₂⁺
 * R past the slider's range, which the slice holds at its end, is returned as a correction for the notice to say.
 */
export function decodeBondsUrl(params: URLSearchParams, dispatch: AppDispatch): LinkCorrection[] {
    const system = params.get('system');
    if (!isBondsSystemId(system)) return [];
    const askedR = params.get('R');
    const R = Number(askedR ?? Number.NaN);
    const { view, densityIso } = parseState(params.get('state'));
    dispatch(setMode('bonds'));
    dispatch(restoreBonds({ system, R: Number.isFinite(R) && R > 0 ? R : null, view, densityIso }));
    const pastRange = system === 'h2plus' && Number.isFinite(R) && R > 0 && (R < H2PLUS_R_RANGE.min || R > H2PLUS_R_RANGE.max);
    return pastRange ? [{ field: 'R', asked: askedR!, used: `R = ${snapH2PlusR(R)!.toFixed(2)} a₀` }] : [];
}

export function registerBondsUrlKeys(): void {
    registerUrlKeys('bonds', encodeBondsUrl, decodeBondsUrl);
}
