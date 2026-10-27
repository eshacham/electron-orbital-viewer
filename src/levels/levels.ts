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

/** How a pointer sentence names each control -- lower case; a sentence capitalises the first word. */
const CONTROL_NAME: Record<ControlId, string> = {
    plot: 'the plot',
    structure: 'structure',
    bondLabels: 'bond labels',
    dipole: 'dipole',
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
    requestWorkspace: 'workspace requests',
};

function joinNames(names: string[]): string {
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The sentence pointing at what `level` still hides among `ids`, naming the
 * level where the deepest of them appears -- e.g. "Charge and relativity
 * appear at Advanced". Null when none of `ids` is hidden at `level`.
 */
export function levelPointer(ids: ControlId[], level: LearningLevel): string | null {
    const hidden = ids.filter(id => !atLeast(level, CONTROL_LEVEL[id]));
    if (hidden.length === 0) return null;
    const joined = joinNames(hidden.map(id => CONTROL_NAME[id]));
    const sentence = joined.charAt(0).toUpperCase() + joined.slice(1);
    const verb = hidden.length === 1 ? 'appears' : 'appear';
    const neededLevel = hidden.reduce<LearningLevel>(
        (max, id) => (levelRank(CONTROL_LEVEL[id]) > levelRank(max) ? CONTROL_LEVEL[id] : max),
        CONTROL_LEVEL[hidden[0]],
    );
    return `${sentence} ${verb} at ${LEVEL_LABEL[neededLevel]}`;
}
