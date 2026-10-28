import { LEVEL_KEY, levelPref } from '../../src/levels/level_pref';
import { visitLevel, visitAsked, setVisitLevel, clearVisit, subscribeVisit, visitId } from '../../src/levels/level_pref';

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

// Final review I1 (ruled): a link sets the visit level both ways, so raiseForVisit (raise-only) became setVisitLevel
// (an assignment); these tests follow it -- "never lowers" and "a higher raise replaces" are now "the next link's
// level replaces the last", in either direction.
describe('the visit level (in-memory only)', () => {
    it('starts with no visit level', () => {
        expect(visitLevel()).toBeNull();
    });

    it('setVisitLevel never touches the stored preference', () => {
        levelPref.set('basics');
        setVisitLevel('advanced');
        expect(visitLevel()).toBe('advanced');
        expect(window.localStorage.getItem(LEVEL_KEY)).toBe('basics');
    });

    it('the next link\'s level replaces the last one, lower as well as higher', () => {
        setVisitLevel('advanced');
        setVisitLevel('basics');
        expect(visitLevel()).toBe('basics');
        setVisitLevel('research');
        expect(visitLevel()).toBe('research');
    });

    it('keeps the lvl a link asked for beside the level it set, and forgets it with the visit', () => {
        setVisitLevel('advanced', 'basics');
        expect(visitAsked()).toBe('basics');
        setVisitLevel('explore');
        expect(visitAsked()).toBeNull();
        setVisitLevel('advanced', 'basics');
        clearVisit();
        expect(visitAsked()).toBeNull();
    });

    it('clearVisit drops it back to null', () => {
        setVisitLevel('advanced');
        clearVisit();
        expect(visitLevel()).toBeNull();
    });

    // Task 2 fix round 1 (M5): the visit notice is dismissed per link, so each link setting a visit level is counted --
    // a second link to the level already in place too, though the level itself does not move.
    it('visitId counts every link that sets a visit level, and tells its listeners', () => {
        const before = visitId();
        const heard: number[] = [];
        const unsubscribe = subscribeVisit(() => heard.push(visitId()));
        setVisitLevel('advanced');
        setVisitLevel('advanced');
        unsubscribe();
        expect(visitLevel()).toBe('advanced');
        expect(heard).toEqual([before + 1, before + 2]);
    });

    it('subscribeVisit fires on a visit and a clear, and unsubscribes cleanly', () => {
        const heard: Array<ReturnType<typeof visitLevel>> = [];
        const unsubscribe = subscribeVisit(() => heard.push(visitLevel()));
        setVisitLevel('advanced');
        clearVisit();
        unsubscribe();
        setVisitLevel('research');
        expect(heard).toEqual(['advanced', null]);
    });
});
