import { MoleculeOrbitalInfo, OrbitalSpin } from '../molecules/types';
import { H2PLUS_LABELS, H2PLUS_STATES, h2plusElectronicEnergy } from './h2plus';

export interface DiagramBox { orbitalIndex: number; up: boolean; down: boolean }
export interface DiagramLevel { label: string; spin: OrbitalSpin; energyHartree: number; boxes: DiagramBox[]; core: boolean }
/**
 * A pair of valence labels whose β energies run in the opposite order to
 * their α ones: `lower` lies below `upper` in β, above it in α (where the
 * diagram draws them). `occupied`: both hold a β electron, so ionisation
 * from either is what a photoelectron spectrum measures.
 */
export interface SpinOrderSwap { lower: string; upper: string; occupied: boolean }
export interface MoDiagramModel { levels: DiagramLevel[]; unrestricted: boolean; betaOrderSwaps: SpinOrderSwap[] }

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
    return { levels, unrestricted, betaOrderSwaps: unrestricted ? betaOrderSwaps(orbitals, levels) : [] };
}

/**
 * Every pair of valence levels the α-energy diagram draws in one order and β
 * puts in the other. O₂ (v1, B3LYP): α has 1πu (−0.573 Ha) below 3σg
 * (−0.559); β has 3σg (−0.521) below 1πu (−0.470), the order the
 * photoelectron spectrum shows. Cores are skipped: they sit side by side in
 * the band under the break, not in energy order, and their α/β order is
 * millihartree noise.
 */
function betaOrderSwaps(orbitals: MoleculeOrbitalInfo[], levels: DiagramLevel[]): SpinOrderSwap[] {
    const beta = groupByLabel(orbitals.filter(o => o.spin === 'beta'));
    const drawn = levels.filter(level => level.spin === 'alpha' && !level.core && beta.has(level.label));
    const swaps: SpinOrderSwap[] = [];
    drawn.forEach((below, i) => {
        for (const above of drawn.slice(i + 1)) {
            const betaBelow = beta.get(below.label)!;
            const betaAbove = beta.get(above.label)!;
            if (above.energyHartree > below.energyHartree && betaAbove[0].energyHartree < betaBelow[0].energyHartree) {
                const occupied = [betaBelow, betaAbove].every(group => group.some(o => o.occupation > 0));
                swaps.push({ lower: above.label, upper: below.label, occupied });
            }
        }
    });
    return swaps;
}

/**
 * The note under an unrestricted diagram: which energies it draws and, when
 * β orders the same labels differently, which pairs swap (final review I1:
 * O₂'s α order hid the textbook 3σg-below-1πu). Photoelectron spectra are
 * cited only when every swapped β level is occupied; B₂'s swapped β pair is
 * empty, and a spectrum ionises only occupied levels. Null when restricted.
 */
export function spinOrderNote(model: MoDiagramModel): string | null {
    if (!model.unrestricted) return null;
    const swaps = model.betaOrderSwaps;
    if (swaps.length === 0) return 'Levels drawn at α energies; ↓ marks the matching β orbital.';
    const pairs = swaps.map(swap => `${swap.lower} lies below ${swap.upper}`).join(' and ');
    const where = swaps.every(swap => swap.occupied) ? 'in β — and in photoelectron spectra —' : 'in β,';
    return `Levels drawn at α energies; ${where} ${pairs}. ↓ marks the matching β orbital.`;
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
