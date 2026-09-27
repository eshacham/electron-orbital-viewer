import type { RootState } from '../store';
import { elementFor } from '../elements';
import { orbitalName } from '../orbital_names';
import { subshellLabel } from '../atom/configurations';
import { selectShownBasicOrbital } from '../store/orbitalSlice';
import { combinationTitle } from '../combinations';

/** Spec §3.1: every exported number says how it was computed. */
export const ATOM_METHOD = 'central-field SCF, LDA exchange + VWN5 correlation, non-relativistic, spherically averaged';
export const BASIC_METHOD = 'exact one-electron (hydrogenic) solution, Z = 1';

export function methodStatement(state: RootState): string {
    if (state.atom.mode === 'atom') return ATOM_METHOD;
    const combination = state.orbital.combination;
    if (combination.kind === 'hybrid') {
        return `${BASIC_METHOD}; hybrids are linear combinations of these, a basis choice rather than a state of the free atom (qualitative)`;
    }
    if (combination.kind === 'field') {
        return combination.level === 1
            ? 'hydrogen 1s polarised by first-order perturbation theory (Dalgarno-Lewis); valid for F << 1 a.u., tunnelling ignored'
            : 'hydrogen n = 2 Stark states (2s +/- 2p_z)/sqrt 2, first-order degenerate perturbation theory; valid for F << 1 a.u.';
    }
    return BASIC_METHOD;
}

export function viewDescription(state: RootState): string {
    const percent = `${Math.round(state.orbital.enclosedFraction * 100)}% contour`;
    if (state.atom.mode !== 'atom') {
        const combination = state.orbital.combination;
        if (combination.kind !== 'none') return `Hydrogen, ${combinationTitle(combination)}, ${percent}`;
        const o = selectShownBasicOrbital(state);
        return `Hydrogen ${orbitalName(o.n, o.l, o.ml)}, ${percent}`;
    }
    const { Z, level, selectedShell, selectedSubshell, selectedOrbital } = state.atom;
    const element = elementFor(Z);
    const name = element ? `${element.name} (${element.symbol}, Z = ${Z})` : `Z = ${Z}`;
    if (level === 'orbital' && selectedOrbital) {
        return `${name}, ${orbitalName(selectedOrbital.n, selectedOrbital.l, selectedOrbital.ml)}, ${percent}`;
    }
    if (level === 'shell' && selectedSubshell) return `${name}, ${subshellLabel(selectedSubshell.n, selectedSubshell.l)} subshell, ${percent}`;
    if (level === 'shell' && selectedShell !== null) return `${name}, n = ${selectedShell} shell, ${percent}`;
    return `${name}, whole atom, ${percent}`;
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
    const { Z, level, selectedShell, selectedSubshell, selectedOrbital } = state.atom;
    const symbol = elementFor(Z)?.symbol ?? `Z${Z}`;
    if (level === 'orbital' && selectedOrbital) {
        return `orbital-viewer_${symbol}_n${selectedOrbital.n}_l${selectedOrbital.l}_ml${selectedOrbital.ml}`;
    }
    if (level === 'shell' && selectedSubshell) return `orbital-viewer_${symbol}_subshell_n${selectedSubshell.n}_l${selectedSubshell.l}`;
    if (level === 'shell' && selectedShell !== null) return `orbital-viewer_${symbol}_shell_n${selectedShell}`;
    return `orbital-viewer_${symbol}_atom`;
}
