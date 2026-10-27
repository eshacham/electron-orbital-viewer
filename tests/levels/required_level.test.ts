import { createAppStore } from '../../src/store';
import { resetUrlKeysForTests, registerBuiltInUrlKeys, applyStateTo } from '../../src/url_state';
import { registerMoleculeUrlKeys } from '../../src/molecules/url_keys';
import { displayPref } from '../../src/design/presentation';
import { requiredLevel, readLevelParam } from '../../src/levels/required_level';

// createAppStore(), not a bare configureStore: it carries production's
// serializableCheck exceptions (ruling R16), same reasoning as url_state.test.ts.
function stateFor(hash: string) {
    const store = createAppStore();
    applyStateTo(hash, store.dispatch);
    return store.getState();
}

describe('requiredLevel (spec plan: a view that already holds an Advanced/Explore value)', () => {
    beforeEach(() => {
        resetUrlKeysForTests();
        registerBuiltInUrlKeys();
        registerMoleculeUrlKeys();
    });
    afterEach(() => {
        resetUrlKeysForTests();
        window.localStorage.clear();
    });

    it('a plain neutral atom is Basics', () => {
        expect(requiredLevel(stateFor('#mode=atom&Z=6'))).toBe('basics');
    });

    it('a combination in Orbitals is Advanced', () => {
        expect(requiredLevel(stateFor('#mode=basic&combo=field&F=0.03'))).toBe('advanced');
    });

    it('a charged species in Atoms is Advanced', () => {
        expect(requiredLevel(stateFor('#mode=atom&Z=26&charge=2'))).toBe('advanced');
    });

    it('a non-default relativity mode is Advanced', () => {
        expect(requiredLevel(stateFor('#mode=atom&Z=1&rel=scalar'))).toBe('advanced');
    });

    it('a non-default enclosed fraction is Advanced', () => {
        expect(requiredLevel(stateFor('#mode=atom&Z=6&frac=0.5'))).toBe('advanced');
    });

    it('space filling in Molecules is Explore', () => {
        expect(requiredLevel(stateFor('#mode=molecule&id=h2o&struct=space'))).toBe('explore');
    });

    it('bond labels on, in Molecules, is Explore', () => {
        displayPref.set({ ...displayPref.get(), moleculeLabels: true });
        expect(requiredLevel(stateFor('#mode=molecule&id=h2o'))).toBe('explore');
    });
});

describe('readLevelParam', () => {
    it('reads the lvl key, the new one, not level (Atoms drill / Orbitals field)', () => {
        expect(readLevelParam('#mode=atom&lvl=basics')).toBe('basics');
        expect(readLevelParam('#mode=atom&level=shell')).toBeNull();
    });

    it('rejects anything that is not one of the four levels', () => {
        expect(readLevelParam('#mode=atom&lvl=wizard')).toBeNull();
        expect(readLevelParam('')).toBeNull();
    });
});
