import type { RootState } from '../store';
import { profileRelativity, speciesOf } from '../store/atomSlice';
import { selectShownBasicOrbital, selectShownEnclosedFraction } from '../store/orbitalSlice';
import { speciesTitle } from '../atom/species';
import type { RelativityMode } from '../atom/relativity';
import { orbitalName } from '../orbital_names';
import { combinationTitle, selectionProblem } from '../combinations';
import { BONDS_SYSTEMS, systemFormula } from '../bonds/systems';
import { plainLength } from '../bonds/captions';
import { bondsDrawnPicture, bondsPictureNamed, moleculeDrawnPicture, moleculeTitle, noSurfaceView } from '../export/caption';
import { atomPartName, bondsViewName } from './view_names';
import { formatFormula } from '../molecules/catalogue';
import { atLeast, type LearningLevel } from '../levels/levels';

// Fix round 1 (M9): shellName is written once, with the other names of what is drawn (view_names.ts).
export { shellName } from './view_names';

/** The drawn profile's method (ruling C9: the picture's mode, not the switch's). */
const METHOD: Record<RelativityMode, string> = {
    off: 'LDA, non-relativistic',
    scalar: 'LDA, scalar-relativistic',
    spinOrbit: 'LDA, with spin–orbit',
};

/**
 * The view's title block. Markup, not display text (Task 8): an orbital's subscript follows a "_" ("3d_z²", as
 * orbitalName writes it) and an MO keeps its data label ("1πu", "1b₁"), so App typesets both with withSubscripts and
 * document.title writes them flat with flatSubscripts. Never shown as it is.
 */
export interface ViewTitle {
    title: string;
    subtitle: string;
}

const ELECTRON_DENSITY = 'electron density';
const SURFACE_KIND = { density: ELECTRON_DENSITY, esp: 'electrostatic potential' } as const;

/** Task 9b: what an orbital's surface is, in plain words below Advanced (the glossary's "cloud where that electron is
 * likely to be found") and in the technical band's from Advanced. */
const ORBITAL_SURFACE = { plain: 'electron cloud', technical: '|ψ|² isosurface' } as const;

/** "<what is drawn> · <its share or its method>", parts left out when empty. */
const line = (...parts: Array<string | null | false>) => parts.filter(Boolean).join(' · ');

/**
 * The viewport's title block (spec §8.5, §9.1): "<Species> — <level>", and one plain subtitle that says what is drawn.
 * Basic, Bonds and Molecules get an honest title from the state they already show; their re-composed titles are 6G-2's.
 *
 * Task 9b (finish review, fixes 2 and 3): the subtitle is banded by the learning level. Below Advanced it is plain
 * words and the enclosed share ("electron density · 90 % enclosed"); from Advanced the method may join it ("|ψ|²
 * isosurface · LDA, non-relativistic"), and the share is Info's Enclosed fact's -- which appears at Advanced, beside
 * the control that sets it -- so each number has one home. It never restates the title, nor a number Info states:
 * Bonds' R and ρ (the slider, the key and Info's fact hold them), a molecule's contour ρ, orbital energy or dipole.
 * Export captions are not this line: viewDescription keeps the whole recipe at every level (Product principle 1).
 */
