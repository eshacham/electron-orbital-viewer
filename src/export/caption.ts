import type { RootState } from '../store';
import { elementFor } from '../elements';
import { orbitalName, shellLetter } from '../orbital_names';
import { subshellLabel, configurationLabelOf } from '../atom/configurations';
import { AtomSpecies, isNeutralGround, speciesConfiguration, speciesSymbol, speciesTitle } from '../atom/species';
import { selectSpeciesEnergies, speciesOf, profileRelativity } from '../store/atomSlice';
import { BELOW_GROUND_NOTE, DELTA_SCF_LABEL, deltaScfMethod } from '../atom/delta_scf';
import { formatDrawnRadius } from '../atom/format_radius';
import { selectShownBasicOrbital, selectShownEnclosedFraction } from '../store/orbitalSlice';
import { combinationTitle } from '../combinations';
import { MAX_FIELD_AU } from '../field_source';
import { N2_MAX_FIELD_AU } from '../stark';
import { RelativityMode, methodStatement as relativityMethodStatement } from '../atom/relativity';

/** Spec §3.1: every exported number says how it was computed. Still true of an ion or excited atom's picture -- only the configuration solved for changes, not the method. */
export const ATOM_METHOD = 'central-field SCF, LDA exchange + VWN5 correlation, non-relativistic, spherically averaged';
export const BASIC_METHOD = 'exact one-electron (hydrogenic) solution, Z = 1';

/**
 * Inline wording for a profile's relativistic treatment, used wherever a
 * caption names the mode in running text (viewDescription, the reference
 * ring caption) rather than in a full method sentence -- '' for off, so
 * every off caption's parts list is exactly what it was before Phase 4
 * ("off is today's app, byte for byte"). Matches App.tsx's SOLVING_SUFFIX
 * wording, without its own parentheses.
 */
function modeCaptionText(mode: RelativityMode): string {
    switch (mode) {
        case 'off': return '';
        case 'scalar': return 'scalar-relativistic';
        case 'spinOrbit': return 'with spin–orbit';
    }
}

export function methodStatement(state: RootState): string {
    if (state.atom.mode === 'atom') {
        // Task 12b (ruling C7): the *drawn* profile's mode (ruling C9), not
        // the switch's -- off keeps ATOM_METHOD's own wording byte-identical
        // (pinned by existing tests), since relativity.ts's own 'off' text
        // reads differently. Scalar/spin–orbit must never claim
        // "non-relativistic", which ATOM_METHOD alone would.
        const mode = state.atom.profile ? profileRelativity(state.atom.profile) : 'off';
        return mode === 'off' ? ATOM_METHOD : relativityMethodStatement(mode);
    }
    const combination = state.orbital.combination;
    if (combination.kind === 'hybrid') {
        return `${BASIC_METHOD}; hybrids are linear combinations of these, a basis choice rather than a state of the free atom (qualitative)`;
    }
    if (combination.kind === 'field') {
        // Fix round 1 (I1): the n = 1 case is genuinely valid across the whole
        // "F << 1 a.u." regime the app ever draws (MAX_FIELD_AU = 0.05), but
        // n = 2's window is far narrower -- the app refuses a field above
        // N2_MAX_FIELD_AU, the over-the-barrier field for E = -1/8 Ha, long
        // before F approaches 1 a.u. -- so that one names its own cap rather
        // than borrowing the "<< 1" phrasing, which overstates it ~250x.
        return combination.level === 1
            ? `hydrogen 1s polarised by first-order perturbation theory (Dalgarno-Lewis); valid for F << 1 a.u., tunnelling ignored; drawn only up to F = ${MAX_FIELD_AU} a.u.`
            : `hydrogen n = 2 Stark states (2s +/- 2p_z)/sqrt 2, first-order degenerate perturbation theory; valid for F well below the n = 2 over-the-barrier field, 1/256 a.u. (≈ ${N2_MAX_FIELD_AU}); tunnelling ignored`;
    }
    return BASIC_METHOD;
}

