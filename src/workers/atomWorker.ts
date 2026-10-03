import { AtomSolution, solveAtom, solveSpecies } from '../atom/scf';
import { UnboundAnionError, UnboundElectronError } from '../atom/scf_shared';
import { AtomSpecies, Excitation, isNeutralGround, neutralGround, speciesConfiguration, speciesKey, speciesTitle } from '../atom/species';
import { RelativityMode, scfLabel } from '../atom/relativity';
import { subshellLabel } from '../atom/configurations';
import { ValenceSContraction, valenceSContraction } from '../atom/relativistic_comparison';
import { EnergyReading, excitationEnergy, ionisationEnergy } from '../atom/delta_scf';
import { AtomProfile, buildAtomProfile, packRadialCurve, subshellSamplingRadius, compositeSamplingRadius } from '../atom/atom_profile';
import { wholeAtomFramingRadius } from '../atom/framing';

/** One shell's contribution, flattened for the worker boundary. */
export interface SerialisedShell {
    n: number;
    electrons: number;
    /** Radius enclosing the profile's requested fraction of this shell's electrons. */
    contourRadius: number;
    /** D(r) for this shell, on the shared log grid (see SerialisedAtomProfile). */
    curve: Float64Array;
    /** This shell's own curve divided by its running maximum (see `shellEmphasis`) -- what the level-2 cut face actually colours. */
    emphasis: Float32Array;
}

/** One subshell's contribution, flattened for the worker boundary. */
export interface SerialisedSubshell {
    n: number;
    l: number;
    /** The j-level; present only with spin–orbit, where each (n, l) with l > 0 is two entries. */
    j?: number;
    electrons: number;
    /** Eigenvalue in Hartree (negative for a bound state). */
    energy: number;
    /** D(r) for this subshell, on the shared log grid. */
    curve: Float64Array;
    /**
     * R(r) for this subshell, on the shared log grid below. This is exactly
     * what Task 8's `OrbitalParams.radialSamples` needs (together with the
     * grid parameters), so level 3 can build a numerical radial override
     * from a solved atom without re-running the SCF loop client-side.
     */
    R: Float64Array;
    /**
     * How far out level 3's marching-cubes sampling box needs to reach to
     * hold this subshell's whole orbital lobe (spec bugfix -- see
     * `subshellSamplingRadius`'s doc comment). **Not** the same quantity as
     * a shell's `contourRadius` above: this one is fixed at a generous
     * 99.99% regardless of the user's chosen enclosed fraction, because the
     * sampling box has to contain the isosurface no matter what fraction
     * the surface itself is later asked to enclose.
     */
    samplingRadius: number;
    /**
     * The sampling box for this subshell's orbitals in the **shell-
     * composition view**, which renders up to sixteen of them at once on a
     * much coarser grid than a single level-3 orbital gets. Sized from the
     * contour actually drawn rather than the 99.99% tail -- see
     * `compositeSamplingRadius` in atom_profile.ts for the measurements.
     */
    compositeSamplingRadius: number;
}

/**
 * The same species' non-relativistic solve, on the same grid, reduced to the
 * curves the radial plot overlays dashed (spec §5 Phase 4: "the radial plot
 * overlays the non-relativistic curve for comparison"). Per (n, l) even with
 * spin–orbit -- the non-relativistic atom has no j-levels.
 */
export interface SerialisedComparison {
    shells: Array<{ n: number; curve: Float64Array }>;
    subshells: Array<{ n: number; l: number; electrons: number; curve: Float64Array }>;
}

/** The neutral ground state's radii, carried alongside an ion or excited atom's profile for the reference ring. */
/**
 * `framingRadius` is where the neutral atom's own whole-atom view frames the
 * camera (atom/framing.ts). The ion is framed on at least that, so stepping
 * Na -> Na⁺ -> Na or He -> He⁺ -> He leaves the camera where it is (ruling
 * C12): the neutral's drawn radius would not do, because a neutral is often
 * framed inside its own sphere (He: 1.43 a₀ against 1.76).
 */
export interface ReferenceRadii { displayRadius: number; contourRadius: number; framingRadius: number }

/**
 * Everything the UI needs from one converged `AtomSolution`, flattened to
 * plain numbers, plain arrays/objects and typed arrays so it can cross a
 * worker boundary with `postMessage` (ruling R2). No class instances, no
 * closures: `AtomSolution` and `AtomProfile` carry both, so this is a
 * deliberate re-shaping of their contents rather than those types themselves.
 */
