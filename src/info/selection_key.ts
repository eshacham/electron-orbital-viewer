import type { RootState } from '../store';

/**
 * What counts as "a new selection" for Info (ruling PF4): when this string changes, Info returns from an (i)'s term
 * to the selection. Per mode -- Orbitals n|l|ml|combo|member; Atoms Z|charge|excite|level|n|l|ml|j; Bonds
 * system|R|state; Molecules id|surface|orbital -- prefixed by the mode, so a mode switch is one too. View settings
 * (opacity, the cut, the enclosed fraction, a field's strength) are not part of it.
 */
export function infoSelectionKey(state: RootState): string {
    const atom = state.atom;
    switch (atom.mode) {
        case 'hydrogenic': {
            const { n, l, ml } = state.orbital.basicSelection;
            const combination = state.orbital.combination;
            const combo = combination.kind === 'hybrid' ? combination.hybrid : combination.kind;
            const member = combination.kind === 'hybrid' ? String(combination.member) : '';
            return ['orbitals', n, l, ml, combo, member].join('|');
        }
        case 'atom': {
            const where = atom.selectedOrbital ?? atom.selectedSubshell;
            const excite = atom.excitation
                ? `${atom.excitation.from.n}${atom.excitation.from.l}>${atom.excitation.to.n}${atom.excitation.to.l}` : '';
            const n = where?.n ?? atom.selectedShell ?? '';
            const ml = atom.selectedOrbital?.ml ?? '';
            return ['atoms', atom.Z, atom.charge, excite, atom.level, n, where?.l ?? '', ml, where?.j ?? ''].join('|');
        }
        case 'bonds': {
            const { system, R, scanIndex, view } = state.bonds;
            const drawn = view.kind === 'h2plus' ? view.state
                : view.kind === 'mo' ? `${view.label}:${view.spin}:${view.component}` : view.kind;
            return ['bonds', system, R ?? scanIndex ?? '', drawn].join('|');
        }
        case 'molecule': {
            const { selectedId, surface } = state.molecule;
            return ['molecules', selectedId ?? '', surface.kind, surface.kind === 'mo' ? surface.index : ''].join('|');
        }
    }
}
