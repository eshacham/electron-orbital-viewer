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

/** One key fact about the selection: a short label and its value with units. Shown from `min` (default: every level). */
export interface InfoFact {
    label: string;
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
    technical?: React.ReactNode;
    facts?: InfoFact[];
    computed?: React.ReactNode;
}
