import type { ValidationRow } from './references';
import { hybridLobeAngleDegrees } from '../hybrids';
import { polarizabilityFromDrawnPsi, transitionDipole2s2pz, HYDROGEN_POLARIZABILITY, VALIDATION_FIELD_AU } from '../stark';

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
    {
        phase: 1,
        quantity: 'static dipole polarisability α',
        system: 'H 1s',
        app: polarizabilityFromDrawnPsi(),
        reference: HYDROGEN_POLARIZABILITY,
        unit: 'a₀³',
        tolerancePercent: 1,
        referenceSource: 'exact (Dalgarno & Lewis 1955)',
        method: `first-order ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ sampled on the 129³ render grid; α = −⟨ψ|z|ψ⟩ / (F⟨ψ|ψ⟩) at F = ${VALIDATION_FIELD_AU} a.u.`,
    },
    {
        phase: 1,
        quantity: '|⟨2s|z|2p_z⟩|',
        system: 'H n = 2',
        app: Math.abs(transitionDipole2s2pz()),
        reference: 3,
        unit: 'a₀',
        tolerancePercent: 1,
        referenceSource: 'exact hydrogen matrix element (Bethe & Salpeter 1957)',
        method: 'quadrature of 2s · z · 2p_z on the 129³ render grid (box 21 a₀)',
    },
];
