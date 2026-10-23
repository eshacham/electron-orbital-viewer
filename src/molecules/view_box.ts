import type { MoleculeBasis } from './types';
import { moOnGrid } from './gaussian_basis';
import { originReach } from './orbital_box';
import { isoLevelForEnclosedFraction } from '../radial_distribution';

/**
 * Ruling T10-mainbox (Task 16c), amended by T16c-I1: the main view's sampling box for an orbital.
 *
 * Bonds sampled every orbital in the molecule's box (the farthest atom +
 * 6.5 a₀) and Molecules in the density grid's box. Diffuse orbitals reach
 * past it -- B₂'s 3σu* and Li₂'s 2σu* at the default 90 %, Li₂'s occupied
 * 2σg at 99 %, CH₃OH's LUMO -- and marching cubes left them open where the
 * box cut them: a flat hole on the lobe. Worse, the iso level for "90 %
 * enclosed" was found over a box that left part of the electron out.
 *
 * The box is max(the molecule's box, the reach of the drawn orbital's
 * surface at this fraction), per (basis, orbital, fraction, molecule box).
 * It is the orbital's own (ruling T16c-I1): the camera keeps its framing for
 * the molecule's box (FieldRenderRequest.frameBox), so switching orbitals
 * never moves it, and an orbital that fits the molecule's box keeps today's
 * box and grid exactly. Only the drawn orbital is probed, so the cost does
 * not grow with how many orbitals a molecule lists (a computed molecule's
 * list runs to hundreds).
 *
 * The reach comes from a probe: ψ sampled on a coarse PROBE_RESOLUTION³ grid
 * over the cube originReach (orbital_box.ts) bounds, and where the surface
 * crosses out of it -- between the outermost samples at or above the iso
 * level and their outward neighbours below it, interpolated in ln |ψ|² (a
 * tail decays exponentially) -- plus PROBE_MARGIN of a probe step. The
 * probe's iso level is taken well beyond the fraction (PROBE_TAIL): the box
 * must hold the density the iso level is found from, not only the surface,
 * and a coarse grid under-samples the cusps at the nuclei and so over-states
 * the iso level (by up to 1.4× on Li₂'s 2σg).
 * tools/thumbs/validate_tile_boxes.mjs proves the result on the shipped data:
 * no main-view surface crosses its box, and the iso level is checked against
 * a reference that holds everything.
 *
 * Orbitals whose originReach is inside the molecule's box are not probed:
 * that reach already holds 99.99 % of every shell that carries them.
 */
export const PROBE_RESOLUTION = 24;
/** Added to the interpolated crossing, in probe steps (see above). */
export const PROBE_MARGIN = 0.25;
/**
 * The probe's iso level is taken at 1 − PROBE_TAIL × (1 − fraction) -- 99 % for a 90 % surface, 99.9 % for a
 * 99 % one -- so the box holds not only the surface but nearly all of the density the iso level is found from
 * (fix round 1). At ½ (the first round's (1 + f)/2) each orbital's own box held its surface but could leave up
 * to 1.5 % of the density out (SiH₄'s 4a1), putting the iso level up to 14 % high; at ⅒ the worst over the
 * shipped data is 0.25 % (iso 2.7 % high), and all but 6 cases are within two of the iso search's histogram bins.
 */
export const PROBE_TAIL = 0.1;

/**
 * Ruling T16c-cap. Where a box grows, the resolution grows with it so the
 * step stays the molecule box's -- up to MAX_VIEW_RESOLUTION (133³ points,
 * 2.4 M samples) and up to what VIEW_MESH_BUDGET_MS affords for the basis's
 * size. Past either cap the step grows instead: the surface stays whole,
 * only its step coarsens. Never below today's resolution.
 */
export const MAX_VIEW_RESOLUTION = 132;

