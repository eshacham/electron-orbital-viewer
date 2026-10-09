import type { FrequencyCheck, MoleculeMeta, MoleculeAtom, GridSpec } from './types';

/**
 * What the molecule library adds to a spec §4.2 meta.json. The §4.2 fields
 * themselves are Phase 5's `MoleculeMeta`; everything here is written by
 * tools/molecules/build_library.py. `MoleculeAtom` and `GridSpec` already
 * live in `./types` (Phase 5); re-exported, not redefined (D18).
 */
export type { MoleculeAtom, GridSpec };

export type MoleculePick = { kind: 'atom'; index: number } | { kind: 'bond'; index: number };

export interface MoleculeReference {
    quantity: string;
    value: number;
    unit: string;
    source: string;
    tolerance?: number;
    atoms?: number[];
    label?: string;
}

export interface LibraryExtras {
    /** Optional on a diatomic's meta.json; every library molecule ships its density grid, and its box frames every surface. */
    grid: GridSpec;
    /** Debye, from − to + (IUPAC), in the frame of `atoms`. */
    dipoleVectorDebye: [number, number, number];
    espGrid: GridSpec;
    /** ESP extremes (Ha/e) near ρ = 0.001 on the coarse grid; for validation. */
    espRangeOnSurface: [number, number];
    electronCount: number;
    densityIntegral: number;
    multiplicity: number;
    /** Phase 6D: `labels` says whether the labels are the full group's, a named subgroup's (labelNote says why), or none
     * (no symmetry: labelGroup null); older data has neither, and was labelled in PySCF's subgroup. */
    symmetry: { pointGroup: string; labelGroup: string | null; labels?: 'full-group' | 'subgroup' | 'none'; labelNote?: string };
    geometryOptimisation?: {
        converged: boolean;
        maxGradient?: number;
        steps?: number;
        /** The attempt whose last frame this run resumed from (6B-1 M4); `steps` then counts this attempt only. */
        resumedFrom?: number;
        /** Phase 6D: 'time-limit' when the worker's time budget stopped the optimisation (spec §9); then `converged` is false. */
        stoppedBy?: 'time-limit';
        /** Phase 6D: the imaginary-frequency count of the saddle point it was displaced from and re-optimised (spec §7). */
        displacedFrom?: number;
    };
    /** A documented exception to the usual "number states its method" claim (ozone's multireference dipole; ruling T7-O3). */
    caveat?: string;
    /** Phase 6D: recipe B's frequency check. */
    frequencyCheck?: FrequencyCheck;
    /** Phase 6D: the D3(BJ) term inside totalEnergyHartree, and what computed it. */
    dispersion?: { model: string; energyHartree: number; backend: string };
}
export type LibraryMoleculeMeta = MoleculeMeta & LibraryExtras;

export const LIBRARY_CATEGORIES: ReadonlyArray<{ key: string; label: string }> = [
    { key: 'first-examples', label: 'First examples' },
    { key: 'hybridisation', label: 'Hybridisation' },
    { key: 'polarity', label: 'Polarity' },
    { key: 'aromatic', label: 'Aromatic' },
    { key: 'biomolecule-fragments', label: 'Biomolecule fragments' },
];

const REQUIRED: Array<keyof LibraryExtras> = ['grid', 'dipoleVectorDebye', 'espGrid', 'espRangeOnSurface', 'electronCount', 'symmetry'];

/** A meta.json from before the library cannot be drawn honestly (no ESP, no dipole direction); say so rather than guess. */
export function asLibraryMeta(meta: MoleculeMeta): LibraryMoleculeMeta {
    const record = meta as unknown as Record<string, unknown>;
    const missing = REQUIRED.filter(key => record[key] === undefined);
    if (missing.length) {
        throw new Error(`${meta.id}: meta.json has no ${missing.join(', ')}; regenerate it with tools/molecules/build_library.py`);
    }
    return meta as LibraryMoleculeMeta;
}
