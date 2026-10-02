import { AtomSolution, solveAtom, solveSpecies } from '../atom/scf';
import { UnboundAnionError } from '../atom/scf_shared';
import { AtomSpecies, Excitation, isNeutralGround, speciesKey } from '../atom/species';
import { EnergyReading, excitationEnergy, ionisationEnergy } from '../atom/delta_scf';
import { AtomProfile, buildAtomProfile, packRadialCurve, subshellSamplingRadius, compositeSamplingRadius } from '../atom/atom_profile';

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

/** The neutral ground state's radii, carried alongside an ion or excited atom's profile for the reference ring. */
export interface ReferenceRadii { displayRadius: number; contourRadius: number }

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
 * ground state's own key.
 */
export function buildSerialisedAtomProfile(
    atom: AtomSolution,
    enclosedFraction: number,
    extras: { speciesKey?: string; reference?: ReferenceRadii | null } = {}
): SerialisedAtomProfile {
    const profile: AtomProfile = buildAtomProfile(atom, enclosedFraction);
    const { grid } = atom;

    return {
        Z: atom.Z,
        converged: atom.converged,
        charge: atom.charge,
        speciesKey: extras.speciesKey ?? String(atom.Z),
        reference: extras.reference ?? null,
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
    };
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
    return buffers;
}

// Worker message types
/**
 * `'solve'` carries a species -- `charge`/`excitation` default to a neutral
 * ground state so every existing caller (and hand-built test fixture) that
 * only ever named a `Z` still type-checks. `'energies'` is a separate
 * request so a slow ΔSCF energies solve (useDeltaScfEnergies' own worker,
 * Task 9) never queues in front of a picture solve on this one.
 */
export type AtomWorkerRequest =
    | { type: 'solve'; Z: number; charge?: number; excitation?: Excitation | null; enclosedFraction: number; requestId: number }
    | { type: 'energies'; Z: number; charge: number; excitation: Excitation | null; requestId: number };

/**
 * `'unbound'` is a distinct reply from `'error'` (spec §3.5): an anion LDA
 * cannot bind is an expected, explained outcome, not a failure to show
 * alongside a genuine solve error.
 */
export type AtomWorkerResponse =
    | { type: 'success'; profile: SerialisedAtomProfile; requestId: number }
    | { type: 'unbound'; message: string; requestId: number }
    | { type: 'error'; message: string; requestId: number }
    | { type: 'energies'; speciesKey: string; ionisation: EnergyReading | null; excitation: EnergyReading | null; requestId: number };

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
            return {
                response: { type: 'energies', speciesKey: speciesKey(species), ionisation: ionisationEnergy(species), excitation: excitationEnergy(species), requestId },
                transfer: [],
            };
        }
        const atom = solveSpecies(species);
        const reference = isNeutralGround(species) ? null : (() => {
            const neutral = buildAtomProfile(solveAtom(species.Z), data.enclosedFraction);
            return { displayRadius: neutral.displayRadius, contourRadius: neutral.contourRadius };
        })();
        const profile = buildSerialisedAtomProfile(atom, data.enclosedFraction, { speciesKey: speciesKey(species), reference });
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
