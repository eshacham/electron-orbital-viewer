import { radialWaveFunction, realSphericalHarmonic } from './quantum_functions';

/**
 * Iso level per (n, l): which contour of |psi|^2 the surface is drawn at.
 *
 * This one is a judgement call rather than a derived number — it decides how
 * much of the orbital's tail you see — so it stays a table. The sampling radius
 * is computed from it by `computeSamplingRadius` below.
 */
const ISO_LEVELS: Record<string, number> = {
    "1_0": 0.001,       // 1s
    "2_0": 0.0005,      // 2s
    "2_1": 0.0005,      // 2p
    "3_0": 0.00001,     // 3s
    "3_1": 0.00001,     // 3p
    "3_2": 0.00001,     // 3d
    "4_0": 0.000004,    // 4s
    "4_1": 0.000004,    // 4p
    "4_2": 0.000004,    // 4d
    "4_3": 0.000004,    // 4f
    "5_0": 0.0000025,   // 5s
    "5_1": 0.0000025,   // 5p
    "5_2": 0.0000025,   // 5d
    "5_3": 0.0000025,   // 5f
    "5_4": 0.0000025,   // 5g
    "6_0": 0.000001,    // 6s
    "6_1": 0.000001,    // 6p
    "6_2": 0.000001,    // 6d
    "6_3": 0.000001,    // 6f
    "6_4": 0.000001,    // 6g
    "6_5": 0.000001,    // 6h
    "7_0": 0.0000007,   // 7s
    "7_1": 0.0000007,   // 7p
    "7_2": 0.0000007,   // 7d
    "7_3": 0.0000007,   // 7f
    "7_4": 0.0000007,   // 7g
    "7_5": 0.0000007,   // 7h
    "7_6": 0.0000007,   // 7i
    "8_0": 0.0000001,   // 8s
    "8_1": 0.0000001,   // 8p
    "8_2": 0.0000001,   // 8d
    "8_3": 0.0000001,   // 8f
    "8_4": 0.0000001,   // 8g
    "8_5": 0.0000001,   // 8h
    "8_6": 0.0000001,   // 8i
    "8_7": 0.0000001,   // 8k
    "9_0": 0.00000001,  // 9s
    "9_1": 0.00000001,  // 9p
    "9_2": 0.00000001,  // 9d
    "9_3": 0.00000001,  // 9f
    "9_4": 0.00000001,  // 9g
    "9_5": 0.00000001,  // 9h
    "9_6": 0.00000001,  // 9i
    "9_7": 0.00000001,  // 9k
    "9_8": 0.00000001,  // 9l
};

export function getIsoLevel(n: number, l: number): number | null {
    return ISO_LEVELS[`${n}_${l}`] ?? null;
}

/**
 * Beyond this the sampling box is not worth having: the voxel is 2 * rMax /
 * resolution, so at some point the box is so wide that nothing inside it is
 * resolved. Only reachable by asking for a very low iso level on a high n.
 */
export const MAX_SAMPLING_RADIUS = 400;

function roundUpToTwoFigures(value: number): number {
    if (!(value > 0)) return value;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)) - 1);
    return Math.ceil(value / magnitude) * magnitude;
}

/** Largest |Y_lm|^2 over the sphere, which is the same for every radius. */
const angularPeaks = new Map<string, number>();

function maxAngularSquared(l: number, ml: number): number {
    const key = `${l},${ml}`;
    const cached = angularPeaks.get(key);
    if (cached !== undefined) return cached;

    // phi chosen so the azimuthal factor is at its maximum of 1, leaving only
    // the polar angle to search.
    const phi = ml > 0 ? 0 : ml < 0 ? Math.PI / (2 * Math.abs(ml)) : 0;

    let peak = 0;
    const STEPS = 2000;
    for (let i = 0; i <= STEPS; i++) {
        const y = realSphericalHarmonic(l, ml, (Math.PI * i) / STEPS, phi);
        peak = Math.max(peak, y * y);
    }

    angularPeaks.set(key, peak);
    return peak;
}

/**
 * How wide the sampling box has to be to hold the whole orbital.
 *
 * |psi|^2 factors into R_nl(r)^2 * Y_lml(theta, phi)^2, so the outermost point
 * of the isosurface is the largest r where R(r)^2 times the angular peak still
 * reaches the iso level. Computing this per orbital rather than storing a table
 * of it means the box tracks ml, Z and the iso level: a table keyed on (n, l)
 * could only ever be right for hydrogen at its own default contour.
 *
 * The box has to *contain* the surface, or the orbital is sliced flat where it
 * meets the wall, but no more than that: a box far larger than the orbital
 * wastes resolution on empty space.
 */
export function computeSamplingRadius(
    n: number,
    l: number,
    ml: number,
    Z: number,
    isoLevel: number
): number {
    const angularPeak = maxAngularSquared(l, ml);
    if (!(angularPeak > 0) || !(isoLevel > 0)) return MAX_SAMPLING_RADIUS;

    const reachesIsoLevel = (r: number) => {
        const radial = radialWaveFunction(n, l, r, Z);
        return radial * radial * angularPeak >= isoLevel;
    };

    // Orbitals are sized by n^2 / Z: a 1s of carbon is a fraction of a Bohr
    // radius across while a 9d of hydrogen runs to hundreds, so both the search
    // bound and its step have to be measured in the orbital's own scale. A fixed
    // step of 1 would never probe inside r = 1 and would miss the compact ones
    // entirely.
    const scale = (n * n) / Z;
    const bound = 60 * scale + 20;

    // Coming in from outside, the first radius that reaches the iso level
    // brackets the edge; the step only has to be fine enough to bracket it.
    const COARSE = scale / 50;
    let inside = 0;
    for (let r = bound; r > 0; r -= COARSE) {
        if (reachesIsoLevel(r)) {
            inside = r;
            break;
        }
    }
    if (inside === 0) return MAX_SAMPLING_RADIUS;   // never reaches the iso level

    // Walk back out through the bracket to land on the edge itself.
    const FINE = COARSE / 50;
    let edge = inside;
    while (edge < inside + COARSE && reachesIsoLevel(edge + FINE)) edge += FINE;

    // A little clearance so the surface never touches the wall. The rounding is
    // relative rather than to a fixed multiple: a heavy nucleus pulls the 1s in
    // to a fraction of a Bohr radius, and rounding that up to the nearest 5
    // would put it in a box a hundred times too wide.
    return Math.min(roundUpToTwoFigures(edge * 1.1), MAX_SAMPLING_RADIUS);
}
