/**
 * How a calculated ionisation energy compares with its NIST measurement
 * (ruling P15, R-accuracy): the signed percent difference, and a one-line
 * limitation note when the gap is large or the species has an open d/f
 * subshell -- `delta_scf.ts`'s ΔSCF method is validated against NIST only
 * through argon (spec §3.4's Phase 3 ruling C6); everything past that is a
 * known-larger-error region documented here rather than silently shown as
 * if it carried the same confidence.
 *
 * The investigation behind this note (tests/atom/delta_scf_heavy.test.ts,
 * ATOM_SLOW_TESTS=1) found two independent, literature-documented LDA
 * error sources, not a solver bug: (1) LDA's known over-binding of a d
 * orbital relative to an s orbital (already documented for other species as
 * `BELOW_GROUND_NOTE` in delta_scf.ts) -- whenever ionisation changes a
 * species' d-occupancy (Ce 5d¹6s² → Ce⁺ 5d², Lu 5d¹6s² → Lu⁺ 6s², Pa/U/Np...
 * losing their only 6d electron), the error is large (11-25 %) and its sign
 * follows whether d-occupancy rises (too low) or falls (too high) on
 * ionisation; ionisations that remove a plain s electron with no d/f
 * reorganisation (Na, Zn, Gd, Yb, Th) stay under ~13 %, rising with Z as the
 * missing relativistic treatment (ΔSCF stays non-relativistic, see
 * delta_scf.ts) starts to matter. (2) Every cation configuration used is the
 * table's own NIST ASD ground state, not a derived "remove the outermost
 * electron" guess (ion_configurations.ts), so the configurations themselves
 * are not the source of the gap -- Th's was found wrong by this
 * investigation and fixed (preflight D2) before this measurement was taken.
 */
import { AtomSpecies, speciesConfiguration } from './species';
import { valenceNote } from './configurations';

/** (calc − meas) / meas × 100. */
export function signedDifferencePercent(calculatedEv: number, measuredEv: number): number {
    return ((calculatedEv - measuredEv) / measuredEv) * 100;
}

/**
 * "+25.3 %", "−0.4 %", "0.0 %" -- never "−0.0 %" (same reasoning as
 * `SpeciesControls`' M11 size comparison: a rounded zero that still carries
 * a sign reads as a typo, not as "no difference"). The minus sign is U+2212,
 * matching every other negative number this app shows (ruling M4/FR-1).
 */
export function formatSignedPercent(percent: number): string {
    const rounded = Number(percent.toFixed(1));
    if (rounded === 0) return '0.0 %';
    const sign = rounded > 0 ? '+' : '−';
    return `${sign}${Math.abs(rounded).toFixed(1)} %`;
}

export const IE_LIMITATION_NOTE =
    'ΔSCF LDA with spherically averaged open shells; expect larger errors for d- and f-block elements';

/**
 * Null for the common case (a light, closed-shell-adjacent species whose
 * calculated value tracks NIST closely); otherwise `IE_LIMITATION_NOTE`,
 * triggered by either a large gap (|percent| > 10, whatever the species) or
 * an open d/f subshell below the outermost shell (`valenceNote`, ruling
 * P14) -- a transition metal or lanthanide/actinide whose error happens to
 * be small this time is still a case the method was never validated for.
 */
export function ieLimitationNote(species: AtomSpecies, percent: number | null): string | null {
    const bigError = percent !== null && Math.abs(percent) > 10;
    const hasOpenInnerShell = valenceNote(speciesConfiguration(species)) !== null;
    return bigError || hasOpenInnerShell ? IE_LIMITATION_NOTE : null;
}
