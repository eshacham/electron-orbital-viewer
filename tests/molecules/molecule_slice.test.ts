import reducer, {
    selectMolecule, metaLoaded, metaFailed, setSurface, renderStarted, renderFinished, renderFailed, renderCancelled, indexLoaded,
    linkRejected,
} from '../../src/store/moleculeSlice';
import { encodeMoleculeUrl, decodeMoleculeUrl } from '../../src/molecules/url_keys';
import { waterMeta } from './fixtures';

const init = () => reducer(undefined, { type: '@@init' });

describe('moleculeSlice', () => {
    it('starts empty: nothing is loaded until a molecule is chosen', () => {
        const s = init();
        expect([s.index, s.selectedId, s.meta]).toEqual([null, null, null]);
        expect(s.surface).toEqual({ kind: 'density' });
    });
    it('selecting clears the old molecule and bumps the nonce, even for the same id', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        const nonce = s.loadNonce;
        s = reducer(s, selectMolecule({ id: 'h2o' }));
        expect(s.meta).toBeNull();
        expect(s.isLoadingMeta).toBe(true);
        expect(s.loadNonce).toBe(nonce + 1);
    });
    it('ignores a meta that arrives for a molecule no longer selected', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, selectMolecule({ id: 'nh3' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        expect(s.meta).toBeNull();
    });
    it('keeps a density or ESP choice across molecules but not an orbital index', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        s = reducer(s, setSurface({ kind: 'esp' }));
        expect(reducer(s, selectMolecule({ id: 'nh3' })).surface).toEqual({ kind: 'esp' });
        s = reducer(s, setSurface({ kind: 'mo', index: 4 }));
        expect(reducer(s, selectMolecule({ id: 'nh3' })).surface).toEqual({ kind: 'density' });
    });
    it('drops an orbital the molecule does not have, from a URL or anywhere', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o', surface: { kind: 'mo', index: 99 } }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        expect(s.surface).toEqual({ kind: 'density' });
        expect(reducer(s, setSurface({ kind: 'mo', index: 99 })).surface).toEqual({ kind: 'density' });
        expect(reducer(s, setSurface({ kind: 'mo', index: 4 })).surface).toEqual({ kind: 'mo', index: 4 });
    });
    // Ruling T12-a / spec §3.5: a bad URL id must not land Molecules mode on
    // a blank screen -- it is an explicit message, same family as metaFailed's.
    it('rejects a link naming no molecule, with no stale selection left standing', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        s = reducer(s, linkRejected('not-a-real-id!!'));
        expect(s.selectedId).toBeNull();
        expect(s.meta).toBeNull();
        expect(s.isLoadingMeta).toBe(false);
        expect(s.error).toBe('This link names no molecule in the library (“not-a-real-id!!”)');
    });
    it('truncates a very long or hostile id in the rejection message', () => {
        const long = 'x'.repeat(60);
        const s = reducer(init(), linkRejected(long));
        expect(s.error).toBe(`This link names no molecule in the library (“${'x'.repeat(40)}…”)`);
    });
    it('reports a failed load explicitly', () => {
        let s = reducer(init(), selectMolecule({ id: 'xyz' }));
        s = reducer(s, metaFailed({ id: 'xyz', message: 'HTTP 404' }));
        expect(s.error).toBe('Could not load “xyz”: HTTP 404');
        expect(s.isLoadingMeta).toBe(false);
    });
    it('tracks the render: busy label, result, failure', () => {
        let s = reducer(init(), renderStarted('Loading Water…'));
        expect(s.renderLabel).toBe('Loading Water…');
        s = reducer(s, renderFinished({ isoLevel: 0.001, espRange: [-0.06, 0.07] }));
        expect([s.renderLabel, s.isoLevel, s.espRange]).toEqual([null, 0.001, [-0.06, 0.07]]);
        s = reducer(s, renderFailed('No isosurface'));
        expect(s.renderError).toBe('No isosurface');
        expect(reducer(s, indexLoaded([])).index).toEqual([]);
    });
    // Ruling D38: a render abandoned mid-flight (the mode left, the molecule
    // cleared) takes its busy label down and leaves the last result alone.
    it('drops the busy label of an abandoned render, keeping the last result', () => {
        let s = reducer(init(), renderFinished({ isoLevel: 0.02 }));
        s = reducer(s, renderStarted('Computing 1b1…'));
        s = reducer(s, renderCancelled());
        expect([s.renderLabel, s.isoLevel, s.renderError]).toEqual([null, 0.02, null]);
    });
});

describe('molecule URL keys', () => {
    it('round-trips', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        s = reducer(s, setSurface({ kind: 'mo', index: 4 }));
        const encoded = encodeMoleculeUrl({ ...s, showDipole: false });
        expect(encoded).toEqual({ id: 'h2o', show: 'mo:4', dipole: '0' });
        expect(decodeMoleculeUrl(encoded)).toEqual({ id: 'h2o', surface: { kind: 'mo', index: 4 }, dipole: false });
    });
    it('writes nothing with no molecule chosen', () => {
        expect(encodeMoleculeUrl(init())).toEqual({});
    });
    it('ignores invalid values rather than throwing', () => {
        expect(decodeMoleculeUrl({ id: 'H2O!<script>', show: 'mo:x', struct: 'maybe', dipole: '2' })).toEqual({});
        expect(decodeMoleculeUrl({ show: 'mo:-1' })).toEqual({});
        expect(decodeMoleculeUrl({ id: 'benzene', show: 'esp', struct: '0' })).toEqual({ id: 'benzene', surface: { kind: 'esp' }, structure: false });
    });
});
