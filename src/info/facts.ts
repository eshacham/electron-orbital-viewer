/**
 * Facts more than one mode's Info builder states (Task 7b fix round 1, M9: shared helpers live in a module of their own,
 * not in one mode's builder -- as text helpers do in format/text.ts).
 */
import type { InfoFact } from './info_types';

/**
 * The enclosed fraction, from Advanced -- where the Electron enclosed control is (CONTROL_LEVEL.enclosed). `of` says what
 * the share is of: one orbital's electron by default; Atoms' shell views enclose a share of the density (Task 6); a
 * molecular orbital a share of its |ψ|², a molecule's density a share of its electron density (Tasks 7a, 7b).
 */
export function enclosedFact(fraction: number, of = 'of the electron'): InfoFact {
    return { label: 'Enclosed', value: `${Math.round(fraction * 100)} % ${of}`, min: 'advanced' };
}

/**
 * Task 9b review I3: that a density is all its occupied orbitals together -- cut from the Bonds and Molecules density
 * leads in 9b, and needed beside the orbital tiles it sums -- said once, in both modes' technical band (the density
 * glossary entry says the same, but no (i) opens it).
 */
export const DENSITY_SUM_SENTENCE = 'The density is all the occupied orbitals together: the sum of their |ψ|², each weighted by how many electrons it holds.';
