// tests/info/selection_key.test.ts -- Ruling PF4: Info returns to the selection when, and only when, the selection
// changes -- Orbitals n|l|ml|combo|member; Atoms Z|charge|excite|level|n|l|ml|j; Bonds system|R|state; Molecules
// id|surface|orbital. A view-only change (opacity, the enclosed fraction, the cut) is not a new selection.
import { createAppStore, type RootState } from '../../src/store';
import { infoSelectionKey } from '../../src/info/selection_key';

const base = createAppStore().getState();
type Atom = RootState['atom'];
const atom = (patch: Partial<Atom>): RootState => ({ ...base, atom: { ...base.atom, mode: 'atom', ...patch } });
const orbitals = (patch: Partial<RootState['orbital']>): RootState =>
    ({ ...base, atom: { ...base.atom, mode: 'hydrogenic' }, orbital: { ...base.orbital, ...patch } });
const bonds = (patch: Partial<RootState['bonds']>): RootState =>
    ({ ...base, atom: { ...base.atom, mode: 'bonds' }, bonds: { ...base.bonds, ...patch } });
const molecules = (patch: Partial<RootState['molecule']>): RootState =>
    ({ ...base, atom: { ...base.atom, mode: 'molecule' }, molecule: { ...base.molecule, ...patch } });

const allDistinct = (states: RootState[]) => {
    const keys = states.map(infoSelectionKey);
    expect(new Set(keys).size).toBe(keys.length);
};

describe('infoSelectionKey (ruling PF4)', () => {
    it('Atoms: Z, charge, excitation, drill level, n, l, mₗ and j each make a new selection', () => {
        allDistinct([
            atom({}),
            atom({ Z: 6 }),
            atom({ Z: 6, charge: 1 }),
            atom({ Z: 6, excitation: { from: { n: 2, l: 0 }, to: { n: 2, l: 1 } } }),
            atom({ Z: 6, level: 'shell', selectedShell: 2 }),
            atom({ Z: 6, level: 'shell', selectedShell: 2, selectedSubshell: { n: 2, l: 1 } }),
            atom({ Z: 6, level: 'orbital', selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: 0 } }),
            atom({ Z: 6, level: 'orbital', selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: 1 } }),
            atom({ Z: 82, level: 'shell', selectedShell: 6, selectedSubshell: { n: 6, l: 1, j: 0.5 } }),
            atom({ Z: 82, level: 'shell', selectedShell: 6, selectedSubshell: { n: 6, l: 1, j: 1.5 } }),
        ]);
    });

    it('Atoms: a view setting is not a new selection', () => {
        const before = atom({ Z: 6 });
        const after: RootState = { ...before, orbital: { ...before.orbital, enclosedFraction: 0.5,
            surfaceStyle: { ...before.orbital.surfaceStyle, opacity: 0.3 } } };
        expect(infoSelectionKey(after)).toBe(infoSelectionKey(before));
    });

    it('Orbitals: n, l, mₗ, the combination and its member each make a new selection; the field strength does not', () => {
        allDistinct([
            orbitals({ basicSelection: { n: 3, l: 2, ml: 0 } }),
            orbitals({ basicSelection: { n: 2, l: 1, ml: 0 } }),
            orbitals({ basicSelection: { n: 2, l: 1, ml: 1 } }),
            orbitals({ combination: { kind: 'hybrid', hybrid: 'sp3', member: 'all' } }),
            orbitals({ combination: { kind: 'hybrid', hybrid: 'sp3', member: 0 } }),
            orbitals({ combination: { kind: 'hybrid', hybrid: 'sp2', member: 0 } }),
            orbitals({ combination: { kind: 'field', level: 1, field: 0.03, stark: 'lower' } }),
        ]);
        expect(infoSelectionKey(orbitals({ combination: { kind: 'field', level: 1, field: 0.05, stark: 'lower' } })))
            .toBe(infoSelectionKey(orbitals({ combination: { kind: 'field', level: 1, field: 0.03, stark: 'lower' } })));
    });

    it('Bonds: the system, R and the drawn state each make a new selection', () => {
        allDistinct([
            bonds({}),
            bonds({ R: 3 }),
            bonds({ R: 3, view: { kind: 'density' } }),
            bonds({ R: 3, view: { kind: 'h2plus', state: '1sigma_u' } }),
            bonds({ system: 'n2', R: 2.07, view: { kind: 'mo', label: '3σg', spin: 'restricted', component: 0 } }),
            bonds({ system: 'n2', R: 2.07, view: { kind: 'mo', label: '1πu', spin: 'restricted', component: 0 } }),
            bonds({ system: 'n2', R: 2.07, view: { kind: 'mo', label: '1πu', spin: 'restricted', component: 1 } }),
        ]);
    });

    it('Molecules: the molecule, the surface and the orbital each make a new selection', () => {
        allDistinct([
            molecules({}),
            molecules({ selectedId: 'h2o' }),
            molecules({ selectedId: 'h2o', surface: { kind: 'esp' } }),
            molecules({ selectedId: 'h2o', surface: { kind: 'mo', index: 3 } }),
            molecules({ selectedId: 'h2o', surface: { kind: 'mo', index: 4 } }),
            molecules({ selectedId: 'nh3', surface: { kind: 'mo', index: 4 } }),
        ]);
    });

    it('differs between modes, so a mode switch is a new selection', () => {
        allDistinct([atom({}), orbitals({}), bonds({}), molecules({})]);
    });
});
