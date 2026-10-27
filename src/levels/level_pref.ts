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
 * The visit-only raise (spec plan): a shared link or a value a view already
 * holds can show more than the viewer's stored level for this visit alone,
 * without ever touching `levelPref` -- a level is a preference, never
 * something a link sets permanently. In memory only: a reload starts over
 * at the stored level, and `raiseForVisit` never lowers a raise already in
 * place (it is a raise, not an assignment).
 */
let visit: LearningLevel | null = null;
const visitListeners = new Set<() => void>();

export function visitLevel(): LearningLevel | null {
    return visit;
}

export function raiseForVisit(level: LearningLevel): void {
    if (visit !== null && levelRank(visit) >= levelRank(level)) return;
    visit = level;
    visitListeners.forEach(listener => listener());
}

export function clearVisit(): void {
    if (visit === null) return;
    visit = null;
    visitListeners.forEach(listener => listener());
}

export function subscribeVisit(listener: () => void): () => void {
    visitListeners.add(listener);
    return () => visitListeners.delete(listener);
}
