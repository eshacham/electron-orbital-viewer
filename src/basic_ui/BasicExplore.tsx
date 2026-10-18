import React, { useEffect, useRef } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { orbitalName, shellLetter } from '../orbital_names';
import { CombinationSelection, combinationTitle, selectionProblem } from '../combinations';
import CombinationControls from '../components/CombinationControls';
import { useRovingFocus } from '../shell/useRovingFocus';
import { BasicSelection } from '../store/orbitalSlice';
import './basic_explore.css';

/**
 * Spec §7's one-electron framing, said under the chips and in Help. Moved
 * here from `Controls.tsx` (Phase 6G-2 Task 6, ruling P3): Basic Orbitals'
 * whole selection moved to Explore, and this caption went with it. Still
 * exported -- `App.tsx`'s Help dialog quotes it too.
 */
export const BASIC_ORBITALS_ABOUT = 'One electron, Z = 1 — the exact solution, and the idealised shape every multi-electron orbital '
    + 'is a distortion of. Pick an element in Atom mode for a real, many-electron atom.';

export interface BasicExploreProps {
    selection: BasicSelection;
    /** Dispatches setBasicSelection, as App's old setN/setL/setMl did. */
    onChange(change: Partial<BasicSelection>): void;
    combination: CombinationSelection;
    onCombinationChange(selection: CombinationSelection): void;
}

const N_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Basic Orbitals' Explore panel (spec §9.2, ruling P3): the fixed Z = 1 tile,
 * the n / subshell / orbital chip rows that draw on selection (debounced by
 * `useDrawOnSelection` in App.tsx, not here), and the Combination picker.
 * Replaces the n/l/mₗ selects and the "Update Orbital" button that used to
 * live in `Controls.tsx`'s selection half.
 */
const BasicExplore: React.FC<BasicExploreProps> = ({ selection, onChange, combination, onCombinationChange }) => {
    const { n, l, ml } = selection;
    const combinationActive = combination.kind !== 'none';

    const lOptions = React.useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);
    const mlOptions = React.useMemo(() => Array.from({ length: 2 * l + 1 }, (_, i) => i - l), [l]);

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

    // §13: each row is one Tab stop, the arrow keys move within it. The
    // subshell and orbital rows' own contents depend on n and l, so their
    // hooks re-attach when those change (ruling DX2).
    const nRowRef = useRef<HTMLDivElement>(null);
    const subshellRowRef = useRef<HTMLDivElement>(null);
    const orbitalRowRef = useRef<HTMLDivElement>(null);
    useRovingFocus(nRowRef, { selector: '.basic-chip', orientation: 'horizontal' });
    useRovingFocus(subshellRowRef, { selector: '.basic-chip', orientation: 'horizontal' }, n);
    useRovingFocus(orbitalRowRef, { selector: '.basic-chip', orientation: 'horizontal' }, l);

    // Ruling R20b carry: while a combination is drawn the heading names it
    // instead (" — not drawn" when it has a problem -- spec §3.5, never a
    // silently wrong picture), and the three rows stay visible, disabled, so
    // the way back to a single orbital is obvious rather than a control that
    // vanished.
    const heading = combinationActive
        ? `${combinationTitle(combination)}${selectionProblem(combination) ? ' — not drawn' : ''}`
        : orbitalName(n, l, ml);

    return (
        <div className="basic-explore">
            <div className="basic-tile">
                <span className="basic-tile-z">Z = 1</span>
                <span className="basic-tile-symbol">H</span>
                <span className="basic-tile-name">Hydrogen-like</span>
            </div>
            <Typography variant="caption" className="basic-tile-caption" display="block">
                {BASIC_ORBITALS_ABOUT}
            </Typography>

            <Typography id="orbital-name" variant="h6" className="basic-heading">
                {heading}
            </Typography>

            <Box ref={nRowRef} role="group" aria-label="energy level (n)" className="basic-chip-row">
                {N_OPTIONS.map(value => (
                    <Chip
                        key={value}
                        className={`basic-chip${value === n ? ' selected' : ''}`}
                        label={`n = ${value}`}
                        aria-pressed={value === n}
                        disabled={combinationActive}
                        onClick={() => onChange({ n: value })}
                    />
                ))}
            </Box>

            <Box ref={subshellRowRef} role="group" aria-label="subshell (l)" className="basic-chip-row">
                {lOptions.map(value => (
                    <Chip
                        key={value}
                        className={`basic-chip${value === l ? ' selected' : ''}`}
                        label={`${n}${shellLetter(value)} subshell`}
                        aria-pressed={value === l}
                        disabled={combinationActive}
                        onClick={() => onChange({ l: value })}
                    />
                ))}
            </Box>

            <Box ref={orbitalRowRef} role="group" aria-label="orbital (mₗ)" className="basic-chip-row">
                {mlOptions.map(value => (
                    <Chip
                        key={value}
                        className={`basic-chip${value === ml ? ' selected' : ''}`}
                        label={`${orbitalName(n, l, value)} orbital`}
                        aria-pressed={value === ml}
                        disabled={combinationActive}
                        onClick={() => onChange({ ml: value })}
                    />
                ))}
            </Box>

            {/* Next to the chips (spec §5 Phase 1). While a combination is drawn the
                three rows stay in view, disabled, so the way back is obvious. */}
            <CombinationControls selection={combination} onChange={onCombinationChange} />
        </div>
    );
};

export default BasicExplore;
