import { resetUrlKeysForTests, applyStateTo, encodeStateOf } from '../../src/url_state';
import { registerMoleculeUrlKeys } from '../../src/molecules/url_keys';
import { registerComputedUrlKeys, encodeJobUrl, decodeJobUrl } from '../../src/jobs/url_keys';
import { createAppStore } from '../../src/store';

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
        expect(decodeJobUrl(new URLSearchParams(`job=${KEY.toUpperCase()}`))).toBeNull();
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
});
