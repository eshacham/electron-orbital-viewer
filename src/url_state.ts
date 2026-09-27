import type { RootState, AppDispatch } from './store';
import type { ViewMode } from './store/atomSlice';

/**
 * The URL hash is the view (spec §4.3). This module owns reading and writing
 * it; each mode registers the keys it needs. Unknown or invalid keys are
 * ignored, never thrown on: a hand-edited link loads what it can.
 */
export type UrlEncoder = (state: RootState) => Record<string, string>;
export type UrlDecoder = (params: URLSearchParams, dispatch: AppDispatch) => void;

/** Key groups every mode gets (the view settings): decoded first, encoded last. */
export const ANY_MODE = '*';

interface KeyGroup { encoder: UrlEncoder; decoder: UrlDecoder; }
const registry = new Map<string, KeyGroup[]>();

/** The URL's name for each stored mode. The stored value names the model; the URL names what the user picked. */
const URL_MODE: Record<ViewMode, string> = { atom: 'atom', hydrogenic: 'basic' };

export function registerUrlKeys(mode: string, encoder: UrlEncoder, decoder: UrlDecoder): void {
    registry.set(mode, [...(registry.get(mode) ?? []), { encoder, decoder }]);
}

export function resetUrlKeysForTests(): void {
    registry.clear();
}

export function urlModeOf(state: RootState): string {
    return URL_MODE[state.atom.mode];
}

/** ':' and ',' stay readable; '+', spaces and '&' are escaped, since URLSearchParams reads '+' as a space. */
function encodeValue(value: string): string {
    return encodeURIComponent(value).replace(/%3A/gi, ':').replace(/%2C/gi, ',');
}

export function encodeStateOf(state: RootState): string {
    const mode = urlModeOf(state);
    const entries = new Map<string, string>();
    const modeGroups = registry.get(mode);
    if (modeGroups) {
        entries.set('mode', mode);
        for (const group of modeGroups) {
            for (const [key, value] of Object.entries(group.encoder(state))) entries.set(key, value);
        }
    }
    for (const group of registry.get(ANY_MODE) ?? []) {
        for (const [key, value] of Object.entries(group.encoder(state))) {
            if (!entries.has(key)) entries.set(key, value);
        }
    }
    return Array.from(entries, ([key, value]) => `${encodeURIComponent(key)}=${encodeValue(value)}`).join('&');
}

function paramsOf(hash: string): URLSearchParams {
    return new URLSearchParams(hash.replace(/^#/, ''));
}

function runDecoder(group: KeyGroup, params: URLSearchParams, dispatch: AppDispatch): void {
    try {
        group.decoder(params, dispatch);
    } catch (error) {
        // A link must never take the app down; the rest of it still applies.
        console.warn('url_state: skipped a key group that could not be decoded', error);
    }
}

export function applyStateTo(hash: string, dispatch: AppDispatch): void {
    const params = paramsOf(hash);
    if (Array.from(params.keys()).length === 0) return;
    for (const group of registry.get(ANY_MODE) ?? []) runDecoder(group, params, dispatch);
    const mode = params.get('mode');
    if (mode === null || mode === ANY_MODE) return;
    for (const group of registry.get(mode) ?? []) runDecoder(group, params, dispatch);
}

export function hasSharedView(hash: string): boolean {
    const mode = paramsOf(hash).get('mode');
    return mode !== null && mode !== ANY_MODE && registry.has(mode);
}

interface UrlStateStore { getState(): RootState; dispatch: AppDispatch; }
let boundStore: UrlStateStore | null = null;

/** main.tsx binds the app's store; tests bind their own, or null. */
export function bindUrlStateStore(store: UrlStateStore | null): void {
    boundStore = store;
}

function requireStore(): UrlStateStore {
    if (!boundStore) throw new Error('url_state: call bindUrlStateStore(store) before encodeState/applyState.');
    return boundStore;
}

export function encodeState(): string {
    return encodeStateOf(requireStore().getState());
}

export function applyState(hash: string): void {
    applyStateTo(hash, requireStore().dispatch);
}
