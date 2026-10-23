import { readFileSync } from 'fs';
import { resolve } from 'path';

// Task 16c fix round 1 (ruling T16c-I1): count the probe's evaluations; everything else evaluates as before.
jest.mock('../../src/molecules/gaussian_basis', () => {
    const actual = jest.requireActual('../../src/molecules/gaussian_basis');
    return { ...actual, moOnGrid: jest.fn(actual.moOnGrid) };
});
import { moOnGrid } from '../../src/molecules/gaussian_basis';
import { bondsStripItems } from '../../src/thumbs/bonds_strip_items';
import { moleculeStripItems } from '../../src/thumbs/molecule_strip_items';
import type { GridFieldSource } from '../../src/field_source';
import type { MoleculeMeta } from '../../src/molecules/types';
import { bondsFieldRequest } from '../../src/bonds/bonds_request';
import reducer, { selectBondsSystem, setBondsView, setScanPoint } from '../../src/store/bondsSlice';
import type { BondsSystemId } from '../../src/bonds/systems';
import { BONDS_RESOLUTION, MOLECULE_PADDING } from '../../src/bonds/systems';
import { gridHalfWidth, MOLECULE_MO_RESOLUTION, planMoleculeRender } from '../../src/molecules/render_plan';
import { MAX_VIEW_RESOLUTION, PROBE_RESOLUTION, VIEW_MESH_BUDGET_MS, orbitalViewBox, predictedMeshMs, viewResolution } from '../../src/molecules/view_box';
import { registerMoleculeBasis } from '../../src/molecules/basis_registry';
import { sampleFieldSource } from '../../src/orbital_mesh';
import { isoLevelForEnclosedFraction } from '../../src/radial_distribution';
import type { FieldRenderRequest } from '../../src/field_source';
import type { BasisOrbital, MoleculeBasis, OrbitalSpin } from '../../src/molecules/types';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';

const fixture = (molecule: string, file: string) =>
    JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules', molecule, file), 'utf8'));

/**
 * The main view's request, sampled exactly as the orbital worker samples it
 * (sampleFieldSource at the request's own box and resolution), and the
 * largest |ψ|² on the box's six faces over the surface's iso level at the
 * request's enclosed fraction (isoLevelForEnclosedFraction, the worker's
 * own). ≥ 1 means the surface crosses a face: marching cubes leaves it open
 * there, a flat hole where the box cuts the lobe.
 */
function faceOverIso(request: FieldRenderRequest): number {
    const [source] = request.sources;
    request.bases?.forEach(registerMoleculeBasis);
    const { samples, side } = sampleFieldSource(source, request.resolution);
    let face = 0;
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) for (let k = 0; k < side; k++) {
        if (i !== 0 && i !== side - 1 && j !== 0 && j !== side - 1 && k !== 0 && k !== side - 1) continue;
        face = Math.max(face, samples[(i * side + j) * side + k] ** 2);
    }
    return face / isoLevelForEnclosedFraction(samples, request.enclosedFraction);
}

/** A Bonds scan point's published basis.json (v3), named for its point as loadBasis names it. */
const bondsBasis = (point: string): MoleculeBasis => ({ ...fixture(point, 'basis.json'), id: `${point.split('-')[0]}@07` });
/** The Bonds molecule box: the farthest atom + MOLECULE_PADDING, the box every view used before Task 16c. */
const moleculeBox = (basis: MoleculeBasis) => Math.max(...basis.atoms.map(atom => Math.hypot(...atom))) + MOLECULE_PADDING;

/** Bonds' main-view request for one view at scan point 07, as App asks for it. */
function bondsRequest(system: BondsSystemId, basis: MoleculeBasis, fraction: number, orbital?: Pick<BasisOrbital, 'label' | 'spin'>, component = 0): FieldRenderRequest {
    const R = Math.abs(basis.atoms[1][2] - basis.atoms[0][2]);
    const view = orbital ? { kind: 'mo' as const, label: orbital.label, spin: orbital.spin, component } : { kind: 'density' as const };
    const state = reducer(reducer(reducer(undefined, selectBondsSystem(system)), setScanPoint({ index: 7, RBohr: R })), setBondsView(view));
    const built = bondsFieldRequest(state, basis, fraction);
    expect(built?.note).toBeNull();
    return built!.request;
}

