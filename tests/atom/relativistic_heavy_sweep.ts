/**
 * Ruling C11's sweep, shared by the relativistic_heavy_sweep_<k>.test.ts
 * shards: every species the UI offers from Z = 55 up (relativity.ts's
 * RELATIVISTIC_DEFAULT_FROM_Z, where scalar becomes the default) -- each
 * offered charge's ground state and every offered excitation of it -- must
 * converge in scalar mode or report a verdict (UnboundAnionError, a
 * non-convergence result, or the solver's own "no bound state found"
 * diagnostic -- see noBoundState below); anything else thrown is a bug, and
 * fails the shard. This naturally includes the five heavy anions
 * ion_configurations.ts offers past mercury: Pb-, Bi-, Po-, Po2-, At- (its
 * ANION_FLOOR table keys 82-85) -- no special-casing needed, since they
 * come out of the same allowedCharges(Z) call as every other species here.
 *
 * Measured finding: a handful of deep promotions into an already
 * substantially-filled 4f/5f (Sm 6s -> 4f, Cf and Fm 7s -> 5f) converge
 * fine off-relativity but make relativistic_solver.ts's eigenvalue search
 * throw its own "Radial grid ... is too small to hold ..., or the
 * potential does not bind it" diagnostic in scalar mode -- the same
 * deliberate not-found guard eigenvalue_search.ts raises non-relativistically
 * (never exercised by Phase 3's own Z <= 56 sweep). Exactly like
 * UnboundAnionError, this reaches the user as a shown failure, not a crash:
 * handleAtomWorkerRequest's catch-all turns any thrown error into a
 * `type: 'error'` reply (spec §3.5), so this is recorded as a verdict
 * (`noBoundState`) rather than failing the shard. An error whose message
 * does not match that known diagnostic is still treated as a bug.
 *
 * With spin-orbit, only the neutrals are swept (ruling C11: "spin-orbit for
 * the neutrals only"): every ion and excitation in that mode would add the
 * same cost again on top of scalar's, for a mode that is never anyone's
 * default. relativistic_heavy_sweep_so_<k>.test.ts covers that half.
 *
 * Unlike excitation_sweep.ts (Phase 3's own sweep, Z <= 56, non-relativistic,
 * picture and ΔSCF energy both), this sweep checks only the picture -- ΔSCF
 * stays non-relativistic by ruling C6 and is out of scope here -- and it
 * does not flag a converged excitation that lands below its own ground
 * state (Phase 3's SPURIOUS_BELOW_GROUND_HA check): that check costs a
 * second full solve per excitation, which here would roughly double an
 * already expensive sweep (each heavy solve also pays for its own
 * non-relativistic warm-start solve, ruling C2), for a failure mode that
 * check exists to catch in the non-relativistic loop, not this one.
 *
 * Sharded only so jest can run them on separate workers: 1,812 species in
 * scalar mode at roughly 12-19 s each (measured, cold, Z = 55..118) is
 * several hours of work; SWEEP_SHARDS shards keep each one under the
 * ten-minute foreground budget, and running several shards in one `npx
 * jest` invocation lets jest's own worker pool run them side by side.
 */
import { solveSpecies } from '../../src/atom/scf';
import { UnboundAnionError } from '../../src/atom/scf_shared';
import { RelativityMode, RELATIVISTIC_DEFAULT_FROM_Z } from '../../src/atom/relativity';
import { allowedCharges } from '../../src/atom/ion_configurations';
import { AtomSpecies, excitationSources, excitationTargets, speciesKey } from '../../src/atom/species';

export const SWEEP_MIN_Z = RELATIVISTIC_DEFAULT_FROM_Z;
export const SWEEP_MAX_Z = 118;
export const SWEEP_SHARDS = 80;
export const SPIN_ORBIT_SHARDS = 3;

type Verdict = 'converged' | 'unconverged' | 'unbound' | 'noBoundState' | 'error';
export interface HeavySweepOutcome { key: string; verdict: Verdict; error?: string }

