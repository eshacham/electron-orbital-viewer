import { useEffect } from 'react';
import { useAppStore } from './store/hooks';
import { applyStateTo, encodeStateOf, hasSharedView } from './url_state';
import { requiredLevel, readLevelParam } from './levels/required_level';
import { levelPref, raiseForVisit } from './levels/level_pref';
import { levelRank } from './levels/levels';

/**
 * The address bar always holds the current view, so it is itself the share
 * link. replaceState, never pushState: every slider drag would otherwise be
 * a Back-button step. Changes are batched for `delayMs`; pointer hover alone
 * dispatches on every move and must not rewrite the URL each time.
 *
 * `onApplyHash` fires after a pasted/typed hash that names a shared view is
 * applied (fix round 1, M2) -- the caller uses it to close whatever chrome
 * (the periodic table pop-over) would otherwise hide the view that was just
 * asked for. Pass a value stable across renders (`useCallback`, `[]`
 * deps): this effect re-subscribes whenever it changes, which would
 * otherwise reset the pending debounce timer on every unrelated re-render.
 */
export function useUrlStateSync(target: Window = window, delayMs = 250, onApplyHash?: () => void): void {
    const store = useAppStore();
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const write = () => {
            timer = null;
            const next = encodeStateOf(store.getState());
            if (target.location.hash.replace(/^#/, '') !== next) {
                target.history.replaceState(target.history.state, '', `#${next}`);
            }
        };
        const unsubscribe = store.subscribe(() => {
            if (timer === null) timer = setTimeout(write, delayMs);
        });
        // replaceState does not fire hashchange, so this is only ever a hash
        // the user typed or a link followed within the page.
        const onHashChange = () => {
            // Captured before applying it: same reasoning as main.tsx's boot
            // read -- this debounced write() (below) rewrites the hash and
            // drops `lvl` (never registered for writing), so it must be read
            // from the raw hash, not a round trip through the store.
            const hash = target.location.hash;
            applyStateTo(hash, store.dispatch);
            // The visit-only raise (spec plan): see main.tsx's boot read for
            // the full reasoning -- raise only above the stored level, never
            // lower it, never write it back.
            const required = requiredLevel(store.getState());
            const linked = readLevelParam(hash);
            const nextLevel = linked && levelRank(linked) > levelRank(required) ? linked : required;
            if (levelRank(nextLevel) > levelRank(levelPref.get())) raiseForVisit(nextLevel);
            if (onApplyHash && hasSharedView(target.location.hash)) onApplyHash();
        };
        target.addEventListener('hashchange', onHashChange);
        write();
        return () => {
            unsubscribe();
            target.removeEventListener('hashchange', onHashChange);
            if (timer !== null) clearTimeout(timer);
        };
    }, [store, target, delayMs, onApplyHash]);
}
