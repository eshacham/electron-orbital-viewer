import type { RootState } from '../store';
import { selectionProblem } from '../combinations';
import { hydrogenicSource } from '../field_source';
import { ORBITAL_RESOLUTION } from '../orbital_presets';
import { subshellLabel } from '../atom/configurations';
import { CsvCurve, radialCurvesToCsv } from './csv';
import { exportFileStem, ATOM_METHOD, methodStatement, viewDescription } from './caption';
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

function drawnReason(state: RootState): string | null {
    if (state.atom.mode === 'atom') return state.atom.profile ? null : WAITING_FOR_ATOM_REASON;
    // Ruling C10: a combination Phase 1 refuses (selectionProblem) says why
    // it refused, not the generic "nothing is drawn" -- the picker already
    // knows the reason, and the export menu should say the same thing.
    const combination = state.orbital.combination;
    const problem = combination.kind !== 'none' ? selectionProblem(combination) : null;
    if (problem) return problem;
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
    return drawnReason(state) ?? (state.orbital.isLoading || state.atom.isSolving ? PICTURE_BUSY_REASON : null);
}

export const WHOLE_ATOM_GEOMETRY_REASON = 'The whole-atom view is a shaded cut face, not a surface. Open a shell or an orbital to export geometry.';

/**
 * STL and glTF take the surfaces in the scene, so they refuse exactly when a
 * PNG would -- nothing drawn, or a new picture still on its way while the
 * old one's meshes are still up -- and also at the whole-atom level, whose
 * picture is a shaded cut face with no surface behind it.
 */
function geometryReason(state: RootState): string | null {
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
        if (!state.atom.profile) return WAITING_FOR_ATOM_REASON;
        // A re-solve (a new element) can leave the old profile in place while it runs.
        return state.atom.isSolving ? CUBE_BUSY_REASON : null;
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
        const subshell = atom.level === 'shell' && sub ? profile.subshells.find(s => s.n === sub.n && s.l === sub.l) : undefined;
        const shell = atom.level === 'shell' ? profile.shells.find(s => s.n === atom.selectedShell) : undefined;
        const what = subshell ? `${subshellLabel(subshell.n, subshell.l)} subshell` : shell ? `n = ${shell.n} shell` : 'total';
        return {
            type: 'radialCube',
            curve: { D: subshell?.curve ?? shell?.curve ?? profile.total, rMin: profile.rMin, dx: profile.dx, size: profile.size },
            resolution: ORBITAL_RESOLUTION,
            atoms: [{ Z: profile.Z, position: [0, 0, 0] }],
            title,
            // Carry from Task 12: features finer than the grid spacing (a heavy atom's 1s) are not resolved.
            description: `rho(r) = D(r)/(4 pi r^2), ${what} electron density, electrons/bohr^3, box enclosing 99.9%, finer features (e.g. a heavy atom's 1s) not resolved; ${ATOM_METHOD}; lengths in bohr`,
        };
    }
    const { currentParams, currentField } = state.orbital;
    const source = currentField ? currentField.sources[0] : hydrogenicSource(currentParams!);
    const resolution = currentField ? currentField.resolution : currentParams!.resolution;
    const Z = currentParams?.Z ?? 1;
    return {
        type: 'fieldCube', source, resolution, atoms: [{ Z, position: [0, 0, 0] }], title,
        description: `psi(x,y,z), real, bohr^-3/2, on the grid as drawn; ${methodStatement(state)}; lengths in bohr`,
    };
}

export function exportAvailability(state: RootState): ExportAvailability {
    const png = pngReason(state);
    const geometry = geometryReason(state);
    return { png, 'png-plain': png, csv: drawnReason(state), stl: geometry, glb: geometry, cube: cubeReason(state) };
}

function csvFor({ state, shareUrl, csvCurves }: ExportContext): string {
    const quantity = state.atom.mode === 'atom'
        ? 'D(r) = 4*pi*r^2*rho(r), electrons per bohr (the radial distribution, not the density)'
        : 'P(r) = r^2*R(r)^2, probability per bohr';
    const comments = [
        viewDescription(state), `quantity: ${quantity}`, `method: ${methodStatement(state)}`, 'r in bohr (a0)', `view: ${shareUrl}`,
    ];
    // Fix round 1 (M5): at the orbital level the curve on screen is still
    // the whole subshell's D(r) (RadialPlot draws one curve per subshell,
    // not per orbital -- see App.tsx's atomCurves) -- worth saying, since a
    // file named after one m_l could otherwise read as if it were specific
    // to that orbital.
    if (state.atom.mode === 'atom' && state.atom.level === 'orbital') {
        comments.push('note: D(r) is the subshell\'s, independent of m_l -- every orbital in this subshell shares the same curve');
    }
    return radialCurvesToCsv(csvCurves, comments);
}

export async function runExport(kind: ExportKind, context: ExportContext): Promise<ExportResult> {
    const reason = exportAvailability(context.state)[kind];
    if (reason) throw new Error(reason);
    const stem = exportFileStem(context.state);
    switch (kind) {
        case 'png':
        case 'png-plain': {
            if (!context.handle) throw new Error(VIEW_NOT_READY_REASON);
            const overlays = kind === 'png'
                ? {
                    caption: [viewDescription(context.state), methodStatement(context.state)],
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