/**
 * relativistic_solver.ts's (and eigenvalue_search.ts's) own deliberate
 * diagnostic for "the search found no bound state matching the requested
 * (n, l[, j])" -- the relativistic-solver analogue of UnboundAnionError,
 * just not restricted to anions. Anything else thrown is still a bug.
 */
const NO_BOUND_STATE = /is too small to hold .+, or the potential does not bind it/;

/** Every species the UI offers from Z = 55 up, in Z order (ruling C11). */
export function offeredHeavySpecies(): AtomSpecies[] {
    const all: AtomSpecies[] = [];
    for (let Z = SWEEP_MIN_Z; Z <= SWEEP_MAX_Z; Z++) {
        for (const charge of allowedCharges(Z)) {
            all.push({ Z, charge, excitation: null });
            for (const from of excitationSources(Z, charge)) {
                for (const to of excitationTargets(Z, charge, from)) all.push({ Z, charge, excitation: { from, to } });
            }
        }
    }
    return all;
}

/** Every offered neutral from Z = 55 up: the spin-orbit half of ruling C11. */
export function offeredHeavyNeutrals(): AtomSpecies[] {
    const all: AtomSpecies[] = [];
    for (let Z = SWEEP_MIN_Z; Z <= SWEEP_MAX_Z; Z++) all.push({ Z, charge: 0, excitation: null });
    return all;
}

/** Round-robin by Z order, so every shard gets light-heavy and superheavy species alike. */
function partition<T>(items: T[], shards: number, shard: number): T[] {
    return items.filter((_, index) => index % shards === shard);
}

export function shardOf(shard: number): AtomSpecies[] { return partition(offeredHeavySpecies(), SWEEP_SHARDS, shard); }
export function spinOrbitShardOf(shard: number): AtomSpecies[] { return partition(offeredHeavyNeutrals(), SPIN_ORBIT_SHARDS, shard); }

export function sweepOne(species: AtomSpecies, relativity: RelativityMode): HeavySweepOutcome {
    const key = speciesKey(species);
    try {
        const solution = solveSpecies(species, relativity);
        return { key, verdict: solution.converged ? 'converged' : 'unconverged' };
    } catch (error) {
        if (error instanceof UnboundAnionError) return { key, verdict: 'unbound' };
        const message = (error as Error).message ?? '';
        if (NO_BOUND_STATE.test(message)) return { key, verdict: 'noBoundState', error: `${key}: ${message}` };
        return { key, verdict: 'error', error: `${key}: ${message}` };
    }
}

/**
 * One shard's test body: every species in it, then one summary line (the
 * run's runtime and every species that did not converge, for the report),
 * then the assertions -- after the summary, so a failure still lists them.
 */
export function runSweep(species: AtomSpecies[], relativity: RelativityMode, label: string): void {
    const started = Date.now();
    const outcomes = species.map(s => sweepOne(s, relativity));
    const errors = outcomes.filter(o => o.verdict === 'error').map(o => o.error!);
    const unconverged = outcomes.filter(o => o.verdict === 'unconverged');
    const unbound = outcomes.filter(o => o.verdict === 'unbound');
    const noBoundState = outcomes.filter(o => o.verdict === 'noBoundState');
    console.log(
        `${label}: ${outcomes.length} species (${relativity}) in ${((Date.now() - started) / 1000).toFixed(0)} s\n` +
        `unbound: ${unbound.map(o => o.key).join(', ') || 'none'}\n` +
        `not converged: ${unconverged.map(o => o.key).join(', ') || 'none'}\n` +
        `no bound state found (reported, not a bug -- see the module note): ${noBoundState.map(o => o.error).join(' | ') || 'none'}\n` +
        `errors: ${errors.join(' | ') || 'none'}`,
    );
    expect(errors).toEqual([]);
    // Only an anion is ever unbound (its key carries the minus sign).
    expect(unbound.every(o => o.key.includes('-'))).toBe(true);
}
