import React, { useEffect, useId, useRef } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { OrbitalLabel } from '../format/OrbitalLabel';
import InfoButton from '../info/InfoButton';
import type { InfoTopicId } from '../info/info_types';
import { CombinationSelection, selectionProblem } from '../combinations';
import { combinationTitleNode } from '../info/basic_info';
import CombinationControls from '../components/CombinationControls';
import { useRovingFocus } from '../shell/useRovingFocus';
import { BasicSelection } from '../store/orbitalSlice';
import { atLeast, CONTROL_LEVEL, LearningLevel } from '../levels/levels';
import LevelLine from '../levels/LevelLine';
import './basic_explore.css';

export interface BasicExploreProps {
    selection: BasicSelection;
    /** Dispatches setBasicSelection, as App's old setN/setL/setMl did. The row's own correction effects use it. */
    onChange(change: Partial<BasicSelection>): void;
    /**
     * A chip pressed (ruling T2-I1, extended by ruling T1 M2): leaves a held combination, then selects -- at
     * every level, the same as a strip pick. Defaults to `onChange`.
     */
    onPick?(change: Partial<BasicSelection>): void;
    combination: CombinationSelection;
    onCombinationChange(selection: CombinationSelection): void;
    /** Task 2: the learning level in use -- the Combination picker appears at Advanced. Omitted, everything shows. */
    level?: LearningLevel;
}

const N_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Basic Orbitals' Explore panel (spec §9.2, ruling P3): the fixed Z = 1 tile,
 * the Shell n chip row that draws on selection (debounced by
 * `useDrawOnSelection` in App.tsx, not here), and the Combination picker.
 * Task 1 (picture control): the Subshell l and Orbital mₗ rows that used to sit
 * beside it are gone -- the thumbnail strip under the picture (App.tsx's
 * basicStrip) is the picker for those now, covering every orbital of the
 * chosen shell. Replaces the n/l/mₗ selects and the "Update Orbital" button
 * that used to live in `Controls.tsx`'s selection half.
 */
const BasicExplore: React.FC<BasicExploreProps> = ({ selection, onChange, onPick = onChange, combination, onCombinationChange, level = 'research' }) => {
    const { n, l, ml } = selection;
    const combinationActive = combination.kind !== 'none';
    // Ruling T1 M2: the n chips stay enabled at every level, combination or not -- a press is always a way back
    // to one orbital (App's onPick leaves the combination first), the same as a strip pick. They used to wait,
    // disabled, at Advanced+ (ruling T2-I1); two pickers with different rules would confuse readers.

    // The Controls-style correction (pre-T6 `Controls.tsx` lines 395-402),
    // moved here: a new n or l can leave l or mₗ out of range (e.g. n drops
    // from 5 to 3 while l was 4). Two effects, each watching only what can
    // invalidate it. The l branch resets mₗ in the same dispatch -- unlike
    // the old two-select panel, which reset l and waited a round trip
    // through Redux before a second effect could see the corrected l and
    // reset mₗ in turn.
    useEffect(() => {
        if (l >= n) onChange({ l: 0, ml: 0 });
    }, [n, l, onChange]);

    useEffect(() => {
        if (l < n && Math.abs(ml) > l) onChange({ ml: 0 });
    }, [n, l, ml, onChange]);

    // §13: the row is one Tab stop, the arrow keys move within it.
    const nRowRef = useRef<HTMLDivElement>(null);
    useRovingFocus(nRowRef, { selector: '.basic-chip', orientation: 'horizontal' });

    // Ruling R20b carry: while a combination is drawn the heading names it
    // instead (" — not drawn" when it has a problem -- spec §3.5, never a
    // silently wrong picture), and the row stays visible and live (ruling T1 M2), so
    // the way back to a single orbital is a press away, not a control that
    // vanished. Task 1 (picture control): the Subshell and Orbital rows are gone -- the strip
    // under the picture is the picker for l and mₗ now (App.tsx's basicStrip/handleBasicPick).
    // Review I1: the combination's name is the node Info's title uses, typeset (2p<sub>z</sub>), never "2p_z".
    const heading = combinationActive
        ? <>{combinationTitleNode(combination)}{selectionProblem(combination) ? ' — not drawn' : ''}</>
        : <OrbitalLabel n={n} l={l} ml={ml} />;

    // Task 5 (critique P2): each row has a visible label that names its group, and an (i) beside it for the term. The
    // quantum number is italic, as physics sets it -- which also keeps "l" from reading as a capital I.
    const rowId = useId();
    const rowLabel = (key: string, label: React.ReactNode, topic: InfoTopicId, term: string) => (
        <div className="basic-row-head">
            <span id={`${rowId}-${key}`} className="basic-row-label">{label}</span>
            <InfoButton topic={topic} label={term} />
        </div>
    );

    return (
        <div className="basic-explore">
            <div className="basic-tile">
                <span className="basic-tile-z">Z = 1</span>
                <span className="basic-tile-symbol">H</span>
                <span className="basic-tile-name">Hydrogen-like</span>
            </div>
            {/* Task 5: the one-electron caption that stood here is Info's now (basicInfo). */}

            <Typography id="orbital-name" variant="h6" className="basic-heading">
                {heading}
            </Typography>

            {rowLabel('n', <>Shell <i>n</i></>, 'shell', 'Shell')}
            <Box ref={nRowRef} role="group" aria-labelledby={`${rowId}-n`} className="basic-chip-row">
                {N_OPTIONS.map(value => (
                    <Chip
                        key={value}
                        className={`basic-chip${value === n ? ' selected' : ''}`}
                        label={`n = ${value}`}
                        aria-pressed={value === n}
                        onClick={() => onPick({ n: value })}
                    />
                ))}
            </Box>

            {/* Next to the chip (spec §5 Phase 1). While a combination is drawn the chip
                row stays in view and live (ruling T1 M2), so the way back is a press away.
                Task 2: from Advanced; below it, one line says so -- or, while a link's
                combination is still drawn, that it is (Review Focus 2). */}
            {atLeast(level, CONTROL_LEVEL.combinations) && <CombinationControls selection={combination} onChange={onCombinationChange} />}
            <LevelLine level={level} ids={['combinations']} held={[combinationActive && {
                id: 'combinations', control: 'combination',
                what: combination.kind === 'hybrid' ? 'hybrid orbitals' : 'an orbital in an electric field',
            }]} />
        </div>
    );
};

export default BasicExplore;
