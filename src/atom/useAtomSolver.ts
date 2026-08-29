import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { solveStarted, solveSucceeded, solveFailed } from '../store/atomSlice';
import { createAtomWorker } from '../workers/createAtomWorker';
import { SerialisedAtomProfile } from '../workers/atomWorker';
import { getCachedProfile, setCachedProfile } from './profile_cache';

interface AtomWorkerSuccessMessage {
    type: 'success';
    profile: SerialisedAtomProfile;
    /** Echoed back from the request that produced it -- see requestId below. */
    requestId: number;
}
interface AtomWorkerErrorMessage {
    type: 'error';
    message: string;
    requestId: number;
}
type AtomWorkerMessage = AtomWorkerSuccessMessage | AtomWorkerErrorMessage;

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
 * Keying the per-request effect on `[mode, Z, enclosedFraction]` is what
 * ensures only a genuine change to what should be solved re-requests
 * anything -- the pure navigation actions in atomSlice (drillToShell,
 * drillToSubshell, drillToOrbital, levelUp, goToLevel) never touch any of
 * those three, so none of them can retrigger this effect.
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

        // Layer 2 of the fix: a solved profile is a pure function of
        // (Z, enclosedFraction), so a hit here needs no worker round trip
        // at all -- this is what makes a mode switch away and back, or
        // re-picking the same element, immediate rather than another
        // multi-second solve.
        const cached = getCachedProfile(Z, enclosedFraction);
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

            if (event.data.type === 'error') {
                dispatch(solveFailed(event.data.message));
                return;
            }
            const { profile } = event.data;
            // Ruling R17: never render an atom the solver did not converge
            // for. This should never fire -- every element in range
            // converges -- but silently drawing a wrong picture instead of
            // reporting it would be worse than the ruling it violates.
            if (profile.converged) {
                setCachedProfile(Z, enclosedFraction, profile);
                dispatch(solveSucceeded(profile));
            } else {
                dispatch(solveFailed(`The SCF calculation for Z=${Z} did not converge.`));
            }
        };
        worker.onerror = (event) => {
            dispatch(solveFailed(event.message || `Could not solve Z=${Z}.`));
        };

        worker.postMessage({ type: 'solve', Z, enclosedFraction, requestId });

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
    }, [mode, Z, enclosedFraction, dispatch]);
}
