import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { H2PlusState, H2PLUS_STATES } from '../bonds/h2plus';
import { BondsSystemId, DENSITY_ISO_VALUES, isBondsSystemId, snapH2PlusR } from '../bonds/systems';
import { OrbitalSpin } from '../molecules/types';

/**
 * Bonds mode's selection. What is loaded for it (scan, meta, basis) is not
 * kept here -- it is large and lives in useBondsData's cache -- only what
 * the user chose. A molecule's R is the snapped scan point's; `R: null`
 * means "snap to the equilibrium once the scan is known", a number with
 * `scanIndex: null` means "snap to the point nearest this" (a restored URL).
 * H₂⁺'s R is always on its slider (snapH2PlusR), so nothing here can hand
 * the exact solver an R it refuses.
 */
export type BondsView =
    | { kind: 'h2plus'; state: H2PlusState }
    /** By label, not index, so sliding R keeps "3σg" even where orbitals reorder. */
    | { kind: 'mo'; label: string; spin: OrbitalSpin; component: number }
    | { kind: 'density' };

export interface BondsState {
    system: BondsSystemId;
    R: number | null;
    scanIndex: number | null;
    view: BondsView;
    /** e/a₀³: the ρ a density surface is drawn at (ruling T7-a), one of DENSITY_ISO_VALUES. */
    densityIso: number;
}

const H2PLUS_DEFAULT_R = 2;

const initialState: BondsState = {
    system: 'h2plus', R: H2PLUS_DEFAULT_R, scanIndex: null, view: { kind: 'h2plus', state: '1sigma_g' }, densityIso: DENSITY_ISO_VALUES[0],
};

const SPINS: readonly OrbitalSpin[] = ['restricted', 'alpha', 'beta'];

/** H₂⁺ shows only its own two states; a molecule its orbitals or its density. A link can carry anything, so the shape is checked too. */
function viewFits(system: BondsSystemId, view: BondsView): boolean {
    if (system === 'h2plus') return view.kind === 'h2plus' && H2PLUS_STATES.includes(view.state);
    if (view.kind === 'density') return true;
    return view.kind === 'mo' && typeof view.label === 'string' && view.label !== ''
        && SPINS.includes(view.spin) && Number.isInteger(view.component) && view.component >= 0;
}

const isDensityIso = (value: number) => (DENSITY_ISO_VALUES as readonly number[]).includes(value);

function choose(state: BondsState, system: BondsSystemId): void {
    state.system = system;
    state.scanIndex = null;
    if (system === 'h2plus') {
        // Back from a molecule, H₂⁺ starts at the R just shown, on its own slider.
        state.R = snapH2PlusR(state.R ?? H2PLUS_DEFAULT_R) ?? H2PLUS_DEFAULT_R;
        state.view = { kind: 'h2plus', state: '1sigma_g' };
    } else {
        state.R = null;
        state.view = { kind: 'density' };
    }
}

const bondsSlice = createSlice({
    name: 'bonds',
    initialState,
    reducers: {
        selectBondsSystem: (state, action: PayloadAction<BondsSystemId>) => {
            if (isBondsSystemId(action.payload)) choose(state, action.payload);
        },
        setH2PlusR: (state, action: PayloadAction<number>) => {
            const R = snapH2PlusR(action.payload);
            if (state.system === 'h2plus' && R !== null) state.R = R;
        },
        /**
         * A molecule's R, from its loaded scan. `system` names the molecule the
         * scan belongs to: a scan that lands after the user has picked another
         * molecule must not snap that one to its points.
         */
        setScanPoint: (state, action: PayloadAction<{ system?: BondsSystemId; index: number; RBohr: number }>) => {
            const { system, index, RBohr } = action.payload;
            if (state.system === 'h2plus' || (system !== undefined && system !== state.system)) return;
            if (!Number.isInteger(index) || index < 0 || !(RBohr > 0) || !Number.isFinite(RBohr)) return;
            state.scanIndex = index;
            state.R = RBohr;
        },
        setBondsView: (state, action: PayloadAction<BondsView>) => {
            if (viewFits(state.system, action.payload)) state.view = action.payload;
        },
        setDensityIso: (state, action: PayloadAction<number>) => {
            if (isDensityIso(action.payload)) state.densityIso = action.payload;
        },
        /** A shared link. Whatever does not fit is ignored, never thrown on, like every other key. */
        restoreBonds: (state, action: PayloadAction<{ system: BondsSystemId; R: number | null; view?: BondsView; densityIso?: number }>) => {
            const { system, R, view, densityIso } = action.payload;
            if (!isBondsSystemId(system)) return;
            choose(state, system);
            if (R !== null && Number.isFinite(R) && R > 0) state.R = system === 'h2plus' ? snapH2PlusR(R) : R;
            if (view && viewFits(system, view)) state.view = view;
            if (densityIso !== undefined && isDensityIso(densityIso)) state.densityIso = densityIso;
        },
    },
});

export const { selectBondsSystem, setH2PlusR, setScanPoint, setBondsView, setDensityIso, restoreBonds } = bondsSlice.actions;
export default bondsSlice.reducer;
