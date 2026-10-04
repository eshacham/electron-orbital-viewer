import { densityEvaluator } from '../molecules/gaussian_basis';
import { MoleculeBasis } from '../molecules/types';

/** Points sampled strictly between the nuclei; the minimum is smooth (no cusp), so this pins it to well under 1 %. */
const SAMPLES = 200;

/**
 * The lowest ρ (e/a₀³) on the segment between a diatomic's two nuclei, from
 * the same basis and occupations the density surface is drawn from. For a
 * diatomic this is the bond critical point: a minimum along the bond and a
 * maximum across it. A surface drawn below it is one envelope around both
 * nuclei; above it, the surface splits into a separate piece around each.
 * Which happens depends on the molecule: at R_e that minimum runs from
 * 0.71 e/a₀³ for N₂ down to 0.0125 for Li₂ (v1 data), so no ρ above the
 * conventional 0.002 outline means the same thing for every molecule.
 * Null if the basis does not hold exactly two atoms.
 */
export function bondAxisMinimumDensity(basis: MoleculeBasis): number | null {
    if (basis.atoms.length !== 2) return null;
    const [a, b] = basis.atoms;
    const rho = densityEvaluator(basis);
    let min = Infinity;
    for (let i = 1; i < SAMPLES; i++) {
        const t = i / SAMPLES;
        min = Math.min(min, rho(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t));
    }
    return min;
}
