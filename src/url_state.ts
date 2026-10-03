import type { RootState, AppDispatch } from './store';
import { setMode, setElement, setCharge, setExcitation, solveStarted, requestAtomView, speciesOf, PendingAtomView, ViewMode } from './store/atomSlice';
import {
    setBasicSelection, setEnclosedFraction, setCombination, requestBasicRender, requestCut, restoreCamera,
    setSurfaceStyle, selectShownBasicOrbital, selectShownEnclosedFraction, BasicSelection, CutSetting,
} from './store/orbitalSlice';
import { ENCLOSED_FRACTIONS } from './orbital_presets';
import { MIN_ATOMIC_NUMBER, MAX_ATOMIC_NUMBER } from './elements';
import { CombinationSelection, NO_COMBINATION, DEFAULT_FIELD_AU } from './combinations';
import { HybridKind } from './hybrids';
import { CameraAngles } from './camera_angles';
import { ClipAxis } from './types/orbital';
import { encodeSpeciesParams, decodeSpeciesParams } from './atom/species';

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

export function parseIntInRange(value: string | null, min: number, max: number): number | null {
    if (value === null || !/^-?\d+$/.test(value)) return null;
    const n = Number(value);
    return n >= min && n <= max ? n : null;
}

// A decimal literal only -- like parseIntInRange's regex, but with an optional
// fraction and exponent. Number() also accepts hex ('0x1') and padded
// whitespace (' 5'); a hand-edited link with either must be ignored like any
// other malformed key, not parsed as a number nobody wrote (ruling T5/M3).
const DECIMAL_LITERAL = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

export function parseNumberInRange(value: string | null, min: number, max: number): number | null {
    if (value === null || !DECIMAL_LITERAL.test(value)) return null;
    const n = Number(value);
    return n >= min && n <= max ? n : null;
}

const round2 = (value: number) => Math.round(value * 100) / 100 + 0;

/** Depth as the Depth slider shows it: 0 nothing removed, 0.5 through the nucleus, 1 everything. */
export function formatCut(cut: CutSetting): string {
    return cut.clipAxis === 'none' ? 'none' : `${cut.clipAxis}:${round2((1 - cut.clipPosition) / 2)}`;
}

export function parseCut(value: string | null): CutSetting | null {
    if (value === 'none') return { clipAxis: 'none', clipPosition: 0 };
    const match = value ? /^([xyz]):(.+)$/.exec(value) : null;
    const depth = match ? parseNumberInRange(match[2], 0, 1) : null;
    if (!match || depth === null) return null;
    return { clipAxis: match[1] as ClipAxis, clipPosition: round2(1 - 2 * depth) };
}

export function parseCamera(value: string | null): CameraAngles | null {
    const match = value ? /^(-?\d+),(-?\d+)$/.exec(value) : null;
    const azimuth = match ? parseIntInRange(match[1], -179, 180) : null;
    const elevation = match ? parseIntInRange(match[2], -89, 89) : null;
    return azimuth === null || elevation === null ? null : { azimuth, elevation };
}

function encodeViewKeys(state: RootState): Record<string, string> {
    const { surfaceStyle, pendingCut, cameraAngles } = state.orbital;
    const keys: Record<string, string> = {
        // The contour drawn, which in Basic Orbitals can lag the panel until Update Orbital.
        frac: String(selectShownEnclosedFraction(state)),
        // A cut still waiting for its view is the one the link asked for.
        cut: formatCut(pendingCut ?? surfaceStyle),
        op: String(round2(surfaceStyle.opacity)),
        surf: surfaceStyle.mode === 'wireframe' ? 'wire' : 'solid',
    };
    if (cameraAngles) keys.cam = `${cameraAngles.azimuth},${cameraAngles.elevation}`;
    return keys;
}

function decodeViewKeys(params: URLSearchParams, dispatch: AppDispatch): void {
    const fraction = parseNumberInRange(params.get('frac'), 0, 1);
    if (fraction !== null && ENCLOSED_FRACTIONS.includes(fraction)) dispatch(setEnclosedFraction(fraction));
    const opacity = parseNumberInRange(params.get('op'), 0.05, 1);
    if (opacity !== null) dispatch(setSurfaceStyle({ opacity: round2(opacity) }));
    const surface = params.get('surf');
    if (surface === 'solid' || surface === 'wire') dispatch(setSurfaceStyle({ mode: surface === 'wire' ? 'wireframe' : 'solid' }));
    const cut = parseCut(params.get('cut'));
    if (cut) dispatch(requestCut(cut));
    // No cam key means the canonical view, so a link always sets the camera.
    dispatch(restoreCamera(parseCamera(params.get('cam'))));
}

export function parseAtomView(params: URLSearchParams): PendingAtomView {
    const whole: PendingAtomView = { level: 'atom', shell: null, subshell: null, orbital: null };
    const level = params.get('level');
    if (level !== 'shell' && level !== 'orbital') return whole;
    const n = parseIntInRange(params.get('n'), 1, 7);
    if (n === null) return whole;
    const shell: PendingAtomView = { level: 'shell', shell: n, subshell: null, orbital: null };
    const l = parseIntInRange(params.get('l'), 0, Math.min(3, n - 1));
    if (l === null) return shell;
    const subshell: PendingAtomView = { ...shell, subshell: { n, l } };
    if (level !== 'orbital') return subshell;
    const ml = parseIntInRange(params.get('ml'), -l, l);
    return ml === null ? subshell : { level: 'orbital', shell: n, subshell: { n, l }, orbital: { n, l, ml } };
}

