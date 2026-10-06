import { resetUrlKeysForTests, applyStateTo, encodeStateOf } from '../../src/url_state';
import { registerMoleculeUrlKeys } from '../../src/molecules/url_keys';
import { registerComputedUrlKeys, encodeJobUrl, decodeJobUrl } from '../../src/jobs/url_keys';
import { createAppStore } from '../../src/store';
import { metaFailed } from '../../src/store/moleculeSlice';

const KEY = 'e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa';

beforeEach(() => {
    resetUrlKeysForTests();
    registerMoleculeUrlKeys();
    registerComputedUrlKeys();
});
afterAll(() => resetUrlKeysForTests());

describe('the job URL key', () => {
    it("links a computed molecule by its job, not as an id, and keeps the surface", () => {
        const store = createAppStore();
        applyStateTo(`#mode=molecule&job=${KEY}&show=esp`, store.dispatch);
        expect(store.getState().molecule.selectedId).toBe(KEY);
        expect(store.getState().molecule.surface).toEqual({ kind: 'esp' });
        const params = new URLSearchParams(encodeStateOf(store.getState()));
        expect(params.get('mode')).toBe('molecule');
        expect(params.get('job')).toBe(KEY);
        expect(params.get('id')).toBeNull();
    });
    it('ignores anything that is not a job key', () => {
        expect(decodeJobUrl(new URLSearchParams('job=../etc'))).toBeNull();
        // M2: the key is hex, which is case-blind; a link that shouts it still names the job.
        expect(decodeJobUrl(new URLSearchParams(`job=${KEY.toUpperCase()}`))).toBe(KEY);
        expect(decodeJobUrl(new URLSearchParams(`job=${KEY.slice(1)}`))).toBeNull();
        expect(decodeJobUrl(new URLSearchParams(`job=${KEY}`))).toBe(KEY);
        expect(encodeJobUrl('h2o')).toEqual({});
        expect(encodeJobUrl(null)).toEqual({});
    });
    it('leaves library links as they were', () => {
        const store = createAppStore();
        applyStateTo('#mode=molecule&id=h2o', store.dispatch);
        const params = new URLSearchParams(encodeStateOf(store.getState()));
        expect([params.get('id'), params.get('job')]).toEqual(['h2o', null]);
    });
    // D14: a malformed job= must say so explicitly (ruling T12-a's pattern), never leave a blank screen.
    it('says a malformed job gives an explicit message, not a blank screen', () => {
        const store = createAppStore();
        applyStateTo('#mode=molecule&job=../etc', store.dispatch);
        expect(store.getState().molecule.selectedId).toBeNull();
        expect(store.getState().molecule.error).toContain('../etc');
    });
    // m7 / M2: a job link is not a library link -- say what is wrong with it, briefly.
    it('says a malformed job link is a bad job key, not a missing library molecule, without the whole value', () => {
        const store = createAppStore();
        applyStateTo(`#mode=molecule&job=${KEY.slice(0, 63)}`, store.dispatch);
        const error = store.getState().molecule.error!;
        expect(error).toBe(`This link’s job key is not valid (“${KEY.slice(0, 10)}…”): a job key is 64 hexadecimal characters.`);
        expect(error).not.toContain('library');
    });
    it('opens an upper-case job link as the job it names', () => {
        const store = createAppStore();
        applyStateTo(`#mode=molecule&job=${KEY.toUpperCase()}`, store.dispatch);
        expect(store.getState().molecule.selectedId).toBe(KEY);
        expect(store.getState().molecule.error).toBeNull();
    });
    // m7: a 64-character key is an unbroken string in a phone's alert.
    it('names a computed molecule that failed to load by its short key', () => {
        const store = createAppStore();
        applyStateTo(`#mode=molecule&job=${KEY}`, store.dispatch);
        store.dispatch(metaFailed({ id: KEY, message: 'offline' }));
        expect(store.getState().molecule.error).toBe(`Could not load “${KEY.slice(0, 10)}…”: offline`);
    });
});
