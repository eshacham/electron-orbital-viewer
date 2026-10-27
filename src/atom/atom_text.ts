/**
 * The Atoms text the panels and Info share (Task 6 fix round 1: shared text helpers live in modules, not in
 * components). Moved here word for word from LevelNav (shell names, "About this model"), Controls (the relativity help
 * and readout, the Cut away helper), SubshellPanel (electron counts, capacities, the j-level note) and SpeciesControls
 * (the ΔSCF energy's value and label), so `atomInfo` and the panels import text, not each other.
 */
import React from 'react';
import type { ClipAxis } from '@/types/orbital';
import type { SerialisedAtomProfile, SerialisedSubshell } from '../workers/atomWorker';
import type { EnergiesState } from '../store/atomSlice';
import type { ValenceSContraction } from './relativistic_comparison';
import { type RelativityMode, shortMethodLabel } from './relativity';
import { AtomSpecies, speciesSymbol } from './species';
import { BELOW_GROUND_NOTE, EnergyReading, ionisedSpeciesOf } from './delta_scf';
import { subshellLabel } from './configurations';
import { shellLetter } from '../orbital_names';
import { listOf } from '../format/text';

const h = React.createElement;

// ---- Shells and "About this model" (from LevelNav) ----

// Old X-ray shell letters, matching atom_profile.ts's private shellName
// (not exported from there — this is a UI label, not a physics quantity, so
// it is simpler to keep its own tiny copy than to export an internal of the
// solver module just for this).
const PRINCIPAL_SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

/** "L shell (n=2)": the chips', breadcrumb's and hint's name for a shell (Info's hint says it too, Task 6). */
export function shellName(n: number): string {
    return `${PRINCIPAL_SHELL_LETTERS[n - 1] ?? `n=${n}`} shell (n=${n})`;
}

/**
 * The relativity clause of "About this model" -- the rest of the paragraph
 * (central-field averaging, LDA/VWN, ions and excitations, the
 * spin-restricted picture and its unbound anions, the basis-choice caveat)
 * does not depend on the mode, so only this one sentence changes with it.
 * Phase 3 widened the non-relativistic wording from "neutral … no ions" to
 * "isolated atoms and their ions"; all three variants keep that ions
 * wording and vary only the relativity statement.
 */
export function aboutRelativitySentence(mode: RelativityMode): string {
    switch (mode) {
        case 'off':
            return 'It is non-relativistic and describes isolated atoms and their ions — no molecules, no spin-orbit coupling.';
        case 'scalar':
            return 'Relativity is included at the scalar-relativistic level (Koelling–Harmon: the mass-velocity and Darwin terms), '
                + 'which captures how heavy atoms’ s and p shells contract, but not spin–orbit splitting. '
                + 'It describes isolated atoms and their ions — no molecules.';
        case 'spinOrbit':
            return 'Relativity is included in full through the radial Dirac equation, so each subshell with l > 0 splits into '
                + 'j = l ± ½ levels, occupied in proportion to 2j + 1 so the atom stays spherical. '
                + 'It describes isolated atoms and their ions — no molecules.';
    }
}

/**
 * Ruling C6: the ionisation and excitation energies are ΔSCF differences
 * from a non-relativistic spin-polarised LDA in every mode (spin-polarised
 * MacDonald–Vosko exchange is out of scope, and ΔSCF is validated only
 * through argon). With a relativistic picture that has to be said, or a
 * heavy atom's energies read as carrying the relativistic shifts its picture
 * shows. Empty for 'off', which leaves the paragraph as it always was.
 */
export function relativisticEnergiesSentence(mode: RelativityMode): string {
    switch (mode) {
        case 'off':
            return '';
        case 'scalar':
            return ' This picture is scalar-relativistic; the ΔSCF energies are not — they stay non-relativistic, '
                + 'so for a heavy atom they leave out the relativistic shifts the picture shows.';
        case 'spinOrbit':
            return ' This picture includes spin–orbit coupling (Dirac equation); the ΔSCF energies do not — they stay '
                + 'non-relativistic, so for a heavy atom they leave out the relativistic shifts the picture shows.';
    }
}

