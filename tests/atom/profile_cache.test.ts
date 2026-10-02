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
});
