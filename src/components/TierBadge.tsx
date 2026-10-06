import React, { useId } from 'react';
import { Chip } from '@mui/material';
import type { MoleculeTier } from '../molecules/types';

export const TIER_TEXT: Record<MoleculeTier, { label: string; line: string }> = {
    validated: { label: 'Validated', line: 'Curated, and checked against published values.' },
    computed: { label: 'Computed', line: 'Computed on request by the same method; not benchmarked against experiment.' },
};

/**
 * Spec §9.1: which tier a molecule belongs to is always on screen with it,
 * never only inside a panel one has to open. `compact` (a phone; preflight
 * D13, ruling T16-c) is the chip alone: the second line pushed the legend
 * stack down over the molecule on a sideways phone. The line is still there
 * for a pointer (title) and is the note's description for a screen reader.
 */
const TierBadge: React.FC<{ tier: MoleculeTier; compact?: boolean }> = ({ tier, compact = false }) => {
    const lineId = useId();
    const { label, line } = TIER_TEXT[tier];
    const chip = <Chip size="small" label={label} color={tier === 'validated' ? 'success' : 'warning'} />;
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
