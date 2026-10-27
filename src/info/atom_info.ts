/**
 * Atoms' Info (plan Task 6): what the selection is -- the whole atom, a shell, a subshell or one orbital -- in the
 * reader's band. It owns every sentence the Atoms panels used to print: the valence note and the hint on what to
 * click (LevelNav), the method line and "About this model", the isolate hint and the j-level note (SubshellPanel), the
 * ΔSCF method, NIST comparison, limitation note and dashed-ring comparison (SpeciesControls), what each relativity mode
 * is and what changed (the Relativity switch), the Electron enclosed and Cut away helpers, the |R|² tab's caption and
 * the cut-face caption the plot and the key column both printed. The panels keep controls and short labelled values.
 * Ruling PF3: no topic parameter; an (i)'s term is InfoPanel's (from the glossary).
 *
 * Science, stated once and never rewritten here: the sentences come from the functions that already said them
 * (methodStatement, aboutModelText with aboutRelativitySentence and relativisticEnergiesSentence, deltaScfMethod,
 * ieLimitationNote, relativityHelp, jLevelNote). An orbital energy is a central-field LDA eigenvalue, never an
 * ionisation energy; an ionisation energy is ΔSCF, compared with NIST only for a neutral atom.
 */
import React from 'react';
import type { RootState } from '../store';
import type { LearningLevel } from '../levels/levels';
import type { InfoContent, InfoFact } from './info_types';
import { OrbitalLabel } from '../format/OrbitalLabel';
import { effectiveRelativity, profileRelativity, speciesOf } from '../store/atomSlice';
import { elementFor } from '../elements';
import { isNeutralGround, speciesConfiguration, speciesKey, speciesSymbol, speciesTitle, excitationLabel } from '../atom/species';
import {
    SubshellOccupancy, configurationLabelOf, shellsOf, subshellLabel, valenceConfigurationLabelOf, valenceNote,
    valenceShellOf, valenceSubshellsOf,
} from '../atom/configurations';
import { defaultRelativityFor, methodStatement, shortMethodLabel } from '../atom/relativity';
import { deltaScfMethod } from '../atom/delta_scf';
import { NIST_FIRST_IONISATION_EV } from '../atom/ionisation_references';
import { formatSignedPercent, ieLimitationNote, signedDifferencePercent } from '../atom/ie_accuracy';
import { formatDrawnRadius } from '../atom/format_radius';
import { LARGE_COMPONENT_NOTE, RADIAL_FACTOR_NOTE } from '../atom/plot_tabs';
import { isoValueText, orbitalEnergyText, shapeWord } from '../orbital_facts';
import { shellLetter } from '../orbital_names';
import { shellName as viewShellName } from '../shell/view_title';
import { aboutModelText, shellName } from '../components/LevelNav';
import { cutHelpText, relativityHelp, relativityReadoutNode, relativityReadoutOf } from '../components/Controls';
import { formatElectrons, jLevelNote } from '../components/SubshellPanel';
import { IE_LEVEL, energyValueText, ionisationLabelOf, ionisationNoValueReason } from '../components/SpeciesControls';
import { enclosedFact } from './basic_info';

const h = React.createElement;

/** What the builder reads: the atom slice, and the orbital slice's enclosed fraction, iso value and cut. */
export type AtomsInfoState = Pick<RootState, 'atom' | 'orbital'>;

/**
 * The cut-face caption (the 3D cut face shades the same D(r) the plot draws, scaled to local shell structure so every
 * shell stays visible). It used to be printed twice, under the plot and in the key column; Info says it once.
 */
export const CUT_FACE_NOTE = 'Cut face shading is scaled to local shell structure.';

/**
 * The critique's researcher red flag: a link without `rel` opens a heavy element non-relativistic (ruling C1 -- every
 * link copied before Phase 4 showed the non-relativistic atom, and must again), though scalar is its default from
 * caesium on. Info says so whenever a heavy element is drawn with relativity off.
 */
export const SCALAR_DEFAULT_NOTE = 'Scalar relativistic is the default for this element.';

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const sum = (subshells: SubshellOccupancy[]) => subshells.reduce((total, s) => total + s.electrons, 0);
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "and" between the last two: "5f and 6d", "2s, 2p and 3s". */
function listOf(items: string[]): string {
    return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The valence electrons in plain words, from the species' own configuration (ruling P14: an open (n−1)d or (n−2)f
 * counts too): "4 electrons in the outer shell", "2 electrons in the outer shell and 6 in the open 3d".
 */
