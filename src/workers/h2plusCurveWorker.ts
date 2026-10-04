import { h2plusCurve, h2plusEquilibrium } from '../bonds/h2plus';

interface CurveSuccessResponse {
    type: 'curveSuccess';
    R: number[];
    sigmaG: number[];
    sigmaU: number[];
    equilibrium: { R: number; totalEnergy: number };
}

interface CurveErrorResponse {
    type: 'error';
    message: string;
}

export type CurveWorkerResponse = CurveSuccessResponse | CurveErrorResponse;

interface WorkerScope {
    onmessage: ((event: MessageEvent<{ R: number[] }>) => void) | null;
    postMessage(message: unknown): void;
}
const worker = self as unknown as WorkerScope;

// ~0.3 s of eigenproblems: small, but not something to do on the UI thread (spec §3.7).
worker.onmessage = event => {
    try {
        const { R } = event.data;
        const response: CurveSuccessResponse = {
            type: 'curveSuccess',
            R,
            sigmaG: h2plusCurve(R, '1sigma_g'),
            sigmaU: h2plusCurve(R, '1sigma_u'),
            equilibrium: h2plusEquilibrium(),
        };
        worker.postMessage(response);
    } catch (error) {
        // Mirrors orbitalWorker.ts: a thrown RangeError (e.g. an out-of-range
        // R reaching the solver) becomes a stated reply rather than a reply
        // that never comes, which is what useH2PlusCurve would otherwise wait
        // on forever.
        const response: CurveErrorResponse = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
        };
        worker.postMessage(response);
    }
};
