import { AnalyticFieldSource } from '../field_source';
import { sampleFieldSource } from '../orbital_mesh';
import { RadialGrid, cumulativeIntegral, interpolateOnGrid } from '../atom/radial_grid';

/** A regular grid, x slowest and z fastest, in bohr: the cube layout and spec §4.1's GridFieldSource shape. */
export interface CubeGrid { shape: [number, number, number]; origin: [number, number, number]; spacing: number; values: Float32Array; }
export interface CubeAtom { Z: number; position: [number, number, number]; }
export interface RadialCurveOnGrid { D: ArrayLike<number>; rMin: number; dx: number; size: number; }

/** Fortran E13.5, which every cube reader accepts. Below 1e-99 is written as 0 to keep the exponent two digits. */
export function formatCubeValue(value: number): string {
    const v = Number.isFinite(value) && Math.abs(value) >= 1e-99 ? value : 0;
    const [mantissa, exponent] = v.toExponential(5).split('e');
    const e = Number(exponent);
    return `${mantissa}E${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`.padStart(13);
}

/** Cube comment lines are single-line ASCII. */
export function asciiLine(text: string): string {
    return text.replace(/ψ/g, 'psi').replace(/ρ/g, 'rho').replace(/−/g, '-')
        .normalize('NFKD').replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
}

const fixed = (v: number) => v.toFixed(6).padStart(12);
const count = (v: number) => String(v).padStart(5);

/** The file as chunks, for new Blob(chunks): a 129³ grid is ~28 MB of text, never one string. */
export function encodeCube(grid: CubeGrid, atoms: CubeAtom[], title: string, description: string): string[] {
    const [n1, n2, n3] = grid.shape;
    if (grid.values.length !== n1 * n2 * n3) throw new Error('Cube grid: the values do not match its shape.');
    const s = grid.spacing;
    const chunks = [
        `${asciiLine(title)}\n${asciiLine(description)}\n`,
        `${count(atoms.length)}${fixed(grid.origin[0])}${fixed(grid.origin[1])}${fixed(grid.origin[2])}\n`,
        `${count(n1)}${fixed(s)}${fixed(0)}${fixed(0)}\n${count(n2)}${fixed(0)}${fixed(s)}${fixed(0)}\n${count(n3)}${fixed(0)}${fixed(0)}${fixed(s)}\n`,
        atoms.map(a => `${count(a.Z)}${fixed(a.Z)}${fixed(a.position[0])}${fixed(a.position[1])}${fixed(a.position[2])}\n`).join(''),
    ];
    let index = 0;
    for (let i = 0; i < n1; i++) {
        const rows: string[] = [];
        for (let j = 0; j < n2; j++) {
            let line = '';
            for (let k = 0; k < n3; k++) {
                line += formatCubeValue(grid.values[index++]);
                if (k % 6 === 5 || k === n3 - 1) { rows.push(line); line = ''; }
            }
        }
        chunks.push(`${rows.join('\n')}\n`);
    }
    return chunks;
}

/** The drawn field, re-sampled exactly as the mesh worker sampled it. */
export function fieldCubeGrid(source: AnalyticFieldSource, resolution: number): CubeGrid {
    const field = sampleFieldSource(source, resolution);
    return { shape: [field.side, field.side, field.side], origin: [field.origin, field.origin, field.origin], spacing: field.step, values: field.samples };
}

/** Built directly: the profile's own grid, whatever its point count. */
function gridOf(curve: RadialCurveOnGrid): RadialGrid {
    const r = Float64Array.from({ length: curve.size }, (_, j) => curve.rMin * Math.exp(j * curve.dx));
    return { r, dx: curve.dx, size: curve.size, rMin: curve.rMin, rMax: r[curve.size - 1] };
}

export const RADIAL_CUBE_FRACTION = 0.999;

export function radiusEnclosing(curve: RadialCurveOnGrid, fraction: number): number {
    const grid = gridOf(curve);
    const running = cumulativeIntegral(grid, Float64Array.from(curve.D));
    const total = running[grid.size - 1];
    for (let j = 0; j < grid.size; j++) if (running[j] >= fraction * total) return grid.r[j];
    return grid.rMax;
}

/**
 * ρ(r) = D(r)/(4πr²) of a spherically averaged atom, on a cube enclosing
 * 99.9 % of it. Features finer than the spacing (a heavy atom's 1s) are not
 * resolved by any uniform grid; the description line says so.
 */
export function radialDensityCubeGrid(curve: RadialCurveOnGrid, resolution: number): CubeGrid {
    const grid = gridOf(curve);
    const D = Float64Array.from(curve.D);
    const halfWidth = radiusEnclosing(curve, RADIAL_CUBE_FRACTION);
    const side = resolution + 1;
    const step = (2 * halfWidth) / resolution;
    const values = new Float32Array(side * side * side);
    let index = 0;
    for (let i = 0; i < side; i++) {
        const x = -halfWidth + i * step;
        for (let j = 0; j < side; j++) {
            const y = -halfWidth + j * step;
            for (let k = 0; k < side; k++) {
                const z = -halfWidth + k * step;
                const r = Math.max(Math.hypot(x, y, z), grid.rMin);
                values[index++] = interpolateOnGrid(grid, D, r) / (4 * Math.PI * r * r);
            }
        }
    }
    return { shape: [side, side, side], origin: [-halfWidth, -halfWidth, -halfWidth], spacing: step, values };
}
