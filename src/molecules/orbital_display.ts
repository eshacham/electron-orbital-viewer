export const HARTREE_TO_EV = 27.211386;
const signed = (v: number, digits: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

export function formatOrbitalEnergy(energyHartree: number): string {
    return `${signed(energyHartree, 3)} Ha (${signed(energyHartree * HARTREE_TO_EV, 2)} eV)`;
}

/** Size of each orbital's degenerate set (|ΔE| below tol, chained through energy order), keyed by orbital index. */
export function degeneracyCounts(orbitals: Array<{ index: number; energyHartree: number }>, tol = 1e-4): Map<number, number> {
    const sorted = [...orbitals].sort((a, b) => a.energyHartree - b.energyHartree);
    const counts = new Map<number, number>();
    let start = 0;
    for (let i = 1; i <= sorted.length; i++) {
        if (i === sorted.length || sorted[i].energyHartree - sorted[i - 1].energyHartree >= tol) {
            for (let j = start; j < i; j++) counts.set(sorted[j].index, i - start);
            start = i;
        }
    }
    return counts;
}

/**
 * PySCF names the two linear point groups with their ASCII typable spelling
 * (Dooh/Coov, "oo" standing in for ∞); the UI shows the conventional
 * D∞h/C∞v wherever a point group is displayed (D34). Every other group name
 * passes through unchanged.
 */
const INFINITE_GROUPS: Record<string, string> = { Dooh: 'D∞h', Coov: 'C∞v' };
export function formatPointGroup(group: string): string {
    return INFINITE_GROUPS[group] ?? group;
}
