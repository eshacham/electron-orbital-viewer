/**
 * Molecules' Info (plan Task 7b): what the view is -- a molecule's electron density, its electrostatic potential map,
 * one of its orbitals, or its structure alone -- in the reader's band. It owns every sentence the Molecules panels used
 * to print: the geometry/method caption under the surface switch (MoleculeNav), the orbital list's gap note, key to the
 * marks and caption wall (MoleculeOrbitalList), the structure, labels and dipole notes (MoleculeViewOptions), the
 * readout's geometry line (MoleculeReadout), the Properties card's captions, the ESP key's notes (EspLegend), and the
 * Enclosed and Cut helpers (Controls); and, under "How this was computed", the former provenance panel (ruling PF5).
 * The panels keep controls, values and short labels; the inside-ball note stays in the list, as it carries an action.
 * Ruling PF3: no topic parameter; an (i)'s term is InfoPanel's (from the glossary).
 *
 * Science, stated once and never rewritten here: the sentences come from the modules that already said them
 * (orbital_display, esp_color, dipole, the provenance panel, atom_text's cut sentence). Every orbital energy is a
 * Kohn–Sham eigenvalue, never an ionisation energy, and the HOMO–LUMO gap is neither the optical nor the fundamental
 * gap -- said once (kohnShamNote), from Explore, where the energies appear. ESP: red is negative, electron-rich
 * (esp_color's ESP_STOPS). An on-demand computed molecule may list no reference values: Info says so, never invents one.
 * The geometry source is the Properties row's, said once; a computed molecule's recipe is "How this was computed"'s.
 */
import React from 'react';
import type { RootState } from '../store';
import { atLeast, CONTROL_LEVEL, type LearningLevel } from '../levels/levels';
import type { InfoContent, InfoFact, InfoTopicId } from './info_types';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import type { MoleculeOrbitalInfo } from '../molecules/types';
import { formatFormula } from '../molecules/catalogue';
import { moleculeTitle } from '../export/caption';
import {
    CONSTRUCTED_MARK, CONSTRUCTED_NOTE, DIFFUSE_MARK, DIFFUSE_NOTE, LVMO_NOTE, UNCLASSIFIED_NOTE, VALENCE_THRESHOLD,
    degeneracyCounts, diffuseDescription, gapTerm, isConstructed, isUpperEstimate, kohnShamNote, labelNotes,
    labelsSentence, orbitalEnergyWithEstimate, orbitalGaps,
} from '../molecules/orbital_display';
import {
    ESP_COLOURS_SENTENCE, ESP_SCALE_SENTENCE, ESP_SURFACE_DENSITY, ESP_SURFACE_SENTENCE, espRangeText, espSaturatedSentence,
} from '../molecules/esp_color';
import { dipoleFactText, dipoleValueText, hasDipoleArrow } from '../molecules/dipole';
import { spaceFillingUnavailableReason } from '../molecules/vdw_radii';
import { tierOf } from '../molecules/types';
import { TIER_LABEL, tierLine } from '../validation/geometry_honesty';
import type { OwnerJobRecord } from '../jobs/owner_job_record';
import { cutAwaySentence } from '../atom/atom_text';
import { isoValueText } from '../orbital_facts';
import { orbitalEnergyText } from '../format/energy';
import { formatSci } from '../format/sci';
import { nb, plural } from '../format/text';
import { withSubscripts } from '../format/subscripts';
import { PointGroupLabel } from '../format/PointGroupLabel';
import ProvenancePanel from '../components/ProvenancePanel';
import InfoButton from './InfoButton';
import { enclosedFact } from './facts';

const h = React.createElement;

/**
 * What the builder reads: the Molecules selection and drawn surface, and the orbital slice's enclosed fraction and cut;
 * the owner's record of a computed molecule (jobs/owner_job_record.ts ownerJobRecordOf -- absent for anyone else);
 * `moleculeLabels`, the display preference's bond-label switch (eov.display, never in the store); and `tierLineShown`,
 * set on a phone, where the tier chip is compact and its line would be a tooltip no touch screen shows (fix round 1,
 * ruling on concern 5). App passes the last three in.
 */