const PICTURE_WORDS: Record<RelativityMode, string> = {
    off: 'non-relativistic',
    scalar: 'scalar-relativistic',
    spinOrbit: 'the Dirac (spin–orbit) one',
};
const SELECTED_WORDS: Record<RelativityMode, string> = {
    off: 'the non-relativistic one',
    scalar: 'the scalar-relativistic one',
    spinOrbit: 'the one with spin–orbit',
};

/**
 * Ruling P18: when the Relativity switch (`selected`) has moved ahead of
 * what is actually drawn (`picture`) -- a re-solve in flight, most often --
 * About says so explicitly, rather than quietly describing the switch's
 * method as if it were already on screen. Null when the two agree, which
 * is the ordinary case and leaves the paragraph exactly as it was.
 */
export function aboutPictureSentence(selected: RelativityMode, picture: RelativityMode): string | null {
    if (selected === picture) return null;
    return `The picture on screen is still ${PICTURE_WORDS[picture]}; ${SELECTED_WORDS[selected]} is being solved.`;
}

/**
 * "About this model" as one paragraph of text (Task 6): Info's "How this was computed" (atomInfo) and Help's About
 * (variant 'about') both say it from here, word for word. The relativity clause follows the switch (`selected`, ruling
 * P18), the ΔSCF sentence the drawn picture (`picture`, ruling T2-picturesentence); with no picture, neither speaks of
 * "this picture" (final review M6).
 */
export function aboutModelText(selected: RelativityMode, picture: RelativityMode, pictureShown: boolean): string {
    const pictureSentence = pictureShown ? aboutPictureSentence(selected, picture) : null;
    return 'This is a central-field model: each electron moves in the spherically averaged potential of the nucleus and '
        + 'every other electron, and open shells are averaged over their sublevels rather than resolved into individual '
        + 'determinants. Exchange and correlation come from the local density approximation (LDA) with the VWN '
        + `correlation functional. ${aboutRelativitySentence(selected)}`
        + (pictureSentence ? ` ${pictureSentence}` : '')
        + ' An ion or an excited atom uses the same model with its own electron count or one electron moved; ionisation '
        + 'and excitation energies are ΔSCF differences of total energies from the spin-polarised form of the same LDA, '
        + 'never orbital eigenvalues. The picture on screen is drawn from a simpler, spin-restricted form of that LDA, '
        // Task 6: "for their" -- the JSX this replaces dropped the space ("fortheir") at a comment between the lines.
        + 'and in it most anions — Cl⁻ included — have no bound state for their extra electron at all.'
        + (pictureShown ? relativisticEnergiesSentence(picture) : '')
        // Fix round 1 (M1): no "below" -- neither Info nor Help has anything below it.
        + ' The individual s/p/d/f orbitals you can pick one by one are a basis choice, not separate physical objects: a '
        + 'partially filled subshell\'s electrons are smeared uniformly over all of it, not sitting in one lobe rather '
        + 'than another.';
}

// ---- Relativity and the cut (from Controls) ----

/**
 * The drawn profile's side of the readout (ruling C9): everything here
 * describes the picture on screen, which during a re-solve is still the old
 * mode's, never the switch's.
 */
export interface RelativityReadout {
    /** The mode the drawn profile was solved in. */
    pictureMode: RelativityMode;
    /** Its valence-s contraction against the same species' non-relativistic solve, when there is one. */
    change: ValenceSContraction | null;
    /** Why a relativistic picture has nothing to compare against (the worker's own words), or null. */
    comparisonUnavailable: string | null;
}

/** The readout's facts for a drawn profile (ruling C9): App's Relativity switch and Info (atomInfo) read the same ones. */
export function relativityReadoutOf(profile: SerialisedAtomProfile): RelativityReadout {
    return {
        pictureMode: profile.relativity ?? 'off',
        change: profile.valenceS ?? null,
        comparisonUnavailable: profile.comparisonUnavailable ?? null,
    };
}

/**
 * What a cut does, in words (the Cut away helper). Task 6: Atoms says it in Info (atomInfo), Bonds and Molecules under
 * the control until Task 7 moves theirs; one function, so the two cannot drift.
 */
