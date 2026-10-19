// tests/molecules/url_keys.test.ts -- the representation and structure-only keys in a Molecules link (ruling P8).
import reducer, { selectMolecule, metaLoaded, setRepresentation, setSurface, MoleculeState } from '../../src/store/moleculeSlice';
import { encodeMoleculeUrl, decodeMoleculeUrl, registerMoleculeUrlKeys } from '../../src/molecules/url_keys';
import { applyStateTo, resetUrlKeysForTests } from '../../src/url_state';
import { createAppStore } from '../../src/store';
import { waterMeta } from './fixtures';

const water = (): MoleculeState => {
    let s = reducer(undefined, selectMolecule({ id: 'h2o' }));
    s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
    return s;
};

describe('struct= (the representation)', () => {
    it('writes struct=space for space filling, struct=0 for none, and nothing for ball and stick', () => {
        expect(encodeMoleculeUrl(reducer(water(), setRepresentation('space-filling'))).struct).toBe('space');
        expect(encodeMoleculeUrl(reducer(water(), setRepresentation('none'))).struct).toBe('0');
        expect(encodeMoleculeUrl(water())).not.toHaveProperty('struct');
    });
    it('reads space, 0 and 1, and leaves an absent struct to the default', () => {
        expect(decodeMoleculeUrl({ id: 'h2o', struct: 'space' })).toEqual({ id: 'h2o', representation: 'space-filling' });
        expect(decodeMoleculeUrl({ id: 'h2o', struct: '0' })).toEqual({ id: 'h2o', representation: 'none' });
        expect(decodeMoleculeUrl({ id: 'h2o', struct: '1' })).toEqual({ id: 'h2o', representation: 'ball-and-stick' });
        expect(decodeMoleculeUrl({ id: 'h2o' })).toEqual({ id: 'h2o' });
    });
});

describe('show=none (structure only)', () => {
    it('writes show=none and reads it back as no surface', () => {
        expect(encodeMoleculeUrl(reducer(water(), setSurface({ kind: 'none' }))).show).toBe('none');
        expect(decodeMoleculeUrl({ id: 'h2o', show: 'none' })).toEqual({ id: 'h2o', surface: { kind: 'none' } });
    });
    it('round-trips a structure-only, space-filling view', () => {
        const s = reducer(reducer(water(), setSurface({ kind: 'none' })), setRepresentation('space-filling'));
        const encoded = encodeMoleculeUrl(s);
        expect(encoded).toEqual({ id: 'h2o', show: 'none', struct: 'space' });
        expect(decodeMoleculeUrl(encoded)).toEqual({ id: 'h2o', surface: { kind: 'none' }, representation: 'space-filling' });
    });
});

describe('unknown values', () => {
    // Review Focus 2: an unknown struct or show value is dropped -- the molecule opens in ball and stick with
    // its default surface, nothing throws, and the id (which was fine) is kept, so linkRejected never fires.
    it('drops an unknown struct or show value and keeps the molecule (Review Focus 2)', () => {
        expect(decodeMoleculeUrl({ id: 'h2o', struct: 'banana', show: 'mo:' })).toEqual({ id: 'h2o' });
        expect(decodeMoleculeUrl({ id: 'h2o', struct: 'Space', show: 'None' })).toEqual({ id: 'h2o' });
        resetUrlKeysForTests();
        registerMoleculeUrlKeys();
        const store = createAppStore();
        // applyStateTo catches a decoder that throws and warns instead: no warning means nothing threw.
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        applyStateTo('#mode=molecule&id=h2o&struct=banana&show=mo:', store.dispatch);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
        const molecule = store.getState().molecule;
        expect([molecule.selectedId, molecule.error, molecule.representation]).toEqual(['h2o', null, 'ball-and-stick']);
        expect(molecule.surface).toEqual({ kind: 'density' });
    });
});
