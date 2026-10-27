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
        // Task 5 (critique P1): a field view is first-order perturbation theory, not the exact solution -- n = 1's
        // polarised 1s by Dalgarno–Lewis, n = 2's Stark states by degenerate perturbation theory. A hybrid mixes
        // exact, degenerate n = 2 states, so it stays exact.
        const method = combination.kind !== 'field' ? 'exact one-electron solution, Z = 1'
            : combination.level === 1 ? '1s + first-order Stark, Dalgarno–Lewis'
            : 'n = 2 + first-order Stark, degenerate perturbation theory';
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
    // Ruling P8 / T13-M: no surface (show=none) -- the line says what is drawn instead, and how it was got.
    return { title: moleculeTitle(meta), subtitle: noSurfaceView(state)?.line ?? viewDescription(state) };
}
