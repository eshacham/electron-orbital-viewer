import React from 'react';
import { atLeast, CONTROL_LEVEL, ControlId, hiddenValueNote, levelPointer, LearningLevel } from './levels';
import './levels.css';

/** A gated control's value that is off its default, named for the line: "Fe²⁺", "charge". */
export interface HeldValue {
    id: ControlId;
    /** What the picture shows because of it. */
    what: string;
    /** The controls it is set with, in "<control> controls appear at …". */
    control: string;
    /**
     * A one-press way back to the default while its control is hidden (final review; Ruling T2-I1 gave combinations
     * theirs): Atoms' held charge or excitation offers the neutral ground state.
     */
    action?: { label: string; onPress(): void };
}

interface LevelLineProps {
    level: LearningLevel;
    /** The gated controls this section would hold, in reading order. */
    ids: ControlId[];
    /**
     * Values held off their default, each by a control of this section (`ids`, or one it stands for: Excite
     * shares Charge's line); falsy entries are skipped, so callers can write `cond && {...}`.
     */
    held?: (HeldValue | null | false | undefined)[];
}

/**
 * The one quiet line under a section whose controls the level hides (Task 2):
 * where they appear -- or, while a hidden control still holds a value, what
 * the picture keeps showing because of it (ruling PF1), since lowering the
 * level never changes what is drawn (Review Focus 2). Nothing when nothing
 * is hidden.
 */
const LevelLine: React.FC<LevelLineProps> = ({ level, ids, held = [] }) => {
    const notes = held
        .filter((value): value is HeldValue => Boolean(value))
        .filter(value => !atLeast(level, CONTROL_LEVEL[value.id]))
        .map(value => ({ line: hiddenValueNote(value.what, value.control, CONTROL_LEVEL[value.id]), action: value.action }));
    const pointer = levelPointer(ids, level);
    const lines = notes.length > 0 ? notes : pointer ? [{ line: pointer, action: undefined }] : [];
    if (lines.length === 0) return null;
    return (
        <>
            {lines.map(({ line, action }) => (
                <p key={line} className="ql-caption level-line">
                    {action ? <span>{line}</span> : line}
                    {action && <>{' '}<button type="button" className="level-line-action" onClick={action.onPress}>{action.label}</button></>}
                </p>
            ))}
        </>
    );
};

export default LevelLine;
