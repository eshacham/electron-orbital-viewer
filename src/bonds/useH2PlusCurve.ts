import { useEffect, useState } from 'react';
import { createH2PlusCurveWorker } from '../workers/createH2PlusCurveWorker';
import type { CurveWorkerResponse } from '../workers/h2plusCurveWorker';
import { H2PLUS_CURVE_R } from './h2plus';

export { H2PLUS_CURVE_R };

export interface H2PlusCurve {
    R: number[];
    sigmaG: number[];
    sigmaU: number[];
    equilibrium: { R: number; totalEnergy: number };
}

/** Small and flat, rather than a thrown/caught error: the caller (App.tsx, Task 13) shows whichever of these is set. */
export interface UseH2PlusCurveResult {
    curve: H2PlusCurve | null;
    error: string | null;
}

const NO_RESULT: UseH2PlusCurveResult = { curve: null, error: null };

// Module-level rather than per-hook-instance, so every caller (App.tsx,
// ruling C7) shares a single computation across remounts instead of
// re-solving a curve it has already seen this session.
let curve: H2PlusCurve | null = null;
let error: string | null = null;
let activeWorker: Worker | null = null;
let pending: Promise<void> | null = null;
/**
 * How many currently-enabled hooks are waiting on the shared worker (ruling
 * M1): a lone caller's own cleanup must not terminate a computation another
 * enabled caller (e.g. the diagram and the curve plot, both reading this at
 * once) is still waiting on.
 */
let enabledCount = 0;

function recordResult(result: UseH2PlusCurveResult): void {
    curve = result.curve;
    error = result.error;
    activeWorker = null;
    pending = null;
}

function startCurve(): Promise<void> {
    if (!pending) {
        const worker = createH2PlusCurveWorker();
        activeWorker = worker;
        pending = new Promise(resolve => {
            worker.onmessage = (event: MessageEvent<CurveWorkerResponse>) => {
                const data = event.data;
                worker.terminate();
                recordResult(data.type === 'error'
                    ? { curve: null, error: data.message }
                    : { curve: { R: data.R, sigmaG: data.sigmaG, sigmaU: data.sigmaU, equilibrium: data.equilibrium }, error: null });
                resolve();
            };
            // I1: a worker that fails outright (rather than catching its own
            // error and posting one, as h2plusCurveWorker.ts does) must still
            // resolve to a stated reason -- otherwise this promise, and every
            // caller awaiting it, would hang forever.
            worker.onerror = (event: ErrorEvent) => {
                worker.terminate();
                recordResult({ curve: null, error: event.message || 'Could not compute the H₂⁺ potential curve.' });
                resolve();
            };
            worker.postMessage({ R: H2PLUS_CURVE_R });
        });
    }
    return pending;
}

/**
 * Kills a computation that never got to finish (ruling C7): leaving Bonds, or
 * switching away from H₂⁺, before the curve lands must not leave a worker
 * running in the background, and coming back must ask again rather than wait
 * forever on a worker that is already dead.
 */
function stopCurve(): void {
    if (activeWorker) {
        activeWorker.terminate();
        activeWorker = null;
        pending = null;
    }
}

export function resetH2PlusCurveForTests(): void {
    curve = null;
    error = null;
    activeWorker = null;
    pending = null;
    enabledCount = 0;
}

/**
 * The exact 1σg and 1σu curves, computed once per session off the main
 * thread -- but only while `enabled`. Ruling C7: the plan's unconditional
 * `useH2PlusCurve()` would spawn this worker on every page load in every
 * mode; the caller (App.tsx) instead passes `isBondsMode && system ===
 * 'h2plus'`, so the worker exists only for as long as that view does.
 */
export function useH2PlusCurve(enabled: boolean): UseH2PlusCurveResult {
    const [value, setValue] = useState<UseH2PlusCurveResult>(() => (enabled ? { curve, error } : NO_RESULT));

    useEffect(() => {
        if (!enabled) return undefined;
        enabledCount += 1;
        let live = true;
        if (curve !== null || error !== null) {
            setValue({ curve, error });
        } else {
            // A retry after an error (below) must not keep showing the old reason while it runs.
            setValue(NO_RESULT);
            void startCurve().then(() => { if (live) setValue({ curve, error }); });
        }
        return () => {
            live = false;
            enabledCount -= 1;
            // Ruling M1: stop the worker only once nobody enabled is left
            // waiting on it. A curve is kept for the session; an error is
            // forgotten (final review M6), so coming back asks again rather
            // than showing a failure that may have been transient.
            if (enabledCount === 0) {
                stopCurve();
                error = null;
            }
        };
    }, [enabled]);

    return enabled ? value : NO_RESULT;
}