const orbitalRequest = (system: BondsSystemId, point: string, label: string, spin: OrbitalSpin, fraction: number) =>
    bondsRequest(system, bondsBasis(point), fraction, { label, spin });

/** Every orbital of a basis, each as its own view (the second of a degenerate pair as component 1). */
const everyView = (basis: MoleculeBasis) => basis.orbitals.map(orbital => ({
    orbital, component: basis.orbitals.filter(o => o.label === orbital.label && o.spin === orbital.spin).indexOf(orbital),
}));

const ch3ohMeta: LibraryMoleculeMeta = fixture('ch3oh', 'meta.json');
const ch3ohBasis: MoleculeBasis = { ...fixture('ch3oh', 'basis.json'), id: ch3ohMeta.id };
function moleculeRequest(meta: LibraryMoleculeMeta, basis: MoleculeBasis, index: number, fraction: number): FieldRenderRequest {
    const plan = planMoleculeRender(meta, { kind: 'mo', index }, fraction, basis);
    if (plan.kind !== 'mo') throw new Error('expected an orbital plan');
    return plan.request;
}

/**
 * Ruling T10-mainbox (Task 16c): the main view draws every orbital the user
 * can pick whole. Before it, Bonds sampled every orbital in the molecule's
 * box (the farthest atom + 6.5 a₀) and Molecules in the density grid's box,
 * and diffuse orbitals overflowed it: drawn with open flat holes where the
 * box cut them. The fixtures are the published v3 files (B₂, Li₂ and F₂ at
 * equilibrium, scan point 07; the library's CH₃OH). The sweep over every
 * Bonds scan point and every library orbital at 90/95/99 % is
 * tools/thumbs/validate_tile_boxes.mjs.
 */
describe('the main view holds the surface it draws (ruling T10-mainbox)', () => {
    it("draws B₂'s virtual 3σu* (α) whole at equilibrium, at the default 90 %", () => {
        expect(faceOverIso(orbitalRequest('b2', 'b2-07', '3σu*', 'alpha', 0.9))).toBeLessThan(1);
    });

    it("draws Li₂'s occupied bonding 2σg whole at equilibrium, at the 99 % the menu offers", () => {
        expect(faceOverIso(orbitalRequest('li2', 'li2-07', '2σg', 'restricted', 0.99))).toBeLessThan(1);
    });

    it("draws the library's CH₃OH LUMO whole, at the default 90 %", () => {
        const lumo = ch3ohMeta.orbitals.find(o => o.role === 'LUMO')!;
        expect(faceOverIso(moleculeRequest(ch3ohMeta, ch3ohBasis, lumo.index, 0.9))).toBeLessThan(1);
    });

    it('draws every orbital of Li₂ whole at 90 % and at 99 %', () => {
        const basis = bondsBasis('li2-07');
        const cut = [0.9, 0.99].flatMap(fraction => basis.orbitals
            .map(orbital => ({ orbital, ratio: faceOverIso(bondsRequest('li2', basis, fraction, orbital)) }))
            .filter(({ ratio }) => ratio >= 1)
            .map(({ orbital, ratio }) => `${orbital.label} at ${fraction}: face/iso ${ratio.toFixed(2)}`));
        expect(cut).toEqual([]);
    });
});

/** The orbital indices the probe evaluated since the last clear (its grid is PROBE_RESOLUTION + 1 points a side). */
const probed = () => (moOnGrid as jest.Mock).mock.calls
    .filter(([, , grid]) => grid.shape[0] === PROBE_RESOLUTION + 1)
    .map(([, index]) => index as number);
const indexOf = (basis: MoleculeBasis, label: string, spin: OrbitalSpin) => basis.orbitals.find(o => o.label === label && o.spin === spin)!.index;

/**
 * Ruling T10-mainbox, amended by T16c-I1 (fix round 1): each drawn orbital
 * gets its own box -- frameBox (the molecule's box) is what keeps the user's
 * zoom across orbital switches, so the box no longer has to be the point's
 * widest. Only the drawn orbital is probed, so the cost no longer grows with
 * the number of orbitals listed (a computed molecule lists hundreds).
 */