export function viewTitle(state: RootState, level: LearningLevel): ViewTitle {
    const technical = atLeast(level, 'advanced');
    const fraction = Math.round(selectShownEnclosedFraction(state) * 100);
    // The enclosed share below Advanced only (above, Info's Enclosed fact states it).
    const share = !technical && `${fraction} % enclosed`;
    const orbitalSurface = technical ? ORBITAL_SURFACE.technical : ORBITAL_SURFACE.plain;
    const atom = state.atom;
    if (atom.mode === 'atom') {
        const part = atomPartName(atom, 'title') ?? 'whole atom';
        const method = technical && METHOD[atom.profile ? profileRelativity(atom.profile) : 'off'];
        // Task 9b review M5 (ruling): a subshell draws each of its orbitals' own surfaces (Info: "of each orbital's
        // probability"), so it is named as an orbital's surface is; a whole atom or a shell is its electron density.
        const orbitalSurfaces = atom.level === 'orbital' || (atom.level === 'shell' && atom.selectedSubshell !== null);
        const subtitle = atom.unbound ? line('nothing is drawn for this species', method)
            : line(orbitalSurfaces ? orbitalSurface : ELECTRON_DENSITY, share, method);
        return { title: `${speciesTitle(speciesOf(atom))} — ${part}`, subtitle };
    }
    if (atom.mode === 'hydrogenic') {
        const combination = state.orbital.combination;
        const shown = selectShownBasicOrbital(state);
        const title = combination.kind !== 'none'
            ? `Hydrogen — ${combinationTitle(combination)}`
            : `Hydrogen — ${orbitalName(shown.n, shown.l, shown.ml)} orbital`;
        // Task 5 (critique P1): a field view is first-order perturbation theory, not the exact solution -- n = 1's
        // polarised 1s by Dalgarno–Lewis, n = 2's Stark states by degenerate perturbation theory. Ruling (fix round 1):
        // not "first-order Stark" for 1s, whose linear Stark shift is zero. A hybrid mixes exact, degenerate n = 2
        // states, so it stays exact.
        const method = technical && (combination.kind !== 'field' ? 'exact one-electron solution, Z = 1'
            : combination.level === 1 ? '1s polarised to first order in F, Dalgarno–Lewis'
            : 'n = 2 Stark states, first-order degenerate perturbation theory');
        return { title, subtitle: line(orbitalSurface, share, method) };
    }
    if (atom.mode === 'bonds') {
        const system = BONDS_SYSTEMS.find(entry => entry.id === state.bonds.system);
        // The picture on screen (none while the next one loads: then the busy label speaks, and the subtitle waits).
        const drawn = bondsDrawnPicture(state);
        const picture = drawn?.picture;
        const component = picture?.kind === 'mo' && picture.componentCount > 1
            ? ` (component ${picture.component + 1} of ${picture.componentCount})` : '';
        const subtitle = !picture ? ''
            : picture.kind === 'density' ? ELECTRON_DENSITY
            : line(`${bondsViewName(bondsPictureNamed(picture))} orbital${component}`,
                // The drawn contour's share, not one the panel has asked for and not yet drawn.
                (share && `${Math.round(drawn!.enclosedFraction * 100)} % enclosed`) || ORBITAL_SURFACE.technical);
        return { title: system ? `${system.formula} — ${system.name}` : 'Bonds', subtitle };
    }
    // Ruling P12: the request workspace's preview is what the canvas shows meanwhile -- named as one, by the
    // preview response's own formula (fix round 1, T16-M4: the one its resolved facts show).
    const { previewAtoms, previewFormula } = state.jobs.request;
    if (previewAtoms) return { title: `Preview — ${formatFormula(previewFormula ?? '')}`, subtitle: 'resolved structure, not yet computed' };
    const meta = state.molecule.meta;
    if (!meta) return { title: 'Molecules', subtitle: 'choose a molecule' };
    return { title: moleculeTitle(meta), subtitle: moleculeSubtitle(state, share) };
}

/**
 * Molecules' subtitle (Task 9b): the surface that landed, by kind -- "electron density · 90 % enclosed", "electrostatic
 * potential", "1b1 orbital (HOMO) · 90 % enclosed" -- with no contour ρ, energy or dipole value: Info's facts hold them.
 * Ruling P8 / T13-M: no surface (show=none) says what is drawn instead; Task 8 (addendum 8): not where a structure's
 * geometry came from, and Task 9b: not the dipole's numbers either -- a PNG's caption keeps noSurfaceView's whole line.
 */
function moleculeSubtitle(state: RootState, share: string | false): string {
    const noSurface = noSurfaceView(state);
    // Task 9b review M8: lower case, as every subtitle is (the PNG caption's line keeps its capital).
    if (noSurface) {
        return noSurface.shows === 'structure' ? 'structure only' : noSurface.shows === 'dipole' ? 'dipole arrow only'
            : noSurface.line.charAt(0).toLowerCase() + noSurface.line.slice(1);
    }
    const drawn = moleculeDrawnPicture(state);
    if (!drawn) return '';
    const { surface } = drawn;
    const drawnShare = share && `${Math.round((drawn.enclosedFraction ?? 0) * 100)} % enclosed`;
    if (surface === 'esp') return SURFACE_KIND.esp;
    if (surface === 'density') return line(ELECTRON_DENSITY, drawnShare);
    const role = surface.role ? ` (${surface.role})` : '';
    return line(`${surface.label} orbital${role}`, drawnShare || ORBITAL_SURFACE.technical);
}

/**
 * The phone's caption under the header (Task 8): what is drawn, in the fewest words, and the one qualifier that tells
 * views of it apart -- the enclosed fraction, the bond length or the kind of surface; the method is Info's. E.g.
 * "Carbon 2p_z" · "90 % enclosed", "CO 5σ" · "R = 2.13 a₀", "Water" · "electron density". Markup, as ViewTitle is.
 */
export interface ViewCaption {
    name: string;
    qualifier: string;
}

export interface ViewCaptionStatus {
    /** The canvas is waiting for the requested view (App's busy label is up): it is named, "loading…". */
    loading: boolean;
    /** Its files could not be loaded (Bonds' are fetched outside the store). */
    failed?: boolean;
    /** Task 5b (finish fix 5; ruling): Basics' plain words -- a Bonds bond length as the Bond length block says it, in Å. */
    plain?: boolean;
}

const LOADING = 'loading…';
const enclosed = (fraction: number) => `${Math.round(fraction * 100)} % enclosed`;

/**
 * While the view loads, a qualifier that names what is drawn (a kind of surface) stays and "loading…" follows it; one
 * that measures the picture (an enclosed %, a bond length) gives way to "loading…" -- fix round 1, M3.
 */
const loadingAfter = (kind: string) => `${kind} · ${LOADING}`;

