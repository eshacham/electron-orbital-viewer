import { useCallback, useSyncExternalStore } from 'react';
import { usePref } from '../design/usePref';
import { clearVisit, levelPref, subscribeVisit, visitId, visitLevel } from './level_pref';
import { levelRank, LearningLevel } from './levels';

export interface LevelState {
    /** The level in use: the stored one, or this visit's raise when a link needed more (Task 1's visit raise). */
    level: LearningLevel;
    /** The viewer's own preference (eov.level). */
    stored: LearningLevel;
    /** This visit shows more than the stored level -- the visit notice says so. */
    raised: boolean;
    /** Which link raised it (level_pref.ts `visitId`): a notice dismissed for one link shows again for the next. */
    visitId: number;
    /** The viewer's choice: stored, and it ends any visit raise (the choice is now theirs). */
    setLevel(level: LearningLevel): void;
}

/**
 * The learning level in use (spec plan): max(stored preference, visit raise).
 * A raise never writes the preference; choosing a level does, and ends it.
 */
export function useLevel(): LevelState {
    const stored = usePref(levelPref);
    const visit = useSyncExternalStore(subscribeVisit, visitLevel, visitLevel);
    const link = useSyncExternalStore(subscribeVisit, visitId, visitId);
    const raised = visit !== null && levelRank(visit) > levelRank(stored);
    const setLevel = useCallback((level: LearningLevel) => {
        levelPref.set(level);
        clearVisit();
    }, []);
    return { level: raised ? visit : stored, stored, raised, visitId: link, setLevel };
}
