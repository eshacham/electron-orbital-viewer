import type { RootState } from '../store';
import { profileRelativity, speciesOf } from '../store/atomSlice';
import { selectShownBasicOrbital, selectShownEnclosedFraction } from '../store/orbitalSlice';
import { speciesTitle } from '../atom/species';
import { subshellLabel } from '../atom/configurations';
import type { RelativityMode } from '../atom/relativity';
import { orbitalName } from '../orbital_names';
import { combinationTitle } from '../combinations';
import { BONDS_SYSTEMS } from '../bonds/systems';
import { moleculeTitle, noSurfaceView, viewDescription } from '../export/caption';
import { formatFormula } from '../molecules/catalogue';
import { ELEMENTS } from '../elements';
import type { CanonicalAtom } from '../jobs/api_types';

const SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

/** "L shell": the X-ray letter, as the breadcrumb and the strip name shells. */
export function shellName(n: number): string {
    return `${SHELL_LETTERS[n - 1] ?? `n = ${n}`} shell`;
}

/** The drawn profile's method (ruling C9: the picture's mode, not the switch's). */
const METHOD: Record<RelativityMode, string> = {
    off: 'LDA, non-relativistic',
    scalar: 'LDA, scalar-relativistic',
    spinOrbit: 'LDA, with spin–orbit',
};

/** Hill order -- carbon, hydrogen, then alphabetical; alphabetical with no carbon -- as tools/jobs/canonical.py's formula() writes it. */
function hillFormula(atoms: CanonicalAtom[]): string {
    const counts = new Map<string, number>();
    for (const [Z] of atoms) {
        const symbol = ELEMENTS[Z - 1]?.symbol ?? `Z${Z}`;
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
    const rest = [...counts.keys()].filter(s => !counts.has('C') || (s !== 'C' && s !== 'H')).sort();
    const order = counts.has('C') ? ['C', 'H', ...rest].filter(s => counts.has(s)) : rest;
    return order.map(s => `${s}${counts.get(s)! > 1 ? counts.get(s) : ''}`).join('');
}

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
        const orbital = atom.selectedOrbital;
        const subshell = atom.selectedSubshell;
        const level = atom.level === 'orbital' && orbital
            ? `${orbitalName(orbital.n, orbital.l, orbital.ml)} orbital${orbital.j === undefined ? '' : ` · ${subshellLabel(orbital.n, orbital.l, orbital.j)}`}`
            : atom.level === 'shell' && subshell ? subshellLabel(subshell.n, subshell.l, subshell.j)
            : atom.level === 'shell' && atom.selectedShell !== null ? shellName(atom.selectedShell)
            : 'whole atom';
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
        return { title, subtitle: `|ψ|² isosurface · ${percent} enclosed · exact one-electron solution, Z = 1` };
    }
    if (atom.mode === 'bonds') {
        const system = BONDS_SYSTEMS.find(entry => entry.id === state.bonds.system);
        return { title: system ? `${system.formula} — ${system.name}` : 'Bonds', subtitle: viewDescription(state) };
    }
    // Ruling P12: the request workspace's preview is what the canvas shows meanwhile -- named as one.
    const preview = state.jobs.request.previewAtoms;
    if (preview) return { title: `Preview — ${formatFormula(hillFormula(preview))}`, subtitle: 'resolved structure, not yet computed' };
    const meta = state.molecule.meta;
    if (!meta) return { title: 'Molecules', subtitle: 'Choose a molecule' };
    // Ruling P8 / T13-M: no surface (show=none) -- the line says what is drawn instead, and how it was got.
    return { title: moleculeTitle(meta), subtitle: noSurfaceView(state)?.line ?? viewDescription(state) };
}