/**
 * The orbital worker's time for one MO mesh (sampling, iso search, marching
 * cubes, vertex phases), ms on an Apple M2 Pro: VIEW_MESH_COST.fixed +
 * S × (perMillionSamples + perMillionSamplesPerBasisFunction × nao), S in
 * millions of samples. An envelope, not a fit: every library molecule's
 * dearest orbital at 99 %, at 96³ and 126³, took no longer than this (best of
 * six, Node 24; the least-squares fit is 126 + S × (24 + 1.37 nao), and the
 * worst case comes to 0.98 of this envelope: acetone's 16a' at 96³).
 */
export const VIEW_MESH_COST = { fixed: 250, perMillionSamples: 100, perMillionSamplesPerBasisFunction: 1.3 };

/**
 * Spec §3.7 (beyond-isolated-atoms.md): a view renders in under 1.5 s on a
 * 2020 laptop and under 4 s on a mid-range phone. A 2020 laptop runs this
 * code about 2× slower than the M2 Pro (systems.ts's BONDS_RESOLUTION
 * timing), and the live view adds about 100 ms (M2) to the worker's own
 * time (spawning it, the transfer, the GPU upload): (1500 − 2 × 100) / 2 =
 * 650 ms of M2 worker time. A mid-range phone at about 4× the M2 Pro's time
 * then takes about 2.6 s + 0.4 s, inside its 4 s.
 */
export const VIEW_MESH_BUDGET_MS = 650;

/** VIEW_MESH_COST's estimate of one mesh at `resolution` for a basis of `nao` functions, ms on an M2 Pro. */
export function predictedMeshMs(resolution: number, nao: number): number {
    const { fixed, perMillionSamples, perMillionSamplesPerBasisFunction } = VIEW_MESH_COST;
    return fixed + ((resolution + 1) ** 3 / 1e6) * (perMillionSamples + perMillionSamplesPerBasisFunction * nao);
}

/** The highest resolution VIEW_MESH_BUDGET_MS affords for `nao` basis functions. */
function affordableResolution(nao: number): number {
    const { fixed, perMillionSamples, perMillionSamplesPerBasisFunction } = VIEW_MESH_COST;
    const samples = ((VIEW_MESH_BUDGET_MS - fixed) / (perMillionSamples + perMillionSamplesPerBasisFunction * nao)) * 1e6;
    let resolution = Math.floor(Math.cbrt(samples)) - 1;
    while (predictedMeshMs(resolution + 1, nao) <= VIEW_MESH_BUDGET_MS) resolution++;
    while (resolution > 1 && predictedMeshMs(resolution, nao) > VIEW_MESH_BUDGET_MS) resolution--;
    return resolution;
}

/** One probe evaluates ψ on a 25³ grid; the boxes are kept per (basis, orbital, fraction, molecule box). */
const CACHE_SIZE = 256;
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
    const iso = isoLevelForEnclosedFraction(samples, 1 - PROBE_TAIL * (1 - fraction));
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
 * The main view's sampling half-width, a₀, for `basis.orbitals[index]` at
 * `fraction`: the molecule's box, or the orbital's probed reach where that is
 * further (ruling T16c-I1: its own box; frameBox keeps the camera).
 */
export function orbitalViewBox(basis: MoleculeBasis, index: number, fraction: number, moleculeBox: number): number {
    const key = `${basis.id}|${basis.nao}|${index}|${fraction}|${moleculeBox}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const box = Math.max(moleculeBox, probedReach(basis, index, fraction, moleculeBox));
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(key, box);
    return box;
}

/**
 * The resolution for a box grown from `moleculeBox` (sampled at
 * `baseResolution` today) to `box`, for a basis of `nao` functions: the one
 * that keeps today's step, capped at MAX_VIEW_RESOLUTION and at what the mesh
 * budget affords (ruling T16c-cap) -- past a cap the step grows -- and never
 * below `baseResolution`. Exactly `baseResolution` when the box has not grown.
 */
export function viewResolution(baseResolution: number, moleculeBox: number, box: number, nao: number): number {
    if (!(box > moleculeBox)) return baseResolution;
    const keepsStep = Math.ceil((baseResolution * box) / moleculeBox);
    return Math.max(baseResolution, Math.min(keepsStep, MAX_VIEW_RESOLUTION, affordableResolution(nao)));
}
