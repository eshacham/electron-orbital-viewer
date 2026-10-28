/**
 * Orbitals' Info (plan Task 5): what the selection is, in the reader's band. It owns every sentence the Orbitals panels
 * used to print -- the Z = 1 caption under the tile, the Combination picker's captions, and the Electron enclosed and
 * Cut away helpers -- so the panels keep controls, short labels and readouts only. Ruling PF3: no topic parameter;
 * an (i)'s term is InfoPanel's (from the glossary).
 *
 * Science, stated once here: one orbital is hydrogen's exact one-electron solution (Z = 1), E = −1/(2n²) Ha, with
 * n − l − 1 radial and l angular nodes; a hybrid mixes the degenerate n = 2 states, so it keeps E(n = 2); a field view
 * is first-order perturbation theory -- never "exact" (the critique's contradiction) -- and states only the shifts the
 * app computes (n = 2's ∓3F; n = 1 has none to first order).
 */
import React from 'react';
import type { RootState } from '../store';
import type { LearningLevel } from '../levels/levels';
import type { InfoContent, InfoFact } from './info_types';
import { enclosedFact, labelWithInfo } from './facts';
import InfoButton from './InfoButton';
import { OrbitalLabel } from '../format/OrbitalLabel';
import { minus } from '../format/sci';
import { withSubscripts } from '../format/subscripts';
import { nb, plural } from '../format/text';
import { shellLetter } from '../orbital_names';
import { angularNodeSurfaces, isoValueText, shapeWord } from '../orbital_facts';
import { RADIAL_FACTOR_NOTE } from '../atom/plot_tabs';
import { cutAwaySentence } from '../atom/atom_text';
import { CombinationSelection, combinationTitle, fieldRequestFor, samePicture, selectionProblem } from '../combinations';
import { HybridKind, HYBRID_NAMES, hybridCount } from '../hybrids';
import { MAX_FIELD_AU } from '../field_source';
import { BASIC_ORBITALS_Z } from '../orbital_presets';
import {
    DEBYE_PER_EA0, EV_PER_HARTREE, N2_MAX_FIELD_AU, StarkState, formatVoltsPerMetre, inducedDipole,
    nextOrderDipoleShare, starkShiftHartree, starkShiftText,
} from '../stark';

const h = React.createElement;

/** What the builder reads: the orbital slice alone (fix round 1: App passes exactly this, so its memo deps are honest). */
export type OrbitalsInfoState = Pick<RootState, 'orbital'>;

/** A quantum-number label, the number in italics as physics sets it -- "Subshell l" must not read "Subshell I". */
const qLabel = (word: string, symbol: string) => h(React.Fragment, null, `${word} `, h('i', null, symbol));

/**
 * Task 1 (picture control): the Subshell and Orbital rows left BasicExplore -- the strip is the picker now -- so
 * their fact labels carry the (i) that used to sit on the row (place 'info', the shared fact-label pattern from
 * atom_info/bonds_info's own kohnShamLabel/curveLabel: the topic is written out at each call, not passed through a
 * shared parameter, so the glossary reachability check (tests/info/glossary.test.ts) finds it by source text).
 * Shell n keeps its own row and its (i) there, so its fact stays plain (`qLabel`).
 */
const subshellFactLabel = h(React.Fragment, null, 'Subshell ', h('i', null, 'l'), h(InfoButton, { topic: 'subshell', label: 'Subshell', place: 'info' }));
const orbitalFactLabel = h(React.Fragment, null, 'Orbital ', h('i', null, 'mₗ'), h(InfoButton, { topic: 'orbital', label: 'Orbital', place: 'info' }));

/**
 * Spec §7's one-electron framing (moved from BasicExplore's tile caption, Task 5). Still exported: App's Help dialog
 * quotes it. A single orbital's Info says it; a field view does not -- it is not the exact solution.
 */
export const BASIC_ORBITALS_FRAMING = 'One electron, Z = 1 — the exact solution, and the idealised shape every multi-electron orbital '
    + 'is a distortion of.';
