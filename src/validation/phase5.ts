import type { ValidationRow } from './references';
import { h2plusElectronicEnergy, h2plusEquilibrium } from '../bonds/h2plus';
import diatomics from './generated/phase5_diatomics.json';

/**
 * Bonds mode. H₂⁺'s `app` values are computed here by the solver the app
 * draws with (~0.1 s at import); the diatomics' come from
 * tools/molecules/generate.py, which wrote them from the committed scans.
 */
const H2PLUS_METHOD = 'exact (Born–Oppenheimer), prolate spheroidal separation';
const WIND = 'Wind, J. Chem. Phys. 42, 2371 (1965)';
const equilibrium = h2plusEquilibrium();

export const PHASE_5_ROWS: ValidationRow[] = [
    { phase: 5, quantity: 'E_el(1σg, R = 2 a₀)', system: 'H₂⁺', app: h2plusElectronicEnergy(2, '1sigma_g'), reference: -1.1026342145, unit: 'Ha', tolerancePercent: 1e-6, referenceSource: 'Bates, Ledsham & Stewart, Phil. Trans. R. Soc. A 246, 215 (1953)', method: H2PLUS_METHOD },
    { phase: 5, quantity: 'R_e', system: 'H₂⁺', app: equilibrium.R, reference: 1.997, unit: 'a₀', tolerancePercent: 0.5, referenceSource: WIND, method: H2PLUS_METHOD },
    { phase: 5, quantity: 'E(R_e)', system: 'H₂⁺', app: equilibrium.totalEnergy, reference: -0.6026, unit: 'Ha', tolerancePercent: 0.1, referenceSource: WIND, method: H2PLUS_METHOD },
    ...(diatomics as Array<Omit<ValidationRow, 'phase'>>).map(row => ({ phase: 5, ...row })),
];