export interface SerialisedAtomProfile {
    Z: number;
    /**
     * Whether the SCF loop actually converged (ruling R17). Every element in
     * this app's range does, in practice, but the UI must still be able to
     * tell the difference rather than silently drawing a converged-looking
     * picture from an iteration limit's last, unconverged guess.
     */
    converged: boolean;
    /** Z minus the electron count. Optional only so older hand-built test fixtures still type-check. */
    charge?: number;
    /** speciesKey of what was solved ('11', '11+1', '11:3s>3p'); what the caches and the animation guard key on. */
    speciesKey?: string;
    /**
     * The neutral ground state's radii, for the reference ring (spec: "a
     * compare strip shows the neutral atom's contour ring"). Null for a
     * neutral ground state, which is its own reference.
     */
    reference?: ReferenceRadii | null;
    /**
     * Why an ion or excited atom carries no reference ring: the neutral atom
     * failed in the same mode (ruling C4 solves it in the species' own
     * mode). The ring is an extra, so its failure costs the ring and the
     * camera's framing floor, never the picture; this says so, naming the
     * method that failed. Null whenever there is nothing to explain.
     */
    referenceUnavailable?: string | null;
    /**
     * Which radial equation drew this profile; absent means 'off', which
     * keeps every hand-built test profile valid. The store compares it with
     * the mode the switch shows, so a picture from the other mode is never
     * taken for the current one (ruling C9).
     */
    relativity?: RelativityMode;
    /**
     * The same species' non-relativistic curves, for the dashed overlay
     * (ruling C5: the species itself, not the neutral atom). Null for a
     * non-relativistic profile, which is its own baseline, and for a
     * relativistic one whose baseline does not exist (see
     * `comparisonUnavailable`).
     */
    nonRelativistic?: SerialisedComparison | null;
    /** The valence s shell's relativistic contraction, "what changed"; null wherever `nonRelativistic` is. */
    valenceS?: ValenceSContraction | null;
    /**
     * Why a relativistic profile carries no comparison, in words for the
     * reader: Pr-Eu 6s -> 4f have no non-relativistic answer at all (LDA does
     * not bind the promoted 4f without relativity, ruling T7-b), yet a
     * relativistic mode may bind it. The picture still lands; this says why
     * there is nothing dashed beside it. Null whenever there is nothing to
     * explain.
     */
    comparisonUnavailable?: string | null;
    /**
     * The shared log grid every curve and R array below is sampled on:
     * r_j = rMin * e^(j*dx), j = 0..size-1. One set of parameters suffices
     * because `buildAtomProfile` samples every curve on `atom.grid`.
     */
    rMin: number;
    dx: number;
    size: number;
    /**
     * Whole-atom D(r) on the shared log grid above, packed to Float32
     * (ruling R25 — supersedes the old uniform-in-r `resampled`/
     * `resampledRMax` fields). The shader indexes this directly on the log
     * spacing the data already lives on:
     *
     *   float t = log(r / rMin) / dx;
     *   float texCoord = (t + 0.5) / float(size);
     *
     * which is exact at every scale — no resampling step to silently lose a
     * heavy atom's inner shells the way a fixed-sample uniform-in-r table
     * did (uranium's K shell retained only 22% of its true height at 256
     * samples). Raw and unnormalised (ruling R16): a shell's peak can be
     * three orders of magnitude below the innermost one, and normalising or
     * quantising here would erase it before the shader's own perceptual
     * ramp ever sees it — the float32 narrowing keeps ~7 significant figures
     * regardless of magnitude, so it doesn't have that effect.
     */
    total: Float32Array;
    /**
     * `total` divided by a smoothed running maximum of itself (see
     * `shellEmphasis` in atom_profile.ts). This, not `total`, is what the
     * level-1 cut face colours: `total` alone spans about three orders of
     * magnitude between a heavy atom's K shell and its valence, which
     * crushes every shell peak against a single global scale (uranium's
     * inner troughs sat 0.028 below their neighbouring peaks -- invisible).
     * Dividing by a *local* running maximum instead means a shell peak
     * approaches 1 regardless of its absolute height, and a trough between
     * two peaks drops well below whichever neighbour is taller, at every
     * radius. Already bounded to [0, 1] by construction, so unlike `total`
     * there is no precision concern in shipping it as float32.
     */
    totalEmphasis: Float32Array;
    /** Radius enclosing the profile's requested fraction of all electrons. */
    contourRadius: number;
    /** Radius of the outermost occupied shell's own D(r) peak. */
    valencePeakRadius: number;
    /**
     * How large to draw the whole atom: `contourRadius`, widened where
     * needed so the valence shell's peak is inside the sphere with
     * clearance. See `AtomProfile.displayRadius` for why the two are
     * separate quantities -- "where is 90% of the charge" and "how big is
     * this atom" have different answers, and the first one cut the valence
     * shell off screen for most of the periodic table.
     */
    displayRadius: number;
    /**
     * Radii of the total D(r)'s resolved local maxima.
     *
     * Display annotation only (ruling R26): shell identity comes from
     * `shells`/`subshells` above, not from this list. Neighbouring shells'
     * D(r) genuinely merge into one maximum from around Z≈26 onward, so
     * `shellPeaks.length` is not the shell count and must never be zipped
     * positionally against `shells`.
     */
    shellPeaks: Float64Array;
    /**
     * Which shell (by position in `shells`, ascending n) dominates the
     * total D(r) at each grid point of the shared log grid above --
     * Addendum 2's atom-level ring colouring. Packed as float rather than
     * kept as the `Uint8Array` `buildAtomProfile` produces it as: the
     * consumer (shell_view.ts's cap shader) reads it through the same
     * float-texture machinery as every other curve here.
     */
    shellIndexAtR: Float32Array;
    shells: SerialisedShell[];
    subshells: SerialisedSubshell[];
}

