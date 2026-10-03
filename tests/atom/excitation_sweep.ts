/**
 * Final review I2's sweep, shared by the excitation_sweep_<k>.test.ts shards:
 * every species Excite and the charge stepper offer for Z ≤ 56 -- each
 * offered charge's ground state and every offered excitation of it -- must
 * end in an answer or a stated verdict, for the picture (restricted SCF)
 * and for its ΔSCF energy (spin-polarised). A verdict is UnboundAnionError,
 * UnboundElectronError (an occupied level of a neutral atom or cation the
 * field does not bind, ruling T7-b) or a non-convergence result; anything
 * else thrown (a grid too small, a radial solve that failed) is a bug, and
 * fails the shard -- as does an excited picture far below its own ground
 * state (an unbound electron placed anyway -- impossible since ruling T7-b,
 * kept as a guard; see SPURIOUS_BELOW_GROUND_HA).
 * An excitation LDA puts slightly below its ground configuration is LDA,
 * not a bug: it is listed, not failed.
 *
 * KNOWN_FAILURES pins every verdict, both ways (ruling T7-d, as in
 * relativistic_heavy_sweep.ts): a shard fails if one of its species fails
 * where the list says it converges, fails differently, or converges where
 * the list says it fails.
 *
 * Split into shards only so jest can run them on separate workers: 1,367
 * species, two solves each (and each excitation's ground state), is about
 * nine hours of jest worker time; SWEEP_SHARDS shards of 17-18 species, 5-9
 * minutes each with eight running side by side (measured), keep each under
 * the ten-minute foreground budget. Excluded from the default run by
 * jest.config.ts unless ATOM_SLOW_TESTS=1 (ruling T7-e).
 */
import { solveSpecies } from '../../src/atom/scf';
import { UnboundAnionError, UnboundElectronError } from '../../src/atom/scf_shared';
import { ionisationEnergy, excitationEnergy } from '../../src/atom/delta_scf';
import { allowedCharges } from '../../src/atom/ion_configurations';
import { AtomSpecies, excitationSources, excitationTargets, speciesKey } from '../../src/atom/species';

export const SWEEP_MAX_Z = 56;
export const SWEEP_SHARDS = 80;

type Verdict = 'converged' | 'unconverged' | 'unbound' | 'notBound' | 'error';

/**
 * Every offered species up to Z = 56 whose picture or ΔSCF energy does not
 * come out, by speciesKey (measured: ATOM_SLOW_TESTS=1, all 80 shards). The
 * anions LDA does not bind, and K 4s -> 4d, whose picture and energy both
 * run out of iterations (HANDOFF, rulings FR-1/FR-2). Nothing up to Z = 56
 * changed with ruling T7-b: the garbage it stopped is all in the
 * lanthanides (relativistic_heavy_sweep.ts).
 */
const UNBOUND_ANIONS = ['1-1', '6-1', '8-1', '8-2', '9-1', '14-1', '15-1', '16-1', '16-2', '17-1',
    '32-1', '33-1', '34-1', '34-2', '50-1', '51-1', '52-1', '52-2'];
export const KNOWN_FAILURES: Readonly<Record<string, { picture: Verdict; energy: Verdict | 'none' }>> = {
    ...Object.fromEntries(UNBOUND_ANIONS.map(key => [key, { picture: 'unbound', energy: 'unbound' }])),
    '19:4s>4d': { picture: 'unconverged', energy: 'unconverged' },
};

export interface SweepOutcome {
    key: string; picture: Verdict; energy: Verdict | 'none'; errors: string[];
    /** Set when LDA puts this "excited" configuration below the ground one it was promoted from. */
    belowGround?: { pictureHa: number | null; energyEv: number | null };
}

/**
 * How far below its own ground state a "converged" excited picture may land
 * before it is nonsense rather than LDA. LDA really does order some
 * configurations the other way round from experiment -- V 4s -> 3d (3d4 4s1
 * under 3d3 4s2), the 3d-metals and 4d-metals generally -- by up to ~0.07 Ha
 * (measured over Z <= 56). An unbound electron the radial solver placed
 * anyway lands hundreds of Ha below (K 4s -> 4d from the neutral's potential:
 * -306 Ha). 1 Ha separates the two by more than an order of magnitude either way.
 */
