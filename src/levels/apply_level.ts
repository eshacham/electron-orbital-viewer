import type { RootState } from '../store';
import { requiredLevel, readLevelParam } from './required_level';
import { levelPref, setVisitLevel } from './level_pref';
import { levelRank } from './levels';

/**
 * The visit level a link sets (spec plan; final review I1, ruled), shared by every hash-apply entry point:
 * main.tsx's boot read, its Cognito-return callback (the view the owner left, restored by `startOwnerSession`'s
 * resolved `back`), and useUrlStateSync.ts's hashchange handler (fix round 1: one helper, not three copies).
 *
 * `hash` must be the raw hash, captured before whatever applies it gets a chance to rewrite it: useUrlStateSync's
 * debounced write() drops `lvl` -- it has no registered url-key encoder (url_state.ts) -- so a hash read back
 * through the store would already have lost it. `getState` is called after the hash has landed: `requiredLevel`
 * needs the state the hash produced, not the state before it.
 *
 * The link opens at its `lvl` -- or, with none, at the viewer's own stored level -- floored at what its view needs
 * (`requiredLevel`), so lowering never hides a value the view holds. A visit equal to the stored level is no visit
 * at all: the viewer is simply at their own level. Each link replaces the last one's visit, so a link without `lvl`
 * after one with it restores the viewer's own level. Never writes the preference (`setVisitLevel`, level_pref.ts).
 */
export function applyLevelForHash(hash: string, getState: () => RootState): void {
    const required = requiredLevel(getState());
    const linked = readLevelParam(hash);
    const stored = levelPref.get();
    const opensAt = linked ?? stored;
    const target = levelRank(opensAt) < levelRank(required) ? required : opensAt;
    setVisitLevel(target === stored ? null : target, linked);
}
