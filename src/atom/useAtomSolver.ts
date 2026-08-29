import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { solveStarted, solveSucceeded, solveFailed } from '../store/atomSlice';
import { createAtomWorker } from '../workers/createAtomWorker';
import { SerialisedAtomProfile } from '../workers/atomWorker';

interface AtomWorkerSuccessMessage {
    type: 'success';
    profile: SerialisedAtomProfile;
}
interface AtomWorkerErrorMessage {
    type: 'error';
    message: string;
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
 * Ruling R28: `solveAtom` is memoised by Z, so the only thing worth guarding
 * against is *dispatching* a solve on every render, not the solve's own
 * cost. Keying this effect on `[mode, Z, enclosedFraction]` does exactly
 * that -- the pure navigation actions in atomSlice (drillToShell,
 * drillToSubshell, drillToOrbital, levelUp, goToLevel) never touch any of
 * those three, so none of them can retrigger this effect, and an
 * enclosedFraction-only change re-requests a profile cheaply (the worker's
 * own solveAtom call comes back from cache; only buildSerialisedAtomProfile's
 * fraction-dependent re-slice actually redoes work).
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

    useEffect(() => {
        if (mode !== 'atom') return;

        dispatch(solveStarted());
        const worker = createWorker();

        worker.onmessage = (event) => {
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
                dispatch(solveSucceeded(profile));
            } else {
                dispatch(solveFailed(`The SCF calculation for Z=${Z} did not converge.`));
            }
        };
        worker.onerror = (event) => {
            dispatch(solveFailed(event.message || `Could not solve Z=${Z}.`));
        };

        worker.postMessage({ type: 'solve', Z, enclosedFraction });

        // Terminates a still-running solve if Z/enclosedFraction/mode change
        // again before it finishes, so a slower superseded solve can never
        // land after a faster later one.
        return () => worker.terminate();
        // createWorker deliberately excluded: the default value is a fresh
        // closure on every call to this hook, and including it would refire
        // this effect on every render -- the same intentionally-incomplete
        // dependency array pattern Controls.tsx's own n/l effects use.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, Z, enclosedFraction, dispatch]);
}