const SPURIOUS_BELOW_GROUND_HA = 1;

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
    let belowGround: SweepOutcome['belowGround'];
    let picture: Verdict;
    try {
        const solution = solveSpecies(species);
        picture = solution.converged ? 'converged' : 'unconverged';
        // A converged excited state below its own ground state is not an
        // answer: it is an unbound electron the radial solver placed anyway
        // (the -904 Ha K 4s -> 4d the HANDOFF records; the solver refuses
        // such a state since ruling T7-b, so this is now only a guard).
        if (picture === 'converged' && species.excitation) {
            const below = solveSpecies({ ...species, excitation: null }).totalEnergy - solution.totalEnergy;
            if (below > SPURIOUS_BELOW_GROUND_HA) throw new Error(`${below.toFixed(3)} Ha below its own ground state`);
            if (below >= 0) belowGround = { pictureHa: below, energyEv: null };
        }
    } catch (error) {
        if (error instanceof UnboundAnionError) picture = 'unbound';
        else if (error instanceof UnboundElectronError) picture = 'notBound';
        else { picture = 'error'; errors.push(`${key} (picture): ${(error as Error).message}`); }
    }
    let energy: SweepOutcome['energy'];
    try {
        const reading = species.excitation ? excitationEnergy(species) : ionisationEnergy(species);
        energy = reading === null ? 'none' : 'converged';
        if (reading && !Number.isFinite(reading.valueEv)) throw new Error(`${reading.valueEv} eV`);
        // An ionisation energy is positive or something is wrong; an
        // excitation energy may be negative where LDA reorders the
        // configurations (see SPURIOUS_BELOW_GROUND_HA), and is listed.
        if (reading && reading.valueEv <= 0) {
            if (!species.excitation) throw new Error(`${reading.valueEv} eV`);
            belowGround = { pictureHa: belowGround?.pictureHa ?? null, energyEv: reading.valueEv };
        }
    } catch (error) {
        if (error instanceof UnboundAnionError) energy = 'unbound';
        else if (error instanceof UnboundElectronError) energy = 'notBound';
        else if (NOT_CONVERGED.test((error as Error).message)) energy = 'unconverged';
        else { energy = 'error'; errors.push(`${key} (energy): ${(error as Error).message}`); }
    }
    return { key, picture, energy, errors, belowGround };
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
    const notBound = outcomes.filter(o => o.picture === 'notBound' || o.energy === 'notBound');
    const below = outcomes.filter(o => o.belowGround);
    console.log(
        `shard ${shard + 1} of ${SWEEP_SHARDS}: ${outcomes.length} species in ${((Date.now() - started) / 1000).toFixed(0)} s\n` +
        `unbound: ${unbound.map(o => `${o.key} [picture ${o.picture}, energy ${o.energy}]`).join(', ') || 'none'}\n` +
        `not converged: ${unconverged.map(o => `${o.key} [picture ${o.picture}, energy ${o.energy}]`).join(', ') || 'none'}\n` +
        `a level not bound: ${notBound.map(o => `${o.key} [picture ${o.picture}, energy ${o.energy}]`).join(', ') || 'none'}\n` +
        `LDA below its ground configuration: ${below.map(o => `${o.key} [picture ${o.belowGround!.pictureHa === null ? 'above' : `${o.belowGround!.pictureHa.toFixed(3)} Ha below`}, energy ${o.belowGround!.energyEv === null ? '> 0' : `${o.belowGround!.energyEv.toFixed(3)} eV`}]`).join(', ') || 'none'}\n` +
        `errors: ${errors.join(' | ') || 'none'}`,
    );
    expect(errors).toEqual([]);
    // Only an anion is ever unbound (its key carries the minus sign).
    expect(unbound.every(o => o.key.includes('-'))).toBe(true);
    // Every verdict is the listed one, both ways.
    const found = Object.fromEntries(outcomes
        .filter(o => o.picture !== 'converged' || (o.energy !== 'converged' && o.energy !== 'none'))
        .map(o => [o.key, { picture: o.picture, energy: o.energy }]));
    const expected = Object.fromEntries(outcomes.filter(o => o.key in KNOWN_FAILURES).map(o => [o.key, KNOWN_FAILURES[o.key]]));
    expect(found).toEqual(expected);
}
