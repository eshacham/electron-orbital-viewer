import { AtomSolution, solveAtom } from '../atom/scf';
import { AtomProfile, buildAtomProfile, packRadialCurve, subshellSamplingRadius } from '../atom/atom_profile';

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
}

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
 */
export function buildSerialisedAtomProfile(atom: AtomSolution, enclosedFraction: number): SerialisedAtomProfile {
    const profile: AtomProfile = buildAtomProfile(atom, enclosedFraction);
    const { grid } = atom;

    return {
        Z: atom.Z,
        converged: atom.converged,
        rMin: grid.rMin,
        dx: grid.dx,
        size: grid.size,
        total: packRadialCurve(profile.total.values),
        totalEmphasis: profile.totalEmphasis,
        contourRadius: profile.contourRadius,
        shellPeaks: Float64Array.from(profile.shellPeaks),
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
        })),
    };
}

/** Every ArrayBuffer inside a payload, so it can be transferred rather than copied across the worker boundary. */
function transferListFor(profile: SerialisedAtomProfile): Transferable[] {
    const buffers: Transferable[] = [profile.total.buffer, profile.totalEmphasis.buffer, profile.shellPeaks.buffer];
    for (const shell of profile.shells) buffers.push(shell.curve.buffer, shell.emphasis.buffer);
    for (const subshell of profile.subshells) buffers.push(subshell.curve.buffer, subshell.R.buffer);
    return buffers;
}

// Worker message types
interface WorkerMessageData {
    type: 'solve';
    Z: number;
    enclosedFraction: number;
    /**
     * Task 20: the worker is now reused across requests rather than
     * created and terminated per call (see createAtomWorker.ts and
     * useAtomSolver.ts), so terminate() can no longer be what stops a
     * superseded reply from landing. Echoing this back on the response is
     * what replaces it -- the caller drops any reply whose id no longer
     * matches its latest dispatched request.
     */
    requestId: number;
}

interface WorkerSuccessResponse {
    type: 'success';
    profile: SerialisedAtomProfile;
    requestId: number;
}

interface WorkerErrorResponse {
    type: 'error';
    message: string;
    requestId: number;
}

// The DOM lib types the global `self` as a Window, whose postMessage takes a
// target origin rather than a transfer list. Pulling in the WebWorker lib
// instead would collide with DOM, so describe just the surface used here.
interface WorkerScope {
    onmessage: ((event: MessageEvent<WorkerMessageData>) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
}
const worker = self as unknown as WorkerScope;

worker.onmessage = (e: MessageEvent<WorkerMessageData>) => {
    if (e.data.type !== 'solve') return;

    const { requestId } = e.data;

    try {
        console.log('Worker: Starting SCF solve', { Z: e.data.Z, requestId });
        const atom = solveAtom(e.data.Z);
        const profile = buildSerialisedAtomProfile(atom, e.data.enclosedFraction);

        console.log('Worker: Solve complete', {
            Z: profile.Z,
            iterations: atom.iterations,
            converged: atom.converged,
            subshellCount: profile.subshells.length,
        });

        const response: WorkerSuccessResponse = { type: 'success', profile, requestId };
        worker.postMessage(response, transferListFor(profile));
    } catch (error) {
        console.error('Worker: Error during SCF solve:', error);
        const response: WorkerErrorResponse = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };
        worker.postMessage(response);
    }
};
