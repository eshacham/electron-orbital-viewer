/**
 * The Info section's shapes (plan Task 4). Each mode's builder (Tasks 5-7: `basicInfo`, `atomInfo`, `bondsInfo`,
 * `moleculeInfo` -- ruling PF3: they take no topic) returns an `InfoContent` for the current selection; an (i) beside
 * a term switches Info to that term's glossary entry (`InfoTopicId`) until the selection changes.
 */
import type React from 'react';
import type { LearningLevel } from '../levels/levels';

/** Every term an (i) can open, in the order the glossary is written. */
export const INFO_TOPIC_IDS = [
    'shell', 'subshell', 'orbital', 'enclosed', 'node', 'phase', 'density', 'esp', 'homoLumo', 'kohnSham',
    'energyLevels', 'relativity', 'ionisation', 'bondOrder', 'potentialCurve', 'moDiagram', 'pointGroup', 'dipole', 'tier',
    'hybrid', 'field',
] as const;

export type InfoTopicId = typeof INFO_TOPIC_IDS[number];

/**
 * One key fact about the selection: a short label and its value with units. Shown from `min` (default: every level).
 * The label may carry markup -- an italic quantum number, so "Subshell l" never reads "Subshell I" (Task 5).
 */
export interface InfoFact {
    label: React.ReactNode;
    value: React.ReactNode;
    min?: LearningLevel;
}

/**
 * "How this was computed", grouped (panel fixes, owner review 2026-11-02): the builder's own sentences, filed by meaning
 * and never reworded. `method` is how it was computed (the theory or solver, basis, functional, grid, geometry source);
 * `limits` what qualifies it (validity ranges, approximations stated as caveats, warnings -- a sentence that is both
 * method and caveat is a limit); `sources` what it cites or links (references, external data). A builder leaves out a
 * part it has nothing for, and Info gives that part no heading.
 */
export interface ComputedParts {
    method: React.ReactNode;
    limits?: React.ReactNode;
    sources?: React.ReactNode;
}

/**
 * What Info says about the current selection. `plain` is read at every level, `technical` is added at Advanced,
 * and `computed` (method, limits, sources) sits under "How this was computed", folded below Research.
 */
export interface InfoContent {
    /** The specimen, as the canvas title names it: "Carbon", "Hydrogen", "Nitrogen (N₂)", "Water (H₂O)". */
    title: React.ReactNode;
    /**
     * Owner, 2026-11-02 (Hallmark audit): the view of the specimen, the title's second line ("whole atom", "3d<sub>z²</sub>
     * orbital", "electron density") -- the same split as the canvas title block, so the two say it the same way. Info
     * reads the two as "<title>, <view>".
     */
    view?: React.ReactNode;
    /**
     * Final review M3: a term the title (or its view line) names, whose (i) sits beside it -- a density view's
     * "electron density", the only place the term is on screen in Info.
     */
    titleTopic?: { topic: InfoTopicId; label: string };
    plain: React.ReactNode;
    /** One paragraph, or (Task 6 fix round 1, M7) a list of short paragraphs, one idea each. */
    technical?: React.ReactNode | React.ReactNode[];
    facts?: InfoFact[];
    /**
     * Task 7b: short notes read at every level, after the facts -- what qualifies the numbers or the picture (Molecules'
     * Kohn–Sham caveat, what the sticks show, the arrow's convention), kept out of `plain` so the facts stay above
     * Info's fold. A builder decides by level which notes concern what the level shows. Fix round 1 (I6): a list, one
     * idea a paragraph, never one wall (ruling T6-M7's rule for `technical`).
     */
    notes?: React.ReactNode[];
    computed?: ComputedParts;
    /**
     * Task 9 (the screen-reader pass): a line said aloud when it changes, not shown -- Atoms' relativity, "Relativity:
     * scalar relativistic", which Task 6 took out of its live region. App speaks it from a polite region that is always
     * mounted in the mode (Info itself is not mounted in the phone's other tabs or the folded drawer, where the switch
     * is), and only when it changes for the same species (fix round 1: a new element's own default is not a change).
     */
    announce?: string | null;
    /**
     * Task 9 fix round 1: a stand-in while the selection loads (a molecule named from the index before its meta lands).
     * Info never announces it; the real content that follows is announced once, so a load is heard once.
     */
    provisional?: boolean;
}