/**
 * Flattens a converged `AtomSolution` into the wire format above.
 *
 * Exported (rather than kept as a private helper of the onmessage handler)
 * so the serialisation contract can be tested directly, without going
 * through `self`/`postMessage` at all -- see the module doc on WorkerScope
 * below for why the DOM worker surface itself is not exercised in tests.
 *
 * `extras` is optional so existing callers (and hand-built test fixtures)
 * that only ever solved a neutral atom still type-check unchanged;
 * `speciesKey` defaults to `String(atom.Z)`, which is exactly a neutral
 * ground state's own key. `nonRelativistic` is the same species' converged
 * non-relativistic solve, passed only with a relativistic `atom`;
 * `comparisonUnavailable` says why it is missing when it is.
 */
export function buildSerialisedAtomProfile(
    atom: AtomSolution,
    enclosedFraction: number,
    extras: {
        speciesKey?: string;
        reference?: ReferenceRadii | null;
        referenceUnavailable?: string | null;
        nonRelativistic?: AtomSolution | null;
        comparisonUnavailable?: string | null;
    } = {}
): SerialisedAtomProfile {
    const profile: AtomProfile = buildAtomProfile(atom, enclosedFraction);
    const { grid } = atom;
    const nonRelativistic = extras.nonRelativistic ?? null;
    let comparison: SerialisedComparison | null = null;
    if (nonRelativistic) {
        // The dashed curve is drawn against the same radius axis, so it must
        // live on the same grid; solveSpecies sizes both with gridForAtom(Z,
        // highest n), which the two solves of one species share.
        const reference = nonRelativistic.grid;
        if (reference.size !== grid.size || reference.rMin !== grid.rMin || reference.dx !== grid.dx) {
            throw new Error('The non-relativistic comparison was solved on a different grid.');
        }
        const baseline = buildAtomProfile(nonRelativistic, enclosedFraction);
        comparison = {
            shells: baseline.shells.map(shell => ({ n: shell.n, curve: shell.curve.values })),
            subshells: baseline.subshells.map(s => ({ n: s.n, l: s.l, electrons: s.electrons, curve: s.curve.values })),
        };
    }

    return {
        Z: atom.Z,
        converged: atom.converged,
        charge: atom.charge,
        speciesKey: extras.speciesKey ?? String(atom.Z),
        reference: extras.reference ?? null,
        referenceUnavailable: extras.referenceUnavailable ?? null,
        rMin: grid.rMin,
        dx: grid.dx,
        size: grid.size,
        total: packRadialCurve(profile.total.values),
        totalEmphasis: profile.totalEmphasis,
        contourRadius: profile.contourRadius,
        valencePeakRadius: profile.valencePeakRadius,
        displayRadius: profile.displayRadius,
        shellPeaks: Float64Array.from(profile.shellPeaks),
        shellIndexAtR: Float32Array.from(profile.shellIndexAtR),
        shells: profile.shells.map(shell => ({
            n: shell.n,
            electrons: shell.electrons,
            contourRadius: shell.contourRadius,
            curve: shell.curve.values,
            emphasis: shell.emphasis,
        })),
        // profile.subshells is built from atom.states in the same order
        // (atom_profile.ts's buildAtomProfile maps states.map(...) directly),
        // so indexing atom.states by position lines each subshell back up
        // with the R(r) array the SCF solver produced for it.
        subshells: profile.subshells.map((subshell, i) => ({
            n: subshell.n,
            l: subshell.l,
            ...(subshell.j !== undefined ? { j: subshell.j } : {}),
            electrons: subshell.electrons,
            energy: subshell.energy,
            curve: subshell.curve.values,
            // .slice() -- not the cached AtomSolution's own array -- because
            // transferListFor below hands this buffer to postMessage's
            // transfer list, which *detaches* it (Task 20: with solveAtom
            // now actually reused across requests for the same Z, the same
            // `atom.states[i].R` would otherwise be handed over, and
            // therefore detached, on a later request too -- a second
            // enclosedFraction for an already-solved element, say -- which
            // throws a DataCloneError since a detached buffer can't be
            // transferred again). Every other array here (`curve.values`,
            // `shell.curve`, `shellPeaks`, ...) is already rebuilt fresh by
            // buildAtomProfile/packRadialCurve on every call and needs no
            // such copy; this is the one place a serialised profile still
            // reached directly into the solver's own, potentially-reused
            // state.
            R: atom.states[i].R.slice(),
            samplingRadius: subshellSamplingRadius(grid, subshell.curve.values),
            compositeSamplingRadius: compositeSamplingRadius(grid, subshell.curve.values, subshell.contourRadius),
        })),
        relativity: atom.relativity,
        nonRelativistic: comparison,
        valenceS: nonRelativistic ? valenceSContraction(nonRelativistic, atom) : null,
        comparisonUnavailable: extras.comparisonUnavailable ?? null,
    };
}

