import { AnalyticFieldSource } from '../field_source';
import { sampleFieldSource } from '../orbital_mesh';
import { RadialGrid, cumulativeIntegral, interpolateOnGrid } from '../atom/radial_grid';

/** A regular grid, x slowest and z fastest, in bohr: the cube layout and spec §4.1's GridFieldSource shape. */
export interface CubeGrid { shape: [number, number, number]; origin: [number, number, number]; spacing: number; values: Float32Array; }
export interface CubeAtom { Z: number; position: [number, number, number]; }
export interface RadialCurveOnGrid { D: ArrayLike<number>; rMin: number; dx: number; size: number; }

/**
 * Fortran E13.5, which every cube reader accepts. Underflow below 1e-99 is
 * written as 0 to keep the exponent two digits; encodeCube rejects
 * non-finite values outright rather than letting this clamp them to zero.
 */
export function formatCubeValue(value: number): string {
    const v = Math.abs(value) >= 1e-99 ? value : 0;
    const [mantissa, exponent] = v.toExponential(5).split('e');
    const e = Number(exponent);
    return `${mantissa}E${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`.padStart(13);
}

/**
 * Cube comment lines are single-line ASCII. NFKD handles most of the rest on
 * its own (e.g. a subscript digit or 'Å' decomposes to plain ASCII, once the
 * stray combining ring is stripped) -- but a few characters the app's own
 * captions use have no compatibility decomposition and would otherwise
 * simply vanish, found live (Task 13b): an O₂ orbital's title read "1g* ()",
 * its π and α gone, not "1pig* (alpha)"; H₂⁺'s "10⁻¹⁰ Ha" read "1010 Ha" --
 * NFKD decomposes the superscript minus into U+2212 (a *second* non-ASCII
 * character, produced only by normalising), so it must be replaced *after*
 * normalising, not before. Spelled out the same way ψ/ρ already were.
 * Task 16b, found live: an ESP title's "±0.05 Ha/e" lost its '±' the same
 * way, reading as a one-sided scale. Phase 6 final review M2: NFKD turns
 * '½' (and '³⁄₂') into digits around U+2044 FRACTION SLASH, which has no
 * ASCII form either, so a spin-orbit cube read "6p12" until it became '/'.
 */
export function asciiLine(text: string): string {
    return text.normalize('NFKD')
        .replace(/ψ/g, 'psi').replace(/ρ/g, 'rho')
        .replace(/σ/g, 'sigma').replace(/π/g, 'pi').replace(/δ/g, 'delta').replace(/φ/g, 'phi')
        .replace(/α/g, 'alpha').replace(/β/g, 'beta')
        .replace(/[−–—]/g, '-').replace(/±/g, '+/-').replace(/⁄/g, '/')
        .replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
}

const fixed = (v: number) => v.toFixed(6).padStart(12);
const count = (v: number) => String(v).padStart(5);

/** The file as chunks, for new Blob(chunks): a 129³ grid is ~28 MB of text, never one string. */
export function encodeCube(grid: CubeGrid, atoms: CubeAtom[], title: string, description: string): string[] {
    const [n1, n2, n3] = grid.shape;
    if (grid.values.length !== n1 * n2 * n3) throw new Error('Cube grid: the values do not match its shape.');
    if (!grid.origin.every(Number.isFinite)) throw new Error('Cube grid: origin must be finite.');
    if (!(Number.isFinite(grid.spacing) && grid.spacing > 0)) throw new Error('Cube grid: spacing must be a positive, finite number.');
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
                const value = grid.values[index];
                if (!Number.isFinite(value)) throw new Error(`Cube grid: value at index ${index} is not finite.`);
                line += formatCubeValue(value);
                index++;
                if (k % 6 === 5 || k === n3 - 1) { rows.push(line); line = ''; }
            }
        }
        chunks.push(`${rows.join('\n')}\n`);
    }
    return chunks;
}

/**
 * The drawn field, re-sampled exactly as the mesh worker sampled it. A
 * 'gaussianDensity' recipe evaluates √ρ (field_source.ts's own convention for
 * density grids, so the mesh's contour search can square it back); a cube of
 * it must hold ρ itself, in electrons/bohr³, not the square root (carry from
 * Task 7/13b).
 */
export function fieldCubeGrid(source: AnalyticFieldSource, resolution: number): CubeGrid {
    const field = sampleFieldSource(source, resolution);
    const values = source.recipe.type === 'gaussianDensity'
        ? Float32Array.from(field.samples, v => v * v)
        : field.samples;
    return { shape: [field.side, field.side, field.side], origin: [field.origin, field.origin, field.origin], spacing: field.step, values };
}

/** Built directly: the profile's own grid, whatever its point count. */
function gridOf(curve: RadialCurveOnGrid): RadialGrid {
    if (curve.D.length !== curve.size) throw new Error('Radial curve: D.length must equal size.');
    const r = Float64Array.from({ length: curve.size }, (_, j) => curve.rMin * Math.exp(j * curve.dx));
    return { r, dx: curve.dx, size: curve.size, rMin: curve.rMin, rMax: r[curve.size - 1] };
}

export const RADIAL_CUBE_FRACTION = 0.999;

/** Shared by radiusEnclosing and radialDensityCubeGrid, so a caller that needs both builds the grid and D array only once. */
function enclosingRadiusOnGrid(grid: RadialGrid, D: Float64Array, fraction: number): number {
    const running = cumulativeIntegral(grid, D);
    const total = running[grid.size - 1];
    if (!(Number.isFinite(total) && total > 0)) throw new Error('Radial distribution: the enclosed total is not finite and positive.');
    for (let j = 0; j < grid.size; j++) if (running[j] >= fraction * total) return grid.r[j];
    return grid.rMax;
}

export function radiusEnclosing(curve: RadialCurveOnGrid, fraction: number): number {
    return enclosingRadiusOnGrid(gridOf(curve), Float64Array.from(curve.D), fraction);
}

/**
 * ρ(r) = D(r)/(4πr²) of a spherically averaged atom, on a cube enclosing
 * `RADIAL_CUBE_FRACTION` of it. Features finer than the spacing (a heavy
 * atom's 1s) are not resolved by any uniform grid.
 */
export function radialDensityCubeGrid(curve: RadialCurveOnGrid, resolution: number): CubeGrid {
    const grid = gridOf(curve);
    const D = Float64Array.from(curve.D);
    const halfWidth = enclosingRadiusOnGrid(grid, D, RADIAL_CUBE_FRACTION);
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
