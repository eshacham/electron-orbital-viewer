import { AtomSolution, solveAtom } from '../atom/scf';
import { AtomProfile, buildAtomProfile, packRadialCurve } from '../atom/atom_profile';

/** One shell's contribution, flattened for the worker boundary. */
export interface SerialisedShell {
    n: number;
    electrons: number;
    /** Radius enclosing the profile's requested fraction of this shell's electrons. */
    contourRadius: number;
    /** D(r) for this shell, on the shared log grid (see SerialisedAtomProfile). */
    curve: Float64Array;
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
        rMin: grid.rMin,
        dx: grid.dx,
        size: grid.size,
        total: packRadialCurve(profile.total.values),
        contourRadius: profile.contourRadius,
        shellPeaks: Float64Array.from(profile.shellPeaks),
        shells: profile.shells.map(shell => ({
            n: shell.n,
            electrons: shell.electrons,
            contourRadius: shell.contourRadius,
            curve: shell.curve.values,
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
            R: atom.states[i].R,
        })),
    };
}

/** Every ArrayBuffer inside a payload, so it can be transferred rather than copied across the worker boundary. */
function transferListFor(profile: SerialisedAtomProfile): Transferable[] {
    const buffers: Transferable[] = [profile.total.buffer, profile.shellPeaks.buffer];
    for (const shell of profile.shells) buffers.push(shell.curve.buffer);
    for (const subshell of profile.subshells) buffers.push(subshell.curve.buffer, subshell.R.buffer);
    return buffers;
}

// Worker message types
interface WorkerMessageData {
    type: 'solve';
    Z: number;
    enclosedFraction: number;
}

interface WorkerSuccessResponse {
    type: 'success';
    profile: SerialisedAtomProfile;
}

interface WorkerErrorResponse {
    type: 'error';
    message: string;
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

    try {
        console.log('Worker: Starting SCF solve', { Z: e.data.Z });
        const atom = solveAtom(e.data.Z);
        const profile = buildSerialisedAtomProfile(atom, e.data.enclosedFraction);

        console.log('Worker: Solve complete', {
            Z: profile.Z,
            iterations: atom.iterations,
            converged: atom.converged,
            subshellCount: profile.subshells.length,
        });

        const response: WorkerSuccessResponse = { type: 'success', profile };
        worker.postMessage(response, transferListFor(profile));
    } catch (error) {
        console.error('Worker: Error during SCF solve:', error);
        const response: WorkerErrorResponse = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        };
        worker.postMessage(response);
    }
};