export const BASIC_ORBITALS_ABOUT = `${BASIC_ORBITALS_FRAMING} Pick an element in Atom mode for a real, many-electron atom.`;

/* The Combination picker's captions (CombinationControls, before Task 5), word for word. */
const HYBRID_BUILT_FROM = "Built from hydrogen's exact 2s and 2p (Z = 1).";
const HYBRID_CAPTION =
    "A basis choice for one atom — hybrids describe bonding directions, not a free atom's ground state.";
const FIELD_SETUP = 'Hydrogen (Z = 1) in a uniform field along +z, which pulls the electron towards −z.';
/** Both levels' validity statement; the refusal threshold that follows it is each level's own. */
const FIELD_VALIDITY = 'Valid for F ≪ 1 a.u.; ionisation by tunnelling is ignored.';
const FIELD_CAPTION =
    `${FIELD_VALIDITY} Fields above ${MAX_FIELD_AU} a.u. are refused (the n = 1 electron goes over the barrier at 0.0625 a.u.).`;
const N2_FIELD_LIMIT =
    `Above ${N2_MAX_FIELD_AU} a.u. an n = 2 electron is not bound: the field lowers the barrier below its energy (F = E²/4, E = −1/8 Ha), so stronger fields are refused here.`;
const N2_FIRST_ORDER =
    'First-order (degenerate) perturbation theory: the field picks these two combinations out of the four n = 2 states. They are the sp hybrid shapes, and they do not change with F; only their energies do.';

/** "2p" with a real subscript z. */
const twoPz = () => h(React.Fragment, null, '2p', h('sub', null, 'z'));

/** The n = 2 Stark states, "(2s + 2p_z)/√2" typeset, for prose (combinations.ts's STARK_LABEL is the same name as
 * markup, which titles typeset with withSubscripts and plain text writes flat). */
function starkLabel(state: StarkState): React.ReactNode {
    return h(React.Fragment, null, `(2s ${state === 'lower' ? '+' : '−'} `, twoPz(), ')/√2');
}

/**
 * combinationTitle typeset (review I1): the same words, with 2p<sub>z</sub> where an n = 2 Stark state is named. One
 * node for Orbitals' Explore heading and Info's title, so the two never disagree -- and, Task 8, by the one label
 * helper the canvas title and the phone caption typeset the same markup with.
 */
export function combinationTitleNode(selection: CombinationSelection): React.ReactNode {
    return withSubscripts(combinationTitle(selection));
}

/** x to 3 significant figures in plain decimals, with a true minus: −0.0556, −13.6. */
const decimal = (x: number) => minus(x.toPrecision(3));

/** "−1.51 eV (−0.0556 Ha)": E = −1/(2n²), eV first and Ha beside it (the formula stays in Ha, in the technical text). */
function energyText(hartree: number): string {
    // Task 6 fix round 1 ruling: every energy fact reads eV first, Ha in parentheses, in every mode.
    return `${decimal(hartree * EV_PER_HARTREE)} eV (${decimal(hartree)} Ha)`;
}

const signedMl = (ml: number) => (ml > 0 ? `+${ml}` : minus(String(ml)));


/** The fraction and, once this orbital is drawn, its contour's iso value. */
function enclosedFacts(state: OrbitalsInfoState, n: number, l: number, ml: number): InfoFact[] {
    const { enclosedFraction, currentParams, isoLevel, isLoading, renderFailed } = state.orbital;
    const facts: InfoFact[] = [enclosedFact(enclosedFraction)];
    // The iso value is the drawn orbital's: until the selection itself has landed it would be the previous one's.
    const drawn = currentParams && !currentParams.radialSamples && currentParams.Z === BASIC_ORBITALS_Z
        && currentParams.n === n && currentParams.l === l && currentParams.ml === ml
        && currentParams.enclosedFraction === enclosedFraction;
    if (drawn && !isLoading && !renderFailed && isoLevel !== null) {
        facts.push({ label: 'Iso value', value: isoValueText(isoLevel), min: 'advanced' });
    }
    return facts;
}

