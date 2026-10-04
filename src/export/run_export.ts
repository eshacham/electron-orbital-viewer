import type { RootState } from '../store';
import type { ViewMode } from '../store/atomSlice';
import { selectionProblem } from '../combinations';
import { hydrogenicSource } from '../field_source';
import { ORBITAL_RESOLUTION, BASIC_ORBITALS_Z } from '../orbital_presets';
import { subshellSpokenLabel } from '../atom/configurations';
import { buildComparisonCurves } from '../atom/comparison_curves';
import type { SerialisedAtomProfile } from '../workers/atomWorker';
import { profileRelativity, pictureLanded } from '../store/atomSlice';
import { CsvCurve, formatNumber, radialCurvesToCsv } from './csv';
import {
    exportFileStem, methodStatement, shellLabel, viewDescription, referenceRingCaption, deltaScfCsvComment, jLevelShapeCaption,
    bondsDrawnPicture,
} from './caption';
import { CombinationLegendItem } from './png';
import { ViewerExportHandle } from './handle';
import { encodeStl } from './stl';
import { encodeGlb } from './gltf';
import { CubeAtom } from './cube';
import { CubeJob, CubeWorkerHandle, requestCube } from './cube_request';
import { H2PLUS_LABELS } from '../bonds/h2plus';
import { bondsCaptions, signed } from '../bonds/captions';
import { H_PLUS_H_PLUS_HARTREE } from '../bonds/curve';
// H2PlusCurve as a type only: bonds/useH2PlusCurve.ts also pulls in
// createH2PlusCurveWorker.ts's `new Worker(new URL(...), import.meta.url)`,
// a worker-bundling construct Jest cannot parse; a type-only import is
// erased at compile time, so this module never actually loads it.
import type { H2PlusCurve } from '../bonds/useH2PlusCurve';
import { BOHR_TO_ANGSTROM, DiatomicId, HARTREE_TO_EV, pointId, systemFormula } from '../bonds/systems';
import type { MoleculeBasis, MoleculeMeta, MoleculeScan } from '../molecules/types';

export type ExportKind = 'png' | 'png-plain' | 'csv' | 'stl' | 'glb' | 'cube';

export interface ExportItem { kind: ExportKind; label: string; detail: string; }

/** Menu order. Each later format adds its entry here. */
export const EXPORT_ITEMS: ExportItem[] = [
    { kind: 'png', label: 'Image (PNG, 2×)', detail: 'with caption, scale bar and colour key' },
    { kind: 'png-plain', label: 'Image (PNG, 2×), view only', detail: 'no overlays' },
    { kind: 'csv', label: 'Radial curves (CSV)', detail: 'the plotted curves, every sample' },
    { kind: 'glb', label: '3D model (glTF .glb)', detail: 'colours kept — slides and AR' },
    { kind: 'stl', label: '3D print (STL)', detail: 'each solid watertight, in millimetres' },
    { kind: 'cube', label: 'Field grid (Gaussian cube)', detail: 'the sampled ψ or ρ, in bohr — for VMD, VESTA, Avogadro' },
];

/**
 * Fix round 1 (M5): Bonds' CSV is the potential curve E(R), not a radial
 * curve -- the menu item's own label should say so, not borrow the
 * atom/Basic Orbitals wording. Every other kind's label is mode-independent.
 */
export function exportItemsFor(mode: ViewMode): ExportItem[] {
    if (mode !== 'bonds') return EXPORT_ITEMS;
    return EXPORT_ITEMS.map(item => (item.kind === 'csv' ? { ...item, label: 'Potential curve (CSV)' } : item));
}

export interface ExportOptions { longestSideMm?: number; }

