import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import { applyLevelToDocument } from '../design/level_temper';
import { usePref } from '../design/usePref';
import { clearVisit, levelPref, subscribeVisit, visitAsked, visitId, visitLevel } from './level_pref';
import { LearningLevel } from './levels';

export interface LevelState {
    /** The level in use: the stored one, or the level a link opened this visit at (level_pref.ts `setVisitLevel`). */
    level: LearningLevel;
    /** The viewer's own preference (eov.level). */
    stored: LearningLevel;
    /** A link set this visit's level, above or below the stored one (final review I1) -- the visit notice says so. */
    visiting: boolean;
    /** The `lvl` that link asked for, or null -- above it, the view needed more (the notice says why). */
    asked: LearningLevel | null;
    /** Which link set it (level_pref.ts `visitId`): a notice dismissed for one link shows again for the next. */
    visitId: number;
    /** The viewer's choice: stored, and it ends any visit level (the choice is now theirs). */
    setLevel(level: LearningLevel): void;
}

/**
 * The learning level in use (spec plan): this visit's level where a link set one that differs from the stored
 * preference, else the stored preference. A visit never writes the preference; choosing a level does, and ends it.
 */
export function useLevel(): LevelState {
    const stored = usePref(levelPref);
    const visit = useSyncExternalStore(subscribeVisit, visitLevel, visitLevel);
    const asked = useSyncExternalStore(subscribeVisit, visitAsked, visitAsked);
    const link = useSyncExternalStore(subscribeVisit, visitId, visitId);
    const visiting = visit !== null && visit !== stored;
    const setLevel = useCallback((level: LearningLevel) => {
        levelPref.set(level);
        clearVisit();
    }, []);
    const level = visiting ? visit : stored;
    // Brass Instrument: the chrome is tempered to the level in use, a link's visit level included -- before paint, so a
    // link that opens at another level never shows one frame at the stored one. Idempotent, so every caller may run it.
    useLayoutEffect(() => applyLevelToDocument(level), [level]);
    return { level, stored, visiting, asked: visiting ? asked : null, visitId: link, setLevel };
}
