/**
 * Bonds' Info (plan Task 7a): what the view is -- H₂⁺'s exact orbital, a molecule's total density or one of its
 * molecular orbitals -- in the reader's band. It owns every sentence the Bonds panels used to print: the energy line,
 * the density surface label, the MO list's legend, the diagram's bond-order footer and α/β note (BondsPanel,
 * MoDiagram), the Enclosed and Cut helpers (Controls), the Data tab's methods list and near-tie caveats
 * (BondsInspector) and the potential curve's caption (curve.ts). The panels keep controls and short labels; the Data tab
 * keeps the frontier values. Ruling PF3: no topic parameter; an (i)'s term is InfoPanel's (from the glossary).
 *
 * Science, stated once and never rewritten here: the sentences come from the builders that already said them
 * (bondsCaptions, frontierText, orbitalCaveats, densitySurfaceText, spinOrderNote, bondOrderText, bondOrderNote and
 * the curve's zero). H₂⁺ is exact within Born–Oppenheimer; every other energy is the scan's method, and every orbital energy a
 * Kohn–Sham eigenvalue -- never an ionisation energy. The bond order is the app's own count (bondOrderOf).
 */
import React from 'react';
import type { RootState } from '../store';
import type { LearningLevel } from '../levels/levels';
import type { InfoContent, InfoFact } from './info_types';
import type { BondsData } from '../bonds/useBondsData';
import type { BondsView } from '../store/bondsSlice';
import type { MoleculeBasis, MoleculeMeta, MoleculeOrbitalInfo } from '../molecules/types';
import { systemFormula } from '../bonds/systems';
import { bondsCaptions, densitySurfaceText, frontierText, lengthText, orbitalCaveats } from '../bonds/captions';
import { bondAxisMinimumDensity } from '../bonds/bond_density';
import {
    bondOrderNote, bondOrderOf, bondOrderText, buildMoDiagram, formatBondOrderNumber, h2plusOrbitals, spinOrderNote,
} from '../bonds/mo_diagram';
import { H2PLUS_LABELS, h2plusElectronicEnergy, h2plusTotalEnergy } from '../bonds/h2plus';
import { H_PLUS_H_PLUS_HARTREE, curveNote } from '../bonds/curve';
import { SPIN_SUFFIX, bondsFieldRequest } from '../bonds/bonds_request';
import { cutAwaySentence } from '../atom/atom_text';
import { isoValueText } from '../orbital_facts';
import { absoluteEnergyText, energyDifferenceText, orbitalEnergyText } from '../format/energy';
import { nb, plural } from '../format/text';
import { withSubscripts } from '../format/subscripts';
import InfoButton from './InfoButton';
import { enclosedFact } from './facts';

const h = React.createElement;

/** What the builder reads: the Bonds selection, and the orbital slice's drawn picture, enclosed fraction and cut. */
export type BondsInfoState = Pick<RootState, 'bonds' | 'orbital'>;

/**
 * The MO list's legend (BondsPanel, before Task 7a), word for word: the key to the diagram's labels. Info reads it
 * from Advanced, beside the technical text; the moDiagram (i) beside the list's heading explains the diagram plainly.
 */
export const MO_LEGEND = 'σ/π: symmetry about the bond axis; g/u: even/odd through the centre; * antibonding; '
    + 'numbers count orbitals of that symmetry from the lowest; arrows show electrons.';

/**
 * Why Electron enclosed is off while a density is drawn (ruling T7-a), moved from the helper under the select. Task 6
 * fix round 1: Info names no positions ("beside the orbitals"), only the control.
 */
export const FIXED_RHO_NOTE = 'The density is drawn at a fixed ρ, chosen with the ρ buttons — not at an enclosed fraction, '
    + 'so Electron enclosed does not apply to it.';

/** Whether a surface is one envelope or splits around each nucleus, read off the basis once (≈ 200 evaluations). */
const minimumOnAxis = new WeakMap<MoleculeBasis, number | null>();
function minOnAxisOf(basis: MoleculeBasis | null): number | null {
    if (!basis) return null;
    if (!minimumOnAxis.has(basis)) minimumOnAxis.set(basis, bondAxisMinimumDensity(basis));
    return minimumOnAxis.get(basis)!;
}

