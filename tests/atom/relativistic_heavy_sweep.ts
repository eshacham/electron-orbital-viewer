/**
 * Ruling C11's sweep, shared by the relativistic_heavy_sweep_<k>.test.ts
 * shards: every species the UI offers from Z = 55 up (relativity.ts's
 * RELATIVISTIC_DEFAULT_FROM_Z, where scalar becomes the default) -- each
 * offered charge's ground state and every offered excitation of it -- in
 * scalar mode, and, at no extra cost, the same species without relativity
 * (solveSpecies solves that first anyway, as the warm start). With
 * spin-orbit, only the neutrals are swept (ruling C11: "spin-orbit for the
 * neutrals only"): every ion and excitation in that mode would add the same
 * cost again on top of scalar's, for a mode that is never anyone's default.
 * relativistic_heavy_sweep_so_<k>.test.ts covers that half.
 *
 * Every outcome is one of:
 * - converged;
 * - unconverged: the loop ran out of iterations (AtomSolution.converged false);
 * - unbound: UnboundAnionError -- only ever an anion's;
 * - notBound: UnboundElectronError (ruling T7-b) -- an occupied level of a
 *   neutral atom or cation that the self-consistent field does not bind;
 * - noBoundState: the radial solvers' StateNotFoundError for a level that IS
 *   bound -- a solver limitation, recognised by exactly one of its two
 *   message shapes (NOT_FOUND_SHAPES below);
 * - error: anything else thrown, a bug.
 *
 * KNOWN_FAILURES pins every outcome that is not "converged", keyed
 * `${speciesKey}@${mode}` (ruling T7-d). Each shard requires the outcomes of
 * its own species to match the list exactly, both ways: a species that
 * newly fails, fails differently, or newly converges fails the shard until
 * the list (and docs/HANDOFF.md, which explains each entry) is updated.
 *
 * It does not flag a converged excitation that lands below its own ground
 * state (Phase 3's SPURIOUS_BELOW_GROUND_HA check): that check costs a
 * second full solve per excitation, which here would roughly double an
 * already expensive sweep. The garbage that check exists to catch -- a
 * state the radial solver placed with no root under it -- now cannot
 * converge at all (ruling T7-b).
 *
 * Sharded so jest can run the shards on separate workers: 1,812 species,
 * roughly 12-19 s each in scalar mode under jest (measured, one worker), is
 * about ten hours of work; SWEEP_SHARDS shards of 22-23 species, 7-9 minutes
 * each with seven running side by side (measured), keep each under the
 * ten-minute foreground budget. Excluded from the default run by
 * jest.config.ts unless ATOM_SLOW_TESTS=1 (ruling T7-e).
 */
import { solveSpecies } from '../../src/atom/scf';
import { UnboundAnionError, UnboundElectronError } from '../../src/atom/scf_shared';
import { StateNotFoundError } from '../../src/atom/eigenvalue_search';
import { RelativityMode, RELATIVISTIC_DEFAULT_FROM_Z } from '../../src/atom/relativity';
import { allowedCharges } from '../../src/atom/ion_configurations';
import { AtomSpecies, excitationSources, excitationTargets, speciesKey } from '../../src/atom/species';

export const SWEEP_MIN_Z = RELATIVISTIC_DEFAULT_FROM_Z;
export const SWEEP_MAX_Z = 118;
export const SWEEP_SHARDS = 80;
export const SPIN_ORBIT_SHARDS = 3;

export type Verdict = 'converged' | 'unconverged' | 'unbound' | 'notBound' | 'noBoundState' | 'error';
export interface HeavySweepOutcome { key: string; verdict: Verdict; error?: string }

/**
 * Every offered species from Z = 55 up that does not converge, by
 * `${speciesKey}@${mode}`, with its verdict (measured: ATOM_SLOW_TESTS=1, all
 * 83 shards, after rulings T7-a/b/c). docs/HANDOFF.md explains each group.
 */
