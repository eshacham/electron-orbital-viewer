import type { MoleculeAtom } from './library_types';
import { drawnAtomRadiusBohr, elementSymbol, Representation } from './ball_and_stick';
import type { MoleculeState } from '../store/moleculeSlice';

/** How far, a₀, the drawn surface reaches from atom `atom`, over the vertices nearer that atom than any other. */
export interface AtomReach { atom: number; reach: number }

/**
 * Owner R25-C (ruling R25-C-present): the drawn surface, split among the atoms nearest its vertices, as each
 * atom's reach. A core is then one atom's (or a few atoms') small reach; a valence surface's reach runs past
 * every ball. Measured off the mesh drawn, at the fraction drawn.
 */
export function surfaceReachByAtom(positions: ReadonlyArray<ArrayLike<number>>, atoms: readonly MoleculeAtom[]): AtomReach[] {
    const reach = new Map<number, number>();
    for (const vertex of positions) {
        let nearest = -1;
        let best = Infinity;
        atoms.forEach((atom, index) => {
            const d = Math.hypot(vertex[0] - atom.position[0], vertex[1] - atom.position[1], vertex[2] - atom.position[2]);
            if (d < best) { best = d; nearest = index; }
        });
        if (nearest >= 0) reach.set(nearest, Math.max(reach.get(nearest) ?? 0, best));
    }
    return [...reach.entries()].map(([atom, r]) => ({ atom, reach: r }));
}

/**
 * "<label> lies inside the S ball" when every part of the drawn surface lies inside the ball `representation`
 * draws for its atom (drawnAtomRadiusBohr: the very radius the structure is built with) -- so the surface cannot
 * be seen -- else null. Computed, never keyed on "a core": S's 1s at 99 % (0.28 a₀) hides in ball and stick's S
 * ball (0.79 a₀), C's 1s at 99 % (~0.8 a₀) pokes out of its C ball (0.57 a₀), and with no structure nothing hides.
 */
export function insideBallNote(label: string, atoms: readonly MoleculeAtom[], reach: readonly AtomReach[] | null, representation: Representation): string | null {
    if (!reach || reach.length === 0 || representation === 'none') return null;
    for (const { atom, reach: r } of reach) {
        const ball = drawnAtomRadiusBohr(representation, atoms[atom].Z);
        if (ball === null || !(r < ball)) return null;
    }
    const elements = [...new Set(reach.map(({ atom }) => elementSymbol(atoms[atom].Z)))];
    const where = elements.length > 1 ? "the atoms' balls" : reach.length > 1 ? `the ${elements[0]} balls` : `the ${elements[0]} ball`;
    return `${label} lies inside ${where}`;
}

/** The note for the orbital drawn now -- only once its surface has landed (`drawn`), and for that very orbital. */
export function insideBallNoteFor(state: Pick<MoleculeState, 'meta' | 'surface' | 'drawn' | 'surfaceReach' | 'representation'>): string | null {
    const { meta, surface, drawn } = state;
    if (!meta || surface.kind !== 'mo' || drawn?.surface.kind !== 'mo' || drawn.surface.index !== surface.index) return null;
    const label = meta.orbitals.find(o => o.index === surface.index)?.label ?? `orbital ${surface.index}`;
    return insideBallNote(label, meta.atoms, state.surfaceReach ?? null, state.representation);
}
