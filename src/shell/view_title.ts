import type { RootState } from '../store';
import { profileRelativity, speciesOf } from '../store/atomSlice';
import { selectShownBasicOrbital, selectShownEnclosedFraction } from '../store/orbitalSlice';
import { speciesTitle } from '../atom/species';
import type { RelativityMode } from '../atom/relativity';
import { orbitalName } from '../orbital_names';
import { combinationTitle, selectionProblem } from '../combinations';
import { BONDS_SYSTEMS, systemFormula } from '../bonds/systems';
import { bondsDrawnPicture, bondsPictureNamed, moleculeTitle, noSurfaceView, viewDescription } from '../export/caption';
import { atomPartName, bondsViewName } from './view_names';
import { formatFormula } from '../molecules/catalogue';

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

/**
 * The viewport's title block (spec §8.5, §9.1): "<Species> — <level>", and a
 * subtitle that says what is drawn, at which enclosed fraction, by which
 * method. Basic, Bonds and Molecules get an honest title from the state they
 * already show; their re-composed titles are 6G-2's.
 */
export function viewTitle(state: RootState): ViewTitle {
    const percent = `${Math.round(selectShownEnclosedFraction(state) * 100)} %`;
    const atom = state.atom;
    if (atom.mode === 'atom') {
        const level = atomPartName(atom, 'title') ?? 'whole atom';
        const method = METHOD[atom.profile ? profileRelativity(atom.profile) : 'off'];
        const drawn = atom.unbound ? 'nothing is drawn for this species'
            : atom.level === 'orbital' ? `|ψ|² isosurface · ${percent} enclosed`
            : `${percent} of the electron density enclosed`;
        return { title: `${speciesTitle(speciesOf(atom))} — ${level}`, subtitle: `${drawn} · ${method}` };
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
        const method = combination.kind !== 'field' ? 'exact one-electron solution, Z = 1'
            : combination.level === 1 ? '1s polarised to first order in F, Dalgarno–Lewis'
            : 'n = 2 Stark states, first-order degenerate perturbation theory';
        return { title, subtitle: `|ψ|² isosurface · ${percent} enclosed · ${method}` };
    }
    if (atom.mode === 'bonds') {
        const system = BONDS_SYSTEMS.find(entry => entry.id === state.bonds.system);
        return { title: system ? `${system.formula} — ${system.name}` : 'Bonds', subtitle: viewDescription(state) };
    }
    // Ruling P12: the request workspace's preview is what the canvas shows meanwhile -- named as one, by the
    // preview response's own formula (fix round 1, T16-M4: the one its resolved facts show).
    const { previewAtoms, previewFormula } = state.jobs.request;
    if (previewAtoms) return { title: `Preview — ${formatFormula(previewFormula ?? '')}`, subtitle: 'resolved structure, not yet computed' };
    const meta = state.molecule.meta;
    if (!meta) return { title: 'Molecules', subtitle: 'Choose a molecule' };
    // Ruling P8 / T13-M: no surface (show=none) -- the line says what is drawn instead. Task 8 (addendum 8): not where
    // a structure's geometry came from -- Info owns the geometry source, so the view said it twice. (A PNG's caption
    // keeps noSurfaceView's whole line: there the file has no Info beside it.)
    const noSurface = noSurfaceView(state);
    const subtitle = noSurface ? (noSurface.shows === 'structure' ? 'Structure only' : noSurface.line) : viewDescription(state);
    return { title: moleculeTitle(meta), subtitle };
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
}

const LOADING = 'loading…';
const ELECTRON_DENSITY = 'electron density';
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

function bondsCaption(state: RootState, { loading, failed }: ViewCaptionStatus): ViewCaption {
    // The picture on screen (an orbital this geometry does not keep is drawn as the density), or -- while the next
    // one loads, or before any has landed -- the one asked for.
    const drawn = loading || failed ? null : bondsDrawnPicture(state);
    if (drawn) {
        return { name: `${systemFormula(drawn.system)} ${bondsViewName(bondsPictureNamed(drawn.picture))}`, qualifier: `R = ${drawn.R.toFixed(2)} a₀` };
    }
    const { system, view, R } = state.bonds;
    const qualifier = failed ? 'not loaded' : loading || R === null ? LOADING : `R = ${R.toFixed(2)} a₀`;
    return { name: `${systemFormula(system)} ${bondsViewName(view)}`, qualifier };
}

const SURFACE_KIND = { density: ELECTRON_DENSITY, esp: 'electrostatic potential' } as const;
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

/** The phone caption's two halves for the view on screen (or, while it loads, the view asked for). */
export function viewCaption(state: RootState, status: ViewCaptionStatus): ViewCaption {
    switch (state.atom.mode) {
        case 'atom': return atomCaption(state, status);
        case 'hydrogenic': return orbitalsCaption(state, status);
        case 'bonds': return bondsCaption(state, status);
        default: return moleculeCaption(state, status);
    }
}
