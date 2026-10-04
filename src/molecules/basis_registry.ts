import type { MoleculeBasis } from './types';

/**
 * Bases the current worker can evaluate. A recipe carries only a molecule id
 * (spec §4.1: recipes are small and serialisable); the request that carries
 * the recipe also carries the basis (FieldRenderRequest.bases, plain JSON
 * that survives a structured clone), and the worker registers it here before
 * rebuilding any evaluator. A basis id names one geometry ('n2@07'), so a
 * re-registered id is the same data and simply replaces the old entry.
 */
const registry = new Map<string, MoleculeBasis>();

export function registerMoleculeBasis(basis: MoleculeBasis): void {
    registry.set(basis.id, basis);
}

export function registeredBasis(id: string): MoleculeBasis {
    const basis = registry.get(id);
    if (!basis) throw new Error(`No basis registered for ${id}; the render request must carry it`);
    return basis;
}
