import React, { useId } from 'react';
import { Chip } from '@mui/material';
import { tierOf, type MoleculeTier } from '../molecules/types';
import { validatedLine } from '../validation/geometry_honesty';

export const TIER_LABEL: Record<MoleculeTier, string> = { validated: 'Validated', computed: 'Computed' };
export const COMPUTED_LINE = 'Computed on request by the same method; not benchmarked against experiment.';

type BadgeMeta = Parameters<typeof validatedLine>[0] & { tier?: MoleculeTier };

/** The badge's second line: a computed molecule's is fixed; a library molecule's says what its own
 * references check (final review I2), never a claim the data do not carry. */
export function tierLine(meta: BadgeMeta): string {
    return tierOf(meta) === 'computed' ? COMPUTED_LINE : validatedLine(meta);
}

/**
 * Spec §9.1: which tier a molecule belongs to is always on screen with it,
 * never only inside a panel one has to open. `compact` (a phone; preflight
 * D13, ruling T16-c) is the chip alone: the second line pushed the legend
 * stack down over the molecule on a sideways phone. The line is still there
 * for a pointer (title) and is the note's description for a screen reader.
 */
const TierBadge: React.FC<{ meta: BadgeMeta; compact?: boolean }> = ({ meta, compact = false }) => {
    const lineId = useId();
    const tier = tierOf(meta);
    const label = TIER_LABEL[tier];
    const line = tierLine(meta);
    // V1: the computed chip's amber is declared in style.css (.tier-chip-computed), where its contrast is tested.
    const chip = tier === 'validated'
        ? <Chip size="small" label={label} color="success" />
        : <Chip size="small" label={label} className="tier-chip-computed" />;
    if (compact) {
        return (
            <div className={`tier-badge tier-${tier} compact`} role="note" aria-label="data tier" title={line} aria-describedby={lineId}>
                {chip}
                <span id={lineId} className="visually-hidden">{line}</span>
            </div>
        );
    }
    return (
        <div className={`tier-badge tier-${tier}`} role="note" aria-label="data tier">
            {chip}
            <span className="tier-badge-line">{line}</span>
        </div>
    );
};

export default TierBadge;