function encodeAtomKeys(state: RootState): Record<string, string> {
    const atom = state.atom;
    // Mid-solve, the link is the view that was asked for, not the whole atom shown meanwhile.
    const view: PendingAtomView = atom.pendingView
        ?? { level: atom.level, shell: atom.selectedShell, subshell: atom.selectedSubshell, orbital: atom.selectedOrbital };
    // {Z, ...species keys, level, n, l, ml} (ruling C2): a neutral ground
    // state offers no charge/excite, so its link stays byte-identical to
    // Phase 2's; Phase 4 later inserts `rel` right after Z, ahead of these.
    const keys: Record<string, string> = { Z: String(atom.Z), ...encodeSpeciesParams(speciesOf(atom)), level: view.level };
    if (view.level !== 'atom' && view.shell !== null) {
        keys.n = String(view.shell);
        if (view.subshell) keys.l = String(view.subshell.l);
        if (view.level === 'orbital' && view.orbital) keys.ml = String(view.orbital.ml);
    }
    return keys;
}

function decodeAtomKeys(params: URLSearchParams, dispatch: AppDispatch): void {
    dispatch(setMode('atom'));
    const Z = parseIntInRange(params.get('Z'), MIN_ATOMIC_NUMBER, MAX_ATOMIC_NUMBER);
    // Without an element there is no solve to land a level on.
    if (Z === null) return;
    dispatch(setElement(Z));
    // setCharge/setExcitation clear pendingView (they reset for a new
    // species, ruling C1), so they must run before requestAtomView, which
    // sets the view this link actually asked for (ruling C2). An unoffered
    // charge or excitation (ruling C14) is ignored by decodeSpeciesParams,
    // which falls back to the neutral ground state.
    const { charge, excitation } = decodeSpeciesParams(Z, params);
    if (charge !== 0) dispatch(setCharge(charge));
    if (excitation) dispatch(setExcitation(excitation));
    dispatch(solveStarted());
    dispatch(requestAtomView(parseAtomView(params)));
}

export function parseBasicSelection(params: URLSearchParams): BasicSelection | null {
    const n = parseIntInRange(params.get('n'), 1, 9);
    const l = n === null ? null : parseIntInRange(params.get('l'), 0, n - 1);
    const ml = l === null ? null : parseIntInRange(params.get('ml'), -l, l);
    return n === null || l === null || ml === null ? null : { n, l, ml };
}

/**
 * Phase 1's combination, with the key names Phase 7's lessons use. Values
 * are never clamped: an out-of-range F or member decodes as given, so the
 * selection lands in Phase 1's refused state (selectionProblem says why and
 * nothing is drawn) instead of silently showing a different field. "Out of
 * range" means a well-formed number -- a negative member included, which is
 * an integer as much as 5 is. A value that is not a number of the right kind
 * at all (member=abc, member=1.5) is malformed, and is ignored like any other
 * malformed key: the default applies (every member, F = 0.03 a.u.).
 */
export function parseCombination(params: URLSearchParams): CombinationSelection {
    const combo = params.get('combo');
    if (combo === 'sp' || combo === 'sp2' || combo === 'sp3') {
        const member = params.get('member');
        const index = parseIntInRange(member, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        return { kind: 'hybrid', hybrid: combo as HybridKind, member: index ?? 'all' };
    }
    if (combo === 'field') {
        const level = params.get('level') === '2' ? 2 : 1;
        const strength = parseNumberInRange(params.get('F'), -Number.MAX_VALUE, Number.MAX_VALUE);
        const stark = params.get('stark');
        return {
            kind: 'field', level, field: strength ?? DEFAULT_FIELD_AU,
            stark: stark === 'upper' || stark === 'both' ? stark : 'lower',
        };
    }
    return NO_COMBINATION;
}

export function formatCombination(selection: CombinationSelection): Record<string, string> {
    if (selection.kind === 'hybrid') {
        return { combo: selection.hybrid, member: String(selection.member) };
    }
    if (selection.kind === 'field') {
        return {
            combo: 'field', level: String(selection.level),
            F: String(Number(selection.field.toPrecision(6))), stark: selection.stark,
        };
    }
    return { combo: 'none' };
}

function encodeBasicKeys(state: RootState): Record<string, string> {
    const shown = selectShownBasicOrbital(state);
    return { n: String(shown.n), l: String(shown.l), ml: String(shown.ml), ...formatCombination(state.orbital.combination) };
}

function decodeBasicKeys(params: URLSearchParams, dispatch: AppDispatch): void {
    dispatch(setMode('hydrogenic'));
    const selection = parseBasicSelection(params);
    if (selection) dispatch(setBasicSelection(selection));
    dispatch(setCombination(parseCombination(params)));
    // App draws once every decoder has dispatched (see basicRenderNonce).
    dispatch(requestBasicRender());
}

/** Registers the keys this app has today. main.tsx calls it once, before applyState. */
export function registerBuiltInUrlKeys(): void {
    registerUrlKeys(ANY_MODE, encodeViewKeys, decodeViewKeys);
    registerUrlKeys('atom', encodeAtomKeys, decodeAtomKeys);
    registerUrlKeys('basic', encodeBasicKeys, decodeBasicKeys);
}