describe('each drawn orbital gets its own box, framed for the molecule (rulings T10-mainbox, T16c-I1)', () => {
    it("grows the box only for the orbital that needs it, and frames every orbital for the molecule's box", () => {
        const basis = bondsBasis('b2-07');
        const box = moleculeBox(basis);
        for (const fraction of [0.9, 0.99]) {
            const diffuse = bondsRequest('b2', basis, fraction, { label: '3σu*', spin: 'alpha' });
            const compact = bondsRequest('b2', basis, fraction, { label: '1σg', spin: 'alpha' });
            // B₂'s diffuse 3σu* reaches past the molecule's box (the bug), so its own box grows ...
            expect(diffuse.sources[0].rMax).toBeGreaterThan(box);
            // ... while the 1σg core keeps today's box and grid exactly,
            expect(compact.sources[0].rMax).toBe(box);
            expect(compact.resolution).toBe(BONDS_RESOLUTION);
            // and both keep their framing for the molecule's box, so switching between them keeps the zoom.
            expect(diffuse.frameBox).toBe(box);
            expect(compact.frameBox).toBe(box);
        }
        // The box is fraction-aware: 99 % reaches further than 90 %.
        expect(bondsRequest('b2', basis, 0.99, { label: '3σu*', spin: 'alpha' }).sources[0].rMax)
            .toBeGreaterThan(bondsRequest('b2', basis, 0.9, { label: '3σu*', spin: 'alpha' }).sources[0].rMax);
    });

    it('probes only the orbital drawn, in Bonds and in Molecules', () => {
        const basis = bondsBasis('b2-07');
        (moOnGrid as jest.Mock).mockClear();
        bondsRequest('b2', basis, 0.93, { label: '3σu*', spin: 'alpha' });
        expect(probed()).toEqual([indexOf(basis, '3σu*', 'alpha')]);
        (moOnGrid as jest.Mock).mockClear();
        const lumo = ch3ohMeta.orbitals.find(o => o.role === 'LUMO')!.index;
        moleculeRequest(ch3ohMeta, ch3ohBasis, lumo, 0.93);
        expect(probed()).toEqual([lumo]);
    });

    it('never probes for the strips: a tile fits its own box', () => {
        const basis = bondsBasis('b2-07');
        const meta = { id: basis.id, orbitals: basis.orbitals.map(({ coefficients, ...orbital }) => orbital) } as unknown as MoleculeMeta;
        const bonds = reducer(reducer(undefined, selectBondsSystem('b2')), setScanPoint({ index: 7, RBohr: 3.0 }));
        (moOnGrid as jest.Mock).mockClear();
        const tiles = bondsStripItems({ bonds, data: { meta, basis }, h2plusR: null, enclosedFraction: 0.94 });
        expect(tiles.length).toBe(basis.orbitals.length + 1);
        const density: GridFieldSource = { kind: 'grid', id: 'd', shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, quantity: 'density', values: new Float32Array(8) };
        moleculeStripItems({
            meta: ch3ohMeta, surface: { kind: 'density' }, representation: 'ball-and-stick', enclosedFraction: 0.94,
            densityGrid: density, espGrid: { shape: [2, 2, 2], origin: [-1, -1, -1], spacing: 2, values: new Float32Array(8) }, espLimit: 0.05, basis: ch3ohBasis,
        });
        expect(probed()).toEqual([]);
    });

    it("gives a Molecules orbital its own box, framed for the density grid's", () => {
        const half = gridHalfWidth(ch3ohMeta);
        const lumo = moleculeRequest(ch3ohMeta, ch3ohBasis, ch3ohMeta.orbitals.find(o => o.role === 'LUMO')!.index, 0.9);
        const homo = moleculeRequest(ch3ohMeta, ch3ohBasis, ch3ohMeta.orbitals.find(o => o.role === 'HOMO')!.index, 0.9);
        expect(lumo.sources[0].rMax).toBeGreaterThan(half);
        expect(homo.sources[0].rMax).toBe(half);
        expect(homo.resolution).toBe(MOLECULE_MO_RESOLUTION);
        for (const request of [lumo, homo]) {
            expect(request.frameBox).toBe(half);
            expect((2 * request.sources[0].rMax) / request.resolution).toBeLessThanOrEqual((2 * half) / MOLECULE_MO_RESOLUTION);
        }
        // Read before the basis has loaded (for its label only), the plan keeps the density's box.
        const labelOnly = planMoleculeRender(ch3ohMeta, { kind: 'mo', index: ch3ohMeta.orbitals[0].index }, 0.9);
        expect(labelOnly.kind === 'mo' && labelOnly.request.sources[0].rMax).toBe(half);
    });

    it("leaves the density view exactly as it was: the molecule's box at 96", () => {
        const basis = bondsBasis('b2-07');
        const density = bondsRequest('b2', basis, 0.9);
        expect(density.sources[0].recipe.type).toBe('gaussianDensity');
        expect(density.sources[0].rMax).toBe(moleculeBox(basis));
        expect(density.resolution).toBe(BONDS_RESOLUTION);
        expect(density.frameBox).toBeUndefined();
    });

    it("keeps today's box and resolution where no surface reaches past the molecule's box (F₂ at equilibrium)", () => {
        const basis = bondsBasis('f2-07');
        for (const fraction of [0.9, 0.99]) {
            for (const { orbital, component } of everyView(basis)) {
                const request = bondsRequest('f2', basis, fraction, orbital, component);
                expect(request.sources[0].rMax).toBe(moleculeBox(basis));
                expect(request.resolution).toBe(BONDS_RESOLUTION);
            }
        }
    });

    it('sets no reach for an orbital the basis does not carry', () => {
        const basis = bondsBasis('li2-07');
        expect(orbitalViewBox(basis, 99, 0.9, 5)).toBe(5);
    });
});