/**
 * Task 9c fix round 1, ruling (c1): a combination's fraction and, once that combination is drawn, the iso value it is
 * drawn at, from Advanced as for one orbital. An overlay's members (the two Stark states, a hybrid set) are equivalent,
 * so the one value the viewer reports (its first member's) is every member's. Until the picture on screen is this
 * selection's at this fraction, the value would be the previous picture's, so none is given.
 */
function combinationEnclosedFacts(state: OrbitalsInfoState, selection: CombinationSelection): InfoFact[] {
    const { enclosedFraction, currentField, isoLevel, isLoading, renderFailed } = state.orbital;
    const facts: InfoFact[] = [enclosedFact(enclosedFraction)];
    const asked = fieldRequestFor(selection, enclosedFraction);
    const drawn = asked !== null && currentField !== null && samePicture(currentField, asked);
    if (drawn && !isLoading && !renderFailed && isoLevel !== null) {
        facts.push({ label: 'Iso value', value: isoValueText(isoLevel), min: 'advanced' });
    }
    return facts;
}

/** The Cut away helper, moved here: what a cut removes (cutAwaySentence, shared with Bonds). Nothing while no cut is on. */
function cutSentence(state: OrbitalsInfoState): string | null {
    return cutAwaySentence(state.orbital.surfaceStyle.clipAxis);
}

const joinSentences = (...parts: Array<string | null | false>) => parts.filter(Boolean).join(' ');
/** Task 9b: what a cut removes, as a note after the facts (InfoContent.notes) -- never part of the lead. */
const notesOf = (cut: string | null) => (cut ? [cut] : undefined);

function orbitalInfo(state: OrbitalsInfoState): InfoContent {
    const { n, l, ml } = state.orbital.basicSelection;
    const radial = n - l - 1;
    const total = n - 1;
    const surfaces = angularNodeSurfaces(l, ml);
    const shape = shapeWord(l, ml);
    const name = h(OrbitalLabel, { n, l, ml });
    const letter = shellLetter(l);
    // The shape's textbook word (qualitative, orbital_facts.ts) leads; past f there is none, so the letter does.
    const lead = !shape ? `${/^[sfhil]$/.test(letter) ? 'An' : 'A'} ${letter} orbital`
        : /^(six|eight)\b/.test(shape) ? shape.charAt(0).toUpperCase() + shape.slice(1) : `A ${shape}`;
    // Review: radial nodes alone (l = 0) do not shape a sphere -- it simply has them; angular nodes do shape the lobes.
    // Task 9b (finish review, fix 5): the lead keeps to three lines -- the count by kind is the Nodes fact's, and what
    // the surfaces are (spheres, planes, cones) is said with the radial and angular parts in the technical band.
    const shapeAndNodes = total === 0
        ? `${lead}, with no nodes: there is no surface where the electron is never found.`
        : `${lead}, ${l === 0 ? 'with' : 'shaped by its'} ${total} ${plural(total, 'node', 'nodes')} — ${plural(total, 'a surface', 'surfaces')} where the electron is never found.`;
    const radialSurfaces = radial > 0 ? ` (${plural(radial, 'a sphere', 'spheres')})` : '';
    const angularSurfaces = l > 0 ? ` (${surfaces ?? 'planes or cones through the nucleus'})` : '';

    const realNote = ml === 0 ? ''
        : ` The app draws real orbitals: this one combines the complex states with mₗ = +${Math.abs(ml)} and mₗ = −${Math.abs(ml)} `
            + `(${ml > 0 ? 'cos' : 'sin'} ${Math.abs(ml) === 1 ? '' : Math.abs(ml)}φ), so it has a definite |mₗ| but no definite angular momentum about z.`;
    const energy = -1 / (2 * n * n);

    return {
        title: h(React.Fragment, null, 'Hydrogen — ', name, ' orbital'),
        // Task 9b (fix 5): the lead alone; the one-electron framing is technical, the pointer to Atom mode is Help's
        // (BASIC_ORBITALS_ABOUT), and what a cut removes follows the facts.
        plain: shapeAndNodes,
        notes: notesOf(cutSentence(state)),
        technical: [
            BASIC_ORBITALS_FRAMING,
            `${nb('ψ = Rₙₗ(r) Y(θ, φ)')}: the radial part has ${nb(`n − l − 1 = ${radial}`)} ${plural(radial, 'node', 'nodes')}${radialSurfaces} and the angular part has ${nb(`l = ${l}`)}${angularSurfaces}. `
                + `Its size grows roughly as n². ${nb('E = −1/(2n²) Ha')} depends on n alone, so all ${nb(`n² = ${n * n}`)} orbitals of the shell share it.${realNote}`
                // Task 6: the |R|² plot tab's caption, said here once (plot_tabs.ts).
                + ` ${RADIAL_FACTOR_NOTE}`,
        ],
        facts: [
            { label: qLabel('Shell', 'n'), value: String(n) },
            { label: subshellFactLabel, value: `${l} (${letter})` },
            { label: orbitalFactLabel, value: signedMl(ml) },
            // Final review M3: the Nodes fact is where "node" is on screen, so its (i) opens the Node entry.
            { label: labelWithInfo('Nodes', 'node', 'Nodes'), value: `${total} (${radial} radial, ${l} angular)` },
            { label: 'Energy', value: energyText(energy), min: 'explore' },
            ...enclosedFacts(state, n, l, ml),
        ],
        computed: 'Exact one-electron solution, Z = 1: hydrogen\'s analytic ψ for the non-relativistic Schrödinger equation with a fixed point nucleus. '
            + `The surface is the contour of constant |ψ|² that encloses ${Math.round(state.orbital.enclosedFraction * 100)} % of the electron, `
            + 'found on a sampled grid by marching cubes.',
    };
}

