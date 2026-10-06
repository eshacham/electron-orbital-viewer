import { registerUrlKeys } from '../url_state';
import type { RootState, AppDispatch } from '../store';
import { setMode } from '../store/atomSlice';
import { MoleculeState, MoleculeSurface, linkRejected, selectMolecule, setShowDipole, setShowStructure } from '../store/moleculeSlice';

/**
 * Molecules mode in the URL (spec §4.3), e.g.
 * `#mode=molecule&id=h2o&show=mo:4&iso=0.9` -- the contour (`iso`→`frac`)
 * is Phase 2's shared key; only `id`, `show`, `struct` and `dipole` are
 * owned here. The id matches the loader's own `MOLECULE_ID` (loader.ts),
 * so a link this module accepts is always one `moleculePath` can resolve.
 */
const ID = /^[a-z0-9]+$/;

function surfaceKey(surface: MoleculeSurface): string {
    return surface.kind === 'mo' ? `mo:${surface.index}` : surface.kind;
}

function parseSurface(value: string | undefined): MoleculeSurface | undefined {
    if (value === 'density' || value === 'esp') return { kind: value };
    const match = value?.match(/^mo:(\d{1,4})$/);
    return match ? { kind: 'mo', index: Number(match[1]) } : undefined;
}

function parseFlag(value: string | undefined): boolean | undefined {
    return value === '1' ? true : value === '0' ? false : undefined;
}

export function encodeMoleculeUrl(state: MoleculeState): Record<string, string> {
    if (!state.selectedId) return {};
    const out: Record<string, string> = { id: state.selectedId, show: surfaceKey(state.surface) };
    if (!state.showStructure) out.struct = '0';
    if (!state.showDipole) out.dipole = '0';
    return out;
}

/**
 * Unknown or malformed values are dropped, never thrown on (spec §4.3).
 * A malformed `id` is dropped here too (this stays a pure, exception-free
 * parse) -- the caller distinguishes "no id given" from "a bad one was"
 * and dispatches `linkRejected` for the latter (spec §3.5: an explicit
 * message, never a blank picture; ruling T12-a).
 */
export function decodeMoleculeUrl(params: Record<string, string>) {
    const out: { id?: string; surface?: MoleculeSurface; structure?: boolean; dipole?: boolean } = {};
    if (params.id && ID.test(params.id)) out.id = params.id;
    const surface = parseSurface(params.show);
    if (surface && out.id) out.surface = surface;
    const structure = parseFlag(params.struct);
    if (structure !== undefined) out.structure = structure;
    const dipole = parseFlag(params.dipole);
    if (dipole !== undefined) out.dipole = dipole;
    return out;
}

export function registerMoleculeUrlKeys(): void {
    registerUrlKeys(
        'molecule',
        (state: RootState) => encodeMoleculeUrl(state.molecule),
        (params: URLSearchParams, dispatch: AppDispatch) => {
            // A mode's own decoder switches to it (Phase 2's convention).
            dispatch(setMode('molecule'));
            const raw = Object.fromEntries(params);
            const decoded = decodeMoleculeUrl(raw);
            if (decoded.id) {
                dispatch(selectMolecule({ id: decoded.id, surface: decoded.surface }));
            } else if (raw.id) {
                // Present but rejected by ID -- a blank Molecules screen would
                // hide that the link named something; no id at all is just
                // the mode's own empty state (spec §3.5; ruling T12-a).
                dispatch(linkRejected(raw.id));
            }
            if (decoded.structure !== undefined) dispatch(setShowStructure(decoded.structure));
            if (decoded.dipole !== undefined) dispatch(setShowDipole(decoded.dipole));
        },
    );
}
