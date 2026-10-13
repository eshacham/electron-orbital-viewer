import { useSyncExternalStore } from 'react';
import type { Pref } from './local_pref';

/** The pref's current value; re-renders when this tab or another changes it. */
export function usePref<T>(pref: Pref<T>): T {
    return useSyncExternalStore(pref.subscribe, pref.get, pref.get);
}