export interface ExportContext extends ExportOptions {
    state: RootState;
    /** Written into files, so a file says which view it came from. */
    shareUrl: string;
    csvCurves: CsvCurve[];
    /** The 3D view's capture handle, set once OrbitalViewer has mounted. */
    handle?: ViewerExportHandle | null;
    /** Whether the on-screen ψ-sign key is showing (App.tsx's showPhaseLegend). */
    phaseLegend?: boolean;
    /** Ruling C5: App's combination colour key, when one is on screen instead. */
    combinationLegend?: CombinationLegendItem[] | null;
    /** Builds the cube worker; absent before App has wired it up (structurally, see App.tsx). */
    createCubeWorker?: () => CubeWorkerHandle;
    /**
     * Bonds mode (ruling C5, Task 13b): the molecule data behind the drawn
     * picture, fetched outside Redux (bondsSlice's own comment: "large,
     * lives in useBondsData's cache") -- `bondsScan` for the potential
     * curve, the multireference caveat and D_e/R_e; `bondsMeta` for the
     * cube's atoms (Z, since MoleculeBasis carries only positions). Each is
     * accepted only once its own id matches the *drawn* system/basis
     * (`bondsDrawnPicture`, caption.ts) -- fix round 1 (I1): a scan/meta
     * fetched for a newly-selected molecule must not be read onto the
     * previous one's still-showing picture. Absent outside Bonds mode, or
     * null while still loading.
     */
    bondsScan?: MoleculeScan | null;
    bondsMeta?: MoleculeMeta | null;
    /** Fix round 1 (I2): the live plot's own cached curve (useH2PlusCurve) -- the CSV must not re-solve it on the main thread. */
    h2plusCurve?: H2PlusCurve | null;
    /**
     * Fix round 1 (I1): `useBondsData`'s own loading/error, mirrored into
     * `exportAvailability` the same way `atomPictureReason` reads
     * `state.atom.unbound` -- a verdict is shown in the store's own words,
     * not the generic "waiting" reason, which would read as if trying again
     * later would help.
     */
    bondsLoading?: boolean;
    bondsError?: string | null;
}

export interface ExportResult { blob: Blob; filename: string; }

/** null: available. Otherwise the reason, shown in the menu (spec §3.5). */
export type ExportAvailability = Record<ExportKind, string | null>;

/**
 * The two refusal reasons this task introduces. Exported so later export
 * kinds (STL, glTF, cube -- ruling R1) give the same wording for the same
 * situation rather than each inventing their own string.
 */
export const WAITING_FOR_ATOM_REASON = 'Waiting for the atom to finish solving.';
export const NOTHING_DRAWN_REASON = 'Nothing is drawn yet.';
/** Before OrbitalViewer has mounted and filled the export handle. */
export const VIEW_NOT_READY_REASON = 'The 3D view is not ready yet.';
/**
 * I3: `drawnReason` alone says whether *something* is on screen, not
 * whether it is the *current* something -- `startOrbitalCalculation` /
 * `startFieldCalculation` / `solveStarted` all set the new request into the
 * store at once, before the worker (or the SCF solve) actually finishes, so
 * a caption built from state can already name the new view while the
 * canvas is still showing the old one underneath it.
 */
export const PICTURE_BUSY_REASON = 'Wait for the picture to finish computing.';

export const RENDER_FAILED_REASON = 'The last picture failed to compute; nothing to export.';

/**
 * Fix round 1 (I1): shown whenever the drawn Bonds picture does not match
 * the panel's current selection (a molecule or point switch whose new
 * picture has not landed yet) or `useBondsData` is still loading -- the same
 * "stale picture, new selection" situation atom mode's `atomPictureReason`
 * already guards against for a relativity switch.
 */
export const BONDS_LOADING_REASON = 'Wait for the molecule to load.';
/** Fix round 1 (I2): the H2+ CSV needs the live plot's cached curve (ExportContext.h2plusCurve), never a main-thread re-solve. */
export const H2PLUS_CURVE_NOT_READY_REASON = 'The potential curve is still computing.';

/** Final review I2: a shell view whose lobes failed is not the picture its caption names. */
export const COMPOSITION_FAILED_REASON = 'This shell\'s orbital lobes failed to compute, so the picture is incomplete.';

/**
 * Atom mode's own refusals, shared by every export kind: a verdict, no
 * picture yet, or (final review M5) the previous mode's picture still up
 * while a relativity switch re-solves (ruling C9). That picture is real,
 * and its captions would name its own mode -- but the view link every file
 * embeds already names the new one, so file and link would disagree.
 */
function atomPictureReason(state: RootState): string | null {
    // Task 12b (ruling C4): an unbound anion -- or, since ruling T7-b,
    // an excitation whose promoted electron LDA does not bind -- is a
    // verdict (spec §3.5), not a solve still in progress -- every export must say so in the
    // store's own words, never the generic "waiting" reason, which
    // would read as if trying again later would help.
    if (state.atom.unbound) return state.atom.unbound;
    if (!state.atom.profile) return WAITING_FOR_ATOM_REASON;
    return pictureLanded(state.atom) ? null : PICTURE_BUSY_REASON;
}