export function cutHelpText(clipAxis: ClipAxis, meshLevel: boolean): string {
    if (clipAxis === 'none') return 'Pick an axis to slice the orbital open.';
    return meshLevel
        ? `Removes the part on the +${clipAxis} side of a plane perpendicular to the ${clipAxis} axis.`
        : `Slices off the +${clipAxis} side to show the shells inside. The atom is round, so X, Y and Z give the same rings, facing a different way.`;
}

/** What each mode is, in one line; "Default for this element" when it is that element's default (spec §3.1). */
export function relativityHelp(mode: RelativityMode, isDefault: boolean): string {
    const base = {
        off: 'Schrödinger equation — no relativistic effects.',
        scalar: 'Scalar-relativistic (Koelling–Harmon): mass-velocity and Darwin terms, no spin–orbit.',
        spinOrbit: 'Dirac equation: each l > 0 subshell splits into j = l − ½ and j = l + ½.',
    }[mode];
    return isDefault ? `${base} Default for this element.` : base;
}

/**
 * A percentage that never rounds a real change to nothing: hydrogen's 1s
 * moves by about a thousandth of a percent, and "0.00 %" would read as no
 * change at all.
 */
function formatPercent(size: number): string {
    if (size >= 1) return size.toFixed(1);
    if (size >= 0.01) return size.toFixed(2);
    if (size >= 1e-4) return size.toPrecision(2);
    return size === 0 ? '0' : 'less than 0.0001';
}

/**
 * Enough decimal places for the two radii to differ where they really do:
 * carbon's 2s moves by 5·10⁻⁴ a₀, which at two places printed as
 * "1.58 → 1.58" beside "contracts by 0.03 %". Two places at least, six at
 * most (hydrogen's 1s moves by a few 10⁻⁵ a₀).
 */
function radiusDecimals(difference: number): number {
    if (!(difference > 0)) return 2;
    return Math.min(6, Math.max(2, Math.ceil(-Math.log10(difference))));
}

/**
 * The valence-s contraction, with the comparison it is measured against
 * named. Two things a reader could otherwise assume wrongly are said
 * outright (Task 8): the shell is the outermost *occupied* s, which for an
 * excited species is not the neutral's valence (Au 6s → 6p reports 5s), and
 * the value is an LDA one -- ⟨r⟩ of LDA orbitals, smaller than the
 * Dirac–Fock contractions textbooks quote (gold's 6s: 14 % here) -- so the
 * method goes in the same sentence as the number (spec §3.1).
 */
export function whatChangedText(change: ValenceSContraction, mode: RelativityMode): string {
    const parts = whatChangedParts(change, mode);
    return parts.before + parts.radii + parts.after;
}

/**
 * The same sentence in three pieces, so the readout can keep the radii
 * together: in a 300 px panel "3.31 →" and "2.85 a₀" otherwise land on
 * different lines (fix round 1, M1). ⟨r⟩ is named as the mean radius for a
 * reader who does not know the symbol.
 */
export interface WhatChangedParts { before: string; radii: string; after: string }

export function whatChangedParts(change: ValenceSContraction, mode: RelativityMode): WhatChangedParts {
    const size = Math.abs(change.contractionPercent);
    const verb = change.contractionPercent >= 0 ? 'contracts' : 'expands';
    const nonRelativistic = change.nonRelativisticMeanRadius;
    const relativistic = change.relativisticMeanRadius;
    const digits = radiusDecimals(Math.abs(nonRelativistic - relativistic));
    const method = shortMethodLabel(mode);
    return {
        before: `What changed: ${change.label} ${verb} by ${formatPercent(size)} % (mean radius `,
        radii: `⟨r⟩ ${nonRelativistic.toFixed(digits)} → ${relativistic.toFixed(digits)} a₀`,
        // A non-breaking space: a lone "s)." at the start of a line reads as a typo.
        after: `; the outermost occupied\u00a0s). ${method[0].toUpperCase()}${method.slice(1)} `
            + 'against the same species\' non-relativistic LDA.',
    };
}

/** How the readout names a picture's mode: "still scalar-relativistic". */
const PICTURE_MODE_WORDS: Record<RelativityMode, string> = {
    off: 'non-relativistic',
    scalar: 'scalar-relativistic',
    spinOrbit: 'the Dirac (spin–orbit) one',
};
const SOLVING_WORDS: Record<RelativityMode, string> = {
    off: 'the non-relativistic picture',
    scalar: 'the scalar-relativistic picture',
    spinOrbit: 'the picture with spin–orbit',
};

