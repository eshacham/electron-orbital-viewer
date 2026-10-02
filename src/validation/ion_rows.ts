/**
 * Phase 3's rows of the shared validation table (spec §3.2, §4.4). Every
 * `app` number is read from ion_results.json, which only
 * tests/atom/delta_scf_nist.test.ts writes, after asserting each value.
 */
import results from './ion_results.json';
import type { ValidationRow } from './references';
import { DELTA_SCF_METHOD } from '../atom/delta_scf';
import { NIST_ASD_IONISATION_SOURCE, NA_D_LINE_SOURCE } from '../atom/ionisation_references';

export interface IonResultEntry {
    kind: 'ionisation' | 'excitation' | 'lsdTotal';
    Z: number;
    charge: number;
    /** 'Na', 'Na⁺' -- speciesSymbol of the species the value belongs to. */
    system: string;
    app: number;
    reference: number;
}

export const NIST_LSD_SOURCE = 'NIST SRD 141, Atomic Reference Data for Electronic Structure Calculations, LSD column '
    + '(Kotochigova, Levine, Shirley, Stiles, Clark, Phys. Rev. A 55, 191 (1997))';
export const LSD_METHOD = 'central-field SCF, spin-polarised LDA (Slater exchange + VWN5), Hund\'s-rule occupation, spherically averaged';

function rowFor(entry: IonResultEntry): ValidationRow {
    const common = { phase: 3, system: entry.system, app: entry.app, reference: entry.reference };
    if (entry.kind === 'ionisation') {
        return { ...common, quantity: 'first ionisation energy (ΔSCF)', unit: 'eV', tolerancePercent: 10, referenceSource: NIST_ASD_IONISATION_SOURCE, method: DELTA_SCF_METHOD };
    }
    if (entry.kind === 'excitation') {
        return { ...common, quantity: '3s → 3p excitation energy (ΔSCF)', unit: 'eV', tolerancePercent: 10, referenceSource: NA_D_LINE_SOURCE, method: DELTA_SCF_METHOD };
    }
    return { ...common, quantity: 'total energy (LSD)', unit: 'Ha', tolerancePercent: 0.001, referenceSource: NIST_LSD_SOURCE, method: LSD_METHOD };
}

export const ION_VALIDATION_ROWS: ValidationRow[] = (results.entries as IonResultEntry[]).map(rowFor);
