import {
    polarized1sSource, starkStateSource, starkShiftHartree, inducedDipole, nextOrderDipoleShare,
    polarizabilityFromDrawnPsi, transitionDipole2s2pz, formatVoltsPerMetre, overTheBarrierField,
    starkFieldProblem, N2_MAX_FIELD_AU, HYDROGEN_POLARIZABILITY,
} from '../src/stark';
import { hybridSource } from '../src/hybrids';
import { makeFieldEvaluator, MAX_FIELD_AU } from '../src/field_source';
import { generateFieldMesh, sampleFieldSource } from '../src/orbital_mesh';
import { overlapIntegral, zMatrixElement } from '../src/field_integrals';
import { ENCLOSED_FRACTIONS, ORBITAL_RESOLUTION } from '../src/orbital_presets';
import { VALIDATION } from '../src/validation/references';

jest.setTimeout(60_000);

describe('polarised 1s (first-order, H′ = +Fz)', () => {
    it('gives α = 9/2 a0³ from the drawn ψ, within 1 %', () => {
        expect(Math.abs(polarizabilityFromDrawnPsi() - 4.5) / 4.5).toBeLessThan(0.01);
    });

    it('responds linearly, which is why α is measured at a small field', () => {
        expect(Math.abs(polarizabilityFromDrawnPsi(0.001) / polarizabilityFromDrawnPsi(0.01) - 1)).toBeLessThan(1e-3);
        // At 0.05 normalising the first-order ψ alone costs 1.4 %.
        const atTop = polarizabilityFromDrawnPsi(0.05);
        expect(atTop).toBeLessThan(4.5);
        expect(atTop).toBeGreaterThan(4.5 * 0.98);
    });

    it('states the displayed dipole and its next-order correction', () => {
        expect(inducedDipole(0.03)).toBeCloseTo(0.135, 12);
        expect(nextOrderDipoleShare(0.05)).toBeCloseTo(0.1234, 4);
        expect(nextOrderDipoleShare(0.03)).toBeCloseTo(0.0444, 4);
    });

    it('keeps the slider maximum below the field that frees the 1s electron', () => {
        expect(overTheBarrierField(0.5)).toBeCloseTo(0.0625, 12);
        expect(MAX_FIELD_AU).toBeLessThan(overTheBarrierField(0.5));
    });

    it('refuses fields above 0.05 a.u.', () => {
        expect(() => polarized1sSource(0.051)).toThrow(/refused/);
        expect(polarized1sSource(0.05)).toMatchObject({ id: 'polarized1s:F0.05', recipe: { type: 'polarized1s', field: 0.05 } });
    });

    // Review Focus 4: the first-order ψ changes sign where F z (1 + r/2) = 1,
    // z ≈ 5.4 a0 at F = 0.05. No offered contour may reach that false node.
    it.each(ENCLOSED_FRACTIONS)('never draws the first-order node, at %p enclosed', fraction => {
        const source = polarized1sSource(0.05);
        const mesh = generateFieldMesh(source, 64, fraction);
        expect(new Set(mesh.psiSigns)).toEqual(new Set([1]));
        const reach = Math.max(...mesh.positions.map(([x, y, z]) => Math.hypot(x, y, z)));
        expect(reach).toBeLessThan(0.8 * source.rMax);
        const zs = mesh.positions.map(([, , z]) => z);
        expect(-Math.min(...zs)).toBeGreaterThan(Math.max(...zs));   // pulled towards −z
    });
});

describe('n = 2 Stark states', () => {
    it('|⟨2s|z|2p_z⟩| = 3 a0 within 1 %, negative in this sign convention', () => {
        const element = transitionDipole2s2pz();
        expect(element).toBeLessThan(0);
        expect(Math.abs(Math.abs(element) - 3) / 3).toBeLessThan(0.01);
    });

    it('puts the lower state\'s density at −z, which is why its shift is −3F', () => {
        const lower = sampleFieldSource(starkStateSource('lower'), ORBITAL_RESOLUTION);
        const centroid = zMatrixElement(lower, lower) / overlapIntegral(lower, lower);
        expect(Math.abs(centroid + 3) / 3).toBeLessThan(0.01);
        expect(starkShiftHartree('lower', 0.002)).toBeCloseTo(-0.006, 12);
        expect(starkShiftHartree('upper', 0.002)).toBeCloseTo(0.006, 12);
    });

    it('is the sp hybrid shape: sp h1 = −(upper state)', () => {
        const sp = makeFieldEvaluator(hybridSource('sp', 0).recipe);
        const upper = makeFieldEvaluator(starkStateSource('upper').recipe);
        for (const [x, y, z] of [[0.5, 0.2, 1], [-2, 1, -3], [0, 0, 6]] as const) {
            expect(sp(x, y, z)).toBeCloseTo(-upper(x, y, z), 14);
        }
    });

    it('refuses fields that would free an n = 2 electron', () => {
        expect(overTheBarrierField(1 / 8)).toBeCloseTo(1 / 256, 12);
        expect(N2_MAX_FIELD_AU).toBeLessThanOrEqual(1 / 256);
        expect(starkFieldProblem(N2_MAX_FIELD_AU)).toBeNull();
        expect(starkFieldProblem(0.01)).toMatch(/not bound/);
        expect(starkFieldProblem(-1)).toMatch(/not bound/);
    });
});

describe('units', () => {
    it('shows the field in V/m', () => {
        expect(formatVoltsPerMetre(0.03)).toBe('1.54 × 10¹⁰ V/m');
        expect(formatVoltsPerMetre(0.001)).toBe('5.14 × 10⁸ V/m');
        expect(formatVoltsPerMetre(0.0039)).toBe('2.01 × 10⁹ V/m');
        expect(formatVoltsPerMetre(0)).toBe('0 V/m');
    });
});

describe('validation rows', () => {
    const row = (quantity: string) => VALIDATION.find(r => r.phase === 1 && r.quantity === quantity)!;

    it('records α from the same computation the test asserts', () => {
        expect(row('static dipole polarisability α').app).toBe(polarizabilityFromDrawnPsi());
        expect(row('static dipole polarisability α').reference).toBe(HYDROGEN_POLARIZABILITY);
    });

    it('records |⟨2s|z|2p_z⟩| from the same computation the test asserts', () => {
        expect(row('|⟨2s|z|2p_z⟩|').app).toBe(Math.abs(transitionDipole2s2pz()));
    });
});
