import { createPref } from '../design/local_pref';
import { isLearningLevel, levelRank, LearningLevel } from './levels';

/**
 * The learning level the viewer chose (spec plan): localStorage only, never
 * in a link -- same reasoning as theme_storage.ts and presentation.ts (spec
 * §6.7). Explore, the default, is stored as no key at all, so a fresh
 * browser and one that has explicitly chosen Explore read identically.
 */
export const LEVEL_KEY = 'eov.level';
const DEFAULT_LEVEL: LearningLevel = 'explore';

export function decodeLevel(raw: string | null): LearningLevel {
    return isLearningLevel(raw) ? raw : DEFAULT_LEVEL;
}

export function encodeLevel(level: LearningLevel): string | null {
    return level === DEFAULT_LEVEL ? null : level;
}

export const levelPref = createPref<LearningLevel>(LEVEL_KEY, { decode: decodeLevel, encode: encodeLevel });

/**
 * This visit's level, set by a link (spec plan; final review I1, ruled: both ways): a shared link opens at the level
 * its `lvl` names -- below the viewer's own level as well as above it -- floored at what its view needs, or, with no
 * `lvl`, at the viewer's own level raised only if the view needs more. It never touches `levelPref`: a level is a
 * preference, never something a link sets permanently. In memory only: a reload starts over at the stored level, and
 * the next link replaces it (`setVisitLevel` assigns), so leaving a link for one without `lvl` restores the viewer's
 * own level. Each link that sets one is counted by `visitId`.
 */
let visit: LearningLevel | null = null;
/** The `lvl` the link asked for, when it set the visit: the notice says why a view needing more opened above it. */
let asked: LearningLevel | null = null;
/** How many links have set a visit level this session (Task 2 fix round 1: the notice is dismissed per link). */
let visitSerial = 0;
const visitListeners = new Set<() => void>();

export function visitLevel(): LearningLevel | null {
    return visit;
}

/** The level the link that set this visit asked for (its `lvl`), or null when it named none or set no visit. */
export function visitAsked(): LearningLevel | null {
    return asked;
}

/** Which link's visit level is in place: a new one each time a link sets one, even the level already in place. */
export function visitId(): number {
    return visitSerial;
}

/**
 * A link's level for this visit -- `level`, or null when the link opens at the viewer's own level -- replacing any
 * earlier link's. `linked` is the link's own `lvl` (null for none), kept beside the level it was floored to.
 */
export function setVisitLevel(level: LearningLevel | null, linked: LearningLevel | null = null): void {
    const nextAsked = level === null ? null : linked;
    if (level === null && visit === null) return;
    if (level !== null) visitSerial += 1;
    visit = level;
    asked = nextAsked;
    visitListeners.forEach(listener => listener());
}

export function clearVisit(): void {
    setVisitLevel(null);
}

export function subscribeVisit(listener: () => void): () => void {
    visitListeners.add(listener);
    return () => visitListeners.delete(listener);
}