// Keyed on the neutral atom's own solve key and the fraction -- an ion's
// reference ring is always the *neutral* atom's radii, so this is
// deliberately independent of charge and excitation, but not of the mode
// (ruling C4): `${Z}:${enclosedFraction}` without relativity, exactly as
// before, and `${Z}@${relativity}:${enclosedFraction}` with it, built on the
// solve cache's own `${speciesKey}@${relativity}` (ruling C2). Without it,
// every ion or excited-atom request would rerun buildAtomProfile on the
// neutral solution from scratch even though solveAtom(Z) itself is already
// memoised; the SCF part was never the expense here, but there is no reason
// to repeat even the cheap part on every request for the same (Z, mode,
// fraction).
const referenceRadiiCache = new Map<string, ReferenceRadii>();

/**
 * The neutral ground state's radii for the reference ring, solved in the
 * ion's own mode (ruling C4): comparing a relativistic ion against a
 * non-relativistic neutral reference would silently compare two different
 * methods, in the ring and in the camera's framing floor alike.
 */
function referenceRadiiFor(Z: number, enclosedFraction: number, relativity: RelativityMode): ReferenceRadii {
    const neutralKey = relativity === 'off' ? String(Z) : `${Z}@${relativity}`;
    const key = `${neutralKey}:${enclosedFraction}`;
    const hit = referenceRadiiCache.get(key);
    if (hit) return hit;
    const neutral = buildAtomProfile(solveAtom(Z, relativity), enclosedFraction);
    const radii: ReferenceRadii = {
        displayRadius: neutral.displayRadius,
        contourRadius: neutral.contourRadius,
        framingRadius: wholeAtomFramingRadius(neutral),
    };
    referenceRadiiCache.set(key, radii);
    return radii;
}

/** Every ArrayBuffer inside a payload, so it can be transferred rather than copied across the worker boundary. */
function transferListFor(profile: SerialisedAtomProfile): Transferable[] {
    const buffers: Transferable[] = [
        profile.total.buffer,
        profile.totalEmphasis.buffer,
        profile.shellPeaks.buffer,
        profile.shellIndexAtR.buffer,
    ];
    for (const shell of profile.shells) buffers.push(shell.curve.buffer, shell.emphasis.buffer);
    for (const subshell of profile.subshells) buffers.push(subshell.curve.buffer, subshell.R.buffer);
    // Fresh arrays from the comparison's own buildAtomProfile, never shared
    // with the curves above, so no buffer is listed twice.
    for (const shell of profile.nonRelativistic?.shells ?? []) buffers.push(shell.curve.buffer);
    for (const subshell of profile.nonRelativistic?.subshells ?? []) buffers.push(subshell.curve.buffer);
    return buffers;
}

