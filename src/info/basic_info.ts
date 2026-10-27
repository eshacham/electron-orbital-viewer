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
import { OrbitalLabel } from '../format/OrbitalLabel';
import { formatSci, minus } from '../format/sci';
import { shellLetter } from '../orbital_names';
import { angularNodeSurfaces, shapeWord } from '../orbital_facts';
import { CombinationSelection, combinationTitle, selectionProblem } from '../combinations';
import { HybridKind, HYBRID_NAMES, hybridCount } from '../hybrids';
import { MAX_FIELD_AU } from '../field_source';
import { BASIC_ORBITALS_Z } from '../orbital_presets';
import {
    DEBYE_PER_EA0, EV_PER_HARTREE, N2_MAX_FIELD_AU, StarkState, formatVoltsPerMetre, inducedDipole,
    nextOrderDipoleShare, starkShiftHartree,
} from '../stark';

const h = React.createElement;

/**
 * Spec §7's one-electron framing (moved from BasicExplore's tile caption, Task 5). Still exported: App's Help dialog
 * quotes it. A single orbital's Info says it; a field view does not -- it is not the exact solution.
 */
export const BASIC_ORBITALS_ABOUT = 'One electron, Z = 1 — the exact solution, and the idealised shape every multi-electron orbital '
    + 'is a distortion of. Pick an element in Atom mode for a real, many-electron atom.';

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

/** The n = 2 Stark states, "(2s + 2p_z)/√2" typeset (combinations.ts's STARK_LABEL is the plain-text form). */
function starkLabel(state: StarkState): React.ReactNode {
    return h(React.Fragment, null, `(2s ${state === 'lower' ? '+' : '−'} `, twoPz(), ')/√2');
}

/** x to 3 significant figures in plain decimals, with a true minus: −0.0556, −13.6. */
const decimal = (x: number) => minus(x.toPrecision(3));

/** "−0.0556 Ha (−1.51 eV)": E = −1/(2n²) Ha, eV beside it. */
function energyText(hartree: number): string {
    return `${decimal(hartree)} Ha (${decimal(hartree * EV_PER_HARTREE)} eV)`;
}

/** "−0.0117 Ha (−0.32 eV)": a Stark shift, as the panel's readout prints it (4 and 2 decimals, signed). */
function signed(value: number, digits: number): string {
    const text = Math.abs(value).toFixed(digits);
    if (Number(text) === 0) return text;
    return `${value < 0 ? '−' : '+'}${text}`;
}
const shiftText = (hartree: number) => `${signed(hartree, 4)} Ha (${signed(hartree * EV_PER_HARTREE, 2)} eV)`;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const signedMl = (ml: number) => (ml > 0 ? `+${ml}` : minus(String(ml)));

/** The fraction and contour facts, from Advanced -- where the Electron enclosed control is (CONTROL_LEVEL.enclosed). */
function enclosedFacts(state: RootState, n: number, l: number, ml: number): InfoFact[] {
    const { enclosedFraction, currentParams, isoLevel, isLoading, renderFailed } = state.orbital;
    const facts: InfoFact[] = [{ label: 'Enclosed', value: `${Math.round(enclosedFraction * 100)} % of the electron`, min: 'advanced' }];
    // The iso value is the drawn orbital's: until the selection itself has landed it would be the previous one's.
    const drawn = currentParams && !currentParams.radialSamples && currentParams.Z === BASIC_ORBITALS_Z
        && currentParams.n === n && currentParams.l === l && currentParams.ml === ml
        && currentParams.enclosedFraction === enclosedFraction;
    if (drawn && !isLoading && !renderFailed && isoLevel !== null) {
        facts.push({ label: 'Iso value', value: `|ψ|² = ${formatSci(isoLevel)} a₀⁻³`, min: 'advanced' });
    }
    return facts;
}

/** The Cut away helper, moved here: what a cut removes. Nothing while no cut is on. */
function cutSentence(state: RootState): string | null {
    const axis = state.orbital.surfaceStyle.clipAxis;
    return axis === 'none' ? null : `The cut removes the part on the +${axis} side of a plane perpendicular to the ${axis} axis.`;
}

const joinSentences = (...parts: Array<string | null | false>) => parts.filter(Boolean).join(' ');

