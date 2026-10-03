/**
 * Final review I2's sweep, shared by the excitation_sweep_<k>.test.ts shards:
 * every species Excite and the charge stepper offer for Z ≤ 56 -- each
 * offered charge's ground state and every offered excitation of it -- must
 * end in an answer or a stated verdict, for the picture (restricted SCF)
 * and for its ΔSCF energy (spin-polarised). A verdict is UnboundAnionError
 * or a non-convergence result; anything else thrown (a grid too small, a
 * radial solve that failed) is a bug, and fails the shard.
 *
 * Split into shards only so jest can run them on separate workers: the
 * whole sweep is about 1,800 species and two solves each.
 */
import { solveSpecies } from '../../src/atom/scf';
import { UnboundAnionError } from '../../src/atom/scf_shared';
import { ionisationEnergy, excitationEnergy } from '../../src/atom/delta_scf';
import { allowedCharges } from '../../src/atom/ion_configurations';
import { AtomSpecies, excitationSources, excitationTargets, speciesKey } from '../../src/atom/species';

export const SWEEP_MAX_Z = 56;
export const SWEEP_SHARDS = 5;

type Verdict = 'converged' | 'unconverged' | 'unbound' | 'error';
export interface SweepOutcome { key: string; picture: Verdict; energy: Verdict | 'none'; errors: string[] }

/** Every species the UI offers up to SWEEP_MAX_Z, in Z order. */
export function offeredSpecies(): AtomSpecies[] {
    const all: AtomSpecies[] = [];
    for (let Z = 1; Z <= SWEEP_MAX_Z; Z++) {
        for (const charge of allowedCharges(Z)) {
            all.push({ Z, charge, excitation: null });
            for (const from of excitationSources(Z, charge)) {
                for (const to of excitationTargets(Z, charge, from)) all.push({ Z, charge, excitation: { from, to } });
            }
        }
    }
    return all;
}

/** Round-robin by Z order, so every shard gets light and heavy atoms alike. */
export function shardOf(shard: number): AtomSpecies[] {
    return offeredSpecies().filter((_, index) => index % SWEEP_SHARDS === shard);
}

const NOT_CONVERGED = /did not converge/;

export function sweepOne(species: AtomSpecies): SweepOutcome {
    const key = speciesKey(species);
    const errors: string[] = [];
    let picture: Verdict;
    try {
        const solution = solveSpecies(species);
        picture = solution.converged ? 'converged' : 'unconverged';
        // A converged excited state below its own ground state is not an
        // answer: it is an unbound electron the radial solver placed anyway
        // (the -904 Ha K 4s -> 4d the HANDOFF records).
        if (picture === 'converged' && species.excitation) {
            const ground = solveSpecies({ ...species, excitation: null });
            if (solution.totalEnergy <= ground.totalEnergy) {
                throw new Error(`${solution.totalEnergy.toFixed(3)} Ha, at or below its ground state's ${ground.totalEnergy.toFixed(3)} Ha`);
            }
        }
    } catch (error) {
        if (error instanceof UnboundAnionError) picture = 'unbound';
        else { picture = 'error'; errors.push(`${key} (picture): ${(error as Error).message}`); }
    }
    let energy: SweepOutcome['energy'];
    try {
        const reading = species.excitation ? excitationEnergy(species) : ionisationEnergy(species);
        energy = reading === null ? 'none' : 'converged';
        if (reading && !(Number.isFinite(reading.valueEv) && reading.valueEv > 0)) throw new Error(`${reading.valueEv} eV`);
    } catch (error) {
        if (error instanceof UnboundAnionError) energy = 'unbound';
        else if (NOT_CONVERGED.test((error as Error).message)) energy = 'unconverged';
        else { energy = 'error'; errors.push(`${key} (energy): ${(error as Error).message}`); }
    }
    return { key, picture, energy, errors };
}

/**
 * One shard's test body: every species in it, then one summary line (the
 * run's runtime and every species that did not converge, for the report),
 * then the assertions -- after the summary, so a failure still lists them.
 */
export function runShard(shard: number): void {
    const started = Date.now();
    const outcomes = shardOf(shard).map(sweepOne);
    const errors = outcomes.flatMap(o => o.errors);
    const unconverged = outcomes.filter(o => o.picture === 'unconverged' || o.energy === 'unconverged');
    const unbound = outcomes.filter(o => o.picture === 'unbound' || o.energy === 'unbound');
    console.log(
        `shard ${shard + 1} of ${SWEEP_SHARDS}: ${outcomes.length} species in ${((Date.now() - started) / 1000).toFixed(0)} s\n` +
        `unbound: ${unbound.map(o => `${o.key} [picture ${o.picture}, energy ${o.energy}]`).join(', ') || 'none'}\n` +
        `not converged: ${unconverged.map(o => `${o.key} [picture ${o.picture}, energy ${o.energy}]`).join(', ') || 'none'}\n` +
        `errors: ${errors.join(' | ') || 'none'}`,
    );
    expect(errors).toEqual([]);
    // Only an anion is ever unbound (its key carries the minus sign).
    expect(unbound.every(o => o.key.includes('-'))).toBe(true);
}
