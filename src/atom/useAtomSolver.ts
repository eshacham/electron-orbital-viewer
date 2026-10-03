import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { solveStarted, solveSucceeded, solveFailed, solveUnbound } from '../store/atomSlice';
import { createAtomWorker } from '../workers/createAtomWorker';
import type { AtomWorkerResponse } from '../workers/atomWorker';
import { getCachedProfile, setCachedProfile } from './profile_cache';
import { speciesKey, speciesTitle } from './species';

/**
 * Every reply atomWorker.ts can post, `requestId` echoed from the request
 * that produced it (see requestId below). One type for both workers: this
 * hook's picture worker and useDeltaScfEnergies' energies worker run the
 * same module.
 */
export type AtomWorkerMessage = AtomWorkerResponse;

/**
 * The surface useAtomSolver actually needs from a worker. Real callers get a
 * real DOM `Worker` (which satisfies this structurally); tests inject a
 * plain object instead, so this hook's dispatch logic -- in particular the
 * R17 converged check -- can be exercised without a Worker/postMessage
 * boundary at all.
 */
export interface AtomWorkerHandle {
    postMessage(message: unknown): void;
    terminate(): void;
    onmessage: ((event: MessageEvent<AtomWorkerMessage>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
}

/**
 * Owns the atom-mode SCF worker's lifecycle.
 *
 * Task 20 fix: this used to create a fresh worker per request and terminate
 * it in the effect's cleanup, which -- as the effect's own dependency array
 * below shows -- happened on every mode/Z/enclosedFraction change, i.e. on
 * every request. atomWorker.ts's `solveAtom` memoisation (ruling R28) lives
 * in that worker's module scope, so a fresh worker every time meant an empty
 * cache every time; the memoisation had never once been reachable in the
 * running app. The worker is now created once (lazily, on first use) and
 * kept for the life of this hook, so its module scope -- and the cache
 * inside it -- actually persists across requests.
 *
 * Reusing the worker removes the one thing `terminate()` used to guarantee:
 * that a slower, superseded solve could never land after a faster later
 * one (Z/enclosedFraction/mode changing again before a solve finishes).
 * `requestId` replaces it -- bumped on every dispatched request and echoed
 * back by the worker on its reply, so a reply belonging to a request this
 * hook has already moved past is recognised and dropped rather than
 * applied. See `latestRequestId` below.
 *
 * Ruling R28 also motivates the second half of this fix, `profile_cache.ts`:
 * `solveAtom` costs up to ~8.6s (uranium), and with only the worker's own
 * memoisation, reaching a warm cache still meant a postMessage round trip.
 * Checking the main-thread cache first means a mode switch or a repeat
 * element/fraction pick needs no worker interaction at all, and keeps
 * working even if the worker happens to be busy with an unrelated request.
 *
 * Keying the per-request effect on the species (Z, charge, excitation), the
 * fraction and solveNonce is what ensures only a genuine change to what
 * should be solved re-requests anything -- the pure navigation actions in
 * atomSlice (drillToShell, drillToSubshell, drillToOrbital, levelUp,
 * goToLevel) touch none of them, so none of them can retrigger this effect.
 * Both caches are keyed the same way, by `speciesKey` -- a neutral ground
 * state's key is String(Z), exactly what they were keyed by before ions.
 *
 * `solveNonce` is there because the others are not sufficient: it is
 * bumped by every species change, and each one clears the profile
 * unconditionally. Without it, re-picking the element already selected
 * cleared the profile while leaving mode/Z/fraction unchanged, so this
 * effect never re-ran and the app sat in "solving" forever with nothing on
 * screen. Found live; the profile cache makes the repeat case immediate.
 *
 * Known issue this closes (see progress.md): `setElement` clears `profile`
 * without setting `isSolving`, which left a one-frame "idle, no profile"
 * gap between the reducer commit and this effect's own solveStarted. The
 * real fix has to live at the call site -- dispatching setElement and
 * solveStarted together so React batches them into one render (see
 * App.tsx's element-picker handler) -- but solveStarted is also dispatched
 * here, both as a harmless no-op in that case and as the only place that
 * covers the enclosedFraction-only change and the initial mount solve.
 */
export function useAtomSolver(
    enclosedFraction: number,
    createWorker: () => AtomWorkerHandle = createAtomWorker
): void {
    const dispatch = useAppDispatch();
    const mode = useAppSelector(state => state.atom.mode);
    const Z = useAppSelector(state => state.atom.Z);
    const charge = useAppSelector(state => state.atom.charge);
    const excitation = useAppSelector(state => state.atom.excitation);
    // Re-picking the element already selected must still produce a solve --
    // `setElement` has cleared the profile by then. See AtomState.solveNonce.
    const solveNonce = useAppSelector(state => state.atom.solveNonce);

    // One worker for this hook's whole lifetime, not one per request -- see
    // the doc comment above. Created lazily (on the first atom-mode
    // request) rather than eagerly, so mounting in hydrogenic mode never
    // spins one up needlessly.
    const workerRef = useRef<AtomWorkerHandle | null>(null);
    // The id of the most recently *dispatched* request, cache hits included
    // -- see the effect below, which bumps this before checking the cache
    // so a stale worker reply arriving after a cache hit is superseded too.
    const latestRequestId = useRef(0);

    // Owns only the worker's lifecycle: created on demand by the effect
    // below, torn down here on unmount. Deliberately separate from the
    // per-request effect so that effect's own cleanup never has to touch
    // the worker (there is nothing left for it to terminate mid-flight).
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (mode !== 'atom') return;

        const requestId = ++latestRequestId.current;
        const key = speciesKey({ Z, charge, excitation });

        // Layer 2 of the fix: a solved profile is a pure function of
        // (species, enclosedFraction), so a hit here needs no worker round
        // trip at all -- this is what makes a mode switch away and back, or
        // re-picking the same element, immediate rather than another
        // multi-second solve.
        const cached = getCachedProfile(key, enclosedFraction);
        if (cached) {
            dispatch(solveSucceeded(cached));
            return;
        }

        dispatch(solveStarted());
        if (!workerRef.current) workerRef.current = createWorker();
        const worker = workerRef.current;

        worker.onmessage = (event) => {
            // A straggler from a request this hook has already moved past
            // (see requestId's doc comment above) -- drop it rather than
            // let a slower earlier solve land after a faster later one.
            if (event.data.requestId !== requestId) return;

            // Spec §3.5: an anion LDA cannot bind (or an excitation whose
            // promoted electron it does not bind) has no profile to read, and
            // is reported as itself rather than as a solve error. Never
            // cached: nothing was solved, and re-picking it is cheap -- the
            // SCF gives up within a few iterations.
            if (event.data.type === 'unbound') {
                dispatch(solveUnbound(event.data.message));
                return;
            }
            if (event.data.type === 'error') {
                dispatch(solveFailed(event.data.message));
                return;
            }
            // 'energies' replies belong to useDeltaScfEnergies' own worker;
            // this one is never asked for them.
            if (event.data.type !== 'success') return;
            const { profile } = event.data;
            // Ruling R17: never render an atom the solver did not converge
            // for. This should never fire -- every element in range
            // converges -- but silently drawing a wrong picture instead of
            // reporting it would be worse than the ruling it violates.
            if (profile.converged) {
                setCachedProfile(key, enclosedFraction, profile);
                dispatch(solveSucceeded(profile));
            } else {
                // Named by species, not Z: "Z=19" says neither the element
                // nor that it was K 4s -> 4d, not K, that failed.
                dispatch(solveFailed(`The SCF calculation for ${speciesTitle({ Z, charge, excitation })} did not converge.`));
            }
        };
        worker.onerror = (event) => {
            dispatch(solveFailed(event.message || `Could not solve ${speciesTitle({ Z, charge, excitation })}.`));
        };

        worker.postMessage({ type: 'solve', Z, charge, excitation, enclosedFraction, requestId });

        // No worker cleanup here any more -- the worker is shared across
        // requests (see workerRef's effect above), and the requestId check
        // in onmessage is what now provides the supersession guarantee
        // terminate() used to.
        // createWorker deliberately excluded from the dependency array: the
        // default value is a fresh closure on every call to this hook, and
        // including it would refire this effect on every render -- the same
        // intentionally-incomplete dependency array pattern Controls.tsx's
        // own n/l effects use.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, Z, charge, excitation, enclosedFraction, solveNonce, dispatch]);
}