function orbitalInfo(state: RootState): InfoContent {
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
    const shapeAndNodes = total === 0
        ? `${lead}, with no nodes: there is no surface where the electron is never found.`
        : `${lead}, shaped by its ${total} ${plural(total, 'node', 'nodes')} — ${plural(total, 'a surface', 'surfaces')} where the electron is never found: `
            + `${radial} radial${radial > 0 ? ` (${plural(radial, 'a sphere', 'spheres')})` : ''}`
            + ` and ${l} angular${l > 0 ? ` (${surfaces ?? 'planes or cones through the nucleus'})` : ''}.`;

    const realNote = ml === 0 ? ''
        : ` The app draws real orbitals: this one combines the complex states with mₗ = +${Math.abs(ml)} and mₗ = −${Math.abs(ml)} `
            + `(${ml > 0 ? 'cos' : 'sin'} ${Math.abs(ml)}φ), so it has a definite |mₗ| but no definite angular momentum about z.`;
    const energy = -1 / (2 * n * n);

    return {
        title: h(React.Fragment, null, 'Hydrogen — ', name, ' orbital'),
        plain: joinSentences(shapeAndNodes, BASIC_ORBITALS_ABOUT, cutSentence(state)),
        technical: `ψ = Rₙₗ(r) Y(θ, φ): the radial part has n − l − 1 = ${radial} ${plural(radial, 'node', 'nodes')} and the angular part l = ${l}. `
            + `Its size grows roughly as n². E = −1/(2n²) Ha depends on n alone, so all n² = ${n * n} orbitals of the shell share it.${realNote}`,
        facts: [
            { label: 'Shell n', value: String(n) },
            { label: 'Subshell l', value: `${l} (${letter})` },
            { label: 'Orbital mₗ', value: signedMl(ml) },
            { label: 'Nodes', value: `${total} (${radial} radial, ${l} angular)` },
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

function hybridInfo(state: RootState, selection: Extract<CombinationSelection, { kind: 'hybrid' }>): InfoContent {
    const k = hybridCount(selection.hybrid) - 1;
    return {
        title: `Hydrogen — ${combinationTitle(selection)}`,
        plain: joinSentences(HYBRID_BUILT_FROM, `${HYBRID_NAMES[selection.hybrid]} mixes ${HYBRID_GEOMETRY[selection.hybrid]}.`,
            HYBRID_CAPTION, cutSentence(state)),
        technical: `hᵢ = −(1/√${k + 1}) ψ₂ₛ + √(${k}/${k + 1}) (dᵢ · p), with dᵢ each hybrid's direction; the 2s enters with a minus sign so each large lobe points along its own dᵢ. `
            + 'All n = 2 states share one energy, so the hybrids have it too.',
        facts: [
            { label: 'Hybrids', value: String(k + 1) },
            { label: 'Built from', value: `2s and ${k} × 2p` },
            { label: 'Energy', value: energyText(-1 / 8), min: 'explore' },
            { label: 'Enclosed', value: `${Math.round(state.orbital.enclosedFraction * 100)} % of the electron`, min: 'advanced' },
        ],
        computed: 'Exact one-electron solution, Z = 1, for the 2s and 2p; hybrids are linear combinations of these, '
            + 'a basis choice rather than a state of the free atom (qualitative).',
    };
}

function fieldInfo(state: RootState, selection: Extract<CombinationSelection, { kind: 'field' }>): InfoContent {
    const field = selection.field;
    const fieldFact: InfoFact = { label: 'Field F', value: `${field.toFixed(selection.level === 1 ? 3 : 4)} a.u. (${formatVoltsPerMetre(field)})` };
    const enclosed: InfoFact = { label: 'Enclosed', value: `${Math.round(state.orbital.enclosedFraction * 100)} % of the electron`, min: 'advanced' };

    if (selection.level === 1) {
        const share = nextOrderDipoleShare(field);
        const dipole = inducedDipole(field);
        return {
            title: `Hydrogen — ${combinationTitle(selection)}`,
            plain: joinSentences(FIELD_SETUP,
                'The cloud shifts a little that way, so the atom gains a small electric dipole; a stronger field shifts it further.',
                cutSentence(state)),
            technical: 'α = 9/2 a₀³, exact for hydrogen, so μ = αF. The 1s energy does not change to first order in F, and its radial distribution neither.',
            facts: [
                fieldFact,
                { label: 'Induced dipole μ', value: `${dipole.toFixed(3)} e·a₀ (${(dipole * DEBYE_PER_EA0).toFixed(3)} D)`, min: 'explore' },
                { label: 'Polarisability α', value: '9/2 a₀³', min: 'advanced' },
                enclosed,
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
        value: `${stark === 'lower' ? '−' : '+'}3F = ${shiftText(starkShiftHartree(stark, field))}`,
        min: 'explore',
    }));
    const title = selection.stark === 'both' ? 'Hydrogen — n = 2 Stark states'
        : h(React.Fragment, null, 'Hydrogen — n = 2 Stark state ', starkLabel(selection.stark));
    return {
        title,
        plain: h(React.Fragment, null,
            `${FIELD_SETUP} At n = 2 it mixes 2s with `, twoPz(), ': in ', starkLabel('lower'),
            ' the electron leans towards −z and its energy falls; in ', starkLabel('upper'), ' it leans towards +z and its energy rises.',
            cutSentence(state) ? ` ${cutSentence(state)}` : ''),
        technical: h(React.Fragment, null, `${N2_FIRST_ORDER} ΔE = ∓3F, from ⟨2s|z|`, twoPz(), '⟩ = −3 a₀ in this sign convention.'),
        facts: [fieldFact, { label: 'Energy at F = 0', value: energyText(-1 / 8), min: 'explore' }, ...shiftFacts, enclosed],
        computed: h(React.Fragment, null,
            'Drawn: the n = 2 Stark states (2s ± ', twoPz(), ')/√2, first-order degenerate perturbation theory. ',
            `${FIELD_VALIDITY} ${N2_FIELD_LIMIT}`),
    };
}

/** Orbitals' Info for the current selection at `level` (InfoPanel filters the facts and bands by level). */
// `level` is unused for now: every band is written, and InfoPanel shows the ones a level reads. Ruling PF3 keeps it in
// the signature every mode's builder shares.
export function basicInfo(state: RootState, level: LearningLevel): InfoContent {
    const combination = state.orbital.combination;
    const content = combination.kind === 'hybrid' ? hybridInfo(state, combination)
        : combination.kind === 'field' ? fieldInfo(state, combination)
        : orbitalInfo(state);
    const problem = selectionProblem(combination);
    // Spec §3.5: a selection that cannot be drawn says so, never a silently wrong picture.
    return problem ? { ...content, title: h(React.Fragment, null, content.title, ' — not drawn'), plain: h(React.Fragment, null, `${problem} `, content.plain) } : content;
}