/**
 * The readout's text, or null for nothing to say. Ruling C9: it speaks for
 * the picture on screen. While the switch and the picture disagree a new
 * mode is solving, and the old picture's contraction must not sit under a
 * switch that names another method -- so it says what is coming and what is
 * still drawn instead. A non-relativistic picture is its own baseline, so
 * it has nothing to report; a relativistic one without a baseline (Pr–Eu
 * 6s → 4f: LDA does not bind the 4f without relativity) says why.
 */
export function relativityReadoutText(switchMode: RelativityMode, readout: RelativityReadout | null): string | null {
    const content = relativityReadoutContent(switchMode, readout);
    return content === null || typeof content === 'string' ? content : content.before + content.radii + content.after;
}

/** relativityReadoutText's decision, with a contraction left in pieces for the readout to lay out. */
export function relativityReadoutContent(switchMode: RelativityMode, readout: RelativityReadout | null): string | WhatChangedParts | null {
    if (!readout) return null;
    if (readout.pictureMode !== switchMode) {
        return `Solving ${SOLVING_WORDS[switchMode]}… the picture on screen is still ${PICTURE_MODE_WORDS[readout.pictureMode]}.`;
    }
    if (readout.pictureMode === 'off') return null;
    if (readout.change) return whatChangedParts(readout.change, readout.pictureMode);
    return readout.comparisonUnavailable;
}

/**
 * The readout as Info shows it (Task 6: atomInfo), with a contraction's radii held on one line (fix round 1, M1: in a
 * narrow panel "3.31 →" and "2.85 a₀" otherwise land on different lines). Null for nothing to say.
 */
export function relativityReadoutNode(switchMode: RelativityMode, readout: RelativityReadout | null): React.ReactNode {
    const content = relativityReadoutContent(switchMode, readout);
    if (content === null || typeof content === 'string') return content;
    return h(React.Fragment, null, content.before,
        h('span', { className: 'relativity-radii', style: { whiteSpace: 'nowrap' } }, content.radii), content.after);
}

// ---- Subshells (from SubshellPanel) ----

/**
 * Whole numbers as they are; a fractional j-level share (spin–orbit on an
 * open subshell: lead's 6p² is 2/3 in 6p½ and 4/3 in 6p³⁄₂) to two places.
 */
export function formatElectrons(electrons: number): string {
    return Number.isInteger(electrons) ? String(electrons) : electrons.toFixed(2);
}

/** A subshell's capacity: 2(2l+1), or 2j+1 for one j-level. */
export function subshellCapacity(subshell: Pick<SerialisedSubshell, 'l' | 'j'>): number {
    return subshell.j === undefined ? 2 * (2 * subshell.l + 1) : 2 * subshell.j + 1;
}

/**
 * Task 6: said in Info (atomInfo's technical band), no longer under SubshellPanel's chips.
 *
 * Spec §3.6: a j-level is drawn with its own R(r) times the real l
 * orbitals, the renderer's one basis. That is honest about its size but not
 * its shape -- a |j, m_j⟩ state mixes mₗ with spin, and a p½ state's density
 * is spherical -- so say which part of the picture is a basis choice. For the
 * isolated j-level when there is one; otherwise for the whole shell, whose
 * j-levels' lobes overlap. Null when nothing drawn has lobes to qualify: no
 * j-levels (off, scalar), only s½ ones, or an isolated s½, whose sphere is
 * its true shape. The p½ example only where there is a p level.
 */
export function jLevelNote(shellSubshells: SerialisedSubshell[], active: SerialisedSubshell | null): string | null {
    const example = (hasP: boolean) => (hasP ? ' (a p½ state is spherical)' : '');
    if (active) {
        if (active.j === undefined || active.l === 0) return null;
        return `The lobes are the ${shellLetter(active.l)} orbitals' shapes, sized by `
            + `${subshellLabel(active.n, active.l, active.j)}'s own radial function — a basis choice. `
            + `A j-level mixes mₗ with spin, so its own states have other shapes${example(active.l === 1)}.`;
    }
    const levels = shellSubshells.filter(s => s.j !== undefined && s.l > 0);
    if (levels.length === 0) return null;
    return 'Each j-level is drawn as its l orbitals\' lobes, sized by its own radial function — a basis choice. '
        + `${listOf(levels.map(s => subshellLabel(s.n, s.l, s.j)))} overlap here; `
        + `a j-level's own states have other shapes${example(levels.some(s => s.l === 1))}.`;
}

