import type { MoleculeBasis } from './types';
import { moEvaluator, moOnGrid } from './gaussian_basis';
import { carryingAtoms, originReach } from './orbital_box';
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
 * box and grid exactly -- unless it is a core that grid cannot resolve, which
 * gets its own compact box (owner R25-C). Only the drawn orbital is probed, so the cost does
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
 * Orbitals whose originReach is inside the molecule's box are not probed for
 * growth: that reach already holds 99.99 % of every shell that carries them.
 * A core among them that the molecule's grid cannot resolve (CUSP_WEIGHT) is
 * probed for its own compact box instead (compactReach, owner R25-C).
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

/** One probe evaluates ψ on a 25³ grid; the boxes are kept per (basis, orbital, fraction, molecule box, base resolution). */
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
 * Owner R25-C: the share of the orbital one main-view sample at a nucleus
 * would claim -- |ψ(nucleus)|² × step³ -- past which the grid cannot resolve
 * the orbital there, and it is sampled in its own compact box (compactReach).
 * On the shipped data every core the molecule's box drew coarse (a surface
 * piece under two voxels) or refused weighs 0.19–9.3 (H₂S's S 1s: 6.4, eight
 * samples carrying 95 % of the orbital), and every valence orbital at most
 * 0.095 (an O 2s-like cusp, ethanol's 4a'): valence orbitals keep today's box
 * and grid exactly.
 */
export const CUSP_WEIGHT = 0.15;

/** The largest |ψ|² × `step`³ of `basis.orbitals[index]` at any of the basis's nuclei (see CUSP_WEIGHT). */
export function cuspWeight(basis: MoleculeBasis, index: number, step: number): number {
    const psi = moEvaluator(basis, index);
    let weight = 0;
    for (const [x, y, z] of basis.atoms) weight = Math.max(weight, psi(x, y, z) ** 2 * step ** 3);
    return weight;
}

/**
 * Owner R25-C: the half-width, a₀, of the smallest origin-centred cube
 * holding all but PROBE_TAIL × (1 − fraction) of `basis.orbitals[index]`'s
 * density -- the growth probe's own tail -- or 0 where that is no smaller
 * than `moleculeBox`.
 *
 * Why. A second-row 1s is tiny: S's 90 % surface is 0.17 a₀ in radius, one
 * voxel of the 95³ grid over the molecule's box. There 8 samples carried 95 %
 * of the sampled orbital, the iso level came out 2–5× off, and the mesh was a
 * speck in the nucleus voxel, which orbital_mesh.ts's R22b guard refuses
 * ("Could not resolve this surface": H₂S, PH₃, SF₆, SO₂, SiH₄ 1s; glycine's
 * N 1s and ethanol's C 1s, whose atoms sit at the origin). Sampled in its own
 * box at the same resolution, S's 1s spans 12–19 voxels in radius (90–99 %).
 *
 * How. A coarse grid cannot weigh a cusp, but the orbital is normalised, so
 * the density a cube holds is 1 minus what lies outside it -- and outside a
 * core's own atoms ψ is smooth. ψ is sampled on PROBE_RESOLUTION³ points over
 * the molecule's box; Σ ψ² h³ over the samples beyond each cube of k steps is
 * what that cube leaves out (over-stated beside a cusp, which only widens the
 * box). The cube is the first that leaves out no more than the tail, reaching
 * one step past its last sample shell, and never closer than one step round
 * an atom carrying the orbital (orbital_box.ts carryingAtoms), so a cusp the
 * probe grid straddles is always inside. originReach cannot size this box: Σ
 * c² ignores overlap, and def2-TZVPD's diffuse s shells look like 1–9 % of a
 * core orbital (glycine's N 1s: originReach 10.2 a₀).
 * tools/thumbs/validate_tile_boxes.mjs checks every shipped orbital so boxed
 * against an exact-superset reference (the most left out: 0.08 %; iso level
 * within ×1.034) and that the orbital worker draws it.
 */
export function compactReach(basis: MoleculeBasis, index: number, fraction: number, moleculeBox: number): number {
    const side = PROBE_RESOLUTION + 1;
    const step = (2 * moleculeBox) / PROBE_RESOLUTION;
    const samples = moOnGrid(basis, index, { shape: [side, side, side], origin: [-moleculeBox, -moleculeBox, -moleculeBox], spacing: step });
    const centre = PROBE_RESOLUTION / 2;
    // shells[k]: Σ ψ² over the samples k steps (max-norm) from the origin.
    const shells = new Float64Array(centre + 1);
    let at = 0;
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
        shells[Math.max(Math.abs(i - centre), Math.abs(j - centre), Math.abs(k - centre))] += samples[at++] ** 2;
    }
    const allowed = PROBE_TAIL * (1 - fraction);
    let outside = 0;
    let steps = centre; // the smallest k whose cube leaves out no more than `allowed`
    for (let k = centre; k >= 0; k--) {
        if (outside * step ** 3 > allowed) break;
        steps = k;
        outside += shells[k];
    }
    const atoms = carryingAtoms(basis, index).map(atom => Math.max(...atom.map(Math.abs)) + step);
    const reach = Math.max((steps + 1) * step, ...atoms);
    return reach < moleculeBox ? reach : 0;
}

/**
 * The main view's sampling half-width, a₀, for `basis.orbitals[index]` at
 * `fraction`: the molecule's box (sampled at `baseResolution` today), or the
 * orbital's probed reach where that is further (ruling T16c-I1: its own box;
 * frameBox keeps the camera), or -- where one sample at a nucleus would hold
 * CUSP_WEIGHT of it, a core the molecule's grid cannot resolve -- its own
 * compact box (owner R25-C).
 */
export function orbitalViewBox(basis: MoleculeBasis, index: number, fraction: number, moleculeBox: number, baseResolution: number): number {
    const key = `${basis.id}|${basis.nao}|${index}|${fraction}|${moleculeBox}|${baseResolution}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const box = !basis.orbitals[index] ? moleculeBox // never drawn from this basis: it sets no box
        : originReach(basis, index) > moleculeBox ? Math.max(moleculeBox, probedReach(basis, index, fraction, moleculeBox))
            : cuspWeight(basis, index, (2 * moleculeBox) / baseResolution) >= CUSP_WEIGHT
                ? compactReach(basis, index, fraction, moleculeBox) || moleculeBox
                : moleculeBox;
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