// Worker message types
/**
 * `'solve'` carries a species -- `charge`/`excitation` default to a neutral
 * ground state so every existing caller (and hand-built test fixture) that
 * only ever named a `Z` still type-checks, and an absent `relativity` means
 * 'off' for the same reason. `'energies'` is a separate
 * request so a slow ΔSCF energies solve (useDeltaScfEnergies' own worker,
 * Task 9) never queues in front of a picture solve on this one.
 *
 * `requestId` on both this and `AtomWorkerResponse` below: Task 20 made the
 * worker long-lived (reused across requests rather than created and
 * terminated per call), which means `terminate()` can no longer be what
 * stops a superseded reply from landing. Echoing the id back is what
 * replaces it -- a caller drops any reply whose id no longer matches its
 * latest dispatched request.
 */
export type AtomWorkerRequest =
    | { type: 'solve'; Z: number; charge?: number; excitation?: Excitation | null; enclosedFraction: number; relativity?: RelativityMode; requestId: number }
    | { type: 'energies'; Z: number; charge: number; excitation: Excitation | null; requestId: number };

/**
 * `'unbound'` is a distinct reply from `'error'` (spec §3.5): an anion LDA
 * cannot bind is an expected, explained outcome, not a failure to show
 * alongside a genuine solve error -- and so, since ruling T7-b, is an
 * excited species whose promoted electron LDA does not bind (Sm 6s → 4f).
 */
export type AtomWorkerResponse =
    | { type: 'success'; profile: SerialisedAtomProfile; requestId: number }
    | { type: 'unbound'; message: string; requestId: number }
    | { type: 'error'; message: string; requestId: number }
    | { type: 'energies'; speciesKey: string; ionisation: EnergyReading | null; excitation: EnergyReading | null; requestId: number };

/**
 * What the user reads when a solve fails (ruling T7-f): the method and the
 * species first -- "Scalar-relativistic SCF for Samarium, excited 6s → 4f"
 * -- then why. An electron the field does not bind (UnboundElectronError,
 * ruling T7-b) is said in words, "the promoted 4f electron is not bound",
 * rather than with the solver's own sentence; anything else keeps its own
 * explanation. The mode is the request's: the same species may solve in
 * another one.
 */
export function solveFailureMessage(species: AtomSpecies, relativity: RelativityMode, error: unknown): string {
    const what = `${scfLabel(relativity)} for ${speciesTitle(species)}`;
    if (error instanceof UnboundElectronError) {
        const label = subshellLabel(error.n, error.l, error.j);
        const to = species.excitation?.to;
        const promoted = to !== undefined && to.n === error.n && to.l === error.l ? 'promoted ' : '';
        return `${what}: the ${promoted}${label} electron is not bound (LDA binds it by less than 10⁻⁴ Ha).`;
    }
    return `${what} failed: ${error instanceof Error ? error.message : 'unknown error'}`;
}

/**
 * The same species' non-relativistic solve, the baseline for the dashed
 * curves and "what changed" (ruling C5) -- or, where there is none, why not.
 * A relativistic picture never waits on its baseline: Pr-Eu 6s -> 4f have no
 * non-relativistic answer (the promoted 4f is unbound without relativity,
 * ruling T7-b) and a relativistic mode may still bind it, so a failed or
 * unconverged baseline costs only the comparison, never the picture. Usually
 * a cache hit: solveSpecies warm-starts the relativistic solve from exactly
 * this one.
 */
function nonRelativisticBaseline(species: AtomSpecies): { nonRelativistic: AtomSolution | null; comparisonUnavailable: string | null } {
    const none = (why: string) => ({ nonRelativistic: null, comparisonUnavailable: `No non-relativistic comparison: ${why}` });
    let baseline: AtomSolution;
    try {
        baseline = solveSpecies(species, 'off');
    } catch (error) {
        if (error instanceof UnboundElectronError) {
            return none(`LDA does not bind the ${subshellLabel(error.n, error.l, error.j)} without relativity.`);
        }
        return none(`the non-relativistic SCF failed (${error instanceof Error ? error.message : 'unknown error'}).`);
    }
    // Ruling R17 holds for the dashed curve as for the picture: an
    // iteration limit's last guess is not drawn as an answer.
    if (!baseline.converged) return none('the non-relativistic SCF did not converge.');
    return { nonRelativistic: baseline, comparisonUnavailable: null };
}

