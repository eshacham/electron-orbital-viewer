import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gridHalfWidth, MOLECULE_MO_RESOLUTION, planMoleculeRender } from '../../src/molecules/render_plan';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { moOnGrid } from '../../src/molecules/gaussian_basis';
import { generateFieldMeshes } from '../../src/orbital_mesh';
import type { FieldRenderRequest } from '../../src/field_source';
import type { MoleculeBasis } from '../../src/molecules/types';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';

const fixture = (molecule: string, file: string) =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', molecule, file), 'utf8'));

/** The published v3 files for H₂S (tools/thumbs/validate_tile_boxes.mjs's fetch, 2026-10-23); S sits at the origin. */
const meta: LibraryMoleculeMeta = fixture('h2s', 'meta.json');
const basis: MoleculeBasis = { ...fixture('h2s', 'basis.json'), id: meta.id };
const indexOf = (label: string) => meta.orbitals.find(o => o.label === label)!.index;

function request(index: number, fraction: number): FieldRenderRequest {
    const plan = planMoleculeRender(meta, { kind: 'mo', index }, fraction, basis);
    if (plan.kind !== 'mo') throw new Error('expected an orbital plan');
    return plan.request;
}

/**
 * The share of S 1s that the surface |ψ|² = `iso` encloses, on a converged grid: ψ every 0.005 a₀ over ±0.5 a₀,
 * which holds all but ~10⁻⁴ of it (S's 1s decays as e^(−16 r)).
 */
function convergedEnclosed(index: number, iso: number): number {
    const side = 201;
    const samples = moOnGrid(basis, index, { shape: [side, side, side], origin: [-0.5, -0.5, -0.5], spacing: 0.005 });
    let total = 0, inside = 0;
    for (const value of samples) {
        total += value * value;
        if (value * value >= iso) inside += value * value;
    }
    return inside / total;
}

/**
 * Owner R25-C. A second-row atom's 1s is tiny: S's 90 % surface is 0.17 a₀ across its radius, about one voxel
 * of the density box's 95³ grid (0.175 a₀). Sampled there, 8 samples round the nucleus carried 95 % of the
 * orbital, the iso level came out 2–5× off, and the mesh was a speck inside the nucleus voxel -- which the
 * R22b guard (orbital_mesh.ts) refuses: "Could not resolve this surface" at 90, 95 and 99 %. The same held
 * for PH₃, SF₆, SO₂ and SiH₄'s 1s and for the N and C 1s of glycine and ethanol, whose atoms sit at the
 * origin (tools/thumbs/validate_tile_boxes.mjs). A core the molecule's grid cannot resolve (view_box.ts CUSP_WEIGHT)
 * is now sampled in its own compact box.
 */
describe("a second-row atom's 1s core is drawn whole (owner R25-C)", () => {
    const core = indexOf('1a1');

    it.each([0.9, 0.95, 0.99])("draws H₂S's S 1s (1a1) at %s, enclosing what it says, many voxels across", fraction => {
        const drawn = request(core, fraction);
        registerMoleculeBasis(basis);
        const [mesh] = generateFieldMeshes(drawn);
        // The surface holds the stated share of the orbital to within half a percentage point (the molecule's
        // grid put the 95 % surface at 5.3× its converged iso level).
        expect(Math.abs(convergedEnclosed(core, mesh.isoLevel) - fraction)).toBeLessThan(0.005);
        // The surface spans many voxels round the S nucleus at the origin, so marching cubes draws it smooth.
        const step = (2 * drawn.sources[0].rMax) / drawn.resolution;
        const radius = Math.max(...mesh.positions.map(p => Math.hypot(...p)));
        expect(radius / step).toBeGreaterThan(8);
    });

    it("samples the core in a compact box at today's resolution, framed for the density's box", () => {
        const half = gridHalfWidth(meta);
        for (const fraction of [0.9, 0.95, 0.99]) {
            const drawn = request(core, fraction);
            expect(drawn.sources[0].rMax).toBeLessThanOrEqual(half / 2);
            // Never dearer than today: the same 96³ samples, in a smaller box.
            expect(drawn.resolution).toBe(MOLECULE_MO_RESOLUTION);
            // The camera keeps its framing for the density's box, so switching to the core never moves it.
            expect(drawn.frameBox).toBe(half);
        }
    });

    it("keeps today's box and grid for the valence orbitals", () => {
        const half = gridHalfWidth(meta);
        for (const label of ['2b1', '5a1', '2b2']) {
            const drawn = request(indexOf(label), 0.9);
            expect(drawn.sources[0].rMax).toBe(half);
            expect(drawn.resolution).toBe(MOLECULE_MO_RESOLUTION);
        }
    });
});