function drawnReason(state: RootState): string | null {
    if (state.atom.mode === 'atom') {
        const picture = atomPictureReason(state);
        if (picture) return picture;
        // Atom mode's level 3 renders through the same orbital request as
        // Basic Orbitals, so a failed one leaves nothing on screen either.
        // The shell levels draw from the profile; a stale flag from an
        // orbital left behind must not refuse them.
        return state.atom.level === 'orbital' && state.orbital.renderFailed ? RENDER_FAILED_REASON : null;
    }
    // Ruling C10: a combination Phase 1 refuses (selectionProblem) says why
    // it refused, not the generic "nothing is drawn" -- the picker already
    // knows the reason, and the export menu should say the same thing.
    const combination = state.orbital.combination;
    const problem = combination.kind !== 'none' ? selectionProblem(combination) : null;
    if (problem) return problem;
    // M3: startOrbitalCalculation/startFieldCalculation set currentParams/
    // currentField before the render finishes, and failOrbitalCalculation
    // does not clear them back out -- so a request that failed still reads
    // as "drawn" by the check below unless this catches it first. There is
    // nothing on screen for a failed request to have left behind.
    if (state.orbital.renderFailed) return RENDER_FAILED_REASON;
    return state.orbital.currentParams || state.orbital.currentField ? null : NOTHING_DRAWN_REASON;
}

/**
 * I3: CSV's curves are read fresh off the store at click time (App's
 * csvCurvesNow), so a mid-flight request only ever produces up-to-date
 * numbers or (via `drawnReason`) a refusal -- there is no stale-picture
 * risk for it to guard against. A PNG instead photographs whatever the
 * canvas currently shows, which lags the store during a fresh
 * computation, so it additionally refuses while one is in flight.
 */
function pngReason(state: RootState): string | null {
    const drawn = drawnReason(state);
    if (drawn) return drawn;
    const { orbital, atom } = state;
    // Final review I2: the shell's lobes are built after the shell view is
    // up, with no orbital request in flight -- OrbitalViewer reports the
    // build itself. Only at the shell level: a stale flag must not refuse
    // another level, which has no lobes to have lost.
    if (atom.mode === 'atom' && atom.level === 'shell' && orbital.compositionFailed) return COMPOSITION_FAILED_REASON;
    // M9: a level transition is two pictures blending, neither of them the one named.
    const busy = orbital.isLoading || atom.isSolving || orbital.compositionBusy || orbital.levelTransition;
    return busy ? PICTURE_BUSY_REASON : null;
}

export const WHOLE_ATOM_GEOMETRY_REASON = 'The whole-atom view is a shaded cut face, not a surface. Open a shell or an orbital to export geometry.';

/**
 * STL and glTF take the surfaces in the scene, so they refuse exactly when a
 * PNG would -- nothing drawn, or a new picture still on its way while the
 * old one's meshes are still up -- and also at the whole-atom level, whose
 * picture is a shaded cut face with no surface behind it.
 */
function geometryReason(state: RootState): string | null {
    // Ruling C4: checked before the whole-atom-view refusal below -- an
    // unbound anion is always at the whole-atom level (no profile ever
    // lands to drill down into), and its own message must win over the
    // generic "this view has no surface" one.
    if (state.atom.mode === 'atom' && state.atom.unbound) return state.atom.unbound;
    if (state.atom.mode === 'atom' && state.atom.level === 'atom') return WHOLE_ATOM_GEOMETRY_REASON;
    return pngReason(state);
}

/** Review Focus 4: an overlay of several members in one picture cannot become one grid. */
export const CUBE_OVERLAY_REASON = 'An overlay is several fields in one picture; pick one member to export its grid.';
/** The surface being sampled -- atom levels 1-2's radial curve is always ready once solved, so only the field/orbital path needs a busy reason. */
export const CUBE_BUSY_REASON = 'The surface is still being computed.';

/**
 * Ruling R1: cubeJobFor reuses viewDescription's shell/subshell labels
 * rather than re-deriving them; Review Focus 4: a multi-member overlay
 * (hybrids "All", Stark "Both") and anything not yet drawn/busy give a
 * stated reason, reusing drawnReason's own wording and reason constants
 * where the situation matches it exactly.
 */
export function cubeReason(state: RootState): string | null {
    if (state.atom.mode === 'atom' && state.atom.level !== 'orbital') {
        // Ruling C4: an unbound anion's own message, not WAITING_FOR_ATOM_REASON.
        // setElement nulls the profile unconditionally (see atomSlice), so
        // a species change is "no profile yet"; a relativity switch keeps
        // the old picture, which atomPictureReason refuses (M5).
        return atomPictureReason(state);
    }
    const reason = drawnReason(state);
    if (reason) return reason;
    const { currentField, isLoading } = state.orbital;
    if (isLoading) return CUBE_BUSY_REASON;
    if (currentField && currentField.sources.length !== 1) return CUBE_OVERLAY_REASON;
    return null;
}

