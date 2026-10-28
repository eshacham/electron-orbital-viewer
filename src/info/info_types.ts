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
    'relativity', 'ionisation', 'bondOrder', 'potentialCurve', 'moDiagram', 'pointGroup', 'dipole', 'tier',
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
 * What Info says about the current selection. `plain` is read at every level, `technical` is added at Advanced,
 * and `computed` (method, references, validity) sits under "How this was computed", folded below Research.
 */
export interface InfoContent {
    title: React.ReactNode;
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
    computed?: React.ReactNode;
    /**
     * Task 9 (the screen-reader pass): a line said aloud whenever it changes, not shown -- Atoms' relativity readout,
     * which Task 6 took out of its live region. App speaks it from a polite region that is always mounted in the mode,
     * because Info itself is not mounted in the phone's other tabs or the folded drawer, where the switch is.
     */
    announce?: string | null;
}
