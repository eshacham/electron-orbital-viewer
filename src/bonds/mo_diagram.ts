import { MoleculeOrbitalInfo, OrbitalSpin } from '../molecules/types';
import { H2PLUS_LABELS, H2PLUS_STATES, h2plusElectronicEnergy } from './h2plus';

export interface DiagramBox { orbitalIndex: number; up: boolean; down: boolean }
export interface DiagramLevel { label: string; spin: OrbitalSpin; energyHartree: number; boxes: DiagramBox[]; core: boolean }
export interface MoDiagramModel { levels: DiagramLevel[]; unrestricted: boolean }

/** A gap this wide separates the 1s cores from the valence levels drawn to scale. */
const CORE_GAP_HARTREE = 1;

function groupByLabel(orbitals: MoleculeOrbitalInfo[]): Map<string, MoleculeOrbitalInfo[]> {
    const groups = new Map<string, MoleculeOrbitalInfo[]>();
    for (const orbital of [...orbitals].sort((a, b) => a.index - b.index)) {
        groups.set(orbital.label, [...(groups.get(orbital.label) ?? []), orbital]);
    }
    return groups;
}

/**
 * Levels of the textbook diagram. Restricted: one level per label, a box per
 * degenerate partner, ↑↓ from its occupation. Unrestricted (O₂, B₂): levels
 * at α energies, ↑ from the α orbital and ↓ from the same-labelled β one, so
 * the unpaired electrons show as boxes with an up arrow alone.
 */
export function buildMoDiagram(orbitals: MoleculeOrbitalInfo[]): MoDiagramModel {
    const unrestricted = orbitals.some(o => o.spin === 'alpha' || o.spin === 'beta');
    const levels: DiagramLevel[] = [];
    if (!unrestricted) {
        for (const [label, group] of groupByLabel(orbitals)) {
            levels.push({
                label, spin: 'restricted', energyHartree: group[0].energyHartree, core: false,
                boxes: group.map(o => ({ orbitalIndex: o.index, up: o.occupation >= 1, down: o.occupation >= 2 })),
            });
        }
    } else {
        const alpha = groupByLabel(orbitals.filter(o => o.spin === 'alpha'));
        const beta = groupByLabel(orbitals.filter(o => o.spin === 'beta'));
        for (const [label, group] of alpha) {
            const partners = beta.get(label) ?? [];
            levels.push({
                label, spin: 'alpha', energyHartree: group[0].energyHartree, core: false,
                boxes: group.map((o, i) => ({ orbitalIndex: o.index, up: o.occupation > 0, down: (partners[i]?.occupation ?? 0) > 0 })),
            });
        }
        for (const [label, group] of beta) {
            if (alpha.has(label)) continue;
            levels.push({
                label, spin: 'beta', energyHartree: group[0].energyHartree, core: false,
                boxes: group.map(o => ({ orbitalIndex: o.index, up: false, down: o.occupation > 0 })),
            });
        }
    }
    levels.sort((a, b) => a.energyHartree - b.energyHartree);
    let widest = 0;
    let split = 0;
    for (let i = 1; i < levels.length; i++) {
        const gap = levels[i].energyHartree - levels[i - 1].energyHartree;
        if (gap > widest) { widest = gap; split = i; }
    }
    if (widest > CORE_GAP_HARTREE) levels.slice(0, split).forEach(level => { level.core = true; });
    return { levels, unrestricted };
}

export function bondOrderText(order: number | null | undefined): string {
    if (order === null || order === undefined) return 'Bond order is not defined by g/u counting for a heteronuclear molecule.';
    if (order === 0) return 'Bond order 0 — no bond: the antibonding electrons cancel the bonding ones.';
    return `Bond order ${Number.isInteger(order) ? order : `${Math.floor(order) || ''}½`}`;
}

/** H₂⁺'s one electron: each level's energy is the exact E_el of that state, a Born–Oppenheimer eigenvalue, not a Kohn–Sham one. */
export function h2plusOrbitals(R: number): MoleculeOrbitalInfo[] {
    return H2PLUS_STATES.map((state, index) => ({
        index, label: H2PLUS_LABELS[state], energyHartree: h2plusElectronicEnergy(R, state),
        occupation: index === 0 ? 1 : 0, spin: 'restricted' as const,
    }));
}
