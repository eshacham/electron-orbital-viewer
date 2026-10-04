import { useEffect, useState } from 'react';
import { createH2PlusCurveWorker } from '../workers/createH2PlusCurveWorker';
import { H2PLUS_R_RANGE } from './h2plus';

export interface H2PlusCurve {
    R: number[];
    sigmaG: number[];
    sigmaU: number[];
    equilibrium: { R: number; totalEnergy: number };
}

/** The slider's own 0.05 a0 step, spanning its whole range -- one energy per point the curve plot can land on. */
export const H2PLUS_CURVE_R: number[] = Array.from(
    { length: Math.round((H2PLUS_R_RANGE.max - H2PLUS_R_RANGE.min) / 0.05) + 1 },
    (_, i) => H2PLUS_R_RANGE.min + i * 0.05,
);

// Module-level rather than per-hook-instance, so the one call site Bonds mode
// has (App.tsx, ruling C7) shares a single computation across remounts
// instead of re-solving a curve it has already seen this session.
let curve: H2PlusCurve | null = null;
let activeWorker: Worker | null = null;
let pending: Promise<H2PlusCurve> | null = null;

function startCurve(): Promise<H2PlusCurve> {
    if (!pending) {
        const worker = createH2PlusCurveWorker();
        activeWorker = worker;
        pending = new Promise(resolve => {
            worker.onmessage = (event: MessageEvent<H2PlusCurve>) => {
                curve = event.data;
                worker.terminate();
                activeWorker = null;
                pending = null;
                resolve(event.data);
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
    activeWorker = null;
    pending = null;
}

/**
 * The exact 1σg and 1σu curves, computed once per session off the main
 * thread -- but only while `enabled`. Ruling C7: the plan's unconditional
 * `useH2PlusCurve()` would spawn this worker on every page load in every
 * mode; the caller (App.tsx) instead passes `isBondsMode && system ===
 * 'h2plus'`, so the worker exists only for as long as that view does.
 */
export function useH2PlusCurve(enabled: boolean): H2PlusCurve | null {
    const [value, setValue] = useState<H2PlusCurve | null>(enabled ? curve : null);

    useEffect(() => {
        if (!enabled) return undefined;
        if (curve) {
            setValue(curve);
            return undefined;
        }
        let live = true;
        void startCurve().then(result => { if (live) setValue(result); });
        return () => {
            live = false;
            stopCurve();
        };
    }, [enabled]);

    return enabled ? value : null;
}