/**
 * A molecule's two nuclei, Z and position in bohr (brief, requirement 4),
 * from `meta.atoms`: `basis.atoms` has the same positions but no Z
 * (MoleculeBasis carries no element data, only the Gaussian functions), so
 * the cube needs the meta alongside the basis. Fix round 1 (M4): accepted
 * only when `meta.id === basis.id` exactly -- the drawn basis' own id, e.g.
 * 'n2@07' -- not merely a matching atom count, which a *different* scan
 * point of the same molecule (or a coincidentally-sized different molecule)
 * would also pass.
 */
function moleculeCubeAtoms(basis: MoleculeBasis, meta: MoleculeMeta | null | undefined): CubeAtom[] | null {
    if (!meta || meta.id !== basis.id) return null;
    return meta.atoms.map(a => ({ Z: a.Z, position: a.position }));
}

/**
 * The drawn Bonds picture as a cube job (ruling C5, Task 13b): H₂⁺'s ψ with
 * both protons at ±R/2 (there is no basis to carry them), or a diatomic's
 * MO/density ψ/ρ with both nuclei from `meta` and its basis registered for
 * the worker (`bases`, since the worker has no registry of its own -- see
 * cube_request.ts). `fieldCubeGrid` (cube.ts) squares a 'gaussianDensity'
 * recipe's √ρ samples back to ρ; this only writes the description that says
 * so. Built from `bondsDrawnPicture` throughout (fix round 1, I1): the same
 * function `exportAvailability` used to refuse a stale picture, so the
 * system this reads can never be the panel's newer selection.
 */
function bondsCubeJob(state: RootState, title: string, scan: MoleculeScan | null | undefined, meta: MoleculeMeta | null | undefined): CubeJob {
    const drawn = bondsDrawnPicture(state);
    if (!drawn) throw new Error(NOTHING_DRAWN_REASON);
    const field = state.orbital.currentField!;
    const source = field.sources[0];
    const resolution = field.resolution;
    const method = methodStatement(state, scan);
    const { picture } = drawn;
    if (picture.kind === 'h2plus') {
        const half = drawn.R / 2;
        const atoms: CubeAtom[] = [{ Z: 1, position: [0, 0, -half] }, { Z: 1, position: [0, 0, half] }];
        return {
            type: 'fieldCube', source, resolution, atoms, title,
            description: `psi(x,y,z), real, bohr^-3/2, H2+ ${H2PLUS_LABELS[picture.state]}, on the grid as drawn; ${method}; lengths in bohr`,
        };
    }
    const basis = drawn.basis;
    if (!basis) throw new Error('No basis available for this molecule export.');
    const atoms = moleculeCubeAtoms(basis, meta);
    if (!atoms) throw new Error('Molecule data is not available for this export yet.');
    if (picture.kind === 'mo') {
        const spin = picture.orbital.spin !== 'restricted' ? ` (${picture.orbital.spin})` : '';
        // Fix round 1 (M1): names which half of a degenerate pair this is,
        // matching the file stem's own '-1'/'-2' suffix.
        const component = picture.componentCount > 1 ? ` (component ${picture.component + 1} of ${picture.componentCount})` : '';
        return {
            type: 'fieldCube', source, resolution, atoms, bases: [basis], title,
            description: `psi(x,y,z), real, bohr^-3/2, ${picture.orbital.label}${spin}${component} molecular orbital, on the grid as drawn; ${method}; lengths in bohr`,
        };
    }
    return {
        type: 'fieldCube', source, resolution, atoms, bases: [basis], title,
        description: `rho(x,y,z), total electron density, electrons/bohr^3, on the grid as drawn; ${method}; lengths in bohr`,
    };
}

/**
 * What the view shows, as a cube job: the drawn ψ (a field source, resampled
 * exactly as it was drawn), or ρ(r) = D(r)/(4πr²) of what the cut face shows
 * at atom levels 1-2 (design decisions, "the cube file is resampled on
 * demand"). `bonds` is Bonds mode's own extra context (ExportContext's
 * `bondsScan`/`bondsMeta`, ruling C5) -- absent, every other mode ignores it.
 */
