import { h2plusCurve, h2plusEquilibrium } from '../bonds/h2plus';

interface WorkerScope {
    onmessage: ((event: MessageEvent<{ R: number[] }>) => void) | null;
    postMessage(message: unknown): void;
}
const worker = self as unknown as WorkerScope;

// ~0.3 s of eigenproblems: small, but not something to do on the UI thread (spec §3.7).
worker.onmessage = event => {
    const { R } = event.data;
    worker.postMessage({ R, sigmaG: h2plusCurve(R, '1sigma_g'), sigmaU: h2plusCurve(R, '1sigma_u'), equilibrium: h2plusEquilibrium() });
};
