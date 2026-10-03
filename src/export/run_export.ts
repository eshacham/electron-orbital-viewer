import type { RootState } from '../store';
import { selectionProblem } from '../combinations';
import { hydrogenicSource } from '../field_source';
import { ORBITAL_RESOLUTION, BASIC_ORBITALS_Z } from '../orbital_presets';
import { subshellSpokenLabel } from '../atom/configurations';
import { buildComparisonCurves } from '../atom/comparison_curves';
import type { SerialisedAtomProfile } from '../workers/atomWorker';
import { CsvCurve, radialCurvesToCsv } from './csv';
import { exportFileStem, methodStatement, shellLabel, viewDescription, referenceRingCaption, deltaScfCsvComment } from './caption';
import { CombinationLegendItem } from './png';
import { ViewerExportHandle } from './handle';
import { encodeStl } from './stl';
import { encodeGlb } from './gltf';
import { CubeJob, CubeWorkerHandle, requestCube } from './cube_request';

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

/** Final review I2: a shell view whose lobes failed is not the picture its caption names. */
export const COMPOSITION_FAILED_REASON = 'This shell\'s orbital lobes failed to compute, so the picture is incomplete.';

function drawnReason(state: RootState): string | null {
    if (state.atom.mode === 'atom') {
        // Task 12b (ruling C4): an unbound anion -- or, since ruling T7-b,
        // an excitation whose promoted electron LDA does not bind -- is a
        // verdict (spec §3.5), not a solve still in progress -- every export must say so in the
        // store's own words, never the generic "waiting" reason, which
        // would read as if trying again later would help.
        if (state.atom.unbound) return state.atom.unbound;
        if (!state.atom.profile) return WAITING_FOR_ATOM_REASON;
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
        if (state.atom.unbound) return state.atom.unbound;
        // setElement nulls the profile unconditionally (see atomSlice), so
        // isSolving is never true here with a profile still in place --
        // "no profile yet" is the only way to be waiting at these levels.
        return state.atom.profile ? null : WAITING_FOR_ATOM_REASON;
    }
    const reason = drawnReason(state);
    if (reason) return reason;
    const { currentField, isLoading } = state.orbital;
    if (isLoading) return CUBE_BUSY_REASON;
    if (currentField && currentField.sources.length !== 1) return CUBE_OVERLAY_REASON;
    return null;
}

/**
 * What the view shows, as a cube job: the drawn ψ (a field source, resampled
 * exactly as it was drawn), or ρ(r) = D(r)/(4πr²) of what the cut face shows
 * at atom levels 1-2 (design decisions, "the cube file is resampled on
 * demand").
 */
export function cubeJobFor(state: RootState): CubeJob {
    const title = `electron-orbital-viewer: ${viewDescription(state)}`;
    const atom = state.atom;
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
        // Task 12b (ruling C7): a j-level's curve is that j-level's own
        // density, G^2 + F^2 (both Dirac radial components, Task 10) --
        // not the plain |R|^2 an off/scalar subshell's curve holds -- said
        // here so the file does not read as the ordinary radial density.
        const jNote = subshell?.j !== undefined ? 'j-level density, G^2 + F^2' : null;
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
    const jLevelNote = atom.mode === 'atom' && atom.level === 'orbital' && atom.selectedOrbital?.j !== undefined
        ? 'large component, l-basis angular part' : null;
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
        if (state.atom.unbound) return state.atom.unbound;
        return state.atom.profile ? null : WAITING_FOR_ATOM_REASON;
    }
    return drawnReason(state);
}

export function exportAvailability(state: RootState): ExportAvailability {
    const png = pngReason(state);
    const geometry = geometryReason(state);
    return { png, 'png-plain': png, csv: csvReason(state), stl: geometry, glb: geometry, cube: cubeReason(state) };
}

/** The shared log grid a profile's curves are sampled on -- the same formula App.tsx's atomRGrid uses, so a comparison curve built here lines up exactly with the already-plotted columns it is appended beside (radialCurvesToCsv requires identical radii across every column). */
function profileRGrid(profile: Pick<SerialisedAtomProfile, 'rMin' | 'dx' | 'size'>): number[] {
    return Array.from({ length: profile.size }, (_, j) => profile.rMin * Math.exp(j * profile.dx));
}

function csvFor({ state, shareUrl, csvCurves }: ExportContext): string {
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
    const reason = exportAvailability(context.state)[kind];
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
            const caption = [viewDescription(context.state), methodStatement(context.state)];
            if (ring) caption.push(ring);
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
            const description = `${viewDescription(context.state)}; ${methodStatement(context.state)}`;
            const buffer = await encodeGlb(context.handle.collectSurfaces(), description);
            return { blob: new Blob([buffer], { type: 'model/gltf-binary' }), filename: `${stem}.glb` };
        }
        case 'cube': {
            if (!context.createCubeWorker) throw new Error('The cube worker is not available.');
            return { blob: await requestCube(cubeJobFor(context.state), context.createCubeWorker), filename: `${stem}.cube` };
        }
    }
}
