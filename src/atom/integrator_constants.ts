/**
 * Numerical safeguards shared by the two radial integrators -- Numerov in
 * radial_solver.ts and the coupled RK4 pair in relativistic_solver.ts. They
 * belong to the integration, not to the eigenvalue search that drives it
 * (eigenvalue_search.ts), which never touches a wave function.
 */

// Outward integration can run into the classically forbidden region at low
// trial energies and blow up before the match point would have stopped it; a
// plain magnitude threshold with a periodic rescale keeps it finite without
// perturbing the node count or the match, since both are invariant under a
// uniform positive rescale of the whole array computed so far.
export const RESCALE_THRESHOLD = 1e100;
export const RESCALE_FACTOR = 1e-100;

// How far past the classical turning point Phase A's node count needs to look
// before it can trust what it has seen (see radial_solver's
// countNodesForBracketing).
export const DECAY_GROWTH_FACTOR = 1e6;
