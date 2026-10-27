import type { RootState } from '../store';
import { requiredLevel, readLevelParam } from './required_level';
import { levelPref, raiseForVisit } from './level_pref';
import { levelRank } from './levels';

/**
 * The visit-only raise (spec plan), shared by every hash-apply entry point:
 * main.tsx's boot read, its Cognito-return callback (the view the owner left,
 * restored by `startOwnerSession`'s resolved `back`), and
 * useUrlStateSync.ts's hashchange handler (fix round 1: this one helper
 * replaces what had been copied verbatim between the first two, and would
 * otherwise have been a third copy for the Cognito path).
 *
 * `hash` must be the raw hash, captured before whatever applies it gets a
 * chance to rewrite it: useUrlStateSync's debounced write() drops `lvl` --
 * it has no registered url-key encoder (url_state.ts) -- so a hash read back
 * through the store would already have lost it. `getState` is called after
 * the hash has landed: `requiredLevel` needs the state the hash produced,
 * not the state before it.
 *
 * Raises the visit to max(lvl, requiredLevel(state after applying)) only
 * when that is above the stored preference; never lowers it, never writes
 * it back (`raiseForVisit`, `level_pref.ts`).
 */
export function applyLevelForHash(hash: string, getState: () => RootState): void {
    const required = requiredLevel(getState());
    const linked = readLevelParam(hash);
    const target = linked && levelRank(linked) > levelRank(required) ? linked : required;
    if (levelRank(target) > levelRank(levelPref.get())) raiseForVisit(target);
}