/**
 * One request in, one response out -- exported so the protocol is tested
 * without a Worker (see the module note on WorkerScope). The same module
 * serves two worker instances: useAtomSolver's (pictures) and
 * useDeltaScfEnergies' (energies), so a slow ΔSCF never queues in front of
 * a picture.
 */
export function handleAtomWorkerRequest(data: AtomWorkerRequest): { response: AtomWorkerResponse; transfer: Transferable[] } {
    const { requestId } = data;
    const species: AtomSpecies = { Z: data.Z, charge: data.charge ?? 0, excitation: data.excitation ?? null };
    try {
        if (data.type === 'energies') {
            // ionisationEnergy/excitationEnergy only ever look *past* this
            // species (the next ion up, or its own un-excited ground state),
            // so neither one validates a charge or excitation this element
            // doesn't itself offer -- speciesConfiguration does, throwing the
            // same "not offered" error solveSpecies would for the 'solve'
            // path, caught below like any other throw from this branch.
            speciesConfiguration(species);
            try {
                return {
                    response: { type: 'energies', speciesKey: speciesKey(species), ionisation: ionisationEnergy(species), excitation: excitationEnergy(species), requestId },
                    transfer: [],
                };
            } catch (error) {
                if (!(error instanceof UnboundElectronError)) throw error;
                // The picture's restricted LDA can bind a level the energies'
                // spin-polarised LDA does not (Tb-Er 6s -> 4f): say which
                // calculation, for which species, rather than the solver's
                // bare sentence under a picture that shows the level bound.
                const label = subshellLabel(error.n, error.l, error.j);
                const message = `Spin-polarised ΔSCF for ${speciesTitle(species)}: its ${label} electron is not bound in the spin-polarised LDA the energies use (the picture's spin-restricted LDA binds it), so no energy is given.`;
                return { response: { type: 'error', message, requestId }, transfer: [] };
            }
        }
        // Checked before the solve, so a species that is not offered says so
        // plainly rather than as a failed SCF.
        speciesConfiguration(species);
        const relativity = data.relativity ?? 'off';
        let atom: AtomSolution;
        try {
            atom = solveSpecies(species, relativity);
        } catch (error) {
            if (error instanceof UnboundAnionError) throw error;
            const message = solveFailureMessage(species, relativity, error);
            const type = error instanceof UnboundElectronError ? 'unbound' : 'error';
            return { response: { type, message, requestId }, transfer: [] };
        }
        let reference: ReferenceRadii | null = null;
        let referenceUnavailable: string | null = null;
        if (!isNeutralGround(species)) {
            try {
                reference = referenceRadiiFor(species.Z, data.enclosedFraction, relativity);
            } catch (error) {
                referenceUnavailable = `No neutral reference ring: ${solveFailureMessage(neutralGround(species.Z), relativity, error)}`;
            }
        }
        const { nonRelativistic, comparisonUnavailable } = relativity === 'off'
            ? { nonRelativistic: null, comparisonUnavailable: null }
            : nonRelativisticBaseline(species);
        const profile = buildSerialisedAtomProfile(atom, data.enclosedFraction, {
            speciesKey: speciesKey(species), reference, referenceUnavailable, nonRelativistic, comparisonUnavailable,
        });
        return { response: { type: 'success', profile, requestId }, transfer: transferListFor(profile) };
    } catch (error) {
        if (error instanceof UnboundAnionError) return { response: { type: 'unbound', message: error.message, requestId }, transfer: [] };
        return { response: { type: 'error', message: error instanceof Error ? error.message : 'Unknown error', requestId }, transfer: [] };
    }
}

// The DOM lib types the global `self` as a Window, whose postMessage takes a
// target origin rather than a transfer list. Pulling in the WebWorker lib
// instead would collide with DOM, so describe just the surface used here.
interface WorkerScope {
    onmessage: ((event: MessageEvent<AtomWorkerRequest>) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
}
const worker = self as unknown as WorkerScope;

worker.onmessage = (e: MessageEvent<AtomWorkerRequest>) => {
    if (e.data.type !== 'solve' && e.data.type !== 'energies') return;
    const { response, transfer } = handleAtomWorkerRequest(e.data);
    worker.postMessage(response, transfer);
};
