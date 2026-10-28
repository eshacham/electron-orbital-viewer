import { listOf } from '../format/text';

/**
 * The four points along which a feature becomes visible, or an answer goes
 * deeper (spec plan, learning levels). Order matters: it is both the reading
 * order of the level switch and the rank `atLeast`/`levelRank` compare on.
 */
export type LearningLevel = 'basics' | 'explore' | 'advanced' | 'research';

export const LEVELS: readonly LearningLevel[] = ['basics', 'explore', 'advanced', 'research'];

export const LEVEL_LABEL: Record<LearningLevel, string> = {
    basics: 'Basics',
    explore: 'Explore',
    advanced: 'Advanced',
    research: 'Research',
};

export function isLearningLevel(value: unknown): value is LearningLevel {
    return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export function levelRank(level: LearningLevel): 0 | 1 | 2 | 3 {
    return LEVELS.indexOf(level) as 0 | 1 | 2 | 3;
}

/** Whether `level` is deep enough for `min` -- inclusive, so a control's own level always passes. */
export function atLeast(level: LearningLevel, min: LearningLevel): boolean {
    return levelRank(level) >= levelRank(min);
}

/**
 * Every control this plan gates, named by what it is rather than where it
 * lives (Task 2 maps each id to its render sites). Picking an orbital,
 * drilling down, the thumbnail strip, opacity, cut away and Share are
 * ungated, so they carry no id here.
 */
export type ControlId =
    | 'plot' | 'structure' | 'bondLabels' | 'dipole' | 'orbitalEnergies' | 'properties' | 'axes'
    | 'charge' | 'excite' | 'relativity' | 'combinations' | 'enclosed' | 'allOrbitals' | 'exports'
    | 'advancedAppearance' | 'surfaceStyle' | 'requestWorkspace';

/** The level at which each control first appears (spec plan's level table). */
export const CONTROL_LEVEL: Record<ControlId, LearningLevel> = {
    plot: 'explore',
    structure: 'explore',
    bondLabels: 'explore',
    dipole: 'explore',
    orbitalEnergies: 'explore',
    properties: 'explore',
    axes: 'explore',
    charge: 'advanced',
    excite: 'advanced',
    relativity: 'advanced',
    combinations: 'advanced',
    enclosed: 'advanced',
    allOrbitals: 'advanced',
    exports: 'advanced',
    advancedAppearance: 'advanced',
    surfaceStyle: 'advanced',
    requestWorkspace: 'research',
};

/**
 * Task 6: the level from which Info's ΔSCF energies and the NIST comparison appear -- with Charge and Excite (the spec's
 * Advanced row; Task 9b removed the panel's energy line). Fix round 1 ruling: a neutral atom's own IE value shows in
 * Info from Explore, as a key number.
 */
export const IE_LEVEL: LearningLevel = 'advanced';

/** How a pointer sentence names each control -- lower case; a sentence capitalises the first word. */
const CONTROL_NAME: Record<ControlId, string> = {
    plot: 'the plot',
    structure: 'structure',
    bondLabels: 'bond labels',
    dipole: 'the dipole arrow',
    orbitalEnergies: 'orbital energies',
    properties: 'properties',
    axes: 'axes',
    charge: 'charge',
    excite: 'excitation',
    relativity: 'relativity',
    combinations: 'combinations',
    enclosed: 'the enclosed fraction',
    allOrbitals: 'all orbitals',
    exports: 'exports',
    advancedAppearance: 'advanced appearance',
    surfaceStyle: 'surface style',
    requestWorkspace: 'molecule requests',
};

/** Names that take a plural verb on their own: "Orbital energies appear", not "appears". */
const PLURAL_NAME: ReadonlySet<ControlId> = new Set<ControlId>([
    'bondLabels', 'orbitalEnergies', 'properties', 'axes', 'combinations', 'allOrbitals', 'exports', 'requestWorkspace',
]);

/**
 * The sentence pointing at the next controls `level` still hides among `ids`
 * -- those that appear at the nearest deeper level, named with it, e.g.
 * "Charge and relativity appear at Advanced". Only the nearest level's: a
 * line saying "Axes and surface style appear at Advanced" would be wrong about
 * the axes, which appear at Explore (Task 2: one step away, one line). Null
 * when none of `ids` is hidden at `level`.
 */
export function levelPointer(ids: ControlId[], level: LearningLevel): string | null {
    const hidden = ids.filter(id => !atLeast(level, CONTROL_LEVEL[id]));
    if (hidden.length === 0) return null;
    const nextLevel = hidden.reduce<LearningLevel>(
        (min, id) => (levelRank(CONTROL_LEVEL[id]) < levelRank(min) ? CONTROL_LEVEL[id] : min),
        CONTROL_LEVEL[hidden[0]],
    );
    const named = hidden.filter(id => CONTROL_LEVEL[id] === nextLevel);
    const joined = listOf(named.map(id => CONTROL_NAME[id]));
    const sentence = joined.charAt(0).toUpperCase() + joined.slice(1);
    const verb = named.length === 1 && !PLURAL_NAME.has(named[0]) ? 'appears' : 'appear';
    return `${sentence} ${verb} at ${LEVEL_LABEL[nextLevel]}`;
}

/**
 * Ruling PF1: the line for a hidden control that still holds a value off its
 * default -- lowering the level never changes what is drawn (Review Focus 2),
 * so the picture keeps it and this says why, and where its control is:
 * "Showing Fe²⁺ — charge controls appear at Advanced".
 */
export function hiddenValueNote(what: string, control: string, level: LearningLevel): string {
    return `Showing ${what} — ${control} controls appear at ${LEVEL_LABEL[level]}`;
}
