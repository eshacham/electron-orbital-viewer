import reducer, {
    selectMolecule, metaLoaded, metaFailed, setSurface, renderStarted, renderFinished, renderFailed, renderCancelled, indexLoaded,
    linkRejected, setRepresentation, setShowStructure, setPick,
} from '../../src/store/moleculeSlice';
import { setMode } from '../../src/store/atomSlice';
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
    // Task 16: the view settings state the contour drawn (ruling D22's
    // isoNote); the last molecule's ρ must not stand under the next one's name.
    it('forgets the last molecule\'s contour when another is chosen', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, renderFinished({ isoLevel: 0.002 }));
        expect(reducer(s, selectMolecule({ id: 'nh3' })).isoLevel).toBeNull();
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
    // Task 16b (ruling D5): exports describe what was drawn, never what is
    // merely selected -- so the slice records the surface that landed, and
    // forgets it whenever the canvas stops showing it.
    it('records the surface that landed, and forgets it when another starts, fails or is cancelled', () => {
        const drawn = { id: 'h2o', surface: { kind: 'mo' as const, index: 4 }, enclosedFraction: 0.9 };
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        expect(s.drawn).toBeNull();
        s = reducer(s, renderStarted('Computing 1b1…'));
        s = reducer(s, renderFinished({ isoLevel: 0.02, drawn }));
        expect(s.drawn).toEqual(drawn);
        expect(reducer(s, renderStarted('Loading Water…')).drawn).toBeNull();
        expect(reducer(s, renderFailed('No isosurface')).drawn).toBeNull();
        expect(reducer(s, renderCancelled()).drawn).toBeNull();
        expect(reducer(s, selectMolecule({ id: 'nh3' })).drawn).toBeNull();
        expect(reducer(s, linkRejected('bad!')).drawn).toBeNull();
        // Leaving the mode: re-entering draws afresh (useMoleculeView's
        // effect re-runs on `active`), so nothing drawn carries over.
        expect(reducer(s, setMode('atom')).drawn).toBeNull();
        // A landing that does not say what it drew records nothing.
        expect(reducer(s, renderFinished({ isoLevel: 0.02 })).drawn).toBeNull();
    });
    // Final review M1: a same-mode setMode (a #mode=molecule link with no id
    // pasted while in Molecules) leaves the picture up, so it stays exportable.
    it('keeps what is drawn when the mode set is Molecules again', () => {
        const drawn = { id: 'h2o', surface: { kind: 'density' as const }, enclosedFraction: 0.9 };
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        s = reducer(s, renderFinished({ isoLevel: 0.02, drawn }));
        expect(reducer(s, setMode('molecule')).drawn).toEqual(drawn);
    });
    // Final review M4: re-clicking the selected orbital (or surface) is not a
    // new choice -- a fresh object would restart the render and dim the view.
    it('keeps the same surface object when the same surface is chosen again', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        s = reducer(s, setSurface({ kind: 'mo', index: 4 }));
        const before = s;
        s = reducer(s, setSurface({ kind: 'mo', index: 4 }));
        expect(s).toBe(before);
        expect(reducer(s, setSurface({ kind: 'mo', index: 3 })).surface).toEqual({ kind: 'mo', index: 3 });
        s = reducer(s, setSurface({ kind: 'esp' }));
        s = reducer(s, renderFinished({ isoLevel: 0.001, espRange: [-0.06, 0.07] }));
        const esp = s;
        expect(reducer(s, setSurface({ kind: 'esp' }))).toBe(esp);
    });
});

// Ruling P8: the representation replaces the ball-and-stick boolean; setShowStructure stays as its alias.
describe('the representation', () => {
    const water = () => reducer(reducer(init(), selectMolecule({ id: 'h2o' })), metaLoaded({ id: 'h2o', meta: waterMeta() }));
    /** Iron in place of water's oxygen: neither Bondi nor Mantina tabulates a van der Waals radius for Fe (ruling P8b). */
    const ironMeta = () => waterMeta({ id: 'feh2', atoms: waterMeta().atoms.map((atom, i) => (i === 0 ? { ...atom, Z: 26 } : atom)) });

    it('starts as ball and stick', () => {
        expect(init().representation).toBe('ball-and-stick');
    });
    it('keeps setShowStructure as the alias: true is ball and stick, false is none', () => {
        expect(reducer(water(), setShowStructure(false)).representation).toBe('none');
        expect(reducer(reducer(water(), setShowStructure(false)), setShowStructure(true)).representation).toBe('ball-and-stick');
    });
    it('switches to space filling', () => {
        expect(reducer(water(), setRepresentation('space-filling')).representation).toBe('space-filling');
    });
    it('forgets the pick when nothing is left to pick', () => {
        const picked = reducer(water(), setPick({ kind: 'atom', index: 0 }));
        expect(reducer(picked, setRepresentation('none')).pick).toBeNull();
        expect(reducer(picked, setShowStructure(false)).pick).toBeNull();
        // Space filling's spheres are atoms too: the pick stays.
        expect(reducer(picked, setRepresentation('space-filling')).pick).toEqual({ kind: 'atom', index: 0 });
    });
    it('refuses space filling for a molecule holding an element with no radius, and falls back when one loads', () => {
        let s = reducer(reducer(init(), selectMolecule({ id: 'feh2' })), metaLoaded({ id: 'feh2', meta: ironMeta() }));
        expect(reducer(s, setRepresentation('space-filling')).representation).toBe('ball-and-stick');
        s = reducer(water(), setRepresentation('space-filling'));
        s = reducer(s, selectMolecule({ id: 'feh2' }));
        expect(s.representation).toBe('space-filling');
        expect(reducer(s, metaLoaded({ id: 'feh2', meta: ironMeta() })).representation).toBe('ball-and-stick');
    });
});

// Ruling P8: show=none draws no surface. Nothing is drawn, so nothing drawn is remembered -- no contour, no
// ESP range, no failure of the surface left behind.
describe('the structure-only surface', () => {
    it('takes no surface, forgetting what the last one drew or why it failed', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o' }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        s = reducer(s, renderFinished({ isoLevel: 0.02, drawn: { id: 'h2o', surface: { kind: 'density' }, enclosedFraction: 0.9 } }));
        const none = reducer(s, setSurface({ kind: 'none' }));
        expect(none.surface).toEqual({ kind: 'none' });
        expect([none.isoLevel, none.drawn, none.espRange]).toEqual([null, null, null]);
        expect(reducer(reducer(s, renderFailed('No isosurface')), setSurface({ kind: 'none' })).renderError).toBeNull();
    });
    it('keeps no surface across molecules, as it keeps density or ESP', () => {
        let s = reducer(init(), selectMolecule({ id: 'h2o', surface: { kind: 'none' } }));
        s = reducer(s, metaLoaded({ id: 'h2o', meta: waterMeta() }));
        expect(reducer(s, selectMolecule({ id: 'nh3' })).surface).toEqual({ kind: 'none' });
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
        // Ruling P8: struct=0 now decodes to the representation 'none' (it was the boolean `structure: false`).
        expect(decodeMoleculeUrl({ id: 'benzene', show: 'esp', struct: '0' })).toEqual({ id: 'benzene', surface: { kind: 'esp' }, representation: 'none' });
    });
});
