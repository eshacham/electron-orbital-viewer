/**
 * The names of what is drawn, written once (Task 8 fix round 1, M9) for the canvas title, the phone caption and the
 * export captions, so they cannot drift apart. Markup, as orbitalName writes it ("2p_z"): the UI typesets it with
 * withSubscripts, a plain-text surface writes it with flatSubscripts.
 */
import type { AtomState } from '../store/atomSlice';
import type { OrbitalSpin } from '../molecules/types';
import { orbitalName, shellName } from '../orbital_names';
import { subshellLabel } from '../atom/configurations';
import { H2PLUS_LABELS, type H2PlusState } from '../bonds/h2plus';
import { SPIN_SUFFIX } from '../bonds/bonds_request';

// Final review M2: a shell's name is written once, in orbital_names.ts (no imports, so the solver can use it too).
export { shellName };

/** One atom orbital: "2p_z", with its j-level after `jJoin` under spin–orbit ("2p_z · 2p³⁄₂", or " (" → "2p_z (2p³⁄₂)"). */
export function atomOrbitalName(orbital: { n: number; l: number; ml: number; j?: number }, jJoin: ' · ' | ' ('): string {
    const name = orbitalName(orbital.n, orbital.l, orbital.ml);
    if (orbital.j === undefined) return name;
    const level = subshellLabel(orbital.n, orbital.l, orbital.j);
    return jJoin === ' (' ? `${name} (${level})` : `${name} · ${level}`;
}

/**
 * The part of the atom drawn, or null for the whole atom: "2p_z", "2p", "L shell". The canvas title adds " orbital"
 * and the j-level after "·"; the caption puts the j-level in brackets (its own "·" separates the qualifier).
 */
export function atomPartName(atom: Pick<AtomState, 'level' | 'selectedOrbital' | 'selectedSubshell' | 'selectedShell'>,
    style: 'title' | 'caption'): string | null {
    const orbital = atom.selectedOrbital;
    const subshell = atom.selectedSubshell;
    if (atom.level === 'orbital' && orbital) {
        if (style === 'caption') return atomOrbitalName(orbital, ' (');
        const name = `${orbitalName(orbital.n, orbital.l, orbital.ml)} orbital`;
        return orbital.j === undefined ? name : `${name} · ${subshellLabel(orbital.n, orbital.l, orbital.j)}`;
    }
    if (atom.level === 'shell' && subshell) return subshellLabel(subshell.n, subshell.l, subshell.j);
    if (atom.level === 'shell' && atom.selectedShell !== null) return shellName(atom.selectedShell);
    return null;
}

/** What a Bonds view or picture shows, by kind. */
export type BondsNamed = { kind: 'h2plus'; state: H2PlusState } | { kind: 'mo'; label: string; spin: OrbitalSpin } | { kind: 'density' };

/** "1σg", "1πg* (α)", or the density in `density`'s words ("electron density" by default). */
export function bondsViewName(view: BondsNamed, density = 'electron density'): string {
    if (view.kind === 'h2plus') return H2PLUS_LABELS[view.state];
    if (view.kind === 'mo') return `${view.label}${SPIN_SUFFIX[view.spin]}`;
    return density;
}

/**
 * Molecules with no surface drawn (show=none), as the canvas's view line and Info's say it (owner, 2026-11-02, subtitle
 * contrast): the structure alone, the dipole arrow alone, or nothing. Lower case, as every view line is; a PNG's
 * caption keeps noSurfaceView's own capitalised line.
 */
export const NO_SURFACE_VIEW = {
    structure: 'structure only',
    dipole: 'dipole arrow only',
    nothing: 'nothing drawn: no surface, structure or dipole arrow',
} as const;