export function valencePlainWords(configuration: SubshellOccupancy[]): string {
    const outer = valenceShellOf(configuration);
    const valence = valenceSubshellsOf(configuration);
    const outerCount = sum(valence.filter(s => s.n === outer));
    const inner = valence.filter(s => s.n < outer);
    const words = `${outerCount} ${plural(outerCount, 'electron', 'electrons')} in the outer shell`;
    if (inner.length === 0) return words;
    return `${words} and ${sum(inner)} in the open ${listOf(inner.map(s => subshellLabel(s.n, s.l)))}`;
}

type Drill = 'atom' | 'shell' | 'subshell' | 'orbital';

function drillOf(atom: AtomsInfoState['atom']): Drill {
    if (atom.level === 'orbital' && atom.selectedOrbital) return 'orbital';
    if (atom.level === 'shell' && atom.selectedSubshell) return 'subshell';
    if (atom.level === 'shell' && atom.selectedShell !== null) return 'shell';
    return 'atom';
}

/**
 * The hint on what to click next -- LevelNav's shell hint and SubshellPanel's isolate hint, which said much the same
 * at the same level, as one sentence; "above" and "below" (where they stood) become what the control is.
 */
function hintSentence(atom: AtomsInfoState['atom'], drill: Drill): string {
    if (atom.unbound) return 'Nothing is drawn for this species, so there is no shell to open.';
    switch (drill) {
        case 'atom':
            return 'Click a ring in the 3D view, or a shell chip, to open it.';
        case 'shell':
            return `${shellName(atom.selectedShell!)} only — click it again, or the ✕, for the whole atom. `
                + 'Click a subshell to show its orbitals on their own.';
        case 'subshell': {
            const { n, l, j } = atom.selectedSubshell!;
            return `Showing ${subshellLabel(n, l, j)} alone — click its chip again for the whole shell.`;
        }
        case 'orbital': {
            const { n, l, j } = atom.selectedOrbital!;
            return `Showing one orbital of ${subshellLabel(n, l, j)} — pick another, or Back for the whole subshell.`;
        }
    }
}

/** The title, as the canvas names the view (view_title.ts), with an orbital's name typeset: Carbon — 2p<sub>z</sub> orbital. */
function titleOf(atom: AtomsInfoState['atom'], drill: Drill, who: string): React.ReactNode {
    const notDrawn = atom.unbound ? ' — not drawn' : '';
    switch (drill) {
        case 'atom':
            return `${who} — whole atom${notDrawn}`;
        case 'shell':
            return `${who} — ${viewShellName(atom.selectedShell!)}${notDrawn}`;
        case 'subshell': {
            const { n, l, j } = atom.selectedSubshell!;
            return `${who} — ${subshellLabel(n, l, j)}${notDrawn}`;
        }
        case 'orbital': {
            const { n, l, ml, j } = atom.selectedOrbital!;
            return h(React.Fragment, null, `${who} — `, h(OrbitalLabel, { n, l, ml }), ' orbital',
                j === undefined ? '' : ` · ${subshellLabel(n, l, j)}`, notDrawn);
        }
    }
}

/** What the selection is, in plain words: how many electrons where, and an orbital's shape. */
function leadSentence(state: AtomsInfoState, drill: Drill, configuration: SubshellOccupancy[]): string {
    const atom = state.atom;
    const species = speciesOf(atom);
    const name = elementFor(species.Z)?.name ?? `Z = ${species.Z}`;
    const who = isNeutralGround(species) ? name : speciesSymbol(species);
    const electrons = sum(configuration);
    switch (drill) {
        case 'atom': {
            const shells = shellsOf(configuration).length;
            return `${who} has ${electrons} ${plural(electrons, 'electron', 'electrons')} in ${shells} ${plural(shells, 'shell', 'shells')}.`
                + (atom.profile ? ' The cut face shows them as rings.' : '');
        }
        case 'shell': {
            const own = configuration.filter(s => s.n === atom.selectedShell);
            return `The ${shellName(atom.selectedShell!)} holds ${sum(own)} of ${who}'s ${electrons} electrons: ${configurationLabelOf(own)}.`;
        }
        case 'subshell': {
            const { n, l, j } = atom.selectedSubshell!;
            const drawn = atom.profile?.subshells.find(s => s.n === n && s.l === l && s.j === j);
            const held = drawn?.electrons ?? configuration.find(s => s.n === n && s.l === l)?.electrons ?? 0;
            const capacity = j === undefined ? 2 * (2 * l + 1) : 2 * j + 1;
            return `${subshellLabel(n, l, j)} holds ${formatElectrons(held)} ${plural(held, 'electron', 'electrons')}, with room for ${capacity}.`;
        }
        case 'orbital': {
            const { n, l, ml, j } = atom.selectedOrbital!;
            const sub = subshellLabel(n, l, j);
            if (l === 0) return `The one orbital of ${sub}, a sphere.`;
            const shape = shapeWord(l, ml);
            const described = !shape ? '' : /^(six|eight)\b/.test(shape) ? `, with ${shape}` : `, a ${shape}`;
            return `One of the ${2 * l + 1} ${shellLetter(l)} orbitals of ${sub}${described}.`;
        }
    }
}

