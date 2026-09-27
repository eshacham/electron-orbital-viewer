import { drillToShell, drillToSubshell, drillToOrbital, setMode } from '../../src/store/atomSlice';
import { setCombination } from '../../src/store/orbitalSlice';
import { viewDescription, exportFileStem, methodStatement, ATOM_METHOD, BASIC_METHOD } from '../../src/export/caption';
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
});