/** "n = 2 shell" -- shared by viewDescription and cubeJobFor's own labelling of a shell's radial curve. */
export function shellLabel(n: number): string {
    return `n = ${n} shell`;
}

export function viewDescription(state: RootState): string {
    const percent = `${Math.round(selectShownEnclosedFraction(state) * 100)}% contour`;
    if (state.atom.mode !== 'atom') {
        const combination = state.orbital.combination;
        if (combination.kind !== 'none') return `Hydrogen, ${combinationTitle(combination)}, ${percent}`;
        const o = selectShownBasicOrbital(state);
        return `Hydrogen ${orbitalName(o.n, o.l, o.ml)}, ${percent}`;
    }
    const { Z, level, selectedShell, selectedSubshell, selectedOrbital, profile } = state.atom;
    const levelPart = level === 'orbital' && selectedOrbital
        ? (selectedOrbital.j === undefined
            // With spin–orbit the orbital's own crumb names its j-level too
            // (LevelNav's "6p_z · 6p³⁄₂" pattern) -- the angular shape drawn
            // is still the l orbital's (spec §3.6); only R(r) is the
            // j-level's, which jLevelShapeCaption's own line says (the
            // method line does not).
            ? orbitalName(selectedOrbital.n, selectedOrbital.l, selectedOrbital.ml)
            : `${orbitalName(selectedOrbital.n, selectedOrbital.l, selectedOrbital.ml)} · ${subshellLabel(selectedOrbital.n, selectedOrbital.l, selectedOrbital.j)}`)
        : level === 'shell' && selectedSubshell
            ? `${subshellLabel(selectedSubshell.n, selectedSubshell.l, selectedSubshell.j)} subshell`
            : level === 'shell' && selectedShell !== null
                ? shellLabel(selectedShell)
                : 'whole atom';

    // Task 12b (ruling C7): the drawn profile's own mode (ruling C9), not
    // the switch's -- '' for off, so an off caption's joined parts are
    // exactly what they always were (empty entries vanish from the join).
    const modeText = modeCaptionText(profile ? profileRelativity(profile) : 'off');
    const modeParts = modeText ? [modeText] : [];

    // A neutral ground state's caption stays byte-identical (existing tests
    // pin it): the name is the element alone, with no configuration -- the
    // configuration line below is what an ion or excited atom adds (spec
    // §3.1: every number states its method, which here includes *what* was
    // solved, not only how).
    const species = speciesOf(state.atom);
    if (isNeutralGround(species)) {
        const element = elementFor(Z);
        const name = element ? `${element.name} (${element.symbol}, Z = ${Z})` : `Z = ${Z}`;
        return [name, levelPart, ...modeParts, percent].join(', ');
    }
    const name = `${speciesTitle(species)} (Z = ${Z})`;
    const configuration = configurationLabelOf(speciesConfiguration(species));
    return [name, configuration, levelPart, ...modeParts, percent].join(', ');
}

/**
 * ASCII suffix added to the element symbol for a non-neutral species:
 * '+1', '-1', '_3s-3p', or both together. Reuses speciesSymbol/excitationLabel's
 * own subshell labels (subshellLabel is already ASCII, "3s" not "3s¹"),
 * just without the superscript charge or the arrow a file name cannot carry.
 */
function speciesFileSuffix(species: AtomSpecies): string {
    const charge = species.charge !== 0 ? `${species.charge > 0 ? '+' : ''}${species.charge}` : '';
    const excitation = species.excitation
        ? `_${subshellLabel(species.excitation.from.n, species.excitation.from.l)}-${subshellLabel(species.excitation.to.n, species.excitation.to.l)}`
        : '';
    return `${charge}${excitation}`;
}

