import type { MoleculeBasis } from './types';
import type { FieldRenderRequest } from '../field_source';

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
 * orbital: it is cheap enough for a render. The main view's own box (ruling
 * T10-mainbox) is view_box.ts's, which bounds its probe with originReach
 * below. tools/thumbs/validate_tile_boxes.mjs
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

/** Each shell's share of `basis.orbitals[index]` (Σ c² over its AOs), and their total. */
function shellShares(basis: MoleculeBasis, index: number): { shares: number[]; total: number } {
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
    return { shares, total: shares.reduce((sum, share) => sum + share, 0) };
}

/**
 * The box a tile meshes `basis.orbitals[index]` in. Never larger than
 * `limit` (the main view's box, centred on the origin): where the fitted
 * cube would not be smaller, that box is returned unchanged.
 */
export function orbitalBox(basis: MoleculeBasis, index: number, limit: number): OrbitalBox {
    const { shares, total } = shellShares(basis, index);
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
 * Half-width, a₀, of the origin-centred cube round every shell carrying at
 * least REACH_SHARE of `basis.orbitals[index]`, each out to its 99.99 %
 * radius: orbitalBox's reach, about the origin the main view's sampling box
 * is centred on (ruling T10-mainbox, view_box.ts). Evaluates nothing; it is
 * loose for diffuse orbitals, which is why the main view only uses it to
 * bound where a probe looks.
 */
export function originReach(basis: MoleculeBasis, index: number): number {
    const { shares, total } = shellShares(basis, index);
    let halfWidth = 0;
    basis.shells.forEach((shell, s) => {
        if (shares[s] < REACH_SHARE * total) return;
        const atom = basis.atoms[shell.atom];
        const reach = shellReach(shell.exponents, shell.coefficients, shell.l);
        for (let axis = 0; axis < 3; axis++) halfWidth = Math.max(halfWidth, Math.abs(atom[axis]) + reach);
    });
    return halfWidth;
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

/**
 * Ruling T10-core: an orbital tile (the Bonds strip's, and since Task 15 the
 * Molecules strip's) is meshed in a box fitted to its own orbital, not the
 * whole molecule's -- at 40³ a 1s core orbital in the molecule's box is a
 * voxel speck. `field` is the main view's own request for that orbital (one
 * gaussianMO source; its rMax the molecule's box, as the strips ask for it
 * with `probe: false`). A tile is fitted within the larger of that box and
 * the orbital's originReach (ruling T16c-I1), and falls back to that larger
 * box where the fit would not be smaller. The sampling box is always
 * centred on the origin, so the tile is given a copy of the basis moved by
 * −centre (and named for it), shared through `moved` by tiles with the same
 * centre: the same orbital, sitting at the centre of its box. The tile frames
 * its own mesh (render_thumbnail.ts), so where the orbital sits does not
 * show. The main view's request is not touched; anything but one gaussianMO
 * source is returned as it is.
 */
export function fitToOrbital(field: FieldRenderRequest, basis: MoleculeBasis, moved: Map<string, MoleculeBasis>): FieldRenderRequest {
    const [source] = field.sources;
    if (field.sources.length !== 1 || source.recipe.type !== 'gaussianMO') return field;
    const { index } = source.recipe;
    // Ruling T16c-I1: the tile's own limit -- the request's box (the molecule's, as the strips ask for it), or the
    // orbital's whole originReach where that is further, so a diffuse orbital's tile holds its surface without a probe.
    const limit = Math.max(source.rMax, originReach(basis, index));
    const { centre, halfWidth } = orbitalBox(basis, index, limit);
    if (halfWidth >= limit) {
        return limit > source.rMax ? { ...field, sources: [{ ...source, rMax: limit }] } : field;
    }
    let fitted = basis;
    if (centre.some(c => c !== 0)) {
        const key = centre.join(',');
        if (!moved.has(key)) moved.set(key, basisCentredOn(basis, centre));
        fitted = moved.get(key)!;
    }
    return {
        ...field,
        sources: [{ ...source, rMax: halfWidth, recipe: { type: 'gaussianMO', moleculeId: fitted.id, index } }],
        bases: [fitted],
    };
}
