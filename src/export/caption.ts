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
import { BondsSystemId, isBondsSystemId, systemFormula } from '../bonds/systems';
import { H2PLUS_CAPTIONS, lengths, multireferenceCaption } from '../bonds/captions';
import { H2PLUS_LABELS, H2PlusState } from '../bonds/h2plus';
import { SPIN_SUFFIX } from '../bonds/bonds_request';
import { tierOf, BasisOrbital, MoleculeBasis, MoleculeScan } from '../molecules/types';
import type { LibraryMoleculeMeta } from '../molecules/library_types';
import { formatFormula } from '../molecules/catalogue';
import { formatOrbitalEnergy } from '../molecules/orbital_display';
import { ESP_LIMIT_HARTREE, ESP_SURFACE_DENSITY } from '../molecules/esp_color';

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

/**
 * Task 13b (ruling C5), fix round 1 (I1, M2): H₂⁺'s own exact method
 * (reusing the solver's own caption, H2PLUS_CAPTIONS[0], rather than
 * restating it), or -- once a *matching* scan is to hand -- the diatomic's
 * shipped density/orbital and energy methods, in bondsCaptions' own
 * wording, plus a multireference caveat (B₂, C₂) when `scan.validity` says
 * one applies.
 *
 * The system this reads is `bondsDrawnPicture`'s, never
 * `state.bonds.system` directly: fix round 1's own probe -- H₂⁺ drawn,
 * N₂ selected, while N₂ is still loading -- would otherwise take the
 * selection's branch and label an H₂⁺ picture with N₂'s CCSD(T) method.
 * `scan` is accepted only when `scan.id` matches that drawn system (a scan
 * for some other molecule, mid-switch, must not be read as this one's); the
 * fallback still states a method, just not the molecule-specific one --
 * methodStatement is also called before any scan has loaded at all (e.g.
 * the title line of a cube job requested the instant a picture lands).
 */
function bondsMethodStatement(state: RootState, scan: MoleculeScan | null | undefined): string {
    const drawn = bondsDrawnPicture(state);
    const system = drawn?.system ?? state.bonds.system;
    if (system === 'h2plus') return H2PLUS_CAPTIONS[0];
    if (!scan || scan.id !== system) return 'diatomic molecular orbitals and density: B3LYP/def2-TZVP';
    const caveat = multireferenceCaption(scan);
    return `Orbitals and density: ${scan.densityMethod}; energies: ${scan.energyMethod}${caveat ? `; ${caveat}` : ''}`;
}

/**
 * `bondsScan` is Bonds mode's own extra context (ruling C5): the scan is
 * fetched outside Redux (bondsSlice's own comment: "large, lives in
 * useBondsData's cache"), so a caller with it to hand (run_export.ts, via
 * ExportContext) passes it; every other mode ignores the parameter.
 */
