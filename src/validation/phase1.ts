import type { ValidationRow } from './references';
import { hybridLobeAngleDegrees } from '../hybrids';

/**
 * Phase 1 rows. Each `app` is computed here by the function its physics test
 * calls, so the table and the tests cannot disagree.
 */
export const TETRAHEDRAL_ANGLE_DEGREES = (Math.acos(-1 / 3) * 180) / Math.PI;

export const PHASE_1_ROWS: ValidationRow[] = [
    {
        phase: 1,
        quantity: 'inter-lobe angle',
        system: 'sp³ hybrids (H, n = 2)',
        app: hybridLobeAngleDegrees('sp3', 0, 1),
        reference: TETRAHEDRAL_ANGLE_DEGREES,
        unit: '°',
        // ±0.5° (spec §5 Phase 1) as a share of 109.47°.
        tolerancePercent: 0.456,
        referenceSource: 'tetrahedral geometry, arccos(−1/3)',
        method: 'density-weighted centroid of each hybrid\'s positive lobe, sampled on the 129³ render grid',
    },
];
