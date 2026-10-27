import { LEVEL_KEY, levelPref } from '../../src/levels/level_pref';
import { visitLevel, raiseForVisit, clearVisit, subscribeVisit } from '../../src/levels/level_pref';

afterEach(() => {
    window.localStorage.clear();
    clearVisit();
});

describe('level preference (spec plan: a preference, never a link)', () => {
    it('defaults to Explore', () => {
        expect(levelPref.get()).toBe('explore');
    });

    it('stores a choice under eov.level, and reads it back', () => {
        levelPref.set('basics');
        expect(window.localStorage.getItem(LEVEL_KEY)).toBe('basics');
        expect(levelPref.get()).toBe('basics');
    });

    it('reads anything it does not recognise as Explore', () => {
        window.localStorage.setItem(LEVEL_KEY, 'wizard');
        expect(levelPref.get()).toBe('explore');
    });

    it('stores Explore, its default, as no key at all', () => {
        levelPref.set('advanced');
        levelPref.set('explore');
        expect(window.localStorage.getItem(LEVEL_KEY)).toBeNull();
    });
});

describe('the visit raise (in-memory only)', () => {
    it('starts with no visit raise', () => {
        expect(visitLevel()).toBeNull();
    });

    it('raiseForVisit never touches the stored preference', () => {
        levelPref.set('basics');
        raiseForVisit('advanced');
        expect(visitLevel()).toBe('advanced');
        expect(window.localStorage.getItem(LEVEL_KEY)).toBe('basics');
    });

    it('never lowers a visit already in place', () => {
        raiseForVisit('advanced');
        raiseForVisit('explore');
        expect(visitLevel()).toBe('advanced');
    });

    it('a higher raise replaces a lower one', () => {
        raiseForVisit('explore');
        raiseForVisit('research');
        expect(visitLevel()).toBe('research');
    });

    it('clearVisit drops it back to null', () => {
        raiseForVisit('advanced');
        clearVisit();
        expect(visitLevel()).toBeNull();
    });

    it('subscribeVisit fires on a raise and a clear, and unsubscribes cleanly', () => {
        const heard: Array<ReturnType<typeof visitLevel>> = [];
        const unsubscribe = subscribeVisit(() => heard.push(visitLevel()));
        raiseForVisit('advanced');
        clearVisit();
        unsubscribe();
        raiseForVisit('research');
        expect(heard).toEqual(['advanced', null]);
    });
});