/**
 * Ruling T16c-cap: the resolution that keeps the step grows with the box only
 * up to MAX_VIEW_RESOLUTION and up to what the mesh budget affords for this
 * many basis functions (predictedMeshMs ≤ VIEW_MESH_BUDGET_MS); past either
 * cap the step grows instead -- the surface stays whole. Never below today's
 * resolution.
 */
describe('viewResolution (ruling T16c-cap)', () => {
    it("keeps the base resolution while the box has not grown, and the base step where it has, up to the caps", () => {
        expect(viewResolution(96, 8, 8, 62)).toBe(96);
        expect(viewResolution(96, 8, 7, 62)).toBe(96);
        expect(viewResolution(96, 8, 9, 62)).toBe(108);
        expect(viewResolution(96, 8, 9.01, 62)).toBe(109);
    });

    it('caps the resolution at 130–135', () => {
        expect(MAX_VIEW_RESOLUTION).toBeGreaterThanOrEqual(130);
        expect(MAX_VIEW_RESOLUTION).toBeLessThanOrEqual(135);
        expect(viewResolution(96, 8, 40, 12)).toBe(MAX_VIEW_RESOLUTION);
    });

    it('stays within the mesh budget for the basis size, and never drops below the base resolution', () => {
        for (const nao of [12, 28, 62, 113, 157, 205, 286]) {
            const resolution = viewResolution(95, 8, 16, nao);
            expect(resolution).toBeGreaterThanOrEqual(95);
            // Grown past the base, it is affordable; at the base it is today's grid, whatever it costs.
            if (resolution > 95) expect(predictedMeshMs(resolution, nao)).toBeLessThanOrEqual(VIEW_MESH_BUDGET_MS);
            if (resolution < MAX_VIEW_RESOLUTION && resolution > 95) expect(predictedMeshMs(resolution + 1, nao)).toBeGreaterThan(VIEW_MESH_BUDGET_MS);
        }
        // B₂ (62 basis functions): the budget stops short of the 132 the resolution cap would allow; SF₆ (286) cannot grow at all.
        expect(viewResolution(96, 8, 10.86, 62)).toBeLessThan(MAX_VIEW_RESOLUTION);
        expect(viewResolution(95, 9.45, 14.2, 286)).toBe(95);
    });
});