export function cubeJobFor(state: RootState, bonds?: { scan?: MoleculeScan | null; meta?: MoleculeMeta | null }): CubeJob {
    const title = `electron-orbital-viewer: ${viewDescription(state)}`;
    const atom = state.atom;
    if (atom.mode === 'bonds') return bondsCubeJob(state, title, bonds?.scan, bonds?.meta);
    if (atom.mode === 'atom' && atom.level !== 'orbital' && atom.profile) {
        const profile = atom.profile;
        const sub = atom.selectedSubshell;
        // j too: with spin–orbit (n, l) is two j-levels with their own
        // densities, and the selection names one of them.
        const subshell = atom.level === 'shell' && sub
            ? profile.subshells.find(s => s.n === sub.n && s.l === sub.l && s.j === sub.j)
            : undefined;
        const shell = atom.level === 'shell' ? profile.shells.find(s => s.n === atom.selectedShell) : undefined;
        // The cube header stays plain ASCII: a j-level reads "6p j = 3/2", not "6p³⁄₂".
        const what = subshell ? `${subshellSpokenLabel(subshell.n, subshell.l, subshell.j)} subshell` : shell ? shellLabel(shell.n) : 'total';
        // Task 12b (ruling C7), final review M4: every relativistic curve
        // counts the small component, G^2 + F^2 (atom_profile's
        // subshellCurveOf: the scalar equation's Q as well as the Dirac F),
        // not the plain |R|^2 an off curve holds -- said here so the file
        // does not read as the ordinary radial density. A j-level's curve is
        // also that one j-level's alone, which the note names. Off: none.
        const relativistic = profileRelativity(profile) !== 'off';
        const jNote = !relativistic ? null
            : subshell?.j !== undefined ? 'j-level density, G^2 + F^2' : 'density with the small component, G^2 + F^2';
        // Task 12b: an ion or excited atom's whole-atom cube also names the
        // dashed neutral-comparison ring, same as the PNG caption and CSV
        // comments (ruling C4) -- null for anything that draws no such ring.
        const ring = referenceRingCaption(state);
        return {
            type: 'radialCube',
            curve: { D: subshell?.curve ?? shell?.curve ?? profile.total, rMin: profile.rMin, dx: profile.dx, size: profile.size },
            resolution: ORBITAL_RESOLUTION,
            atoms: [{ Z: profile.Z, position: [0, 0, 0] }],
            title,
            // Carry from Task 12: features finer than the grid spacing (a
            // heavy atom's 1s) are not resolved. Task 12b: the method line
            // is the drawn profile's own (methodStatement), never the
            // non-relativistic ATOM_METHOD for a relativistic picture.
            description: `rho(r) = D(r)/(4 pi r^2), ${what} electron density, electrons/bohr^3, box enclosing 99.9%, finer features (e.g. a heavy atom's 1s) not resolved`
                + `${jNote ? `; ${jNote}` : ''}; ${methodStatement(state)}${ring ? `; ${ring}` : ''}; lengths in bohr`,
        };
    }
    const { currentParams, currentField } = state.orbital;
    const source = currentField ? currentField.sources[0] : hydrogenicSource(currentParams!);
    const resolution = currentField ? currentField.resolution : currentParams!.resolution;
    // currentParams carries the real Z (a solved profile's, at atom mode's
    // level 3); a combination's sources are always hydrogen's own.
    const Z = currentParams?.Z ?? BASIC_ORBITALS_Z;
    // Task 12b (ruling C7, Task 10 carry M4): with spin–orbit, atom mode's
    // level-3 orbital is drawn as the j-level's R(r) times the plain l-basis
    // real spherical harmonic -- the large component only, not the true
    // |j, m_j> angular shape (spec §3.6) -- so the cube says so rather than
    // reading as the full relativistic wavefunction.
    // A scalar-relativistic orbital is a genuine l state, but its small
    // component Q is dropped from the drawn psi too: "large component" alone.
    const atomOrbital = atom.mode === 'atom' && atom.level === 'orbital';
    const drawnMode = atom.profile ? profileRelativity(atom.profile) : 'off';
    const jLevelNote = atomOrbital && atom.selectedOrbital?.j !== undefined
        ? 'large component, l-basis angular part'
        : atomOrbital && drawnMode === 'scalar' ? 'large component' : null;
    return {
        type: 'fieldCube', source, resolution, atoms: [{ Z, position: [0, 0, 0] }], title,
        description: `psi(x,y,z), real, bohr^-3/2, on the grid as drawn; ${methodStatement(state)}${jLevelNote ? `; ${jLevelNote}` : ''}; lengths in bohr`,
    };
}

/**
 * Atom mode's curves come from the solved profile at every level -- at the
 * orbital level too, where the plot is the subshell's D(r) -- so a failed 3D
 * render there leaves them intact, and only a missing profile refuses them.
 * Basic Orbitals plots the orbital or combination drawn, so it refuses
 * exactly when nothing is.
 */
function csvReason(state: RootState): string | null {
    if (state.atom.mode === 'atom') {
        // Ruling C4: an unbound anion's own message, not WAITING_FOR_ATOM_REASON.
        return atomPictureReason(state);
    }
    return drawnReason(state);
}

