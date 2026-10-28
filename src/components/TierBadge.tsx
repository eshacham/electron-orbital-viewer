import React, { useId } from 'react';
import { Chip } from '@mui/material';
import { tierOf, type MoleculeTier } from '../molecules/types';
import { tierLine, TIER_LABEL, validatedLine } from '../validation/geometry_honesty';
import InfoButton from '../info/InfoButton';

// Task 7b fix round 1: the tier's name and line are worded in validation/geometry_honesty.ts (Info says the line on a
// phone); still exported from here for the callers that read them beside the badge.
export { COMPUTED_LINE, TIER_LABEL, tierLine } from '../validation/geometry_honesty';

type BadgeMeta = Parameters<typeof validatedLine>[0] & { tier?: MoleculeTier };

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
    // Final review M3: the tier's chip and line are where "data tier" is on screen, so its (i) sits at their end. A
    // phone's compact chip has none: there Info's last note says the line, and carries the (i) (moleculeInfo).
    return (
        <div className={`tier-badge tier-${tier}`} role="note" aria-label="data tier">
            {chip}
            <span className="tier-badge-line">{line}</span>
            <InfoButton topic="tier" label="Data tier" place="badge" />
        </div>
    );
};

export default TierBadge;
