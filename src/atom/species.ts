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
// Two energy-like orders, each encoded as a single sortable number, used
// only to pick targets *above* the source -- never to derive a ground state
// (this file never second-guesses ion_configurations.ts). A neutral atom's
// outer subshells sit in Madelung (n+l, then n) order, which is why K's 4s
// fills before its 3d; a cation's do not -- with the screening electron gone,
// the levels fall back towards the hydrogen-like (n, then l) order, which is
// why Fe3+ is 3d5 and not 3d3 4s2, and why its 3d -> 4s is an excitation.
const madelung = ({ n, l }: SubshellRef) => (n + l) * 10 + n;
const hydrogenLike = ({ n, l }: SubshellRef) => n * 10 + l;
const orderFor = (charge: number) => (charge > 0 ? hydrogenLike : madelung);
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

/**
 * The valence subshells an electron can be promoted out of (spec §5 Phase
 * 3, "an Excite action on the valence subshell"): every open subshell, plus
 * every occupied subshell of the outermost shell. Sorted by (n, l).
 *
 * "Outermost shell" alone misreads valence twice over. A d or f ion's open
 * subshell sits a shell inside its outermost one (Fe3+ 3d5 under nothing,
 * Gd3+ 4f7 under 5s2 5p6) and is exactly what its chemistry and spectrum are
 * about, so every open subshell counts wherever it sits. The outermost
 * shell's closed d10 counts too -- Cu+ and Ag+ (3d10, 4d10), Zn2+, Hg2+, and
 * neutral Pd, whose 5s is empty -- because nothing lies outside it: it is the
 * least bound subshell the species has, and that shell's own s and p, which
 * lie well below its d, stay out. A closed subshell under a shell that
 * *is* occupied stays out (Na 2p, K 3p, Zn 3d under 4s2): that is a core
 * excitation, tens of eV up and not what "excite" means here. None for an
 * anion: its extra electron is barely held as it is.
 */
export function excitationSources(Z: number, charge: number): SubshellRef[] {
    if (charge < 0 || !allowedCharges(Z).includes(charge)) return [];
    const configuration = ionConfigurationFor(Z, charge);
    const valenceN = valenceShellOf(configuration);
    // An outermost shell that holds a d or f (Cu+ 3s2 3p6 3d10, Fe3+ 3d5, Pd
    // 4s2 4p6 4d10) has its s and p tens of eV below that d: those are core,
    // not valence, whatever their n.
    const outerHoldsDOrF = configuration.some(s => s.n === valenceN && s.l >= 2 && s.electrons > 0);
    const isOpen = (s: SubshellOccupancy) => s.electrons < capacity(s.l);
    return configuration
        .filter(s => s.electrons > 0 && (isOpen(s) || (s.n === valenceN && !(outerHoldsDOrF && s.l < 2))))
        .map(({ n, l }) => ({ n, l }))
        .sort(hydrogenLikeOrder);
}

function hydrogenLikeOrder(a: SubshellRef, b: SubshellRef): number { return hydrogenLike(a) - hydrogenLike(b); }

/**
 * Candidate destinations for one promoted electron: any subshell up to one
 * shell past the outermost (capped at n = 7) that is not full and not the
 * source -- s, p and d when empty, and an open f (Gd's 4f7 can take one
 * more); an empty f is never a low-lying destination. A target must lie
 * *above* the source in the species' order (see orderFor), so "excite"
 * always means "up": later in that order, or empty in the ground state -- an
 * empty subshell the order puts earlier is one the ground state itself
 * skipped (Pd's 5s under 4d10, Ca+'s 3d under 4s), and the ground state is
 * the better witness that it lies higher. The first four by that order (Na
 * 3s -> 3p, 4s, 3d, 4p puts the sodium D line first).
 */
export function excitationTargets(Z: number, charge: number, from: SubshellRef): SubshellRef[] {
    if (!excitationSources(Z, charge).some(s => same(s, from))) return [];
    const configuration = ionConfigurationFor(Z, charge);
    const valenceN = valenceShellOf(configuration);
    const order = orderFor(charge);
    const candidates: SubshellRef[] = [];
    for (let n = 1; n <= Math.min(7, valenceN + 1); n++) {
        for (let l = 0; l <= Math.min(3, n - 1); l++) {
            const target = { n, l };
            if (same(target, from)) continue;
            const occupied = configuration.find(s => same(s, target))?.electrons ?? 0;
            if (occupied === capacity(l) || (occupied === 0 && l === 3)) continue;
            if (occupied === 0 || order(target) > order(from)) candidates.push(target);
        }
    }
    return candidates.sort((a, b) => order(a) - order(b)).slice(0, MAX_EXCITATION_TARGETS);
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
