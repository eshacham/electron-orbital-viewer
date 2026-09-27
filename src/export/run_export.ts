import type { RootState } from '../store';
import { selectionProblem } from '../combinations';
import { CsvCurve, radialCurvesToCsv } from './csv';
import { exportFileStem, methodStatement, viewDescription } from './caption';

export type ExportKind = 'csv';

export interface ExportItem { kind: ExportKind; label: string; detail: string; }

/** Menu order. Each later format adds its entry here. */
export const EXPORT_ITEMS: ExportItem[] = [
    { kind: 'csv', label: 'Radial curves (CSV)', detail: 'the plotted curves, every sample' },
];

export interface ExportOptions { longestSideMm?: number; }

export interface ExportContext extends ExportOptions {
    state: RootState;
    /** Written into files, so a file says which view it came from. */
    shareUrl: string;
    csvCurves: CsvCurve[];
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

export function exportAvailability(state: RootState): ExportAvailability {
    return { csv: drawnReason(state) };
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
        case 'csv': {
            // Fix round 1 (M3): a UTF-8 BOM, and charset said in the MIME
            // type, so Excel -- which otherwise guesses the system codepage
            // -- reads the em dashes, superscripts and fractions in a
            // caption (—, ², ½) correctly instead of mangling them.
            const blob = new Blob(['﻿', csvFor(context)], { type: 'text/csv;charset=utf-8' });
            return { blob, filename: `${stem}.csv` };
        }
    }
}
