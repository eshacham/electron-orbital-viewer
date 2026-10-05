import * as THREE from 'three';
import { espColorSrgb, espVertexColors, espLegendGradient, ESP_LIMIT_HARTREE, ESP_SURFACE_DENSITY, formatEsp } from '../../src/molecules/esp_color';
import { generateGridIsoValueMesh } from '../../src/orbital_mesh';
import type { GridFieldSource } from '../../src/field_source';
import { hexToRgb01 } from '../../src/curve_colors';

const L = ESP_LIMIT_HARTREE;
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));

describe('ESP colour map', () => {
    it('is red at −limit, white at 0, blue at +limit, and saturates beyond', () => {
        close(espColorSrgb(-L, L), hexToRgb01('#b2182b'));
        close(espColorSrgb(0, L), hexToRgb01('#f7f7f7'));
        close(espColorSrgb(L, L), hexToRgb01('#2166ac'));
        close(espColorSrgb(-3 * L, L), espColorSrgb(-L, L));
        const [r, , b] = espColorSrgb(-0.3 * L, L);
        expect(r).toBeGreaterThan(b);
    });

    it('writes linear-space vertex colours and reports the range it drew', () => {
        const grid = {
            shape: [2, 2, 2] as [number, number, number],
            origin: [-1, -1, -1] as [number, number, number],
            spacing: 2,
            values: new Float32Array(8).fill(-L),
        };
        const { colors, min, max } = espVertexColors([[0, 0, 0], [0.5, 0.5, 0.5]], grid, L);
        const red = new THREE.Color('#b2182b');
        close(Array.from(colors.slice(0, 3)), [red.r, red.g, red.b]);
        expect(min).toBeCloseTo(-L, 6);
        expect(max).toBeCloseTo(-L, 6);
    });

    it('builds the legend gradient from the same stops', () => {
        expect(espLegendGradient()).toBe('linear-gradient(to right, #b2182b 0%, #ef8a62 25%, #f7f7f7 50%, #67a9cf 75%, #2166ac 100%)');
        expect(formatEsp(-0.0612)).toBe('−0.061');
        expect(formatEsp(0.05)).toBe('+0.050');
    });
});

// Ruling D4: the ESP surface is drawn EXACTLY at ρ = 0.001 e/a₀³, never
// converted to an enclosed fraction (Phase 5's T7-a ruling, unchanged for
// Phase 6). There is no `enclosedFractionForDensity` to test; instead,
// `generateGridIsoValueMesh` must land the mesh's isoLevel on the requested
// ρ exactly.
describe('the 0.001 surface, drawn exactly', () => {
    it('makes generateGridIsoValueMesh draw ρ = 0.001 exactly, on a real grid', () => {
        const n = 41, half = 6, h = (2 * half) / (n - 1);
        const values = new Float32Array(n ** 3);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                for (let k = 0; k < n; k++) {
                    const [x, y, z] = [i, j, k].map(v => -half + v * h);
                    values[(i * n + j) * n + k] = Math.exp(-(x * x + y * y + z * z) / 2.88);
                }
            }
        }
        const source: GridFieldSource = {
            kind: 'grid',
            id: 'blob',
            shape: [n, n, n],
            origin: [-half, -half, -half],
            spacing: h,
            quantity: 'density',
            values,
        };
        const mesh = generateGridIsoValueMesh(source, ESP_SURFACE_DENSITY);
        expect(mesh.isoLevel).toBe(ESP_SURFACE_DENSITY);
        expect(mesh.positions.length).toBeGreaterThan(0);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1]));
    });

    it('refuses a non-positive or non-finite isoValue', () => {
        const good: GridFieldSource = {
            kind: 'grid',
            id: 'tiny',
            shape: [3, 3, 3],
            origin: [-1, -1, -1],
            spacing: 1,
            quantity: 'density',
            values: new Float32Array(27).fill(1),
        };
        expect(() => generateGridIsoValueMesh(good, 0)).toThrow(/isoValue must be positive/);
        expect(() => generateGridIsoValueMesh(good, -0.001)).toThrow(/isoValue must be positive/);
        expect(() => generateGridIsoValueMesh(good, NaN)).toThrow(/isoValue must be positive/);
    });
});
