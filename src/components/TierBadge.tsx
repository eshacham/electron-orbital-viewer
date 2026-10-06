import React from 'react';
import { Chip } from '@mui/material';
import type { MoleculeTier } from '../molecules/types';

export const TIER_TEXT: Record<MoleculeTier, { label: string; line: string }> = {
    validated: { label: 'Validated', line: 'Curated, and checked against published values.' },
    computed: { label: 'Computed', line: 'Computed on request by the same method; not benchmarked against experiment.' },
};

/** Spec §9.1: which tier a molecule belongs to is always on screen with it, never only inside a panel one has to open. */
const TierBadge: React.FC<{ tier: MoleculeTier }> = ({ tier }) => (
    <div className={`tier-badge tier-${tier}`} role="note" aria-label="data tier">
        <Chip size="small" label={TIER_TEXT[tier].label} color={tier === 'validated' ? 'success' : 'warning'} />
        <span className="tier-badge-line">{TIER_TEXT[tier].line}</span>
    </div>
);

export default TierBadge;