/**
 * Fix round 1 (I1): the drawn picture can be a step behind the panel's
 * selection -- a molecule switch, or a scan-point slide, whose new render
 * has not landed (or failed to) -- and every Bonds export must refuse
 * rather than read the method/CSV/cube off the *new* selection while the
 * canvas (and `bondsDrawnPicture`) still show the old one. Checked in this
 * order, the same shape as `atomPictureReason`: a load error is a verdict,
 * shown in the store's own words; "still loading" and "selection ahead of
 * the picture" both read the same generic reason, since either will resolve
 * once the fetch catches up. Null (nothing to block) falls through to the
 * ordinary nothing-drawn/busy/failed reasons below, which already handle
 * "nothing drawn at all" (the very first load, before anything has landed).
 */
function bondsBlockReason(state: RootState, bondsLoad?: { loading: boolean; error: string | null }): string | null {
    if (bondsLoad?.error) return bondsLoad.error;
    if (bondsLoad?.loading) return BONDS_LOADING_REASON;
    const drawn = bondsDrawnPicture(state);
    if (!drawn) return null;
    const bonds = state.bonds;
    if (drawn.system !== bonds.system) return BONDS_LOADING_REASON;
    if (bonds.system !== 'h2plus' && bonds.scanIndex !== null
        && drawn.moleculeId !== pointId(bonds.system as DiatomicId, bonds.scanIndex)) {
        return BONDS_LOADING_REASON;
    }
    return null;
}

// Task 13b (ruling C5): Bonds no longer refuses every kind outright --
// `drawnReason` and friends already read `state.orbital.currentField`/
// `isLoading`/`renderFailed` generically (a Bonds request is a single-source
// `currentField`, exactly like a Basic Orbitals combination's), so beyond
// `bondsBlockReason` above (fix round 1, I1) nothing else is Bonds-specific:
// nothing drawn, loading or failed give the same stated reasons every other
// mode gets. `bondsLoad` is Bonds' own extra context (`useBondsData`'s
// loading/error, not in Redux); every other mode ignores it.
export function exportAvailability(state: RootState, bondsLoad?: { loading: boolean; error: string | null }): ExportAvailability {
    if (state.atom.mode === 'bonds') {
        const reason = bondsBlockReason(state, bondsLoad);
        if (reason) return { png: reason, 'png-plain': reason, csv: reason, stl: reason, glb: reason, cube: reason };
    }
    const png = pngReason(state);
    const geometry = geometryReason(state);
    return { png, 'png-plain': png, csv: csvReason(state), stl: geometry, glb: geometry, cube: cubeReason(state) };
}

/** The shared log grid a profile's curves are sampled on -- the same formula App.tsx's atomRGrid uses, so a comparison curve built here lines up exactly with the already-plotted columns it is appended beside (radialCurvesToCsv requires identical radii across every column). */
function profileRGrid(profile: Pick<SerialisedAtomProfile, 'rMin' | 'dx' | 'size'>): number[] {
    return Array.from({ length: profile.size }, (_, j) => profile.rMin * Math.exp(j * profile.dx));
}

/**
 * H₂⁺'s exact potential curve, both states -- the live plot's own cached
 * curve (`context.h2plusCurve`, `useH2PlusCurve`), never re-solved here
 * (fix round 1, I2: the full range is ~1 s of eigenproblems, not something
 * to do on the main thread during a user-initiated export when the hook has
 * almost certainly already solved it). The equilibrium comment (fix round 1,
 * M3) is the curve's own `equilibrium`, the same number the plot's dotted
 * line states (bonds/curve.ts's `h2plusCurveSpec`).
 */
function h2plusCurveCsv(curve: H2PlusCurve, shareUrl: string): string {
    const De = H_PLUS_H_PLUS_HARTREE - curve.equilibrium.totalEnergy;
    const comments = [
        `H2+ potential curve: E(R), both states (${H2PLUS_LABELS['1sigma_g']} gerade, ${H2PLUS_LABELS['1sigma_u']} ungerade).`,
        ...bondsCaptions('h2plus', null),
        `R_e = ${curve.equilibrium.R.toFixed(3)} a₀ (${(curve.equilibrium.R * BOHR_TO_ANGSTROM).toFixed(3)} Å), `
            + `E = ${signed(curve.equilibrium.totalEnergy, 4)} Ha (exact); D_e = ${(De * HARTREE_TO_EV).toFixed(2)} eV (${De.toFixed(4)} Ha) to H + H⁺.`,
        `Zero: H + H+ (${H_PLUS_H_PLUS_HARTREE} Ha).`,
        `view: ${shareUrl}`,
    ];
    const lines = comments.map(line => `# ${line}`);
    lines.push(['R_bohr', 'R_angstrom', 'E_1sigma_g_eV', 'E_1sigma_g_Ha', 'E_1sigma_u_eV', 'E_1sigma_u_Ha'].join(','));
    curve.R.forEach((r, i) => {
        const g = curve.sigmaG[i], u = curve.sigmaU[i];
        lines.push([
            formatNumber(r, 'R_bohr', r),
            formatNumber(r * BOHR_TO_ANGSTROM, 'R_angstrom', r),
            formatNumber((g - H_PLUS_H_PLUS_HARTREE) * HARTREE_TO_EV, 'E_1sigma_g_eV', r),
            formatNumber(g, 'E_1sigma_g_Ha', r),
            formatNumber((u - H_PLUS_H_PLUS_HARTREE) * HARTREE_TO_EV, 'E_1sigma_u_eV', r),
            formatNumber(u, 'E_1sigma_u_Ha', r),
        ].join(','));
    });
    return `${lines.join('\n')}\n`;
}