export const KNOWN_FAILURES: Readonly<Record<string, Exclude<Verdict, 'converged' | 'error'>>> = {
    // Anions LDA does not bind (spec §3.5). At- holds its 6p without
    // relativity and loses it with: relativity binds p slightly less.
    '82-1@off': 'unbound', '83-1@off': 'unbound', '84-1@off': 'unbound', '84-2@off': 'unbound',
    '82-1@scalar': 'unbound', '83-1@scalar': 'unbound', '84-1@scalar': 'unbound', '84-2@scalar': 'unbound', '85-1@scalar': 'unbound',
    // 6s -> 4f, Pr-Eu: the promoted 4f leaves the bound spectrum even
    // without relativity (this used to "converge" around a 4f at -192 Ha).
    '59:6s>4f@off': 'notBound', '60:6s>4f@off': 'notBound', '61:6s>4f@off': 'notBound', '62:6s>4f@off': 'notBound', '63:6s>4f@off': 'notBound',
    // 6s -> 4f with scalar relativity: Pr-Eu as above; Ce and Tb-Tm, whose
    // 4f is bound by only 3-66 mHa without relativity, lose it to the
    // scalar shift (about +0.1 Ha for a 4f).
    '58:6s>4f@scalar': 'notBound', '59:6s>4f@scalar': 'notBound', '60:6s>4f@scalar': 'notBound', '61:6s>4f@scalar': 'notBound',
    '62:6s>4f@scalar': 'notBound', '63:6s>4f@scalar': 'notBound', '65:6s>4f@scalar': 'notBound', '66:6s>4f@scalar': 'notBound',
    '67:6s>4f@scalar': 'notBound', '68:6s>4f@scalar': 'notBound', '69:6s>4f@scalar': 'notBound',
    // 7s -> 5f with scalar relativity, Pu and Am: the 5f is bound by
    // 0.10 and 0.12 Ha without relativity; the scalar shift of an actinide
    // 5f here is +0.13 (Pa) to +0.24 Ha (Md), about +0.17 Ha around Pu.
    '94:7s>5f@scalar': 'notBound', '95:7s>5f@scalar': 'notBound',
};

/**
 * The radial solvers' two "could not return the state" messages
 * (StateNotFoundError, eigenvalue_search.ts): the eigenvalue search's own
 * refusal, whose evidence says which check failed (no root bracketed, or a
 * root with the wrong node count), and the containment guard's. A
 * StateNotFoundError in any other shape is a bug in the shape, not a verdict.
 */
export const NOT_FOUND_SHAPES: readonly RegExp[] = [
    /^Radial grid \(rMax=[\d.]+\) is too small to hold .+, or the potential does not bind it: .+\.$/,
    /^Radial grid \(rMax=[\d.]+\) is too small to hold .+: [\d.]+% of the electron's probability lies in the outermost 1% of the grid\. Use a grid sized for this n\.$/,
];

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

export function outcomeKey(species: AtomSpecies, relativity: RelativityMode): string {
    return `${speciesKey(species)}@${relativity}`;
}

export function classify(error: unknown): Verdict {
    if (error instanceof UnboundAnionError) return 'unbound';
    if (error instanceof UnboundElectronError) return 'notBound';
    if (error instanceof StateNotFoundError && NOT_FOUND_SHAPES.some(shape => shape.test(error.message))) return 'noBoundState';
    return 'error';
}

function sweepMode(species: AtomSpecies, relativity: RelativityMode): HeavySweepOutcome {
    const key = outcomeKey(species, relativity);
    try {
        return { key, verdict: solveSpecies(species, relativity).converged ? 'converged' : 'unconverged' };
    } catch (error) {
        return { key, verdict: classify(error), error: `${key}: ${(error as Error).message}` };
    }
}

/** One species: in scalar mode its non-relativistic warm start too (already solved, so free); otherwise the mode alone. */
export function sweepOne(species: AtomSpecies, relativity: RelativityMode): HeavySweepOutcome[] {
    const relativistic = sweepMode(species, relativity);
    return relativity === 'scalar' ? [sweepMode(species, 'off'), relativistic] : [relativistic];
}

/** KNOWN_FAILURES restricted to these outcomes' keys: what this shard must reproduce. */
export function expectedFailures(keys: Iterable<string>): Record<string, Verdict> {
    const expected: Record<string, Verdict> = {};
    for (const key of keys) if (key in KNOWN_FAILURES) expected[key] = KNOWN_FAILURES[key];
    return expected;
}

/**
 * One shard's test body: every species in it, then one summary (runtime and
 * every outcome that did not converge, with its message), then the
 * assertions -- after the summary, so a failure still lists them.
 */
export function runSweep(species: AtomSpecies[], relativity: RelativityMode, label: string): void {
    const started = Date.now();
    const outcomes = species.flatMap(s => sweepOne(s, relativity));
    const failed = outcomes.filter(o => o.verdict !== 'converged');
    const found: Record<string, Verdict> = Object.fromEntries(failed.map(o => [o.key, o.verdict]));
    console.log(
        `${label}: ${species.length} species (${relativity}${relativity === 'scalar' ? ' and off' : ''}) in ${((Date.now() - started) / 1000).toFixed(0)} s\n` +
        `not converged: ${failed.map(o => `${o.key} [${o.verdict}]`).join(', ') || 'none'}\n` +
        `messages: ${failed.map(o => o.error).filter(Boolean).join(' | ') || 'none'}`,
    );
    // Both ways: a new failure and a listed failure that now converges both fail.
    expect(found).toEqual(expectedFailures(outcomes.map(o => o.key)));
    // Only an anion is ever unbound (its key carries the minus sign), and an
    // anion that fails is unbound, never anything else.
    for (const o of failed) expect([o.key, o.verdict === 'unbound']).toEqual([o.key, /^\d+-\d/.test(o.key)]);
}
