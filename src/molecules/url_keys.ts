import { registerUrlKeys } from '../url_state';
import type { RootState, AppDispatch } from '../store';
import { setMode } from '../store/atomSlice';
import { MoleculeState, MoleculeSurface, Representation, linkRejected, selectMolecule, setRepresentation, setShowDipole } from '../store/moleculeSlice';
import { isJobKey } from './job_paths';

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

export function parseSurface(value: string | undefined): MoleculeSurface | undefined {
    if (value === 'density' || value === 'esp' || value === 'none') return { kind: value };
    const match = value?.match(/^mo:(\d{1,4})$/);
    return match ? { kind: 'mo', index: Number(match[1]) } : undefined;
}

function parseFlag(value: string | undefined): boolean | undefined {
    return value === '1' ? true : value === '0' ? false : undefined;
}

/**
 * `struct` (ruling P8, spec §9.4): `space` is space filling; `1` and `0` keep
 * their old meaning (ball and stick, none). Ball and stick, the default, is
 * written as no key at all.
 */
const STRUCT_VALUES: Readonly<Record<string, Representation>> = { 1: 'ball-and-stick', 0: 'none', space: 'space-filling' };
const STRUCT_KEYS: Readonly<Record<Representation, string | null>> = { 'ball-and-stick': null, none: '0', 'space-filling': 'space' };

function parseStruct(value: string | undefined): Representation | undefined {
    return value !== undefined && Object.hasOwn(STRUCT_VALUES, value) ? STRUCT_VALUES[value] : undefined;
}

export function encodeMoleculeUrl(state: MoleculeState): Record<string, string> {
    if (!state.selectedId) return {};
    // A computed molecule is linked by its job key under `job` (src/jobs/url_keys.ts), never as an id.
    const out: Record<string, string> = isJobKey(state.selectedId) ? {} : { id: state.selectedId };
    out.show = surfaceKey(state.surface);
    const struct = STRUCT_KEYS[state.representation];
    if (struct) out.struct = struct;
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
    const out: { id?: string; surface?: MoleculeSurface; representation?: Representation; dipole?: boolean } = {};
    if (params.id && ID.test(params.id)) out.id = params.id;
    const surface = parseSurface(params.show);
    if (surface && out.id) out.surface = surface;
    const representation = parseStruct(params.struct);
    if (representation !== undefined) out.representation = representation;
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
            if (decoded.representation !== undefined) dispatch(setRepresentation(decoded.representation));
            if (decoded.dipole !== undefined) dispatch(setShowDipole(decoded.dipole));
        },
    );
}
