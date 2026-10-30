import { MoleculeMeta, MoleculeOrbitalInfo, OrbitalSpin } from '../molecules/types';
import { H2PLUS_LABELS, H2PLUS_STATES, H2PlusState, h2plusElectronicEnergy } from './h2plus';
import { orbitalEnergyText } from '../format/energy';
import { nb } from '../format/text';
import { BondsSystemId, TEXTBOOK_BOND_ORDER } from './systems';

export interface DiagramBox { orbitalIndex: number; up: boolean; down: boolean }
/**
 * `core`: a level far below the valence, drawn in the band under the lower break. `folded` (science corrections, ruling
 * M2, N1): an empty level above the lowest wholly empty one, drawn in the band over the upper break -- Kohn–Sham
 * virtuals past it are basis-dependent and say little, and to scale they would set the diagram's height. Neither band
 * is to scale.
 */
export interface DiagramLevel { label: string; spin: OrbitalSpin; energyHartree: number; boxes: DiagramBox[]; core: boolean; folded: boolean }
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

/** A level holding at least one electron (↑ or ↓ in any box). */
function occupied(level: DiagramLevel): boolean {
    return level.boxes.some(box => box.up || box.down);
}

/**
 * Marks the two bands, on levels sorted by energy.
 * - Core (science corrections, ruling I1): every level under the highest gap over 1 Ha that lies at or below the
 *   highest occupied level. The highest such gap, not the widest: CO's C 1s (2σ, −10.3 Ha) and O 1s (1σ, −19.2 Ha)
 *   are 8.9 Ha apart, and at short R that beats the 2σ→3σ gap, which once left C 1s drawn among the valence levels.
 *   Gaps among the empty levels never count (N₂'s 3σu* sits over 1 Ha above 1πg* at short R). A one-electron system
 *   (H₂⁺, ruling T2 c5) has no core: its two levels are all there is.
 * - Folded (rulings M2, N1): every level above both the lowest wholly empty level and the highest occupied one. A
 *   level is drawn with both spins (α energies, ↓ from β), so a partly filled one is drawn filled, not empty: O₂'s
 *   1πg* holds its two α electrons, and its lowest wholly empty level is 3σu*, though the data's LUMO is β 1πg*.
 */
function markBands(levels: DiagramLevel[], electrons: number): void {
    const homo = levels.reduce((top, level, i) => (occupied(level) ? i : top), -1);
    if (electrons > 1) {
        for (let i = homo; i >= 1; i--) {
            if (levels[i].energyHartree - levels[i - 1].energyHartree > CORE_GAP_HARTREE) {
                levels.slice(0, i).forEach(level => { level.core = true; });
                break;
            }
        }
    }
    const lowestEmpty = levels.findIndex(level => !level.core && !occupied(level));
    if (lowestEmpty < 0) return;
    levels.slice(Math.max(lowestEmpty, homo) + 1).forEach(level => { level.folded = true; });
}

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
                label, spin: 'restricted', energyHartree: group[0].energyHartree, core: false, folded: false,
                boxes: group.map(o => ({ orbitalIndex: o.index, up: o.occupation >= 1, down: o.occupation >= 2 })),
            });
        }
    } else {
        const alpha = groupByLabel(orbitals.filter(o => o.spin === 'alpha'));
        const beta = groupByLabel(orbitals.filter(o => o.spin === 'beta'));
        for (const [label, group] of alpha) {
            const partners = beta.get(label) ?? [];
            levels.push({
                label, spin: 'alpha', energyHartree: group[0].energyHartree, core: false, folded: false,
                boxes: group.map((o, i) => ({ orbitalIndex: o.index, up: o.occupation > 0, down: (partners[i]?.occupation ?? 0) > 0 })),
            });
        }
        for (const [label, group] of beta) {
            if (alpha.has(label)) continue;
            levels.push({
                label, spin: 'beta', energyHartree: group[0].energyHartree, core: false, folded: false,
                boxes: group.map(o => ({ orbitalIndex: o.index, up: false, down: o.occupation > 0 })),
            });
        }
    }
    levels.sort((a, b) => a.energyHartree - b.energyHartree);
    markBands(levels, orbitals.reduce((sum, o) => sum + o.occupation, 0));
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
 * The bond order a system's view states (Task 7a: Info's fact): H₂⁺'s ½; a homonuclear molecule's own, counted from
 * its MO occupations (meta.json's `bondOrder`); for CO and HF, whose `bondOrder` is null by design, and before a
 * molecule's data has loaded, the textbook value the System select shows (ruling R23e, T23e-COHF). For H₂⁺ this is the
 * ground state's: Info names it so in the 1σu* view (bondOrderNote).
 */
export function bondOrderOf(system: BondsSystemId, meta: Pick<MoleculeMeta, 'bondOrder'> | null): number {
    if (system === 'h2plus') return 0.5;
    return meta?.bondOrder ?? TEXTBOOK_BOND_ORDER[system];
}

/**
 * Ruling T23e-COHF: a heteronuclear molecule's bond order is the textbook number (the System select's), and this says
 * why g/u counting does not reach it -- so the two never contradict each other.
 */
export const HETERONUCLEAR_BOND_ORDER_NOTE =
    "Counted from the valence orbitals' bonding or antibonding character; g/u labels do not apply to a heteronuclear molecule.";

/**
 * What the old footer under the MO diagram said beyond the number (Task 7a fix round 1, M5: Info's Bond order fact
 * gives the number; this is only the why). H₂⁺ is exact -- and in its 1σu* view, the ½ is the ground state's (I2);
 * CO and HF are counted another way; a homonuclear molecule's count needs no note. Null where there is nothing to add.
 */
export function bondOrderNote(system: BondsSystemId, meta: Pick<MoleculeMeta, 'bondOrder'> | null, h2plusState: H2PlusState = '1sigma_g'): string | null {
    if (system === 'h2plus') {
        return h2plusState === '1sigma_u'
            ? 'In the ground state (electron in 1σg) the bond order is ½; with the electron in 1σu* there is no bond. One electron, so the energies are exact.'
            : 'One electron, so the energies are exact.';
    }
    return meta && meta.bondOrder === null ? HETERONUCLEAR_BOND_ORDER_NOTE : null;
}

/** H₂⁺'s one electron: each level's energy is the exact E_el of that state, a Born–Oppenheimer eigenvalue, not a Kohn–Sham one. */
export function h2plusOrbitals(R: number): MoleculeOrbitalInfo[] {
    return H2PLUS_STATES.map((state, index) => ({
        index, label: H2PLUS_LABELS[state], energyHartree: h2plusElectronicEnergy(R, state),
        occupation: index === 0 ? 1 : 0, spin: 'restricted' as const,
    }));
}

/**
 * Task 7a fix round 1 (ruling I5): H₂⁺'s Data values -- its two exact levels at R, eV first, each held on one line:
 * "1σg E_el = −30.00 eV (−1.103 Ha) · 1σu* E_el = −18.16 eV (−0.668 Ha)" (at R = 2 a₀). The analogue of a molecule's
 * frontier line; the caller typesets E_el and the labels.
 */
export function h2plusLevelsText(R: number): string {
    return h2plusLevelParts(R).join(' · ');
}

/** The entries `h2plusLevelsText` joins with " · ", so the Data line can hold each "· entry" together. */
export function h2plusLevelParts(R: number): string[] {
    return h2plusOrbitals(R).map(level => nb(`${level.label} E_el = ${orbitalEnergyText(level.energyHartree)}`));
}