/**
 * A diatomic's shipped potential curve (brief, requirement 5): the scan's own
 * points, zero at the separated atoms (`scan.fit.separatedAtomsHartree`),
 * with the same method/validity/D_e/R_e comments the live panel shows
 * (`bondsCaptions`, reused so the file says exactly what the screen says).
 */
function diatomicCurveCsv(system: DiatomicId, scan: MoleculeScan, shareUrl: string): string {
    const comments = [
        `${systemFormula(system)} potential curve: E(R), precomputed at ${scan.points.length} bond lengths.`,
        ...bondsCaptions(system, scan),
        `view: ${shareUrl}`,
    ];
    const lines = comments.map(line => `# ${line}`);
    lines.push(['R_bohr', 'R_angstrom', 'E_eV', 'E_Ha'].join(','));
    for (const point of scan.points) {
        const eRel = (point.energyHartree - scan.fit.separatedAtomsHartree) * HARTREE_TO_EV;
        lines.push([
            formatNumber(point.RBohr, 'R_bohr', point.RBohr),
            formatNumber(point.RBohr * BOHR_TO_ANGSTROM, 'R_angstrom', point.RBohr),
            formatNumber(eRel, 'E_eV', point.RBohr),
            formatNumber(point.energyHartree, 'E_Ha', point.RBohr),
        ].join(','));
    }
    return `${lines.join('\n')}\n`;
}

/**
 * Brief, requirement 5: Bonds' CSV is the potential curve, not a radial
 * curve -- H₂⁺'s own exact curve (`context.h2plusCurve`), or the diatomic's
 * shipped scan points (`context.bondsScan`). The system is
 * `bondsDrawnPicture`'s, not the panel's selection (fix round 1, I1), and
 * `bondsScan` is accepted only when its own id matches that drawn system --
 * `exportAvailability` already refuses the mismatched case before this is
 * ever reached from `runExport`, but `csvFor`/`cubeJobFor` are also called
 * directly (tests, and `cubeJobFor` from the cube path), so the guard is
 * repeated here rather than assumed.
 */
function bondsCsvFor({ state, shareUrl, bondsScan, h2plusCurve }: ExportContext): string {
    const drawn = bondsDrawnPicture(state);
    const system = drawn?.system ?? state.bonds.system;
    if (system === 'h2plus') {
        if (!h2plusCurve) throw new Error(H2PLUS_CURVE_NOT_READY_REASON);
        return h2plusCurveCsv(h2plusCurve, shareUrl);
    }
    if (!bondsScan || bondsScan.id !== system) throw new Error('The potential curve is not available yet.');
    return diatomicCurveCsv(system as DiatomicId, bondsScan, shareUrl);
}