function atomCaption(state: RootState, { loading }: ViewCaptionStatus): ViewCaption {
    const atom = state.atom;
    // The whole atom is the species itself, and what is drawn of it is its electron density (ruling M4); a drill-down
    // names its part after the species.
    const part = atomPartName(atom, 'caption');
    const species = speciesTitle(speciesOf(atom));
    if (!part) {
        return { name: species, qualifier: atom.unbound ? 'nothing drawn' : loading ? loadingAfter(ELECTRON_DENSITY) : ELECTRON_DENSITY };
    }
    const qualifier = loading ? LOADING : atom.unbound ? 'nothing drawn' : enclosed(selectShownEnclosedFraction(state));
    return { name: `${species} ${part}`, qualifier };
}

function orbitalsCaption(state: RootState, { loading }: ViewCaptionStatus): ViewCaption {
    const combination = state.orbital.combination;
    if (combination.kind !== 'none') {
        // Spec §3.5: a refused selection draws nothing, and says so.
        const qualifier = selectionProblem(combination) ? 'not drawn' : loading ? LOADING : enclosed(state.orbital.enclosedFraction);
        return { name: `Hydrogen ${combinationTitle(combination)}`, qualifier };
    }
    // The orbital on screen, or -- while the next one is computed -- the one asked for.
    const orbital = loading ? state.orbital.basicSelection : selectShownBasicOrbital(state);
    return {
        name: `Hydrogen ${orbitalName(orbital.n, orbital.l, orbital.ml)}`,
        qualifier: loading ? LOADING : enclosed(selectShownEnclosedFraction(state)),
    };
}

function bondsCaption(state: RootState, { loading, failed, plain }: ViewCaptionStatus): ViewCaption {
    // Task 5b (finish fix 5; ruling): at Basics in the Bond length block's words and Å, lower-case as a qualifier is;
    // from Explore in a₀, as before.
    const length = (R: number) => (plain ? plainLength(R).replace(/^D/, 'd') : `R = ${R.toFixed(2)} a₀`);
    // The picture on screen (an orbital this geometry does not keep is drawn as the density), or -- while the next
    // one loads, or before any has landed -- the one asked for.
    const drawn = loading || failed ? null : bondsDrawnPicture(state);
    if (drawn) {
        return { name: `${systemFormula(drawn.system)} ${bondsViewName(bondsPictureNamed(drawn.picture))}`, qualifier: length(drawn.R) };
    }
    const { system, view, R } = state.bonds;
    const qualifier = failed ? 'not loaded' : loading || R === null ? LOADING : length(R);
    return { name: `${systemFormula(system)} ${bondsViewName(view)}`, qualifier };
}

const NO_SURFACE: Record<'structure' | 'dipole', string> = { structure: 'structure only', dipole: 'dipole arrow only' };

function moleculeCaption(state: RootState, { loading }: ViewCaptionStatus): ViewCaption {
    const { previewAtoms, previewFormula } = state.jobs.request;
    if (previewAtoms) return { name: `Preview ${formatFormula(previewFormula ?? '')}`, qualifier: 'not yet computed' };
    const molecule = state.molecule;
    const meta = molecule.meta;
    if (!meta) {
        if (molecule.selectedId === null) return { name: 'Molecules', qualifier: 'choose a molecule' };
        // The molecule asked for, by its index name (a computed one, not in the index, as "Molecule"), until its meta lands.
        const asked = molecule.index?.find(entry => entry.id === molecule.selectedId)?.name ?? 'Molecule';
        return { name: asked, qualifier: molecule.error ? 'not loaded' : LOADING };
    }
    const surface = molecule.surface;
    if (surface.kind === 'mo') {
        const orbital = meta.orbitals.find(o => o.index === surface.index);
        // Fix round 1 (M2): the role says which orbital, so it goes with the name -- "Water 1b1 (HOMO)", as the canvas
        // subtitle and the export write it.
        const role = orbital?.role ? ` (${orbital.role})` : '';
        return {
            name: `${meta.name} ${orbital?.label ?? `orbital ${surface.index}`}${role}`,
            qualifier: loading ? LOADING : enclosed(state.orbital.enclosedFraction),
        };
    }
    if (surface.kind === 'none') {
        const shows = noSurfaceView(state)?.shows;
        return { name: meta.name, qualifier: shows ? NO_SURFACE[shows] : 'nothing drawn' };
    }
    const kind = SURFACE_KIND[surface.kind];
    return { name: meta.name, qualifier: loading ? loadingAfter(kind) : kind };
}

/**
 * Whether a caption names a view still being waited for ("loading…", alone or after the kind of surface) -- Task 9
 * review M3: App's spoken copy holds the last view that is not, and asks here rather than matching the words.
 */
export function captionIsLoading(caption: ViewCaption): boolean {
    return caption.qualifier === LOADING || caption.qualifier.endsWith(` · ${LOADING}`);
}

/** The phone caption's two halves for the view on screen (or, while it loads, the view asked for). */
export function viewCaption(state: RootState, status: ViewCaptionStatus): ViewCaption {
    switch (state.atom.mode) {
        case 'atom': return atomCaption(state, status);
        case 'hydrogenic': return orbitalsCaption(state, status);
        case 'bonds': return bondsCaption(state, status);
        default: return moleculeCaption(state, status);
    }
}