/**
 * ASCII j-level suffix for a file stem: j = 1.5 (i.e. 3/2) -> '_j3-2' (j is
 * always a half-integer, so `j * 2` is always a whole number). Absent for a
 * non-relativistic selection (`j === undefined`), so a stem that never had
 * a j-level stays unchanged.
 */
function jFileSuffix(j: number | undefined): string {
    return j === undefined ? '' : `_j${j * 2}-2`;
}

/** ASCII mode suffix for a file stem (brief, requirement 3): '' for off, so every off stem stays byte-identical. */
function modeFileSuffix(mode: RelativityMode): string {
    switch (mode) {
        case 'off': return '';
        case 'scalar': return '_scalar';
        case 'spinOrbit': return '_so';
    }
}

/** ASCII only: file names travel through systems that mangle "²". */
export function exportFileStem(state: RootState): string {
    if (state.atom.mode !== 'atom') {
        const combination = state.orbital.combination;
        if (combination.kind === 'hybrid') {
            return `orbital-viewer_H_${combination.hybrid}${combination.member === 'all' ? '' : `_h${combination.member + 1}`}`;
        }
        if (combination.kind === 'field') return `orbital-viewer_H_field${combination.level}`;
        const o = selectShownBasicOrbital(state);
        return `orbital-viewer_H_basic_n${o.n}_l${o.l}_ml${o.ml}`;
    }
    const { Z, level, selectedShell, selectedSubshell, selectedOrbital, profile } = state.atom;
    const symbol = elementFor(Z)?.symbol ?? `Z${Z}`;
    // A neutral ground state's suffix is '', so `base` is exactly `symbol`
    // and every stem below stays byte-identical to before ions existed.
    const base = `${symbol}${speciesFileSuffix(speciesOf(state.atom))}`;
    const stem = level === 'orbital' && selectedOrbital
        ? `orbital-viewer_${base}_n${selectedOrbital.n}_l${selectedOrbital.l}_ml${selectedOrbital.ml}${jFileSuffix(selectedOrbital.j)}`
        : level === 'shell' && selectedSubshell
            ? `orbital-viewer_${base}_subshell_n${selectedSubshell.n}_l${selectedSubshell.l}${jFileSuffix(selectedSubshell.j)}`
            : level === 'shell' && selectedShell !== null
                ? `orbital-viewer_${base}_shell_n${selectedShell}`
                : `orbital-viewer_${base}_atom`;
    // Task 12b (ruling C7): the drawn profile's own mode, appended last so
    // it reads as a qualifier of the whole stem rather than part of any one
    // level/j segment -- off adds nothing, so every existing stem is unchanged.
    return `${stem}${modeFileSuffix(profile ? profileRelativity(profile) : 'off')}`;
}

/**
 * 'dashed ring: neutral Na drawn radius 1.28 a₀' -- the one extra caption
 * line an ion or excited atom's whole-atom view adds, naming the neutral
 * comparison ring drawn on the cut face (`profile.reference`, ruling C11:
 * the neutral's own drawn radius). Null whenever no such ring is on screen:
 * hydrogenic mode, no profile yet, a neutral ground state (its own
 * reference, so none is drawn), or any level besides the whole atom (the
 * ring is only ever drawn there).
 */
export function referenceRingCaption(state: RootState): string | null {
    if (state.atom.mode !== 'atom' || state.atom.level !== 'atom') return null;
    const { profile } = state.atom;
    if (!profile || !profile.reference) return null;
    const species = speciesOf(state.atom);
    if (isNeutralGround(species)) return null;
    const neutralSymbol = speciesSymbol({ Z: species.Z, charge: 0, excitation: null });
    const radius = formatDrawnRadius(profile.reference.displayRadius);
    // Task 12b (ruling C7): the neutral comparison solves in the species'
    // own mode (ruling C4), so the ring's mode is the profile's -- '' for
    // off, so an off ring's caption is exactly what it always was.
    const modeText = modeCaptionText(profileRelativity(profile));
    return `dashed ring: neutral ${neutralSymbol} drawn radius ${radius} a₀${modeText ? `, ${modeText}` : ''}`;
}