function csvFor(context: ExportContext): string {
    if (context.state.atom.mode === 'bonds') return bondsCsvFor(context);
    const { state, shareUrl, csvCurves } = context;
    const quantity = state.atom.mode === 'atom'
        ? 'D(r) = 4*pi*r^2*rho(r), electrons per bohr (the radial distribution, not the density)'
        : 'P(r) = r^2*R(r)^2, probability per bohr';
    const comments = [
        viewDescription(state), `quantity: ${quantity}`, `method: ${methodStatement(state)}`, 'r in bohr (a0)', `view: ${shareUrl}`,
    ];
    // Task 12b (ruling C4): the dashed neutral-comparison ring an ion or
    // excited atom's whole-atom view draws, and (optional) a landed ΔSCF
    // energy for the selected species -- both null, and so skipped, for
    // anything that has neither.
    const ring = referenceRingCaption(state);
    if (ring) comments.push(ring);
    const deltaScf = deltaScfCsvComment(state);
    if (deltaScf) comments.push(deltaScf);
    // Fix round 1 (M5): at the orbital level the curve on screen is still
    // the whole subshell's D(r) (RadialPlot draws one curve per subshell,
    // not per orbital -- see App.tsx's atomCurves) -- worth saying, since a
    // file named after one m_l could otherwise read as if it were specific
    // to that orbital.
    if (state.atom.mode === 'atom' && state.atom.level === 'orbital') {
        comments.push('note: D(r) is the subshell\'s, independent of m_l -- every orbital in this subshell shares the same curve');
    }
    // Task 12b (ruling C7): the same dashed non-relativistic curves the
    // radial plot overlays (Task 12's buildComparisonCurves, extracted so
    // this and RadialPlot share one matching/scaling/colour rule) --
    // appended as extra columns, headed with their own "... non-relativistic"
    // label, or (when there is none) the reason said as a comment instead.
    let curves = csvCurves;
    const profile = state.atom.mode === 'atom' ? state.atom.profile : null;
    if (profile) {
        const { curves: comparison, note } = buildComparisonCurves({
            profile, level: state.atom.level, selectedShell: state.atom.selectedShell, selectedSubshell: state.atom.selectedSubshell,
            rGrid: profileRGrid(profile),
        });
        if (comparison.length > 0) curves = [...csvCurves, ...comparison.map(({ label, points }) => ({ label, points }))];
        // The isolated j-level twin's scaling, stated exactly as the
        // on-screen legend states it (Task 12's comparisonNote).
        if (note) comments.push(note);
        if (profile.comparisonUnavailable) comments.push(profile.comparisonUnavailable);
    }
    return radialCurvesToCsv(curves, comments);
}

export async function runExport(kind: ExportKind, context: ExportContext): Promise<ExportResult> {
    // Fix round 1 (I1): the same mismatch/loading/error gate the live menu
    // uses (App.tsx), repeated here so a direct runExport call -- a menu
    // item clicked the instant before a state change would have disabled it,
    // or a caller that skips the menu -- cannot bypass it.
    const bondsLoad = context.state.atom.mode === 'bonds'
        ? { loading: Boolean(context.bondsLoading), error: context.bondsError ?? null }
        : undefined;
    const reason = exportAvailability(context.state, bondsLoad)[kind];
    if (reason) throw new Error(reason);
    const stem = exportFileStem(context.state);
    switch (kind) {
        case 'png':
        case 'png-plain': {
            if (!context.handle) throw new Error(VIEW_NOT_READY_REASON);
            // Task 12b (ruling C4): the dashed neutral-comparison ring an ion
            // or excited atom's whole-atom view draws gets its own caption
            // line, same wording as the CSV/cube comment -- null, and so
            // omitted, for anything that draws no such ring.
            const ring = referenceRingCaption(context.state);
            const caption = [viewDescription(context.state), methodStatement(context.state, context.bondsScan)];
            if (ring) caption.push(ring);
            // Final review I1: j-level lobes are a basis choice the method
            // line does not state -- null, and so omitted, without them.
            const shape = jLevelShapeCaption(context.state);
            if (shape) caption.push(shape);
            const overlays = kind === 'png'
                ? {
                    caption,
                    phaseLegend: Boolean(context.phaseLegend),
                    // Ruling C5: describe the combination key too, when App has one on screen.
                    combinationLegend: context.combinationLegend,
                }
                : null;
            return { blob: await context.handle.capturePng(overlays), filename: kind === 'png' ? `${stem}.png` : `${stem}_view.png` };
        }
        case 'csv': {
            // Fix round 1 (M3): a UTF-8 BOM, and charset said in the MIME
            // type, so Excel -- which otherwise guesses the system codepage
            // -- reads the em dashes, superscripts and fractions in a
            // caption (—, ², ½) correctly instead of mangling them.
            const blob = new Blob(['﻿', csvFor(context)], { type: 'text/csv;charset=utf-8' });
            return { blob, filename: `${stem}.csv` };
        }
        case 'stl': {
            if (!context.handle) throw new Error(VIEW_NOT_READY_REASON);
            const stl = encodeStl(context.handle.collectSurfaces(), context.longestSideMm ?? 50);
            return { blob: new Blob([stl], { type: 'model/stl' }), filename: `${stem}.stl` };
        }
        case 'glb': {
            if (!context.handle) throw new Error(VIEW_NOT_READY_REASON);
            const description = `${viewDescription(context.state)}; ${methodStatement(context.state, context.bondsScan)}`;
            const buffer = await encodeGlb(context.handle.collectSurfaces(), description);
            return { blob: new Blob([buffer], { type: 'model/gltf-binary' }), filename: `${stem}.glb` };
        }
        case 'cube': {
            if (!context.createCubeWorker) throw new Error('The cube worker is not available.');
            const job = cubeJobFor(context.state, { scan: context.bondsScan, meta: context.bondsMeta });
            return { blob: await requestCube(job, context.createCubeWorker), filename: `${stem}.cube` };
        }
    }
}