/** The orbital a view names among the data's own: the `component`-th sharing its label and spin (bonds_request's rule). */
function orbitalOf(meta: MoleculeMeta | null, view: BondsView): { orbital: MoleculeOrbitalInfo; group: MoleculeOrbitalInfo[] } | null {
    if (!meta || view.kind !== 'mo') return null;
    const group = meta.orbitals.filter(o => o.label === view.label && (o.spin ?? 'restricted') === view.spin);
    const orbital = group[view.component];
    return orbital ? { orbital, group } : null;
}

const electronsIn = (orbitals: readonly MoleculeOrbitalInfo[]) => orbitals.reduce((total, o) => total + o.occupation, 0);

/** "a σ", "an antibonding π". */
const withArticle = (words: string) => `${/^[aeiou]/.test(words) ? 'an' : 'a'} ${words}`;

/** A paragraph of plain sentences, typeset (orbital labels, R_e and the like get a real <sub>); empty parts dropped. */
function sentences(...parts: Array<string | null | false | undefined>): React.ReactNode {
    const kept = parts.filter((part): part is string => Boolean(part));
    return kept.length === 0 ? null : withSubscripts(kept.join(' '));
}

/** Short paragraphs, one idea each, typeset; empty ones dropped. */
function paragraphs(...parts: Array<string | null | false | undefined>): React.ReactNode[] {
    return parts.filter((part): part is string => Boolean(part)).map(withSubscripts);
}

/**
 * One molecular orbital in plain words: what kind it is, how many electrons it holds, and its frontier role -- read off
 * the data's own label, occupation and role. Bonding and antibonding are named only where the labels mark them (a
 * homonuclear molecule's g/u labels, * antibonding: the rule the bond order counts by); a core level is named as one.
 */
function orbitalWords(formula: string, meta: MoleculeMeta, orbital: MoleculeOrbitalInfo, group: MoleculeOrbitalInfo[]): string {
    const spin = orbital.spin ?? 'restricted';
    const name = `${orbital.label}${SPIN_SUFFIX[spin]}`;
    const core = buildMoDiagram(meta.orbitals).levels.find(level => level.label === orbital.label && level.spin === spin)?.core ?? false;
    const kind = orbital.label.includes('σ') ? 'σ' : orbital.label.includes('π') ? 'π' : null;
    const marked = /[σπ][gu]/.test(orbital.label);
    const character = !marked ? '' : orbital.label.includes('*') ? 'antibonding ' : 'bonding ';
    const others = group.length > 1 ? `, one of ${group.length} with the same energy` : '';
    const what = core
        ? `${name} is a core orbital of ${formula}${others}: far below the valence levels, it takes almost no part in the bond.`
        : `${name} is ${withArticle(`${character}${kind ? `${kind} ` : ''}orbital`)} of ${formula}${others}.`;
    const shape = core ? null
        : kind === 'σ' ? 'It is symmetric around the bond axis.'
        : kind === 'π' ? 'It has a nodal plane through the bond axis.' : null;
    const held = orbital.occupation === 0 ? 'It is empty.'
        : `It holds ${orbital.occupation} ${plural(orbital.occupation, 'electron', 'electrons')}.`;
    const role = group.find(o => o.role)?.role;
    const frontier = role === 'HOMO' ? 'It is the HOMO: the highest level that holds electrons.'
        : role === 'LUMO' ? 'It is the LUMO: the lowest empty level.'
        : role === 'SOMO' ? 'It is singly occupied: a SOMO.' : null;
    return [what, shape, held, frontier].filter(Boolean).join(' ');
}