/** The dashed ring's comparison with the neutral atom (moved from SpeciesControls), or null with no ring. */
function dashedRingText(state: AtomsInfoState): string | null {
    const profile = state.atom.profile;
    const reference = profile?.reference ?? null;
    if (!profile || !reference) return null;
    const species = speciesOf(state.atom);
    const neutral = speciesSymbol({ Z: species.Z, charge: 0, excitation: null });
    const ratio = profile.displayRadius / reference.displayRadius;
    const percent = Math.abs(ratio - 1) * 100;
    // M11: a rounded 0 % reads as a typo ("−0 %"), not as "these are the same size" -- say that plainly.
    const sizeNote = percent < 0.5 ? '≈ same size' : `${ratio < 1 ? '−' : '+'}${Math.round(percent)} %`;
    const picture = profileRelativity(profile);
    // Spec §3.1: both radii come from the picture's own mode (ruling C4), so a relativistic one says which.
    return `neutral ${neutral}, drawn radius ${formatDrawnRadius(reference.displayRadius)} a₀ · `
        + `${speciesSymbol(species)} ${formatDrawnRadius(profile.displayRadius)} a₀ (${sizeNote})`
        + (picture !== 'off' ? ` · both ${shortMethodLabel(picture)}` : '');
}

interface EnergyFacts { facts: InfoFact[]; limitation: string | null }

/** The ΔSCF energy (Advanced, as the panel's line), and for a neutral atom NIST's measurement with the signed difference. */
function energyFacts(state: AtomsInfoState): EnergyFacts {
    const atom = state.atom;
    if (atom.unbound) return { facts: [], limitation: null };
    const species = speciesOf(atom);
    // Ruling C5: a reply in flight can describe a species no longer selected.
    const matches = atom.energies.speciesKey === speciesKey(species);
    const status = matches ? atom.energies.status : 'idle';
    const pictureFailed = atom.error !== null;
    if (species.excitation) {
        const reading = matches ? atom.energies.excitation : null;
        return {
            facts: [{
                label: `Excitation energy ${excitationLabel(species.excitation)}`,
                value: energyValueText(reading, status, undefined, pictureFailed, true),
                min: IE_LEVEL,
            }],
            limitation: null,
        };
    }
    const reading = matches ? atom.energies.ionisation : null;
    const facts: InfoFact[] = [{
        label: ionisationLabelOf(species, reading),
        value: energyValueText(reading, status, ionisationNoValueReason(species), pictureFailed),
        min: IE_LEVEL,
    }];
    // Ruling P15: NIST's value is the neutral atom's own first ionisation energy only.
    const measured = species.charge === 0 ? NIST_FIRST_IONISATION_EV[species.Z] : undefined;
    if (measured === undefined || !reading) return { facts, limitation: null };
    const percent = signedDifferencePercent(reading.valueEv, measured);
    facts.push({ label: 'Measured (NIST)', value: `${measured.toFixed(3)} eV (calculated ${formatSignedPercent(percent)})`, min: IE_LEVEL });
    return { facts, limitation: ieLimitationNote(species, percent) };
}

/** The drawn orbital's iso value -- only once this orbital itself has landed; until then it is the previous one's. */
function isoFact(state: AtomsInfoState): InfoFact | null {
    const orbital = state.atom.selectedOrbital;
    const { currentParams, isoLevel, isLoading, renderFailed, enclosedFraction } = state.orbital;
    const drawn = orbital && currentParams && currentParams.radialSamples && currentParams.Z === state.atom.Z
        && currentParams.n === orbital.n && currentParams.l === orbital.l && currentParams.ml === orbital.ml
        && currentParams.enclosedFraction === enclosedFraction;
    if (!drawn || isLoading || renderFailed || isoLevel === null) return null;
    return { label: 'Iso value', value: isoValueText(isoLevel), min: 'advanced' };
}

/** A paragraph of sentences and nodes, joined by spaces, empty parts dropped. */
function sentences(...parts: React.ReactNode[]): React.ReactNode {
    const kept = parts.filter(part => part !== null && part !== undefined && part !== false && part !== '');
    if (kept.length === 0) return null;
    return h(React.Fragment, null, ...kept.flatMap((part, i) => (i === 0 ? [part] : [' ', part])));
}

