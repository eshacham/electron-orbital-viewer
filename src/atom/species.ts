/**
 * What atom mode solves: an element, a charge and at most one promoted
 * electron (spec §5 Phase 3). Everything downstream -- the SCF, both caches,
 * the worker protocol, the store, the URL -- is keyed by `speciesKey`, and a
 * neutral ground state's key is plain String(Z) so every cache key that
 * existed before ions did is unchanged.
 */
import { SubshellOccupancy, subshellLabel, valenceShellOf } from './configurations';
import { allowedCharges, ionConfigurationFor } from './ion_configurations';
import { elementFor } from '../elements';

export interface SubshellRef { n: number; l: number }
export interface Excitation { from: SubshellRef; to: SubshellRef }
export interface AtomSpecies { Z: number; charge: number; excitation: Excitation | null }

export const MAX_EXCITATION_TARGETS = 4;
const LETTERS = 'spdf';
const capacity = (l: number) => 2 * (2 * l + 1);
// Madelung (n+l, then n) order, encoded as a single sortable number -- the
// same rule the neutral-atom table's comment describes as "roughly" filling
// order, used here only to pick targets *after* the source, never to derive
// a ground state (this file never second-guesses ion_configurations.ts).
const madelung = ({ n, l }: SubshellRef) => (n + l) * 10 + n;
const same = (a: SubshellRef, b: SubshellRef) => a.n === b.n && a.l === b.l;
const refLabel = (r: SubshellRef) => subshellLabel(r.n, r.l);

export function neutralGround(Z: number): AtomSpecies { return { Z, charge: 0, excitation: null }; }
export function isNeutralGround(species: AtomSpecies): boolean { return species.charge === 0 && species.excitation === null; }

/** A neutral ground state's key is exactly String(Z): every cache key that existed before ions did stays byte-identical. */
export function speciesKey(species: AtomSpecies): string {
    const charge = species.charge > 0 ? `+${species.charge}` : species.charge < 0 ? `${species.charge}` : '';
    const excitation = species.excitation ? `:${refLabel(species.excitation.from)}>${refLabel(species.excitation.to)}` : '';
    return `${species.Z}${charge}${excitation}`;
}

/** Occupied subshells of the outermost shell. None for an anion: its extra electron is barely held as it is. */
export function excitationSources(Z: number, charge: number): SubshellRef[] {
    if (charge < 0 || !allowedCharges(Z).includes(charge)) return [];
    const configuration = ionConfigurationFor(Z, charge);
    const valenceN = valenceShellOf(configuration);
    return configuration.filter(s => s.n === valenceN && s.electrons > 0).map(({ n, l }) => ({ n, l }));
}

/**
 * Candidate destinations for one promoted electron: n from (valence n - 1)
 * to (valence n + 1), capped at 7, s/p/d only, not full, not the source, and
 * strictly after the source in Madelung order -- so "excite" always means
 * "up", never a relabelling of the ground state. The first four by that
 * order (Na 3s -> 3p, 4s, 3d, 4p puts the sodium D line first).
 */
export function excitationTargets(Z: number, charge: number, from: SubshellRef): SubshellRef[] {
    if (!excitationSources(Z, charge).some(s => same(s, from))) return [];
    const configuration = ionConfigurationFor(Z, charge);
    const valenceN = valenceShellOf(configuration);
    const candidates: SubshellRef[] = [];
    for (let n = Math.max(1, valenceN - 1); n <= Math.min(7, valenceN + 1); n++) {
        for (let l = 0; l <= Math.min(2, n - 1); l++) {
            const target = { n, l };
            if (same(target, from) || madelung(target) <= madelung(from)) continue;
            const occupied = configuration.find(s => same(s, target))?.electrons ?? 0;
            if (occupied < capacity(l)) candidates.push(target);
        }
    }
    return candidates.sort((a, b) => madelung(a) - madelung(b)).slice(0, MAX_EXCITATION_TARGETS);
}

export function isValidExcitation(Z: number, charge: number, excitation: Excitation): boolean {
    return excitationTargets(Z, charge, excitation.from).some(t => same(t, excitation.to));
}