export type MoleculeInfoState = Pick<RootState, 'molecule' | 'orbital'> & Partial<OwnerJobRecord>
    & { moleculeLabels?: boolean; tierLineShown?: boolean };

/** The dipole arrow's sign convention (MoleculeViewOptions, before Task 7b), word for word. */
export const DIPOLE_CONVENTION = 'The arrow points from − to + (the physics convention), 1 a₀ per debye; many chemistry texts draw it the other way.';

/** A fact's label with its term's (i) -- in Info, so `place` 'info' (another (i) for the term may sit in a panel). */
const withInfo = (text: string, topic: InfoTopicId, label: string) =>
    h(React.Fragment, null, text, h(InfoButton, { topic, label, place: 'info' }));

/** Short paragraphs, one idea each, typeset; empty ones dropped. */
function paragraphs(...parts: Array<string | null | false | undefined>): React.ReactNode[] {
    return parts.filter((part): part is string => Boolean(part)).map(withSubscripts);
}

/** Orbitals closer than this are one level (degeneracyCounts' own tolerance). */
const SAME_LEVEL_HARTREE = 1e-4;

/**
 * One orbital in plain words: what it is, how many electrons it holds, its frontier role and what its data flag.
 * Fix round 1 (I3): an open shell's HOMO is the highest *doubly* occupied orbital -- NO₂'s SOMO (6a1) lies above its
 * HOMO (4b2) -- and a SOMO's role says its one electron, so it is not said twice. "Orbital", as the homoLumo glossary says.
 * Fix round 2 (N1): the clauses come from the energies and occupations, not from one assumed order -- an owner-computed
 * triplet has two SOMOs, and ROKS energies need not put them above the HOMO. Only an orbital with no occupied orbital
 * above it is "the highest that holds electrons"; the HOMO says how many SOMOs lie above it, if any do.
 */
function orbitalWords(formula: string, orbital: MoleculeOrbitalInfo, orbitals: MoleculeOrbitalInfo[]): { lead: string; more: string } {
    const degenerate = degeneracyCounts(orbitals).get(orbital.index) ?? 1;
    const others = degenerate > 1 ? `, one of ${degenerate} with the same energy` : '';
    // Task 9b (finish review, fix 5): the lead keeps to three lines -- what the orbital is. What a constructed one is, how
    // full it is, its role and what its data flag follow the facts (the first note): a Basics strip tile (HOMO, LUMO,
    // LVMO) opened a lead of up to ten lines.
    const what = isConstructed(orbital)
        ? `${orbital.label} is not one of ${formula}'s computed orbitals${others}.`
        : `${orbital.label} is one of ${formula}'s molecular orbitals${others}.`;
    const constructed = isConstructed(orbital) ? `It is ${CONSTRUCTED_NOTE}.` : null;
    const held = orbital.role === 'SOMO' ? null
        : orbital.occupation === 0 ? 'It is empty.'
        : `It holds ${orbital.occupation} ${plural(orbital.occupation, 'electron', 'electrons')}.`;
    const above = (o: MoleculeOrbitalInfo) => o.energyHartree > orbital.energyHartree + SAME_LEVEL_HARTREE;
    const highest = !orbitals.some(o => o.occupation > 0 && above(o));
    const somosAbove = orbitals.filter(o => o.role === 'SOMO' && above(o)).length;
    const role = orbital.role === 'HOMO'
        ? (somosAbove === 1 ? 'It is the HOMO: the highest doubly occupied orbital; the singly occupied SOMO lies above it.'
            : somosAbove > 1 ? `It is the HOMO: the highest doubly occupied orbital; ${somosAbove} singly occupied SOMOs lie above it.`
            : highest ? 'It is the HOMO: the highest orbital that holds electrons.'
            : 'It is the HOMO: the highest doubly occupied orbital.')
        : orbital.role === 'LUMO' ? 'It is the LUMO: the lowest empty orbital.'
        : orbital.role === 'SOMO' ? `It is a SOMO: a singly occupied orbital${highest ? ', the highest that holds electrons' : ''}.`
        : orbital.role === 'LVMO' ? `It is the LVMO: ${LVMO_NOTE}.` : null;
    const diffuse = orbital.class === 'diffuse' ? `${orbital.label} is ${diffuseDescription(orbital)}.` : null;
    return { lead: what, more: [constructed, held, role, diffuse].filter(Boolean).join(' ') };
}