export function methodStatement(state: RootState, bondsScan?: MoleculeScan | null): string {
    if (state.atom.mode === 'bonds') return bondsMethodStatement(state, bondsScan);
    if (state.atom.mode === 'molecule') return moleculeMethodStatement(state);
    if (state.atom.mode === 'atom') {
        // Task 12b (ruling C7): the *drawn* profile's mode (ruling C9), not
        // the switch's -- off keeps ATOM_METHOD's own wording byte-identical
        // (pinned by existing tests), since relativity.ts's own 'off' text
        // reads differently. Scalar/spin–orbit must never claim
        // "non-relativistic", which ATOM_METHOD alone would.
        const mode = state.atom.profile ? profileRelativity(state.atom.profile) : 'off';
        return mode === 'off' ? ATOM_METHOD : relativityMethodStatement(mode);
    }
    // Only 'hydrogenic' is left (Basic Orbitals).
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

/**
 * Task 16b (ruling D5): one library molecule's method. The method is the
 * molecule's, not the surface's -- density, orbitals and ESP all come from
 * one SCF -- so this reads the loaded meta even before anything has landed
 * (a CSV of the orbital table needs it then). Never Basic Orbitals' wording:
 * Molecules mode has its own sentence even with nothing loaded.
 */
function moleculeMethodText(meta: LibraryMoleculeMeta): string {
    const { density, energies } = meta.method;
    return density === energies ? density : `${density} (density, orbitals, ESP); orbital energies ${energies}`;
}

function moleculeMethodStatement(state: RootState): string {
    const meta = state.molecule.meta;
    if (!meta) return 'molecule library: no molecule loaded';
    // Preflight D15 (ruling 16b): a computed molecule's picture says so, and
    // that nobody has checked it against experiment -- an export travels
    // without the badge that says it on screen.
    const tier = tierOf(meta) === 'computed' ? '; computed on request, not benchmarked against experiment' : '';
    return `${moleculeMethodText(meta)} (PySCF); geometry: ${meta.geometrySource}${tier}`;
}

export type MoleculeDrawnSurface = 'density' | 'esp' | { mo: number; label: string; role?: string; energyHartree: number };

export interface MoleculeDrawnPicture {
    id: string;
    name: string;
    /** As meta.json writes it, ASCII ('H2O'); captions subscript it (formatFormula). */
    formula: string;
    surface: MoleculeDrawnSurface;
    /** The enclosed fraction the density or orbital was contoured at; absent for the ESP map, drawn at a fixed ρ. */
    enclosedFraction?: number;
    /** The contour value the render produced: ρ for the density, |ψ|² for an orbital, ρ = 0.001 for the ESP surface. */
    isoLevel?: number;
    method: string;
    geometrySource: string;
    /** A documented exception the molecule carries (ozone's multireference dipole, ruling T7-O3). */
    caveat?: string;
}

/**
 * What the canvas shows in Molecules mode -- the surface that *landed*
 * (`state.molecule.drawn`, reported by the render itself), never the
 * selection (`state.molecule.surface`), which runs ahead of the picture
 * while the next render computes: the same rule as `bondsDrawnPicture` and
 * atom mode's drawn profile (ruling C9). Null unless the meta is loaded, no
 * render is in flight or has failed, and the landed surface belongs to it.
 */
export function moleculeDrawnPicture(state: RootState): MoleculeDrawnPicture | null {
    const { meta, drawn, renderLabel, renderError, isoLevel } = state.molecule;
    if (state.atom.mode !== 'molecule' || !meta || !drawn || renderLabel !== null || renderError !== null) return null;
    if (drawn.id !== meta.id) return null;
    let surface: MoleculeDrawnSurface;
    if (drawn.surface.kind === 'mo') {
        const index = drawn.surface.index;
        const orbital = meta.orbitals.find(o => o.index === index);
        if (!orbital) return null;
        surface = { mo: index, label: orbital.label, ...(orbital.role ? { role: orbital.role } : {}), energyHartree: orbital.energyHartree };
    } else {
        surface = drawn.surface.kind;
    }
    return {
        id: meta.id, name: meta.name, formula: meta.formula, surface,
        ...(surface === 'esp' ? {} : { enclosedFraction: drawn.enclosedFraction }),
        ...(isoLevel !== null ? { isoLevel } : {}),
        method: moleculeMethodText(meta), geometrySource: meta.geometrySource,
        ...(meta.caveat ? { caveat: meta.caveat } : {}),
    };
}

/** 'Water (H₂O)' -- the loaded molecule, drawn or not. */
export function moleculeTitle(meta: LibraryMoleculeMeta): string {
    return `${meta.name} (${formatFormula(meta.formula)})`;
}

/** "90 % enclosed": the brief's own wording, spaced as SI writes a percentage. */
const enclosedText = (fraction: number) => `${Math.round(fraction * 100)} % enclosed`;

function moleculeViewDescription(state: RootState): string {
    const meta = state.molecule.meta;
    if (!meta) return 'Molecules: no molecule loaded';
    const drawn = moleculeDrawnPicture(state);
    if (!drawn) return moleculeTitle(meta);
    const { surface } = drawn;
    const fraction = drawn.enclosedFraction ?? 0;
    if (surface === 'esp') {
        return `${moleculeTitle(meta)}, ESP on ρ = ${ESP_SURFACE_DENSITY} e/a₀³ surface, ±${ESP_LIMIT_HARTREE} Ha/e`;
    }
    if (surface === 'density') {
        // The ρ the fraction produced, written as the view settings write it (App's moleculeIsoNote).
        const rho = drawn.isoLevel !== undefined ? ` (ρ = ${drawn.isoLevel.toExponential(2)} e/a₀³)` : '';
        return `${moleculeTitle(meta)}, density, ${enclosedText(fraction)}${rho}`;
    }
    const role = surface.role ? ` (${surface.role})` : '';
    return `${moleculeTitle(meta)}, MO ${surface.label}${role}, ${formatOrbitalEnergy(surface.energyHartree)}, ${enclosedText(fraction)}`;
}

/**
 * The caption line a molecule's own caveat adds (ozone's, ruling T7-O3) --
 * null, and so omitted, for every molecule without one. Read off the loaded
 * meta: the caveat is the molecule's, whichever surface is drawn.
 */
export function moleculeCaveatCaption(state: RootState): string | null {
    return state.atom.mode === 'molecule' ? state.molecule.meta?.caveat ?? null : null;
}

/**
 * ASCII Mulliken labels: a prime is 'p' and a double prime 'pp' ("10a'" ->
 * '10ap', '2a"' -> '2app') -- spelled out rather than dropped, since 10a'
 * and 10a" are different orbitals.
 */
function asciiMullikenLabel(label: string): string {
    return label.replace(/"/g, 'pp').replace(/'/g, 'p').replace(/[^A-Za-z0-9-]/g, '');
}

/** 'H2O' as shipped; a formula with brackets ('(CH3)2CO') reads worse stripped than the id does ('acetone'). */
function moleculeFileName(meta: LibraryMoleculeMeta): string {
    return /^[A-Za-z0-9]+$/.test(meta.formula) ? meta.formula : meta.id;
}

/**
 * 'orbital-viewer_H2O_density-90', 'orbital-viewer_H2O_esp',
 * 'orbital-viewer_H2O_mo4-1b1' (brief, requirement 2): the molecule and the
 * drawn surface. An MO's index is part of the stem because a degenerate set
 * shares one label (benzene's two 1e1g HOMOs), as Bonds' stems number
 * the halves of a degenerate pair.
 */
function moleculeFileStem(state: RootState): string {
    const meta = state.molecule.meta;
    if (!meta) return 'orbital-viewer_molecule';
    const base = `orbital-viewer_${moleculeFileName(meta)}`;
    const drawn = moleculeDrawnPicture(state);
    if (!drawn) return base;
    const { surface } = drawn;
    if (surface === 'esp') return `${base}_esp`;
    if (surface === 'density') return `${base}_density-${Math.round((drawn.enclosedFraction ?? 0) * 100)}`;
    return `${base}_mo${surface.mo}-${asciiMullikenLabel(surface.label)}`;
}

/** The orbital table is the molecule's, whatever surface is drawn: 'orbital-viewer_H2O_orbitals'. */
export function moleculeTableFileStem(state: RootState): string {
    const meta = state.molecule.meta;
    return meta ? `orbital-viewer_${moleculeFileName(meta)}_orbitals` : 'orbital-viewer_molecule_orbitals';
}

/** "n = 2 shell" -- shared by viewDescription and cubeJobFor's own labelling of a shell's radial curve. */
export function shellLabel(n: number): string {
    return `n = ${n} shell`;
}

/**
 * A drawn molecular orbital: `component`/`componentCount` are the orbital's
 * 0-based position among every orbital sharing its label and spin (a
 * degenerate π pair has two) -- fix round 1 (M1): without this, exporting
 * each half of a degenerate pair separately produces the same file name and
 * the same description, as if only one had been exported.
 */
interface BondsDrawnMo { kind: 'mo'; orbital: BasisOrbital; component: number; componentCount: number; }

/**
 * What a Bonds picture is, by `type` alone (never a combination, never atom
 * mode's species-y bits).
 */
type BondsPictureKind =
    | { kind: 'h2plus'; state: H2PlusState }
    | BondsDrawnMo
    | { kind: 'density'; isoValue: number };

export interface BondsDrawnPicture {
    system: BondsSystemId;
    R: number;
    /** The scan point id the drawn basis belongs to (e.g. 'n2@07'); null for H2+, which carries no basis. */
    moleculeId: string | null;
    /** The basis actually drawn, for a cube export to register with the worker; null for H2+. */
    basis: MoleculeBasis | null;
    /** The contour the picture was actually rendered at (field.enclosedFraction) -- fix round 1 (M6). */
    enclosedFraction: number;
    picture: BondsPictureKind;
}

/**
 * What the canvas actually shows in Bonds mode, read off the drawn request
 * (`state.orbital.currentField`) rather than the panel's selection
 * (`state.bonds`) -- the same reason atom mode's captions read the drawn
 * profile and not the switch (ruling C9): the selection can be a step ahead
 * of the picture while the next one is still loading (Review Focus 1/2; fix
 * round 1, I1: this is exactly the reviewer's probe -- H₂⁺ drawn, N₂
 * selected -- and every Bonds caption/cube/CSV function reads this, never
 * `state.bonds` directly, so the selection can never leak into them).
 * R comes from the basis' own two atom positions, not `state.bonds.R`, for
 * the same reason -- a diatomic's basis only ever reaches `currentField`
 * once it is the one actually drawn (bondsFieldRequest's own geometry guard).
 * Exported: `exportAvailability`/`cubeJobFor`/`csvFor` (run_export.ts) use
 * it to check a selection against the drawn picture, and to accept `scan`/
 * `meta` only when their ids match what is actually on screen. Null only
 * when nothing matching a Bonds recipe is drawn.
 */
export function bondsDrawnPicture(state: RootState): BondsDrawnPicture | null {
    const field = state.orbital.currentField;
    if (!field || field.sources.length !== 1) return null;
    const recipe = field.sources[0].recipe;
    if (recipe.type === 'h2plus') {
        return {
            system: 'h2plus', R: recipe.R, moleculeId: null, basis: null,
            enclosedFraction: field.enclosedFraction, picture: { kind: 'h2plus', state: recipe.state },
        };
    }
    if (recipe.type !== 'gaussianMO' && recipe.type !== 'gaussianDensity') return null;
    const basis = field.bases?.find(b => b.id === recipe.moleculeId);
    if (!basis || basis.atoms.length < 2) return null;
    const system = basis.id.split('@')[0];
    if (!isBondsSystemId(system) || system === 'h2plus') return null;
    const [a, b] = basis.atoms;
    const R = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const common = { system, R, moleculeId: basis.id, basis, enclosedFraction: field.enclosedFraction };
    if (recipe.type === 'gaussianMO') {
        const orbital = basis.orbitals[recipe.index];
        if (!orbital) return null;
        const matches = basis.orbitals.filter(o => o.label === orbital.label && o.spin === orbital.spin);
        const component = matches.findIndex(o => o.index === orbital.index);
        return { ...common, picture: { kind: 'mo', orbital, component, componentCount: matches.length } };
    }
    // Always set alongside a 'gaussianDensity' recipe (bondsFieldRequest);
    // the fallback only guards a request built some other way (e.g. a test).
    return { ...common, picture: { kind: 'density', isoValue: field.densityIsoValue ?? state.bonds.densityIso } };
}

/** '' for a non-degenerate orbital; ' (component 1 of 2)' etc. otherwise (fix round 1, M1). */
function componentNote(picture: BondsDrawnMo): string {
    return picture.componentCount > 1 ? ` (component ${picture.component + 1} of ${picture.componentCount})` : '';
}

function bondsViewDescription(state: RootState): string {
    const drawn = bondsDrawnPicture(state);
    if (!drawn) return systemFormula(state.bonds.system);
    const where = lengths(drawn.R);
    const { picture } = drawn;
    const name = systemFormula(drawn.system);
    // Fix round 1 (M6): the drawn contour, named the way every other mode's
    // caption names it -- except a density surface, which already states its
    // own fixed ρ and draws at no enclosed fraction at all.
    const percent = `${Math.round(drawn.enclosedFraction * 100)}% contour`;
    if (picture.kind === 'h2plus') return `${name} ${H2PLUS_LABELS[picture.state]}, ${where}, ${percent}`;
    if (picture.kind === 'mo') {
        return `${name} ${picture.orbital.label}${SPIN_SUFFIX[picture.orbital.spin]}${componentNote(picture)}, ${where}, ${percent}`;
    }
    return `${name} total density, surface at ρ = ${picture.isoValue} e/a₀³, ${where}`;
}

export function viewDescription(state: RootState): string {
    if (state.atom.mode === 'bonds') return bondsViewDescription(state);
    if (state.atom.mode === 'molecule') return moleculeViewDescription(state);
    const percent = `${Math.round(selectShownEnclosedFraction(state) * 100)}% contour`;
    if (state.atom.mode === 'hydrogenic') {
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

const GREEK_FILE_ASCII: Record<string, string> = { 'σ': 'sigma', 'π': 'pi', 'δ': 'delta', 'φ': 'phi' };
/** 'σ','π' etc. spelled out, the antibonding '*' dropped (not ASCII, and the stem is unique without it -- see bondsFileStem). */
function asciiOrbitalLabel(label: string): string {
    return label.replace(/[σπδφ]/g, ch => GREEK_FILE_ASCII[ch] ?? ch).replace(/\*/g, '');
}

const SUBSCRIPT_DIGIT_ASCII: Record<string, string> = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
};
/** 'N₂' -> 'N2', 'H₂⁺' -> 'H2plus': BONDS_SYSTEMS' formula strings, ASCII only. */
function asciiFormula(formula: string): string {
    return formula.replace(/[₀-₉]/g, ch => SUBSCRIPT_DIGIT_ASCII[ch] ?? ch).replace(/⁺/g, 'plus').replace(/⁻/g, 'minus');
}

/**
 * 'orbital-viewer_N2_R2.07_density-0.002', 'orbital-viewer_O2_R2.29_1pig-alpha',
 * 'orbital-viewer_H2plus_R2.00_1sigmag' (brief, requirement 3): system,
 * R to the slider's own precision, and what is drawn -- reusing
 * bondsDrawnPicture so the stem names the same picture viewDescription does.
 */
function bondsFileStem(state: RootState): string {
    const drawn = bondsDrawnPicture(state);
    // The drawn picture's own system, not the panel's current selection
    // (which can be a step ahead while the next molecule loads -- same
    // reasoning as bondsDrawnPicture itself).
    const system = asciiFormula(systemFormula(drawn?.system ?? state.bonds.system));
    if (!drawn) return `orbital-viewer_${system}`;
    const r = `R${drawn.R.toFixed(2)}`;
    const { picture } = drawn;
    if (picture.kind === 'h2plus') return `orbital-viewer_${system}_${r}_${picture.state.replace('_', '')}`;
    if (picture.kind === 'mo') {
        const spin = picture.orbital.spin === 'restricted' ? '' : `-${picture.orbital.spin}`;
        // Fix round 1 (M1): a degenerate pair's two halves would otherwise
        // share one file name -- the second exported silently overwrites
        // (or, depending on the browser, numbers itself "(1)") the first.
        const component = picture.componentCount > 1 ? `-${picture.component + 1}` : '';
        return `orbital-viewer_${system}_${r}_${asciiOrbitalLabel(picture.orbital.label)}${spin}${component}`;
    }
    return `orbital-viewer_${system}_${r}_density-${picture.isoValue}`;
}

/** ASCII only: file names travel through systems that mangle "²". */
export function exportFileStem(state: RootState): string {
    if (state.atom.mode === 'bonds') return bondsFileStem(state);
    if (state.atom.mode === 'molecule') return moleculeFileStem(state);
    if (state.atom.mode === 'hydrogenic') {
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