/** The occupancies to solve, sorted by (n, l), zero-occupancy subshells dropped. */
export function speciesConfiguration(species: AtomSpecies): SubshellOccupancy[] {
    const configuration = ionConfigurationFor(species.Z, species.charge).map(sub => ({ ...sub }));
    if (!species.excitation) return configuration;
    if (!isValidExcitation(species.Z, species.charge, species.excitation)) {
        throw new Error(`${excitationLabel(species.excitation)} is not an excitation offered for ${speciesKey({ ...species, excitation: null })}.`);
    }
    const { from, to } = species.excitation;
    configuration.find(sub => same(sub, from))!.electrons -= 1;
    const target = configuration.find(sub => same(sub, to));
    if (target) target.electrons += 1;
    else configuration.push({ n: to.n, l: to.l, electrons: 1 });
    return configuration.filter(sub => sub.electrons > 0).sort((a, b) => (a.n - b.n) || (a.l - b.l));
}

const CHARGE_SUPERSCRIPT: Record<string, string> = { '1': '', '2': '²', '3': '³' };

/** '', '⁺', '²⁺', '³⁺', '⁻', '²⁻' -- the way chemistry writes an ion's charge. */
export function chargeSuffix(charge: number): string {
    if (charge === 0) return '';
    return `${CHARGE_SUPERSCRIPT[String(Math.abs(charge))]}${charge > 0 ? '⁺' : '⁻'}`;
}

export function excitationLabel(excitation: Excitation): string {
    return `${refLabel(excitation.from)} → ${refLabel(excitation.to)}`;
}

/** e.g. 'Na', 'Fe²⁺', 'Na*' -- an excited neutral atom gets a bare asterisk, same as spectroscopic notation. */
export function speciesSymbol(species: AtomSpecies): string {
    const symbol = elementFor(species.Z)?.symbol ?? `Z${species.Z}`;
    return `${symbol}${chargeSuffix(species.charge)}${species.excitation ? '*' : ''}`;
}

/** e.g. 'Sodium', 'Chlorine ion Cl⁻', 'Sodium, excited 3s → 3p'. */
export function speciesTitle(species: AtomSpecies): string {
    const name = elementFor(species.Z)?.name ?? `Z = ${species.Z}`;
    if (species.excitation) {
        const ionPart = species.charge !== 0 ? ` ion ${speciesSymbol({ ...species, excitation: null })}` : '';
        return `${name}${ionPart}, excited ${excitationLabel(species.excitation)}`;
    }
    return species.charge === 0 ? name : `${name} ion ${speciesSymbol(species)}`;
}

/** For Phase 2's URL state: nothing is written for a neutral ground state, so old links are untouched. */
export function encodeSpeciesParams(species: AtomSpecies): Record<string, string> {
    const params: Record<string, string> = {};
    if (species.charge !== 0) params.charge = String(species.charge);
    if (species.excitation) params.excite = `${refLabel(species.excitation.from)}-${refLabel(species.excitation.to)}`;
    return params;
}

// An integer literal only, like url_state.ts's parseIntInRange -- Number()
// also accepts hex, leading '+', and padded whitespace, which would let a
// hand-edited link spell a charge nobody chose (same reasoning as
// url_state.ts's DECIMAL_LITERAL for the camera/cut keys).
const INTEGER_LITERAL = /^-?\d+$/;

function parseRef(text: string): SubshellRef | null {
    const match = /^([1-7])([spdf])$/.exec(text);
    return match ? { n: Number(match[1]), l: LETTERS.indexOf(match[2]) } : null;
}

/**
 * Anything the element does not offer is ignored, never thrown on (Review
 * Focus 4): an unparseable charge, a charge the element doesn't offer, an
 * excitation naming a subshell outside 1..7/s-f, or an excitation the
 * element doesn't offer at that charge -- all fall back to the neutral
 * ground state (charge 0 is always offered, so `allowedCharges` alone
 * decides the charge; `isValidExcitation` alone decides the excitation).
 */
export function decodeSpeciesParams(Z: number, params: URLSearchParams): { charge: number; excitation: Excitation | null } {
    const rawCharge = params.get('charge');
    const parsedCharge = rawCharge !== null && INTEGER_LITERAL.test(rawCharge) ? Number(rawCharge) : 0;
    const charge = allowedCharges(Z).includes(parsedCharge) ? parsedCharge : 0;

    const rawExcite = params.get('excite');
    const parts = rawExcite ? rawExcite.split('-') : null;
    const from = parts && parts.length === 2 ? parseRef(parts[0]) : null;
    const to = parts && parts.length === 2 ? parseRef(parts[1]) : null;
    const excitation = from && to && isValidExcitation(Z, charge, { from, to }) ? { from, to } : null;

    return { charge, excitation };
}
