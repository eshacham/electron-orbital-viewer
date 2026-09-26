/**
 * Every quantitative claim the app makes, beside the published value it is
 * checked against (spec §3.2). Each phase appends its rows; the Methods page
 * (Phase 7) renders this table as it stands, so the numbers users read are
 * the numbers the tests assert.
 *
 * Phase 0 rows are the atom-mode engine's recorded agreement with NIST
 * (docs/HANDOFF.md); tests/atom/scf.test.ts is what pins those values, with
 * the same tolerances (0.001 % total energy, 0.02 % eigenvalues). Rows from
 * phase 1 on compute `app` by calling the very functions their physics tests
 * call, at import -- about a second of grid quadrature -- so import this only
 * from tests and from a lazily loaded page, never from the app's entry.
 */
import { PHASE_1_ROWS } from './phase1';

export interface ValidationRow {
    phase: number;
    quantity: string;
    system: string;
    app: number;
    reference: number;
    unit: string;
    tolerancePercent: number;
    referenceSource: string;
    method: string;
}

const NIST_LDA = 'NIST Atomic Reference Data (LDA)';
const ATOM_METHOD = 'central-field SCF, LDA exchange + VWN5';

const PHASE_0_ROWS: ValidationRow[] = [
    { phase: 0, quantity: 'total energy', system: 'He', app: -2.834829, reference: -2.834836, unit: 'Ha', tolerancePercent: 0.001, referenceSource: NIST_LDA, method: ATOM_METHOD },
    { phase: 0, quantity: 'total energy', system: 'Ne', app: -128.233250, reference: -128.233481, unit: 'Ha', tolerancePercent: 0.001, referenceSource: NIST_LDA, method: ATOM_METHOD },
    { phase: 0, quantity: 'total energy', system: 'Ar', app: -525.945350, reference: -525.946195, unit: 'Ha', tolerancePercent: 0.001, referenceSource: NIST_LDA, method: ATOM_METHOD },
    { phase: 0, quantity: '2s eigenvalue', system: 'Ar', app: -10.794, reference: -10.794172, unit: 'Ha', tolerancePercent: 0.02, referenceSource: NIST_LDA, method: ATOM_METHOD },
    { phase: 0, quantity: '2p eigenvalue', system: 'Ar', app: -8.443, reference: -8.443439, unit: 'Ha', tolerancePercent: 0.02, referenceSource: NIST_LDA, method: ATOM_METHOD },
];

export const VALIDATION: ValidationRow[] = [...PHASE_0_ROWS, ...PHASE_1_ROWS];

export function relativeErrorPercent(row: ValidationRow): number {
    return (Math.abs(row.app - row.reference) / Math.abs(row.reference)) * 100;
}