const HYBRID_GEOMETRY: Record<HybridKind, string> = {
    sp: 'the 2s with one 2p into 2 equivalent hybrids pointing opposite ways along z, 180° apart',
    sp2: 'the 2s with two 2p into 3 equivalent hybrids in the xy plane, 120° apart',
    sp3: 'the 2s with all three 2p into 4 equivalent hybrids pointing to the corners of a tetrahedron, 109.5° apart',
};

function hybridInfo(state: OrbitalsInfoState, selection: Extract<CombinationSelection, { kind: 'hybrid' }>): InfoContent {
    const k = hybridCount(selection.hybrid) - 1;
    return {
        title: h(React.Fragment, null, 'Hydrogen — ', combinationTitleNode(selection)),
        plain: joinSentences(HYBRID_BUILT_FROM, `${HYBRID_NAMES[selection.hybrid]} mixes ${HYBRID_GEOMETRY[selection.hybrid]}.`,
            HYBRID_CAPTION),
        notes: notesOf(cutSentence(state)),
        technical: `${nb(`hᵢ = −(1/√${k + 1}) ψ₂ₛ + √(${k}/${k + 1}) (dᵢ · p)`)}, with dᵢ each hybrid's direction; the 2s enters with a minus sign so each large lobe points along its own dᵢ. `
            + 'All n = 2 states share one energy, so the hybrids have it too.',
        facts: [
            { label: 'Hybrids', value: String(k + 1) },
            { label: 'Built from', value: k === 1 ? '2s and 2p' : `2s and ${k} × 2p` },
            { label: 'Energy', value: energyText(-1 / 8), min: 'explore' },
            ...combinationEnclosedFacts(state, selection),
        ],
        // Fix round 1 (science ruling): for hydrogen a mixture of the degenerate n = 2 states is still stationary.
        computed: 'Exact one-electron solution, Z = 1, for the 2s and 2p. A hybrid is a linear combination of these degenerate states '
            + "— for hydrogen still a stationary state with E₂ — chosen to describe bonding directions; it is not the free atom's ground state.",
    };
}

