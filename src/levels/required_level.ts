import type { RootState } from '../store';
import { effectiveRelativity } from '../store/atomSlice';
import { defaultRelativityFor } from '../atom/relativity';
import { DEFAULT_ENCLOSED_FRACTION } from '../orbital_presets';
import { isLearningLevel, LearningLevel } from './levels';

/**
 * Whether this state already holds a value that only an Advanced control can
 * set: a combination in Orbitals, a charged or excited species or a non-
 * default relativity mode in Atoms, or an enclosed fraction off the 90%
 * default (any mode -- `frac` is a shared view key, url_state.ts's
 * encodeViewKeys/decodeViewKeys).
 */
function holdsAdvancedValue(state: RootState): boolean {
    if (state.atom.mode === 'hydrogenic' && state.orbital.combination.kind !== 'none') return true;
    if (state.atom.mode === 'atom') {
        const { atom } = state;
        if (atom.charge !== 0) return true;
        if (atom.excitation !== null) return true;
        if (effectiveRelativity(atom) !== defaultRelativityFor(atom.Z)) return true;
    }
    return state.orbital.enclosedFraction !== DEFAULT_ENCLOSED_FRACTION;
}

/**
 * Whether this state already holds a value only an Explore control can set: a Molecules representation other than
 * ball-and-stick. Final review I3: not the bond/angle labels -- they are the reader's own preference (`displayPref`,
 * never in a link, ruling P9), so they must not raise a link's level; below Explore the Display line's held-value
 * note says they are on, as it does for the other held preferences.
 */
function holdsExploreValue(state: RootState): boolean {
    return state.atom.mode === 'molecule' && state.molecule.representation !== 'ball-and-stick';
}

/**
 * The level this view's own state calls for -- independent of any stored
 * preference or visit level (spec plan): a value an Advanced/Explore-only
 * control set must stay visible, even to a viewer whose own level is lower.
 * applyLevelForHash floors a link's visit level at it (final review I1), and
 * Share's "Opens at" offers nothing below it.
 */
export function requiredLevel(state: RootState): LearningLevel {
    if (holdsAdvancedValue(state)) return 'advanced';
    if (holdsExploreValue(state)) return 'explore';
    return 'basics';
}

/** The `lvl` link key (never `level`, which Atoms' drill and Orbitals' field already own), read from a raw hash. */
export function readLevelParam(hash: string): LearningLevel | null {
    const raw = new URLSearchParams(hash.replace(/^#/, '')).get('lvl');
    return isLearningLevel(raw) ? raw : null;
}