/**
 * The key to the list's marks (MoleculeOrbitalList's legend, before Task 7b): only the marks the list shows, and only
 * what each means (fix round 1, M2: what a diffuse or constructed orbital is is the lead's, or the technical band's).
 */
function marksKey(orbitals: MoleculeOrbitalInfo[], energiesShown: boolean): string | null {
    const keys = [
        orbitals.some(o => o.class === 'diffuse')
            && `${DIFFUSE_MARK} marks a partly diffuse virtual (under ${nb(`${Math.round(VALENCE_THRESHOLD * 100)} %`)} valence).`,
        orbitals.some(isConstructed) && `${CONSTRUCTED_MARK} marks a constructed LVMO, not an orbital of this calculation.`,
        energiesShown && orbitals.some(isUpperEstimate) && '“upper est.” marks an energy that is an upper estimate.',
    ].filter((key): key is string => Boolean(key));
    return keys.length ? keys.join(' ') : null;
}

/**
 * What the orbital labels are, and the virtuals' classes (the list's caption, before Task 7b): technical. Fix round 1
 * (M2): what the lead already says of the drawn orbital (diffuse, the LVMO, constructed) is not said again here.
 */
function listNotes(meta: LibraryMoleculeMeta, chosen: MoleculeOrbitalInfo | null): Array<string | false> {
    const { orbitals } = meta;
    const diffuse = orbitals.filter(o => o.class === 'diffuse');
    const unclassified = orbitals.some(o => !(o.occupation > 0)) && !orbitals.some(o => o.class !== undefined);
    const lvmo = orbitals.find(o => o.role === 'LVMO');
    return [
        labelsSentence(meta.symmetry),
        ...labelNotes(orbitals),
        diffuse.length > 0 && chosen?.class !== 'diffuse' && `A partly diffuse virtual (${DIFFUSE_MARK}): ${DIFFUSE_NOTE}.`,
        // Fix round 1 (M1): its own subject, now that the diffuse key it followed is a note.
        diffuse.some(o => o.energyHartree > 0) && 'Diffuse virtuals at positive energy are unbound, basis-set dependent states, not bound orbitals.',
        lvmo !== undefined && chosen?.role !== 'LVMO' && `LVMO: ${LVMO_NOTE}.`,
        orbitals.some(isConstructed) && !(chosen && isConstructed(chosen)) && `${CONSTRUCTED_MARK} LVMO ${CONSTRUCTED_NOTE}.`,
        unclassified && UNCLASSIFIED_NOTE,
    ];
}

