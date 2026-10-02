import { drillToShell, drillToSubshell, drillToOrbital, setMode } from '../../src/store/atomSlice';
import { setCombination, setEnclosedFraction, startOrbitalCalculation } from '../../src/store/orbitalSlice';
import { basicOrbitalParams } from '../../src/orbital_presets';
import { viewDescription, exportFileStem, methodStatement, ATOM_METHOD, BASIC_METHOD } from '../../src/export/caption';
import { MAX_FIELD_AU } from '../../src/field_source';
import { N2_MAX_FIELD_AU } from '../../src/stark';
import { makeStore, neonStore } from './fixtures';

describe('export captions', () => {
    it('names each atom level, with the method', () => {
        const store = neonStore();
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), whole atom, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_atom');
        expect(methodStatement(store.getState())).toBe(ATOM_METHOD);
        store.dispatch(drillToShell(2));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), n = 2 shell, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_shell_n2');
        store.dispatch(drillToSubshell(2, 1));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), 2p subshell, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_subshell_n2_l1');
        store.dispatch(drillToOrbital(2, 1, 1));
        expect(viewDescription(store.getState())).toBe('Neon (Ne, Z = 10), 2p_x, 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_Ne_n2_l1_ml1');
    });

    it('names Basic Orbitals and its combinations, saying when a model is qualitative', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        expect(viewDescription(store.getState())).toBe('Hydrogen 3d_z², 90% contour');
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_H_basic_n3_l2_ml0');
        expect(methodStatement(store.getState())).toBe(BASIC_METHOD);
        store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
        expect(methodStatement(store.getState())).toMatch(/first-order perturbation theory/);
        expect(exportFileStem(store.getState())).toBe('orbital-viewer_H_field1');
    });

    // Fix round 1, I1: n = 2's Stark states are refused far below "F << 1
    // a.u." (see N2_MAX_FIELD_AU, the over-the-barrier field for E = -1/8
    // Ha), so its caption must not claim n = 1's much wider range.
    it('states each field level\'s own valid range and says tunnelling is ignored', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        store.dispatch(setCombination({ kind: 'field', level: 1, field: 0.03, stark: 'lower' }));
        const level1 = methodStatement(store.getState());
        expect(level1).toContain('tunnelling ignored');
        expect(level1).toContain(`up to F = ${MAX_FIELD_AU} a.u.`);
        expect(level1).toContain('F << 1 a.u.');

        store.dispatch(setCombination({ kind: 'field', level: 2, field: 0.001, stark: 'lower' }));
        const level2 = methodStatement(store.getState());
        expect(level2).toContain('tunnelling ignored');
        expect(level2).toContain(`${N2_MAX_FIELD_AU}`);
        expect(level2).not.toContain('F << 1 a.u.');
    });

    // Final review I1: in Basic Orbitals the fraction only takes effect on
    // Update Orbital, so until then the caption names the drawn contour, not
    // the panel's. Combinations redraw as the fraction changes, so they
    // follow the panel at once.
    it('names the contour drawn, not one the panel has not applied yet', () => {
        const store = makeStore();
        store.dispatch(setMode('hydrogenic'));
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(3, 2, 0, 0.9)));
        store.dispatch(setEnclosedFraction(0.5));
        expect(viewDescription(store.getState())).toBe('Hydrogen 3d_z², 90% contour');
        store.dispatch(startOrbitalCalculation(basicOrbitalParams(3, 2, 0, 0.5)));
        expect(viewDescription(store.getState())).toBe('Hydrogen 3d_z², 50% contour');

        store.dispatch(setCombination({ kind: 'hybrid', hybrid: 'sp3', member: 'all' }));
        store.dispatch(setEnclosedFraction(0.75));
        expect(viewDescription(store.getState())).toMatch(/, 75% contour$/);
    });
});
