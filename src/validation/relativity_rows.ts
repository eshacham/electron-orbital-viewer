/**
 * Phase 4's rows of the shared validation table (spec §3.2): the app's
 * relativistic total energies and eigenvalues next to NIST's ScRLDA and
 * RLDA values. Every `app` number is read from relativity_results.json,
 * which only tests/atom/relativistic_nist.test.ts writes (after asserting
 * each value), so nothing here is typed by hand.
 *
 * The quantity string carries its column ("total energy (ScRLDA)", not just
 * "total energy"): the ScRLDA and RLDA tables both have a '1s orbital
 * eigenvalue' row for the same atom, and references.test.ts requires every
 * `phase|system|quantity` key to be unique (preflight D2). The column also
 * reads naturally in the Methods table, next to the method sentence that
 * already names the mode.
 */
import results from './relativity_results.json';
import type { ValidationRow } from './references';
import { jLabel, methodStatement } from '../atom/relativity';

export interface RelativityResultEntry {
    Z: number;
    symbol: string;
    column: 'ScRLDA' | 'RLDA';
    /** 'Etot', or a NIST orbital key: '6s', '2p' (ScRLDA), '2p-' / '2p+' (RLDA, j = l ∓ 1/2). */
    quantity: string;
    app: number;
    reference: number;
}

export const NIST_SOURCE = 'NIST SRD 141, Atomic Reference Data for Electronic Structure Calculations '
    + '(Kotochigova, Levine, Shirley, Stiles, Clark, Phys. Rev. A 55, 191 (1997))';

const LETTERS = 'spdf';

/** '2p-' -> '2p½', '4f+' -> '4f⁷⁄₂', '6s' -> '6s'. */
export function orbitalQuantityLabel(key: string): string {
    const suffix = key.slice(2);
    if (suffix === '') return key;
    const l = LETTERS.indexOf(key[1]);
    return `${key.slice(0, 2)}${jLabel(suffix === '-' ? l - 0.5 : l + 0.5)}`;
}

function quantityLabel(entry: RelativityResultEntry): string {
    const base = entry.quantity === 'Etot' ? 'total energy' : `${orbitalQuantityLabel(entry.quantity)} orbital eigenvalue`;
    return `${base} (${entry.column})`;
}

function rowFor(entry: RelativityResultEntry): ValidationRow {
    return {
        phase: 4,
        quantity: quantityLabel(entry),
        system: entry.symbol,
        app: entry.app,
        reference: entry.reference,
        unit: 'Ha',
        // Spec: 0.1 % for Z <= 18 (Ne, Ar); 1 % for the heavier fixture atoms.
        tolerancePercent: entry.Z <= 18 ? 0.1 : 1,
        referenceSource: NIST_SOURCE,
        method: methodStatement(entry.column === 'ScRLDA' ? 'scalar' : 'spinOrbit'),
    };
}

export const RELATIVITY_VALIDATION_ROWS: ValidationRow[] = (results.entries as RelativityResultEntry[]).map(rowFor);
