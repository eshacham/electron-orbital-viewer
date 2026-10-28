import { createAppStore } from '../../src/store';
import { resetUrlKeysForTests, registerBuiltInUrlKeys, applyStateTo } from '../../src/url_state';
import { levelPref, visitLevel, visitAsked, clearVisit, LEVEL_KEY } from '../../src/levels/level_pref';
import { applyLevelForHash } from '../../src/levels/apply_level';
import { registerMoleculeUrlKeys } from '../../src/molecules/url_keys';
import { displayPref } from '../../src/design/presentation';

/**
 * The one helper main.tsx's boot read, its Cognito-return callback, and
 * useUrlStateSync's hashchange handler all share (fix round 1, Important #2)
 * -- testing it once here covers all three call sites' behaviour, including
 * the Cognito-return path (fix round 1, Important #1), which has no main.tsx
 * test of its own to exercise it directly.
 */
describe('applyLevelForHash (spec plan: the visit level a link sets, shared by every hash-apply entry point)', () => {
    beforeEach(() => {
        resetUrlKeysForTests();
        registerBuiltInUrlKeys();
    });
    afterEach(() => {
        resetUrlKeysForTests();
        window.localStorage.clear();
        clearVisit();
    });

    function apply(hash: string) {
        const store = createAppStore();
        applyStateTo(hash, store.dispatch);
        applyLevelForHash(hash, () => store.getState());
        return store;
    }

    // The exact scenario fix round 1 asks for: a hash the owner left before a
    // Cognito redirect (owner_session.ts's `back`), applied on return, that
    // itself needs Advanced -- it must raise the visit, and must not touch
    // the stored preference (a visit raise is never written back).
    it('raises the visit for a returned hash that needs Advanced, and leaves eov.level untouched', () => {
        apply('#mode=atom&Z=26&charge=2');
        expect(visitLevel()).toBe('advanced');
        expect(window.localStorage.getItem(LEVEL_KEY)).toBeNull();
    });

    it('raises to a linked lvl that exceeds what the state itself needs', () => {
        apply('#mode=atom&Z=6&lvl=research');
        expect(visitLevel()).toBe('research');
    });

    it('does not raise when the view needs no more than the stored level', () => {
        levelPref.set('advanced');
        apply('#mode=atom&Z=6');
        expect(visitLevel()).toBeNull();
    });

    // Final review I1 (ruled): each link sets the visit level; one without lvl opens at the reader's own level, so
    // leaving a link that raised it restores that level (this replaces "never lowers a raise already in place").
    it('a later link with no lvl restores the reader\'s own level', () => {
        apply('#mode=atom&Z=26&charge=2');
        apply('#mode=atom&Z=6');
        expect(visitLevel()).toBeNull();
    });

    // Final review I3: a Basics reader's own bond-label preference is not the link's -- no visit level, so no notice
    // saying "for this link".
    it('does not raise a Molecules link for the reader\'s own bond-label preference', () => {
        registerMoleculeUrlKeys();
        levelPref.set('basics');
        displayPref.set({ ...displayPref.get(), moleculeLabels: true });
        apply('#mode=molecule&id=h2o');
        expect(visitLevel()).toBeNull();
    });

    // Final review I1 (ruled): lvl sets the visit level in both directions, floored at what the view needs.
    describe('a linked lvl sets the visit level both ways (final review I1)', () => {
        it('opens at Basics for a reader whose level is Research', () => {
            levelPref.set('research');
            apply('#mode=atom&Z=6&lvl=basics');
            expect(visitLevel()).toBe('basics');
            expect(window.localStorage.getItem(LEVEL_KEY)).toBe('research');
        });

        it('opens at Explore for a first-time visitor -- their own level, so no visit at all', () => {
            apply('#mode=atom&Z=6&lvl=explore');
            expect(visitLevel()).toBeNull();
            expect(levelPref.get()).toBe('explore');
        });

        it('floors a Basics link to an Fe²⁺ view at Advanced, and keeps what it asked for', () => {
            levelPref.set('research');
            apply('#mode=atom&Z=26&charge=2&lvl=basics');
            expect(visitLevel()).toBe('advanced');
            expect(visitAsked()).toBe('basics');
        });

        it('leaving the link for one with no lvl restores the reader\'s own level', () => {
            levelPref.set('research');
            apply('#mode=atom&Z=6&lvl=basics');
            apply('#mode=atom&Z=11');
            expect(visitLevel()).toBeNull();
        });
    });
});