/** Kohn–Sham's (i) on an orbital energy: that ε is the model's eigenvalue, not the energy to remove an electron. */
const kohnShamLabel = (text: string) => h(React.Fragment, null, text, h(InfoButton, { topic: 'kohnSham', label: 'Kohn–Sham orbitals', place: 'info' }));
/** The potential curve's (i) on its quantity: what E − E(atoms) is, and where its minimum and depth are. */
const curveLabel = (text: string) => h(React.Fragment, null, text, h(InfoButton, { topic: 'potentialCurve', label: 'Potential energy curve', place: 'info' }));

/** Bonds' Info for the current selection (InfoPanel filters the facts and bands by level). */
// `level` is unused for now: every band is written, and InfoPanel shows the ones a level reads. Ruling PF3 keeps it in
// the signature every mode's builder shares. `state` is the bonds and orbital slices (a whole RootState is one too).
export function bondsInfo(state: BondsInfoState, data: BondsData, level: LearningLevel): InfoContent {
    const { bonds, orbital: drawn } = state;
    const { system, view, scanIndex } = bonds;
    const formula = systemFormula(system);
    const exact = system === 'h2plus';
    const { scan, meta } = data;
    const fraction = drawn.enclosedFraction;
    const clipAxis = drawn.surfaceStyle.clipAxis;

    const chosen = orbitalOf(meta, view);
    // An orbital this geometry does not keep is drawn as the density, and the panel says why (bonds_request.ts).
    const density = !exact && (view.kind === 'density' || (meta !== null && chosen === null));
    const R = exact ? bonds.R : scanIndex !== null ? bonds.R : null;
    const point = !exact && scan && scanIndex !== null ? scan.points[scanIndex] ?? null : null;
    const h2plusState = view.kind === 'h2plus' ? view.state : '1sigma_g';
    const order = bondOrderOf(system, meta);
    const orbitals = exact ? (R !== null ? h2plusOrbitals(R) : null) : meta?.orbitals ?? null;

    // --- What it is, in plain words.
    let title: React.ReactNode;
    let lead: string;
    if (exact) {
        const label = H2PLUS_LABELS[h2plusState];
        title = h(React.Fragment, null, `${formula} — `, withSubscripts(label), ' orbital');
        // Fix round 1 (M2, M1): "for nuclei held in place" is Born–Oppenheimer in plain words; the node is the wavefunction's.
        lead = `${formula} is two protons sharing one electron: the simplest chemical bond, and one solved exactly here for nuclei held in place. `
            + (h2plusState === '1sigma_g'
                ? `In ${label}, the bonding orbital, the electron gathers between the nuclei and holds them together.`
                : `In ${label}, the antibonding orbital, the wavefunction has a nodal plane midway between the nuclei, so the electron is kept out of the region between them, and this state does not hold them together.`);
    } else if (density) {
        title = `${formula} — total electron density`;
        const electrons = meta ? electronsIn(meta.orbitals) : null;
        // Fix round 1 (M3): plain words only -- what the surface at this ρ shows, with its numbers, is technical. Task 7b
        // fix round 1 (M6): "occupied" -- the empty orbitals hold none of the density (one wording with Molecules).
        lead = electrons !== null
            ? `${formula} has ${electrons} electrons; the surface shows where they are likely to be found, all its occupied orbitals together.`
            : 'The surface shows where the electrons are likely to be found, all the occupied orbitals together.';
    } else {
        const mo = view as Extract<BondsView, { kind: 'mo' }>;
        title = h(React.Fragment, null, `${formula} — `, withSubscripts(mo.label), `${SPIN_SUFFIX[mo.spin]} orbital`);
        lead = chosen && meta ? orbitalWords(formula, meta, chosen.orbital, chosen.group)
            : `${mo.label} is one of ${formula}'s molecular orbitals.`;
    }
    // Ruling T4-d: B₂ and C₂'s energies are a rough guide -- said plainly here (fix round 1, M4: the energies, as T4-d's
    // caption says), and in the method's words under "How this was computed" (bondsCaptions' first caption).
    const qualitative = scan?.validity.multireference
        ? `The computed energies for ${formula} are only a rough guide: no single arrangement of its electrons describes it well, and the methods used here start from one.`
        : null;
    // He₂: the footer said "no bond" to every level, under the diagram; it does here.
    const noBond = !exact && meta && order === 0 ? bondOrderText(0) : null;

    // --- Key facts, each from the level that reads it.
    const facts: InfoFact[] = [];
    // "Bond length", as the captions call the scan's points ("Precomputed at 14 bond lengths"); held on one line.
    if (R !== null) facts.push({ label: h(React.Fragment, null, 'Bond length ', h('i', null, 'R')), value: nb(lengthText(R)) });
    if (exact && R !== null) {
        const total = h2plusTotalEnergy(R, h2plusState);
        facts.push({ label: curveLabel('E − E(H + H⁺)'), value: energyDifferenceText(total - H_PLUS_H_PLUS_HARTREE), min: 'explore' });
        facts.push({ label: 'Total energy', value: absoluteEnergyText(total), min: 'research' });
    } else if (point && scan) {
        facts.push({ label: curveLabel('E − E(atoms)'), value: energyDifferenceText(point.energyHartree - scan.fit.separatedAtomsHartree), min: 'explore' });
        facts.push({ label: 'Total energy', value: absoluteEnergyText(point.energyHartree), min: 'research' });
    }
    // Fix round 1 (I2): with H₂⁺'s electron in 1σu* there is no bond; the ½ is the ground state's, and says so.
    const excited = exact && h2plusState === '1sigma_u';
    facts.push({ label: excited ? 'Ground-state bond order' : 'Bond order', value: formatBondOrderNumber(order) });
    if (exact && R !== null) {
        // H₂⁺'s one electron: its orbital energy is the exact electronic energy (H2PLUS_CAPTIONS).
        facts.push({ label: 'Orbital energy', value: nb(orbitalEnergyText(h2plusElectronicEnergy(R, h2plusState))), min: 'explore' });
    } else if (chosen) {
        facts.push({ label: kohnShamLabel('Orbital energy'), value: nb(orbitalEnergyText(chosen.orbital.energyHartree)), min: 'explore' });
    }
    if (!density) {
        // Fix round 1 (M10): a molecular orbital may hold two electrons, so its surface encloses a share of |ψ|².
        facts.push(exact ? enclosedFact(fraction) : enclosedFact(fraction, "of the orbital's |ψ|²"));
        // The iso value is the drawn orbital's: only once the picture asked for is the one on screen.
        const asked = bondsFieldRequest(bonds, data.basis, fraction, { probe: false });
        const field = drawn.currentField;
        const landed = asked !== null && field !== null && field.sources[0]?.id === asked.request.sources[0].id
            && field.enclosedFraction === fraction && !drawn.isLoading && !drawn.renderFailed && drawn.isoLevel !== null;
        if (landed) facts.push({ label: 'Iso value', value: isoValueText(drawn.isoLevel!), min: 'advanced' });
    }

    // --- The technical band: what the density surface shows, the diagram's key and notes, the bond order's why.
    const technical = paragraphs(
        density && densitySurfaceText(bonds.densityIso, null, minOnAxisOf(data.basis)),
        orbitals && orbitals.length > 0 && MO_LEGEND,
        orbitals && spinOrderNote(buildMoDiagram(orbitals)),
        // Fix round 1 (M5): the fact gives the number; this adds only the why.
        bondOrderNote(system, meta, h2plusState),
        density && FIXED_RHO_NOTE,
    );

    // --- How this was computed: every method, said once.
    const frontier = !exact && meta ? frontierText(meta.orbitals) : null;
    const computed = h(React.Fragment, null,
        ...paragraphs(
            ...bondsCaptions(system, scan),
            ...(exact ? [] : orbitalCaveats(meta)),
            frontier && `Frontier orbitals — ${frontier}`,
            curveNote(system, scan),
        ).map(paragraph => h('p', null, paragraph)));

    return {
        title,
        // Fix round 1 (I1): Cut away is on screen from Basics, so what it removes is said in the plain band.
        plain: sentences(lead, qualitative, noBond, cutAwaySentence(clipAxis)),
        technical,
        facts,
        computed,
    };
}