/** Atoms' Info for the current selection (InfoPanel filters the facts and bands by level). */
// `level` is unused for now: every band is written, and InfoPanel shows the ones a level reads. Ruling PF3 keeps it in
// the signature every mode's builder shares. `state` is the atom and orbital slices (a whole RootState is one too).
export function atomInfo(state: AtomsInfoState, level: LearningLevel): InfoContent {
    const atom = state.atom;
    const species = speciesOf(atom);
    const configuration = speciesConfiguration(species);
    const drill = drillOf(atom);
    const profile = atom.profile;
    const selected = effectiveRelativity(atom);
    // Ruling C9: what describes the picture reads the drawn profile's mode, not the switch's.
    const picture = profile ? profileRelativity(profile) : selected;
    const fraction = state.orbital.enclosedFraction;
    const shellView = drill !== 'orbital';

    const isDefault = selected === defaultRelativityFor(atom.Z);
    const scalarDefault = defaultRelativityFor(atom.Z) === 'scalar' && selected === 'off';
    const energies = energyFacts(state);
    const ring = dashedRingText(state);

    const shellN = drill === 'atom' ? null : drill === 'shell' ? atom.selectedShell
        : drill === 'subshell' ? atom.selectedSubshell!.n : atom.selectedOrbital!.n;
    const shellSubshells = profile && shellN !== null ? profile.subshells.filter(s => s.n === shellN) : [];
    const chosen = atom.selectedSubshell;
    const activeSubshell = chosen && chosen.n === shellN
        ? shellSubshells.find(s => s.n === chosen.n && s.l === chosen.l && s.j === chosen.j) ?? null : null;
    const jNote = profile && shellN !== null ? jLevelNote(shellSubshells, activeSubshell) : null;
    // The orbital energy of what is selected: a subshell's (or j-level's) eigenvalue; an orbital shares its subshell's.
    const where = drill === 'orbital' ? atom.selectedOrbital : drill === 'subshell' ? atom.selectedSubshell : null;
    const energySubshell = where && profile ? profile.subshells.find(s => s.n === where.n && s.l === where.l && s.j === where.j) : undefined;

    const coreNote = valenceNote(configuration) ?? (shellsOf(configuration).length > 1 ? 'everything inside is core' : null);
    const clipAxis = state.orbital.surfaceStyle.clipAxis;
    const readout = profile ? relativityReadoutNode(selected, relativityReadoutOf(profile)) : null;

    const facts: InfoFact[] = [
        { label: 'Configuration', value: configurationLabelOf(configuration) },
        { label: 'Valence', value: valencePlainWords(configuration) },
        ...(energySubshell ? [{ label: 'Orbital energy', value: orbitalEnergyText(energySubshell.energy), min: 'explore' as const }] : []),
        ...energies.facts,
        ...(ring ? [{ label: 'Dashed ring', value: ring, min: 'explore' as const }] : []),
        { label: 'Relativity', value: relativityHelp(selected, isDefault), min: 'advanced' },
        enclosedFact(fraction, drill === 'orbital' ? 'of the electron'
            // Ruling FR-M6: a subshell holds several orbitals, each with its own surface.
            : drill === 'subshell' ? "of each orbital's probability" : 'of the electron density'),
        ...(drill === 'orbital' && isoFact(state) ? [isoFact(state)!] : []),
    ];

    return {
        title: titleOf(atom, drill, speciesTitle(species)),
        plain: sentences(
            leadSentence(state, drill, configuration),
            scalarDefault && SCALAR_DEFAULT_NOTE,
            shellView && profile && !atom.unbound && CUT_FACE_NOTE,
            hintSentence(atom, drill),
        ),
        technical: sentences(
            coreNote && `Valence ${valenceConfigurationLabelOf(configuration)}: ${coreNote}.`,
            energySubshell && 'Its orbital energy is an eigenvalue of the central-field LDA, never an ionisation energy.',
            (drill === 'subshell' || drill === 'orbital') && (picture === 'off' ? RADIAL_FACTOR_NOTE : LARGE_COMPONENT_NOTE),
            jNote,
            readout,
            !ring && profile?.referenceUnavailable,
            energies.limitation && `${capitalise(energies.limitation)}.`,
            clipAxis !== 'none' && profile && cutHelpText(clipAxis, !shellView),
        ),
        facts,
        computed: h(React.Fragment, null,
            h('p', null, `${capitalise(methodStatement(selected))}.`),
            h('p', null, aboutModelText(selected, picture, profile !== null)),
            h('p', null, deltaScfMethod(picture)),
        ),
    };
}