function fieldInfo(state: OrbitalsInfoState, selection: Extract<CombinationSelection, { kind: 'field' }>): InfoContent {
    const field = selection.field;
    const fieldFact: InfoFact = { label: 'Field F', value: `${field.toFixed(selection.level === 1 ? 3 : 4)} a.u. (${formatVoltsPerMetre(field)})` };
    const enclosed = combinationEnclosedFacts(state, selection);

    if (selection.level === 1) {
        const share = nextOrderDipoleShare(field);
        const dipole = inducedDipole(field);
        return {
            title: h(React.Fragment, null, 'Hydrogen — ', combinationTitleNode(selection)),
            plain: joinSentences(FIELD_SETUP,
                'The cloud shifts a little that way, so the atom gains a small electric dipole; a stronger field shifts it further.'),
            notes: notesOf(cutSentence(state)),
            technical: `${nb('α = 9/2 a₀³')}, exact for hydrogen, so ${nb('μ = αF')}. The 1s energy does not change to first order in F, nor does its radial distribution.`,
            facts: [
                fieldFact,
                { label: 'Induced dipole μ', value: `${dipole.toFixed(3)} e·a₀ (${(dipole * DEBYE_PER_EA0).toFixed(3)} D)`, min: 'explore' },
                { label: 'Polarisability α', value: '9/2 a₀³', min: 'advanced' },
                ...enclosed,
            ],
            computed: joinSentences(
                'Drawn: ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ, first-order perturbation theory (Dalgarno–Lewis).',
                FIELD_CAPTION,
                share >= 0.01 && `At this field the next-order (hyperpolarisability) term would change μ by about ${Math.round(share * 100)} %.`),
        };
    }

    const states: StarkState[] = selection.stark === 'both' ? ['lower', 'upper'] : [selection.stark];
    const shiftFacts: InfoFact[] = states.map(stark => ({
        label: selection.stark === 'both' ? `${stark === 'lower' ? 'Lower' : 'Upper'} state ΔE` : 'Stark shift ΔE',
        value: nb(`${stark === 'lower' ? '−' : '+'}3F = ${starkShiftText(starkShiftHartree(stark, field))}`),
        min: 'explore',
    }));
    return {
        title: h(React.Fragment, null, 'Hydrogen — ', combinationTitleNode(selection)),
        plain: h(React.Fragment, null,
            `${FIELD_SETUP} At n = 2 it mixes 2s with `, twoPz(), ': in ', starkLabel('lower'),
            ' the electron leans towards −z and its energy falls; in ', starkLabel('upper'), ' it leans towards +z and its energy rises.'),
        notes: notesOf(cutSentence(state)),
        technical: h(React.Fragment, null, `${N2_FIRST_ORDER} ${nb('ΔE = ∓3F')}, from ⟨2s|z|`, twoPz(), nb('⟩ = −3 a₀'), ' in this sign convention.'),
        facts: [fieldFact, { label: 'Energy at F = 0', value: energyText(-1 / 8), min: 'explore' }, ...shiftFacts, ...enclosed],
        computed: h(React.Fragment, null,
            'Drawn: the n = 2 Stark states (2s ± ', twoPz(), ')/√2, first-order degenerate perturbation theory. ',
            `${FIELD_VALIDITY} ${N2_FIELD_LIMIT}`),
    };
}

/** Orbitals' Info for the current selection at `level` (InfoPanel filters the facts and bands by level). */
// `level` is unused for now: every band is written, and InfoPanel shows the ones a level reads. Ruling PF3 keeps it in
// the signature every mode's builder shares. `state` is the orbital slice (a whole RootState is one too).
export function basicInfo(state: OrbitalsInfoState, level: LearningLevel): InfoContent {
    const combination = state.orbital.combination;
    const content = combination.kind === 'hybrid' ? hybridInfo(state, combination)
        : combination.kind === 'field' ? fieldInfo(state, combination)
        : orbitalInfo(state);
    const problem = selectionProblem(combination);
    // Spec §3.5: a selection that cannot be drawn says so, never a silently wrong picture.
    return problem ? { ...content, title: h(React.Fragment, null, content.title, ' — not drawn'), plain: h(React.Fragment, null, `${problem} `, content.plain) } : content;
}