/** Molecules' Info for the current selection (InfoPanel filters the facts and bands by level). */
// `level` decides only what concerns a control the level shows (the structure and bond-label notes, from Explore) and
// the Kohn–Sham caveat, which goes with the energies (from Explore); every band is written, InfoPanel shows the ones
// a level reads (ruling PF3 keeps it in the signature every builder shares).
export function moleculeInfo(state: MoleculeInfoState, meta: LibraryMoleculeMeta | null, level: LearningLevel): InfoContent {
    const { molecule, orbital: view } = state;
    if (!meta) {
        const name = molecule.index?.find(entry => entry.id === molecule.selectedId)?.name;
        return {
            title: name ?? 'Molecules',
            plain: molecule.isLoadingMeta ? 'Loading the molecule…'
                : molecule.error ? 'This molecule did not load.'
                : 'Choose a molecule to see its electron density, electrostatic potential and orbitals.',
            // Task 9 fix round 1: the index name stands in until the meta lands; the real title is the one announced.
            provisional: molecule.selectedId !== null && !molecule.error,
        };
    }
    const { surface, representation } = molecule;
    const formula = formatFormula(meta.formula);
    const fraction = view.enclosedFraction;
    const explore = atLeast(level, 'explore');
    const chosen = surface.kind === 'mo' ? meta.orbitals.find(o => o.index === surface.index) ?? null : null;
    // The contour's value is the drawn surface's: only once the one asked for has landed (App's old helper rule).
    const drawn = molecule.drawn;
    const landed = molecule.renderLabel === null && molecule.renderError === null && molecule.isoLevel !== null
        && (drawn === null || (drawn.surface.kind === surface.kind
            && (surface.kind !== 'mo' || (drawn.surface.kind === 'mo' && drawn.surface.index === surface.index))
            && drawn.enclosedFraction === fraction));

    // --- What it is, in plain words.
    let title: React.ReactNode = moleculeTitle(meta);
    let lead: string;
    // Task 9b: an orbital's electrons, role and flags, the first note after the facts (orbitalWords).
    let orbitalMore: string | null = null;
    if (surface.kind === 'density') {
        title = `${moleculeTitle(meta)} — electron density`;
        // Task 9b (finish review, fix 5): the lead keeps to three lines -- that the density is all the occupied orbitals
        // together is the density glossary entry's (technical band: the sum of |ψ|² over the occupied orbitals).
        lead = `${meta.name} has ${meta.electronCount} electrons; the surface shows where they are likely to be found.`;
    } else if (surface.kind === 'esp') {
        title = `${moleculeTitle(meta)} — electrostatic potential`;
        lead = ESP_COLOURS_SENTENCE;
    } else if (surface.kind === 'mo') {
        const label = chosen?.label ?? `orbital ${surface.index}`;
        title = h(React.Fragment, null, `${moleculeTitle(meta)} — `, withSubscripts(label), ' orbital');
        const words = chosen ? orbitalWords(formula, chosen, meta.orbitals) : null;
        lead = words?.lead ?? `${label} is one of ${formula}'s molecular orbitals.`;
        orbitalMore = words?.more || null;
    } else {
        const arrow = molecule.showDipole && hasDipoleArrow(meta);
        lead = representation !== 'none' ? 'No surface is drawn: the view shows the structure alone.'
            : arrow ? 'No surface or structure is drawn: the view shows the dipole arrow alone.'
            : 'Nothing is drawn: no surface, structure or dipole arrow.';
    }
    const espRange = surface.kind === 'esp' ? molecule.espRange : null;
    const surfaceShown = surface.kind !== 'none';
    // The structure options are Explore's (CONTROL_LEVEL): what they cannot do is said where they are on screen.
    const structureControls = atLeast(level, CONTROL_LEVEL.structure);
    const labelsControl = atLeast(level, CONTROL_LEVEL.bondLabels);
    const dipoleControl = atLeast(level, CONTROL_LEVEL.dipole);
    const unavailable = spaceFillingUnavailableReason(meta.atoms);
    // The lead says what is drawn; the facts follow it, and then these notes on the numbers and the picture -- after
    // the facts, so the numbers stay above Info's fold (InfoContent.notes), one idea a paragraph (fix round 1, I6).
    const plain = withSubscripts(lead);
    const tier = tierOf(meta);
    const notes = paragraphs(
        orbitalMore,
        // Ruling T7-O3 sits on the dipole fact; the energies' caveat, once, wherever an energy is on screen (Explore).
        explore && kohnShamNote(meta.orbitals),
        surface.kind === 'mo' && marksKey(meta.orbitals, explore),
        explore && espRange && espSaturatedSentence(espRange),
        representation === 'ball-and-stick' && 'Sticks show connectivity, not bond order.',
        representation === 'space-filling' && ['The spheres are van der Waals spheres (Bondi 1964 / Mantina 2009).',
            surfaceShown ? 'The spheres can hide the surface inside them.' : ''].join(' ').trim(),
        labelsControl && representation === 'none' && 'No structure is drawn, so there is nothing to label.',
        labelsControl && representation === 'space-filling' && state.moleculeLabels && 'Space filling draws no bonds, so only angles are labelled.',
        structureControls && unavailable && `Space filling is unavailable: ${unavailable}.`,
        // Ruling T2-I2: while the arrow is drawn its convention is said -- Task 9b (finish review, fix 1): from the level
        // its switch is on screen (Explore), so Info never explains it where the pointer says "the dipole arrow … appear
        // at Explore".
        dipoleControl && molecule.showDipole && hasDipoleArrow(meta) && DIPOLE_CONVENTION,
        surfaceShown && cutAwaySentence(view.surfaceStyle.clipAxis),
        // Ruling (concern 5): on a phone, the tier line -- its own builder's words -- last, at every level. Fix round 2
        // (N2): the computed line already says "Computed on request", so it goes without the label.
        state.tierLineShown && (tier === 'computed' ? tierLine(meta) : `${TIER_LABEL[tier]}: ${tierLine(meta)}`),
    );

    // --- Key facts, each from the level that reads it.
    // Ruling (concern 4): each number has one home, Info; the Properties card keeps what Info does not show. No Formula
    // fact: the title says it ("Water (H₂O)").
    // Task 9b (finish review, fix 1): the point group is a scientific term with an (i) -- Advanced's band; the dipole
    // shows its value with units below Research, and the experiment and its reference at Research.
    const dipole = atLeast(level, 'research') ? dipoleFactText(meta) : dipoleValueText(meta);
    const facts: InfoFact[] = [
        { label: withInfo('Point group', 'pointGroup', 'Point group'), value: h(PointGroupLabel, { pg: meta.symmetry.pointGroup }), min: 'advanced' },
        { label: 'Electrons', value: String(meta.electronCount) },
        // Ruling T7-O3: a documented caveat stays beside the number it qualifies.
        { label: withInfo('Dipole μ', 'dipole', 'Dipole moment'), value: `${dipole}${meta.caveat ? ` — ${meta.caveat}` : ''}` },
        ...orbitalGaps(meta.orbitals).map((gap, index): InfoFact => ({
            label: index === 0 ? withInfo(gapTerm(gap), 'homoLumo', 'HOMO and LUMO') : gapTerm(gap),
            value: nb(orbitalEnergyText(gap.hartree)), min: 'explore',
        })),
    ];
    if (chosen) {
        facts.push({
            label: withInfo('Orbital energy', 'kohnSham', 'Kohn–Sham orbitals'),
            value: nb(orbitalEnergyWithEstimate(chosen)), min: 'explore',
        });
    }
    if (espRange) facts.push({ label: 'Potential range', value: nb(espRangeText(espRange)), min: 'explore' });
    if (surface.kind === 'esp') facts.push({ label: 'Surface', value: nb(`ρ = ${ESP_SURFACE_DENSITY} e/a₀³`), min: 'advanced' });
    if (surface.kind === 'density' || surface.kind === 'mo') {
        facts.push(enclosedFact(fraction, surface.kind === 'mo' ? "of the orbital's |ψ|²" : 'of the electron density'));
        if (landed) {
            facts.push({
                label: 'Iso value',
                value: surface.kind === 'mo' ? isoValueText(molecule.isoLevel!) : nb(`ρ = ${formatSci(molecule.isoLevel!)} e/a₀³`),
                min: 'advanced',
            });
        }
    }

    // --- The technical band: what the surface's contour is, and (with the list on screen) its labels and classes.
    const technical = paragraphs(
        surface.kind === 'density' && 'The surface is a contour of constant density ρ, at the value that encloses the chosen fraction of the electrons.',
        surface.kind === 'mo' && 'The surface is a contour of constant |ψ|², at the value that encloses the chosen fraction of the orbital.',
        surface.kind === 'esp' && ESP_SCALE_SENTENCE,
        surface.kind === 'esp' && ESP_SURFACE_SENTENCE,
        ...(surface.kind === 'mo' ? listNotes(meta, chosen) : []),
    );

    // --- How this was computed: the provenance, said once (and the owner's time and cost, to the owner alone).
    const computed = h(ProvenancePanel, { meta, ownerJob: state.ownerJob ?? null, ownerJobError: state.ownerJobError ?? null });

    return { title, plain, facts, notes, technical, computed };
}