/** The tail every j-level lobe caveat shares: what the drawn shape is not. */
const J_LEVEL_SHAPE_TAIL = 'a basis choice; a |j, m_j⟩ state\'s shape differs';

/**
 * 'lobes: the p orbitals' shapes sized by 6p½'s R(r) — a basis choice; ...'
 * -- final review I1: with spin–orbit a j-level's lobes are the real l
 * orbitals sized by that j-level's own radial function (spec §3.6), the
 * caveat SubshellPanel states on screen, so a PNG of those lobes carries it
 * as a caption line of its own. Null wherever no j-level lobes are drawn:
 * hydrogenic mode, no profile, off or scalar (no j), the whole-atom level
 * (a cut face, no lobes), or only s½ levels -- an s½ sphere is its true shape.
 */
export function jLevelShapeCaption(state: RootState): string | null {
    if (state.atom.mode !== 'atom') return null;
    const { level, selectedShell, selectedSubshell, selectedOrbital, profile } = state.atom;
    if (!profile) return null;
    if (level === 'orbital' && selectedOrbital) {
        const { n, l, j } = selectedOrbital;
        if (j === undefined || l === 0) return null;
        return `lobes: the ${shellLetter(l)} orbital's shape sized by ${subshellLabel(n, l, j)}'s R(r) — ${J_LEVEL_SHAPE_TAIL}`;
    }
    if (level !== 'shell') return null;
    if (selectedSubshell) {
        const { n, l, j } = selectedSubshell;
        if (j === undefined || l === 0) return null;
        return `lobes: the ${shellLetter(l)} orbitals' shapes sized by ${subshellLabel(n, l, j)}'s R(r) — ${J_LEVEL_SHAPE_TAIL}`;
    }
    const levels = profile.subshells.filter(s => s.n === selectedShell && s.j !== undefined && s.l > 0);
    return levels.length > 0 ? `lobes: the l orbitals' shapes sized by each j-level's R(r) — ${J_LEVEL_SHAPE_TAIL}` : null;
}

/**
 * 'Na → Na⁺: 5.14 eV (ΔSCF, LDA)', or 'Na 3s → 3p excitation: 2.19 eV
 * (ΔSCF, LDA)' for an excited atom -- an optional CSV comment line (brief,
 * requirement 3), only once the selected species' own ΔSCF energy has
 * actually landed (`selectSpeciesEnergies`, ruling C5): a reply can still be
 * in flight for a species no longer selected, and nothing is shown for that
 * case rather than a stale or wrong number. Never an eigenvalue (Global
 * Constraints) -- `reading.valueEv` is always a ΔSCF total-energy
 * difference, the same number SpeciesControls shows on screen.
 */
export function deltaScfCsvComment(state: RootState): string | null {
    if (state.atom.mode !== 'atom') return null;
    const energies = selectSpeciesEnergies(state);
    if (!energies || energies.status !== 'done') return null;
    const reading = state.atom.excitation ? energies.excitation : energies.ionisation;
    if (!reading) return null;
    // An excitation's toLabel already names it ('Na 3s → 3p'); prefixing
    // fromLabel and another arrow read as two transitions (final review M5).
    const what = state.atom.excitation ? `${reading.toLabel} excitation` : `${reading.fromLabel} → ${reading.toLabel}`;
    const label = state.atom.excitation && reading.valueEv < 0 ? `${DELTA_SCF_LABEL}; ${BELOW_GROUND_NOTE}` : DELTA_SCF_LABEL;   // ruling FR-1: excitations only
    // Ruling C6: the energies are non-relativistic whatever the picture is,
    // and the method text says which picture it sits beside.
    const mode = state.atom.profile ? profileRelativity(state.atom.profile) : 'off';
    return `${what}: ${reading.valueEv.toFixed(2)} eV (${label}); ${deltaScfMethod(mode)}`;
}
