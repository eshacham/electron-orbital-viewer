import type { MoleculeBasis } from './types';

/**
 * Ruling T10-core: a strip tile meshes one molecular orbital at 40³ (spec
 * §12). Over the whole molecule's box (the farthest atom + 6.5 a₀) a voxel is
 * ~0.38 a₀ -- as wide as a 1s core orbital's 90 % surface, which came out as
 * a six-vertex speck (CO's 1σ) or a clipped block (CO's 2σ). So each tile is
 * meshed in a box fitted to its own orbital, read off the basis: the shells
 * that carry the orbital, and how far each of them reaches.
 *
 * A shell's share is the sum of its coefficients squared (contracted AOs are
 * normalised, so this is roughly the electron it carries; overlap is
 * ignored). The box is centred on the shells carrying at least CENTRE_SHARE
 * of the orbital -- a core orbital's own atom (or atoms) -- and reaches round
 * every shell carrying at least REACH_SHARE (ruling T10-core-I1: a 5 % cut
 * for the reach dropped the diffuse shells that set a valence orbital's
 * outer surface, and cut C₂'s 3σu* at 90 % and F₂'s 3σg at 99 %). A shell
 * reaches as far as its most diffuse primitive that matters (normalised
 * weight over PRIMITIVE_SHARE of the largest), out to the radius holding
 * 99.99 % of that primitive's own density. Nothing here evaluates the
 * orbital: it is cheap enough for a render, and the main view (which meshes
 * the whole molecule's box) is not involved. tools/thumbs/validate_tile_boxes.mjs
 * proves the rule over every Bonds molecule and scan point at 90/95/99 %.
 */
export const CENTRE_SHARE = 5e-2;
export const REACH_SHARE = 5e-3;
export const PRIMITIVE_SHARE = 1e-3;

/**
 * u at which the radial density r^(2l+2) e^(−2αr²) of a normalised primitive
 * holds 99.99 %, u = 2αr²: Gamma(l + 3/2) quantiles, i.e. χ²(2l + 3)'s
 * 0.9999 point over 2 (s, p, d, f). 99.99 %, not 99.9 % (ruling
 * T10-core-I1): at the 99 % surface the Bonds menu offers, diffuse virtual
 * orbitals (N₂'s and O₂'s 3σu*) reach past their shells' 99.9 % radius.
 */
const TAIL_U = [21.108 / 2, 25.745 / 2, 29.878 / 2, 33.720 / 2];

/** Γ(l + 3/2) for l = 0…3. */
const GAMMA_L_3_2 = [0.886226925452758, 1.329340388179137, 3.323350970447843, 11.63172839656745];

export interface OrbitalBox {
    /** Where the box is centred, a₀ (the molecule's frame). */
    centre: [number, number, number];
    /** Half the box's side, a₀. */
    halfWidth: number;
}

/** Radius, a₀, holding 99.99 % of a normalised primitive r^l e^(−αr²) S_lm's density. */
function primitiveReach(alpha: number, l: number): number {
    return Math.sqrt(TAIL_U[l] / (2 * alpha));
}

/** A primitive's coefficient as a share of a normalised primitive (the basis stores c × norm). */
function normalisedWeight(coefficient: number, alpha: number, l: number): number {
    const normSquared = (2 * Math.pow(2 * alpha, l + 1.5)) / GAMMA_L_3_2[l];
    return (coefficient * coefficient) / normSquared;
}

function shellReach(exponents: number[], coefficients: number[], l: number): number {
    const weights = exponents.map((alpha, k) => normalisedWeight(coefficients[k], alpha, l));
    const largest = Math.max(...weights);
    let reach = 0;
    exponents.forEach((alpha, k) => {
        if (weights[k] >= PRIMITIVE_SHARE * largest) reach = Math.max(reach, primitiveReach(alpha, l));
    });
    return reach;
}

/**
 * The box a tile meshes `basis.orbitals[index]` in. Never larger than
 * `limit` (the molecule's own box, centred on the origin): where the fitted
 * cube would not be smaller, that box is returned unchanged.
 */
export function orbitalBox(basis: MoleculeBasis, index: number, limit: number): OrbitalBox {
    const coefficients = basis.orbitals[index].coefficients;
    const shares: number[] = [];
    let offset = 0;
    for (const shell of basis.shells) {
        const width = 2 * shell.l + 1;
        let share = 0;
        for (let m = 0; m < width; m++) share += coefficients[offset + m] ** 2;
        shares.push(share);
        offset += width;
    }
    const total = shares.reduce((sum, share) => sum + share, 0);
    // Centre: the middle of the atoms' spheres for the shells that carry the orbital.
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    const reaches = basis.shells.map(shell => shellReach(shell.exponents, shell.coefficients, shell.l));
    basis.shells.forEach((shell, s) => {
        if (shares[s] < CENTRE_SHARE * total) return;
        const atom = basis.atoms[shell.atom];
        for (let axis = 0; axis < 3; axis++) {
            low[axis] = Math.min(low[axis], atom[axis] - reaches[s]);
            high[axis] = Math.max(high[axis], atom[axis] + reaches[s]);
        }
    });
    const centre = [0, 1, 2].map(axis => (low[axis] + high[axis]) / 2) as [number, number, number];
    // Reach: round every shell that carries enough to move the surface.
    let halfWidth = 0;
    basis.shells.forEach((shell, s) => {
        if (shares[s] < REACH_SHARE * total) return;
        const atom = basis.atoms[shell.atom];
        for (let axis = 0; axis < 3; axis++) halfWidth = Math.max(halfWidth, Math.abs(atom[axis] - centre[axis]) + reaches[s]);
    });
    if (!(halfWidth > 0) || halfWidth >= limit) return { centre: [0, 0, 0], halfWidth: limit };
    return { centre, halfWidth };
}

/**
 * A copy of `basis` moved by −centre, named for it: the same orbitals, with
 * `centre` at the origin. The sampling cube is always centred on the origin
 * (orbital_mesh.ts), so this is how a tile's fitted box is put on its orbital.
 */
export function basisCentredOn(basis: MoleculeBasis, centre: [number, number, number]): MoleculeBasis {
    return {
        ...basis,
        id: `${basis.id}~${centre.map(c => c.toFixed(6)).join(',')}`,
        atoms: basis.atoms.map(atom => atom.map((x, axis) => x - centre[axis]) as [number, number, number]),
    };
}
