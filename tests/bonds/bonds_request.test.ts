import { bondsFieldRequest, findOrbital, DENSITY_SURFACE_HEX } from '../../src/bonds/bonds_request';
import reducer, { selectBondsSystem, setScanPoint, setBondsView, setDensityIso, BondsState } from '../../src/store/bondsSlice';
import { MoleculeBasis } from '../../src/molecules/types';

const basis: MoleculeBasis = {
    id: 'n2@07', spherical: true, convention: 'x', atoms: [[0, 0, -1.037], [0, 0, 1.037]], nao: 1,
    shells: [{ atom: 0, l: 0, exponents: [1], coefficients: [1] }],
    orbitals: [
        { index: 0, label: '3σg', energyHartree: -0.38, occupation: 2, spin: 'restricted', coefficients: [1] },
        { index: 1, label: '1πg*', energyHartree: -0.08, occupation: 0, spin: 'restricted', coefficients: [1] },
        { index: 2, label: '1πg*', energyHartree: -0.08, occupation: 0, spin: 'restricted', coefficients: [1] },
    ],
};
const initial = reducer(undefined, { type: '@@init' });
const n2 = reducer(reducer(undefined, selectBondsSystem('n2')), setScanPoint({ index: 7, RBohr: 2.074 }));

describe('bondsFieldRequest', () => {
    it('draws H2+ from the exact recipe', () => {
        const { request, note } = bondsFieldRequest(initial, null, 0.9)!;
        expect(request.sources[0].recipe).toEqual({ type: 'h2plus', R: 2, state: '1sigma_g' });
        expect(request).toMatchObject({ resolution: 96, enclosedFraction: 0.9 });
        expect(request.label).toBe('H₂⁺ 1σg at R = 2.00 a₀');
        expect(request.memberLabels).toEqual([request.label]);
        expect(request.densityIsoValue).toBeUndefined();
        expect(note).toBeNull();
    });

    // Task 2's carry: a source costs a 1.2 ms re-solve on the main thread, and
    // the request is rebuilt on every render that reads it.
    it('solves H2+ once per (R, state)', () => {
        const first = bondsFieldRequest(initial, null, 0.9)!.request.sources[0];
        expect(bondsFieldRequest(initial, null, 0.5)!.request.sources[0]).toBe(first);
        const antibonding = bondsFieldRequest(reducer(initial, setBondsView({ kind: 'h2plus', state: '1sigma_u' })), null, 0.9)!;
        expect(antibonding.request.sources[0]).not.toBe(first);
        expect(antibonding.request.label).toBe('H₂⁺ 1σu* at R = 2.00 a₀');
    });

    // Task 1's carry: the solver throws outside (0, 100]; the slice clamps,
    // and so does the request, whatever state it is handed.
    it('never hands the solver an R off the slider', () => {
        const off: BondsState = { ...initial, R: 0 };
        expect(bondsFieldRequest(off, null, 0.9)!.request.sources[0].recipe).toEqual({ type: 'h2plus', R: 0.5, state: '1sigma_g' });
        expect(bondsFieldRequest({ ...initial, R: Number.NaN }, null, 0.9)).toBeNull();
    });

    it('waits for the basis of the snapped scan point', () => {
        expect(bondsFieldRequest(reducer(undefined, selectBondsSystem('n2')), basis, 0.9)).toBeNull();
        expect(bondsFieldRequest(n2, null, 0.9)).toBeNull();
        expect(bondsFieldRequest(n2, { ...basis, id: 'n2@06' }, 0.9)).toBeNull();
    });

    // Ruling T7-a: a density is drawn at a fixed ρ, and its label says which.
    it('draws the density at the chosen ρ, carrying the basis', () => {
        const { request, note } = bondsFieldRequest(n2, basis, 0.9)!;
        expect(request.sources[0].recipe).toEqual({ type: 'gaussianDensity', moleculeId: 'n2@07' });
        expect(request.densityIsoValue).toBe(0.002);
        expect(request.bases).toEqual([basis]);
        expect(request.colors).toEqual([DENSITY_SURFACE_HEX]);
        expect(request.sources[0].rMax).toBeCloseTo(1.037 + 6.5, 12);
        expect(request.label).toBe('N₂ total density at R = 2.07 a₀, surface at ρ = 0.002 e/a₀³');
        expect(note).toBeNull();
        expect(bondsFieldRequest(reducer(n2, setDensityIso(0.2)), basis, 0.9)!.request).toMatchObject({
            densityIsoValue: 0.2, label: 'N₂ total density at R = 2.07 a₀, surface at ρ = 0.2 e/a₀³',
        });
    });

    it('draws the chosen component of a degenerate pair', () => {
        const view = setBondsView({ kind: 'mo', label: '1πg*', spin: 'restricted', component: 1 });
        const { request } = bondsFieldRequest(reducer(n2, view), basis, 0.9)!;
        expect(request.sources[0].recipe).toEqual({ type: 'gaussianMO', moleculeId: 'n2@07', index: 2 });
        expect(request.densityIsoValue).toBeUndefined();
        expect(request.bases).toEqual([basis]);
        expect(request.label).toBe('N₂ 1πg* at R = 2.07 a₀');
    });

    it('names the spin of an unrestricted orbital', () => {
        const o2: MoleculeBasis = {
            ...basis, id: 'o2@04',
            orbitals: [{ index: 0, label: '1πg*', energyHartree: -0.3, occupation: 1, spin: 'alpha', coefficients: [1] }],
        };
        const state = reducer(reducer(reducer(undefined, selectBondsSystem('o2')), setScanPoint({ index: 4, RBohr: 2.28 })),
            setBondsView({ kind: 'mo', label: '1πg*', spin: 'alpha', component: 0 }));
        expect(bondsFieldRequest(state, o2, 0.9)!.request.label).toBe('O₂ 1πg* (α) at R = 2.28 a₀');
    });

    // Review Focus 2.
    it('falls back to the density, saying so, when the orbital is not kept here', () => {
        const view = setBondsView({ kind: 'mo', label: '3σu*', spin: 'restricted', component: 0 });
        const result = bondsFieldRequest(reducer(n2, view), basis, 0.9)!;
        expect(result.request.sources[0].recipe.type).toBe('gaussianDensity');
        expect(result.note).toBe('3σu* is not among the orbitals kept at this geometry; showing the total density.');
    });
});

describe('findOrbital', () => {
    it('finds by label, spin and component, and nothing for a density', () => {
        expect(findOrbital(basis, { kind: 'mo', label: '1πg*', spin: 'restricted', component: 0 })?.index).toBe(1);
        expect(findOrbital(basis, { kind: 'mo', label: '1πg*', spin: 'restricted', component: 2 })).toBeNull();
        expect(findOrbital(basis, { kind: 'mo', label: '3σg', spin: 'alpha', component: 0 })).toBeNull();
        expect(findOrbital(basis, { kind: 'density' })).toBeNull();
    });
});
