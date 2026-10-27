import { MoleculeMeta, MoleculeOrbitalInfo, OrbitalSpin } from '../molecules/types';
import { H2PLUS_LABELS, H2PLUS_STATES, h2plusElectronicEnergy } from './h2plus';
import { BondsSystemId, TEXTBOOK_BOND_ORDER } from './systems';

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

/**
 * (bonding − antibonding)/2 over a molecule's MO occupations (ruling R23e;
 * MoleculeMeta.bondOrder's own doc comment, types.ts). Only a homonuclear
 * molecule's labels carry the antibonding star (g/u symmetry splits bonding
 * from antibonding there); a heteronuclear one's σ/π labels carry no such
 * mark, so there is nothing to sum by -- this returns null, and the caller
 * falls back to a textbook value (systems.ts' TEXTBOOK_BOND_ORDER).
 */
export function bondOrderFromOrbitals(orbitals: readonly Pick<MoleculeOrbitalInfo, 'label' | 'occupation'>[]): number | null {
    if (orbitals.length === 0 || !orbitals.some(o => o.label.includes('*'))) return null;
    let bonding = 0;
    let antibonding = 0;
    for (const orbital of orbitals) {
        if (orbital.label.includes('*')) antibonding += orbital.occupation;
        else bonding += orbital.occupation;
    }
    return (bonding - antibonding) / 2;
}

/** A bond order as a number: "3", "½", "1½". */
export function formatBondOrderNumber(order: number): string {
    return Number.isInteger(order) ? String(order) : `${Math.floor(order) || ''}½`;
}

export function bondOrderText(order: number | null | undefined): string {
    if (order === null || order === undefined) return 'Bond order is not defined by g/u counting for a heteronuclear molecule.';
    if (order === 0) return 'Bond order 0 — no bond: the antibonding electrons cancel the bonding ones.';
    return `Bond order ${formatBondOrderNumber(order)}`;
}

/**
 * Ruling T23e-COHF (fix round 1): a heteronuclear molecule's footer used to
 * say only that bond order "is not defined by g/u counting" -- true of the
 * g/u-counting method, but left the panel silently disagreeing with the
 * System select, which (ruling R23e) shows CO and HF's textbook bond order
 * (systems.ts' TEXTBOOK_BOND_ORDER, the same source this takes `order`
 * from). This states the number and why g/u counting doesn't reach it,
 * instead of only the latter.
 */
export function heteronuclearBondOrderText(order: number): string {
    return `Bond order ${formatBondOrderNumber(order)} — counted from the valence orbitals' bonding/antibonding character; `
        + "g/u labels don't apply to a heteronuclear molecule.";
}

/**
 * The bond order a system's view states (Task 7a: Info's fact): H₂⁺'s ½; a homonuclear molecule's own, counted from
 * its MO occupations (meta.json's `bondOrder`); for CO and HF, whose `bondOrder` is null by design, and before a
 * molecule's data has loaded, the textbook value the System select shows (ruling R23e, T23e-COHF).
 */
export function bondOrderOf(system: BondsSystemId, meta: Pick<MoleculeMeta, 'bondOrder'> | null): number {
    if (system === 'h2plus') return 0.5;
    return meta?.bondOrder ?? TEXTBOOK_BOND_ORDER[system];
}

const withFullStop = (text: string) => (text.endsWith('.') ? text : `${text}.`);

/**
 * The sentence that used to stand under the MO diagram (BondsPanel's footer, before Task 7a moved it into Info): the
 * bond order and how it was counted. H₂⁺'s is exact; a heteronuclear molecule's states the textbook number and why g/u
 * counting does not reach it, so it never contradicts the System select (ruling T23e-COHF). Only for a view whose
 * orbitals are known -- H₂⁺, or a molecule once `meta` has loaded.
 */
export function bondOrderFooter(system: BondsSystemId, meta: Pick<MoleculeMeta, 'bondOrder'> | null): string {
    if (system === 'h2plus') return `${withFullStop(bondOrderText(0.5))} One electron, exact energies.`;
    if (meta && meta.bondOrder === null) return withFullStop(heteronuclearBondOrderText(TEXTBOOK_BOND_ORDER[system]));
    return withFullStop(bondOrderText(meta?.bondOrder));
}

/** H₂⁺'s one electron: each level's energy is the exact E_el of that state, a Born–Oppenheimer eigenvalue, not a Kohn–Sham one. */
export function h2plusOrbitals(R: number): MoleculeOrbitalInfo[] {
    return H2PLUS_STATES.map((state, index) => ({
        index, label: H2PLUS_LABELS[state], energyHartree: h2plusElectronicEnergy(R, state),
        occupation: index === 0 ? 1 : 0, spin: 'restricted' as const,
    }));
}
