import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bondsFieldRequest } from '../../src/bonds/bonds_request';
import reducer, { selectBondsSystem, setBondsView, setScanPoint } from '../../src/store/bondsSlice';
import type { BondsSystemId } from '../../src/bonds/systems';
import { BONDS_RESOLUTION, MOLECULE_PADDING } from '../../src/bonds/systems';
import { gridHalfWidth, MOLECULE_MO_RESOLUTION, planMoleculeRender } from '../../src/molecules/render_plan';
import { MAX_VIEW_RESOLUTION, orbitalViewBox, viewResolution } from '../../src/molecules/view_box';
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

describe('one box per scan point and fraction, framed for the molecule (ruling T10-mainbox)', () => {
    it("gives every Bonds orbital at a point the same box and resolution, framed for the molecule's box", () => {
        const basis = bondsBasis('b2-07');
        const box = moleculeBox(basis);
        for (const fraction of [0.9, 0.99]) {
            const requests = everyView(basis).map(({ orbital, component }) => bondsRequest('b2', basis, fraction, orbital, component));
            const [first] = requests;
            // B₂'s diffuse 3σu* reaches past the molecule's box at both fractions (the bug), so the box grows ...
            expect(first.sources[0].rMax).toBeGreaterThan(box);
            for (const request of requests) {
                // ... the same for every orbital, so switching between them keeps the camera,
                expect(request.sources[0].rMax).toBe(first.sources[0].rMax);
                expect(request.resolution).toBe(first.resolution);
                // which keeps its framing for the molecule's own box (as the density's),
                expect(request.frameBox).toBe(box);
                // and the step is no coarser than the molecule box's at 96.
                expect((2 * request.sources[0].rMax) / request.resolution).toBeLessThanOrEqual((2 * box) / BONDS_RESOLUTION);
            }
        }
        // The box is fraction-aware: 99 % reaches further than 90 %.
        expect(bondsRequest('b2', basis, 0.99, basis.orbitals[0]).sources[0].rMax)
            .toBeGreaterThan(bondsRequest('b2', basis, 0.9, basis.orbitals[0]).sources[0].rMax);
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

    it("gives every Molecules orbital the same box, framed for the density grid's", () => {
        const half = gridHalfWidth(ch3ohMeta);
        const requests = ch3ohMeta.orbitals.map(o => moleculeRequest(ch3ohMeta, ch3ohBasis, o.index, 0.9));
        const [first] = requests;
        expect(first.sources[0].rMax).toBeGreaterThan(half);
        for (const request of requests) {
            expect(request.sources[0].rMax).toBe(first.sources[0].rMax);
            expect(request.resolution).toBe(first.resolution);
            expect(request.frameBox).toBe(half);
            expect((2 * request.sources[0].rMax) / request.resolution).toBeLessThanOrEqual((2 * half) / MOLECULE_MO_RESOLUTION);
        }
        // Read before the basis has loaded (for its label only), the plan keeps the density's box.
        const labelOnly = planMoleculeRender(ch3ohMeta, { kind: 'mo', index: ch3ohMeta.orbitals[0].index }, 0.9);
        expect(labelOnly.kind === 'mo' && labelOnly.request.sources[0].rMax).toBe(half);
    });

    it('sets no reach for an orbital the basis does not carry', () => {
        const basis = bondsBasis('li2-07');
        expect(orbitalViewBox(basis, [99], 0.9, 5)).toBe(5);
    });
});

describe('viewResolution', () => {
    it("keeps the base resolution while the box has not grown, and the base step where it has, up to the cap", () => {
        expect(viewResolution(96, 8, 8)).toBe(96);
        expect(viewResolution(96, 8, 7)).toBe(96);
        expect(viewResolution(96, 8, 10)).toBe(120);
        expect(viewResolution(96, 8, 10.01)).toBe(121);
        expect(viewResolution(95, 8, 40)).toBe(MAX_VIEW_RESOLUTION);
    });
});