// ---- The ΔSCF energy (from SpeciesControls) ----

/**
 * The ground-state → ionised-species label ("Na → Na⁺", "Na⁺ → Na²⁺") that
 * disambiguates *which* ionisation an energy is (ruling M4: without it,
 * every cation's "Ionisation energy" line reads the same as the neutral
 * atom's). Only defined for a ground-state species (an excited one shows its
 * excitation energy instead, never an ionisation energy -- see the caller).
 *
 * Prefers the energy reading's own labels when one has arrived (they are
 * exactly what the ΔSCF calculation used); falls back to deriving the same
 * strings from the species itself via `ionisedSpeciesOf` + `speciesSymbol`
 * so the qualifier is not blank while the reading is still computing.
 * `ionisedSpeciesOf` only identifies *which* species is next -- it is not
 * `ionisationEnergy`, which would trigger a real SCF solve, wrong to do from
 * inside a presentational component.
 */
function ionisationQualifier(species: AtomSpecies, reading: EnergyReading | null): string | null {
    if (species.excitation) return null;
    if (reading) return `${reading.fromLabel} → ${reading.toLabel}`;
    const ionised = ionisedSpeciesOf(species);
    if (ionised === null) return null;
    const toLabel = ionised === 'bare nucleus'
        ? `${speciesSymbol({ ...species, charge: species.Z, excitation: null })} (bare nucleus)`
        : speciesSymbol(ionised);
    return `${speciesSymbol(species)} → ${toLabel}`;
}

/**
 * What the value slot says. "—" is reserved for an answer the ΔSCF gave --
 * no such energy (Na⁺'s next electron would break the neon core) -- never
 * for one not asked yet: the energies wait for the species' picture (ruling
 * C15), and until then the line says so.
 */
export function energyValueText(reading: EnergyReading | null, status: EnergiesState['status'], noValueReason?: string, pictureFailed = false, isExcitation = false): string {
    // Ruling FR-2: "waiting" would wait for ever on a picture that failed.
    // The picture's error is either an unconverged SCF or a worker failure;
    // both leave the energies unasked, so say that rather than guess which.
    if (status === 'idle') return pictureFailed ? 'not computed — the picture\'s solve failed' : 'waiting for the picture…';
    if (status === 'computing') return 'computing…';
    if (reading) {
        const value = `${reading.valueEv.toFixed(2).replace('-', '−')} eV`;
        // Ruling FR-1's note is about an excited configuration landing below
        // the ground one; a negative ionisation energy would be another fault.
        return isExcitation && reading.valueEv < 0 ? `${value} (${BELOW_GROUND_NOTE})` : value;
    }
    return noValueReason ? `— (${noValueReason})` : '—';
}

/**
 * Which ionisation energy a line or fact names (ruling M4: without it every cation's reads the same as the neutral
 * atom's): "Ionisation energy (Na → Na⁺)"; an anion's is an electron affinity (M3). One label for the panel and Info.
 */
export function ionisationLabelOf(species: AtomSpecies, reading: EnergyReading | null): string {
    if (species.charge < 0) {
        // M3: ionising an anion of charge q releases exactly the electron
        // affinity of the species one charge less negative -- O²⁻ → O⁻ is
        // the electron affinity of O⁻, not of the neutral O, so the label is
        // built from species.charge + 1, never a bare element symbol.
        return `Ionisation energy (= electron affinity of ${speciesSymbol({ ...species, charge: species.charge + 1, excitation: null })})`;
    }
    const qualifier = ionisationQualifier(species, reading);
    return qualifier ? `Ionisation energy (${qualifier})` : 'Ionisation energy';
}

/** Why there is no ionisation energy to show (final review M6): the app offers no next ion to subtract. */
export function ionisationNoValueReason(species: AtomSpecies): string | undefined {
    return ionisedSpeciesOf(species) === null ? 'next ion not offered' : undefined;
}
