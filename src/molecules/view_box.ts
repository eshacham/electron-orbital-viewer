import type { MoleculeBasis } from './types';
import { moOnGrid } from './gaussian_basis';
import { originReach } from './orbital_box';
import { isoLevelForEnclosedFraction } from '../radial_distribution';

/**
 * Ruling T10-mainbox (Task 16c): the main view's sampling box for an orbital.
 *
 * Bonds sampled every orbital in the molecule's box (the farthest atom +
 * 6.5 a₀) and Molecules in the density grid's box. Diffuse orbitals reach
 * past it -- B₂'s 3σu* and Li₂'s 2σu* at the default 90 %, Li₂'s occupied
 * 2σg at 99 %, CH₃OH's LUMO -- and marching cubes left them open where the
 * box cut them: a flat hole on the lobe. Worse, the iso level for "90 %
 * enclosed" was found over a box that left part of the electron out.
 *
 * The box is max(the molecule's box, the reach of the widest surface the
 * user can pick here at this fraction), one value per (basis, fraction,
 * molecule box): the same for every orbital of a scan point or molecule, so
 * switching orbitals never changes the box. Each orbital's reach comes from
 * a probe: ψ sampled on a coarse PROBE_RESOLUTION³ grid over the cube
 * originReach (orbital_box.ts) bounds, and where the surface crosses out of
 * it -- between the outermost samples at or above the iso level and their
 * outward neighbours below it, interpolated in ln |ψ|² (a tail decays
 * exponentially) -- plus PROBE_MARGIN of a probe step. The probe's iso level
 * is taken at (1 + fraction) / 2, half the left-out share, because a coarse
 * grid under-samples the cusps at the nuclei and so over-states the iso
 * level (by up to 1.4× on Li₂'s 2σg), which would put the surface too close
 * in. Against a reference at the main view's own step, over every Bonds
 * scan point and every library molecule at 90/95/99 %, this box was never
 * short (by ≥ 0.25 a₀ wherever the molecule's box cuts a surface) and on
 * average 0.2–0.4 a₀ wide of it; tools/thumbs/validate_tile_boxes.mjs proves
 * the result on the shipped data (no main-view surface crosses its box).
 *
 * Orbitals whose originReach is inside the molecule's box are not probed:
 * that reach already holds 99.99 % of every shell that carries them.
 */
export const PROBE_RESOLUTION = 24;
/** Added to the interpolated crossing, in probe steps (see above). */
export const PROBE_MARGIN = 0.25;

/**
 * Where a box grows the resolution grows with it, so the step stays at most
 * the molecule box's -- capped here (161³ samples, 4.6× a 97³ view). The
 * worst case over the shipped data is listed in the Task 16c report.
 */
export const MAX_VIEW_RESOLUTION = 160;

/** A probe evaluates ψ once per point of a 25³ grid per orbital; the boxes are kept per (basis, fraction, box). */
const CACHE_SIZE = 64;
const cache = new Map<string, number>();

/** How far, a₀ (max-norm about the origin), the `fraction` surface of `basis.orbitals[index]` reaches; 0 when it cannot pass `moleculeBox`. */
export function probedReach(basis: MoleculeBasis, index: number, fraction: number, moleculeBox: number): number {
    // An orbital the basis does not carry is never drawn from it, so it sets no reach.
    if (!basis.orbitals[index]) return 0;
    const bound = originReach(basis, index);
    if (!(bound > moleculeBox)) return 0;
    const side = PROBE_RESOLUTION + 1;
    const step = (2 * bound) / PROBE_RESOLUTION;
    const samples = moOnGrid(basis, index, { shape: [side, side, side], origin: [-bound, -bound, -bound], spacing: step });
    const iso = isoLevelForEnclosedFraction(samples, (1 + fraction) / 2);
    if (!(iso > 0)) return 0;
    const centre = PROBE_RESOLUTION / 2;
    const density = (at: number[]) => samples[(at[0] * side + at[1]) * side + at[2]] ** 2;
    let reach = -1; // in probe steps from the centre, max-norm
    const at = [0, 0, 0];
    for (at[0] = 0; at[0] < side; at[0]++) for (at[1] = 0; at[1] < side; at[1]++) for (at[2] = 0; at[2] < side; at[2]++) {
        const inside = density(at);
        if (inside < iso) continue;
        const offsets = at.map(n => Math.abs(n - centre));
        reach = Math.max(reach, ...offsets);
        // Outward along each axis: where between this sample and the next ψ² falls to the iso level.
        for (let axis = 0; axis < 3; axis++) {
            if (offsets[axis] === 0) continue;
            const next = [...at];
            next[axis] += Math.sign(at[axis] - centre);
            let t = 1; // off the probe's grid (its edge is originReach's): count the whole step
            if (next[axis] >= 0 && next[axis] < side) {
                const outside = density(next);
                if (outside >= iso) continue;
                if (outside > 0) t = Math.log(inside / iso) / Math.log(inside / outside);
            }
            reach = Math.max(reach, offsets[axis] + t);
        }
    }
    return reach < 0 ? 0 : (reach + PROBE_MARGIN) * step;
}

/**
 * The main view's sampling half-width, a₀, for any of `orbitalIndices` (the
 * orbitals the user can pick) of `basis` at `fraction`: never smaller than
 * `moleculeBox`, and the same for each of them.
 */
export function orbitalViewBox(basis: MoleculeBasis, orbitalIndices: readonly number[], fraction: number, moleculeBox: number): number {
    const key = `${basis.id}|${basis.nao}|${orbitalIndices.join(',')}|${fraction}|${moleculeBox}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let box = moleculeBox;
    for (const index of orbitalIndices) box = Math.max(box, probedReach(basis, index, fraction, moleculeBox));
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(key, box);
    return box;
}

/**
 * The resolution that keeps a grown box's step no coarser than `baseResolution`
 * over `moleculeBox` (today's view), up to MAX_VIEW_RESOLUTION; exactly
 * `baseResolution` when the box has not grown.
 */
export function viewResolution(baseResolution: number, moleculeBox: number, box: number): number {
    if (!(box > moleculeBox)) return baseResolution;
    return Math.min(MAX_VIEW_RESOLUTION, Math.ceil((baseResolution * box) / moleculeBox));
}
