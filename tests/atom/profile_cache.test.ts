import { getCachedProfile, setCachedProfile, clearProfileCacheForTests } from '../../src/atom/profile_cache';
import { SerialisedAtomProfile } from '../../src/workers/atomWorker';

const profile = (Z: number) => ({ Z } as unknown as SerialisedAtomProfile);

describe('profile cache keyed by species', () => {
    beforeEach(clearProfileCacheForTests);
    it('keeps Na and Na+ apart at the same fraction', () => {
        setCachedProfile('11', 0.9, profile(11));
        expect(getCachedProfile('11+1', 0.9)).toBeUndefined();
        setCachedProfile('11+1', 0.9, profile(111));
        expect(getCachedProfile('11', 0.9)!.Z).toBe(11);
        expect(getCachedProfile('11+1', 0.9)!.Z).toBe(111);
    });

    // Ruling C2: a relativistic profile is a different picture of the same species.
    it('keeps the modes apart, off under the species key alone', () => {
        setCachedProfile('79', 0.9, profile(1));
        setCachedProfile('79', 0.9, profile(2), 'scalar');
        setCachedProfile('79', 0.9, profile(3), 'spinOrbit');
        expect(getCachedProfile('79', 0.9)!.Z).toBe(1);
        expect(getCachedProfile('79', 0.9, 'off')!.Z).toBe(1);
        expect(getCachedProfile('79', 0.9, 'scalar')!.Z).toBe(2);
        expect(getCachedProfile('79', 0.9, 'spinOrbit')!.Z).toBe(3);
    });
});
