/**
 * Ionisation and excitation energies as ΔSCF total-energy differences
 * (spec §3.4; Global Constraints -- an eigenvalue is never an ionisation
 * energy).
 *
 * Spin-polarised LDA, not the restricted LDA the pictures use: restricted
 * ΔSCF put O, F and S 12-22 % off experiment, because an atom and its ion
 * have different numbers of unpaired electrons and restricted LDA ignores
 * the exchange energy that difference carries. Spin-polarised LDA puts all
 * of H-Ar within 7.6 % (He; He+ is exact, He is not).
 */
import { AtomSpecies, speciesConfiguration, speciesKey, speciesSymbol, excitationLabel } from './species';
import { allowedCharges } from './ion_configurations';
import { solvePolarised } from './spin_scf';

export const HARTREE_IN_EV = 27.211386245988;
export const DELTA_SCF_LABEL = 'ΔSCF, LDA';
export const DELTA_SCF_METHOD =
    'ΔSCF: the difference of two self-consistent total energies, each from a central-field, spin-polarised ' +
    'LDA calculation (Slater exchange + VWN5 correlation, spherically averaged, non-relativistic) -- a ' +
    'different, spin-restricted form of the same LDA draws the picture on screen. Occupations ' +
    'follow Hund\'s rule (maximum spin), so an excitation out of a closed subshell lands in the highest-spin ' +
    'state it can reach -- He 1s→2s gives 2³S, Mg 3s→3p gives ³P. One-electron species are exact. ' +
    'Never an orbital eigenvalue.';

export interface EnergyReading { valueEv: number; fromLabel: string; toLabel: string }

const cache = new Map<string, number>();

/**
 * Memoised by speciesKey. Throws when the spin-polarised solve did not
 * converge (ruling C6): solvePolarised returns converged: false with
 * totalEnergy: NaN in that case, and NaN propagating silently through a
 * ΔSCF difference would print as "NaN eV" rather than say what happened.
 */
export function polarisedTotalEnergy(species: AtomSpecies): number {
    const key = speciesKey(species);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const solution = solvePolarised(species.Z, speciesConfiguration(species));
    if (!solution.converged) {
        throw new Error(`The spin-polarised SCF did not converge for ${speciesSymbol(species)}; no ΔSCF energy is available for it.`);
    }
    cache.set(key, solution.totalEnergy);
    return solution.totalEnergy;
}

export function ionisedSpeciesOf(species: AtomSpecies): AtomSpecies | 'bare nucleus' | null {
    if (species.excitation) return null;
    const next = species.charge + 1;
    if (next === species.Z) return 'bare nucleus';
    return allowedCharges(species.Z).includes(next) ? { Z: species.Z, charge: next, excitation: null } : null;
}

/** Only for a ground-state species (Decided, brief): for an excited one the excitation energy is what means something. */
export function ionisationEnergy(species: AtomSpecies): EnergyReading | null {
    const ionised = ionisedSpeciesOf(species);
    if (ionised === null) return null;
    const after = ionised === 'bare nucleus' ? 0 : polarisedTotalEnergy(ionised);
    return {
        valueEv: (after - polarisedTotalEnergy(species)) * HARTREE_IN_EV,
        fromLabel: speciesSymbol(species),
        toLabel: ionised === 'bare nucleus' ? `${speciesSymbol({ ...species, charge: species.Z })} (bare nucleus)` : speciesSymbol(ionised),
    };
}

export function excitationEnergy(species: AtomSpecies): EnergyReading | null {
    if (!species.excitation) return null;
    const ground = { ...species, excitation: null };
    return {
        valueEv: (polarisedTotalEnergy(species) - polarisedTotalEnergy(ground)) * HARTREE_IN_EV,
        fromLabel: speciesSymbol(ground),
        toLabel: `${speciesSymbol(ground)} ${excitationLabel(species.excitation)}`,
    };
}

export function clearDeltaScfCacheForTests(): void { cache.clear(); }
