import { SampledField } from './orbital_mesh';

/**
 * Quadrature on the render grid itself. The validation claims (spec §5 Phase
 * 1) are about the ψ actually drawn, so they are measured on exactly the
 * samples the mesher sees: a plain sum times the cell volume, which for a
 * field that has decayed at the box walls is the trapezoid rule.
 */

function assertSameGrid(a: SampledField, b: SampledField): void {
    if (a.side !== b.side || a.step !== b.step || a.origin !== b.origin) {
        throw new Error('Both fields must be sampled on the same grid');
    }
}

/** ⟨a|b⟩. */
export function overlapIntegral(a: SampledField, b: SampledField): number {
    assertSameGrid(a, b);
    let sum = 0;
    for (let i = 0; i < a.samples.length; i++) sum += a.samples[i] * b.samples[i];
    return sum * a.step ** 3;
}

/** ⟨a|z|b⟩. */
export function zMatrixElement(a: SampledField, b: SampledField): number {
    assertSameGrid(a, b);
    const { side, step, origin } = a;
    let sum = 0;
    let index = 0;
    for (let i = 0; i < side; i++) {
        for (let j = 0; j < side; j++) {
            for (let k = 0; k < side; k++, index++) {
                sum += a.samples[index] * (origin + k * step) * b.samples[index];
            }
        }
    }
    return sum * step ** 3;
}

/**
 * Where the positive lobe's density sits: Σ r ψ² over ψ > 0, over Σ ψ².
 * The whole drawn lobe decides it, not one grid point -- an argmax snaps to
 * the grid and would be degrees off.
 */
export function positiveLobeCentroid(field: SampledField): [number, number, number] {
    const { samples, side, step, origin } = field;
    let wx = 0, wy = 0, wz = 0, w = 0;
    let index = 0;
    for (let i = 0; i < side; i++) {
        const x = origin + i * step;
        for (let j = 0; j < side; j++) {
            const y = origin + j * step;
            for (let k = 0; k < side; k++, index++) {
                const value = samples[index];
                if (value <= 0) continue;
                const density = value * value;
                wx += x * density;
                wy += y * density;
                wz += (origin + k * step) * density;
                w += density;
            }
        }
    }
    if (!(w > 0)) throw new Error('The field has no positive lobe');
    return [wx / w, wy / w, wz / w];
}

/** The share of Σψ² carried where ψ > 0. */
export function positiveShare(field: SampledField): number {
    let positive = 0, total = 0;
    for (const value of field.samples) {
        const density = value * value;
        total += density;
        if (value > 0) positive += density;
    }
    return positive / total;
}

export function angleBetweenDegrees(u: readonly number[], v: readonly number[]): number {
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cos = dot / (Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2]));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
