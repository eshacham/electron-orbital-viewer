import { renderHook, act } from '@testing-library/react';

const worker = {
    postMessage: jest.fn(),
    terminate: jest.fn(),
    onmessage: null as ((e: { data: unknown }) => void) | null,
    onerror: null as ((e: { message?: string }) => void) | null,
};
jest.mock('../../src/workers/createH2PlusCurveWorker', () => ({ createH2PlusCurveWorker: jest.fn(() => worker) }));

import { createH2PlusCurveWorker } from '../../src/workers/createH2PlusCurveWorker';
import { useH2PlusCurve, resetH2PlusCurveForTests, H2PLUS_CURVE_R } from '../../src/bonds/useH2PlusCurve';

const curve = { R: [1], sigmaG: [-0.5], sigmaU: [0.2], equilibrium: { R: 1.997, totalEnergy: -0.6026 } };
const curveMessage = { type: 'curveSuccess', ...curve };

// Ruling C7: the worker starts only in Bonds with H2+ selected -- never on
// page load -- and is terminated when the last enabled caller leaves before
// it answers (ruling M1: not by any one caller's own cleanup). I1: a reply
// the worker cannot produce is a stated error, not a permanently null curve.
describe('useH2PlusCurve', () => {
    beforeEach(() => {
        resetH2PlusCurveForTests();
        jest.clearAllMocks();
    });

    it('never starts the worker while disabled', () => {
        const { result } = renderHook(() => useH2PlusCurve(false));
        expect(result.current).toEqual({ curve: null, error: null });
        expect(createH2PlusCurveWorker).not.toHaveBeenCalled();
    });

    it('asks the worker once enabled, shares the result, and reuses it next time', async () => {
        const { result, rerender } = renderHook(
            ({ enabled }) => useH2PlusCurve(enabled),
            { initialProps: { enabled: false } },
        );
        expect(worker.postMessage).not.toHaveBeenCalled();

        rerender({ enabled: true });
        expect(worker.postMessage).toHaveBeenCalledWith({ R: H2PLUS_CURVE_R });
        expect(result.current).toEqual({ curve: null, error: null });

        // The worker's reply lands inside a promise's .then(), a microtask --
        // a plain sync act() returns before it runs, so the assertion below
        // would still see the pre-resolution value without the `async` here.
        await act(async () => { worker.onmessage!({ data: curveMessage }); });
        expect(result.current).toEqual({ curve, error: null });
        expect(worker.terminate).toHaveBeenCalledTimes(1);

        const second = renderHook(() => useH2PlusCurve(true));
        expect(second.result.current).toEqual({ curve, error: null });
        expect(createH2PlusCurveWorker).toHaveBeenCalledTimes(1);
    });

    it('states an error the worker replies with, rather than leaving the curve null forever', async () => {
        const { result } = renderHook(() => useH2PlusCurve(true));
        expect(worker.postMessage).toHaveBeenCalledTimes(1);

        await act(async () => {
            worker.onmessage!({ data: { type: 'error', message: 'H₂⁺ is solved only up to R = 100 a₀' } });
        });
        expect(result.current).toEqual({ curve: null, error: 'H₂⁺ is solved only up to R = 100 a₀' });
        expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it('states an error when the worker itself fails, not just a stated reply', async () => {
        const { result } = renderHook(() => useH2PlusCurve(true));
        expect(worker.postMessage).toHaveBeenCalledTimes(1);

        await act(async () => { worker.onerror!({ message: 'Script error' }); });
        expect(result.current).toEqual({ curve: null, error: 'Script error' });
        expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    // Final review M6: a failure was cached for the session, so leaving
    // Bonds and coming back showed the same error without asking again. A
    // curve is still kept; an error is forgotten once the last view leaves.
    it('retries after an error once the view is left and re-entered', async () => {
        const { result, rerender } = renderHook(
            ({ enabled }) => useH2PlusCurve(enabled),
            { initialProps: { enabled: true } },
        );
        await act(async () => { worker.onerror!({ message: 'Script error' }); });
        expect(result.current).toEqual({ curve: null, error: 'Script error' });

        rerender({ enabled: false });
        rerender({ enabled: true });
        expect(createH2PlusCurveWorker).toHaveBeenCalledTimes(2);
        expect(result.current).toEqual({ curve: null, error: null });

        await act(async () => { worker.onmessage!({ data: curveMessage }); });
        expect(result.current).toEqual({ curve, error: null });
    });

    // Ruling M1: two enabled callers (e.g. the diagram and the curve plot)
    // share one worker; the first leaving must not cut off the second.
    it('keeps the worker running for a second enabled caller after the first leaves', async () => {
        const first = renderHook(() => useH2PlusCurve(true));
        const second = renderHook(() => useH2PlusCurve(true));
        expect(createH2PlusCurveWorker).toHaveBeenCalledTimes(1);

        first.unmount();
        expect(worker.terminate).not.toHaveBeenCalled();

        await act(async () => { worker.onmessage!({ data: curveMessage }); });
        expect(second.result.current).toEqual({ curve, error: null });

        second.unmount();
    });

    it('terminates only once the last enabled caller leaves', () => {
        const first = renderHook(() => useH2PlusCurve(true));
        const second = renderHook(() => useH2PlusCurve(true));
        expect(worker.postMessage).toHaveBeenCalledTimes(1);

        first.unmount();
        expect(worker.terminate).not.toHaveBeenCalled();

        second.unmount();
        expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it('kills an unfinished computation when the only view is left, and starts fresh on return', () => {
        const { rerender } = renderHook(
            ({ enabled }) => useH2PlusCurve(enabled),
            { initialProps: { enabled: true } },
        );
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        expect(worker.terminate).not.toHaveBeenCalled();

        rerender({ enabled: false });
        expect(worker.terminate).toHaveBeenCalledTimes(1);

        rerender({ enabled: true });
        expect(createH2PlusCurveWorker).toHaveBeenCalledTimes(2);
        expect(worker.postMessage).toHaveBeenCalledTimes(2);
    });

    it('samples the slider range every 0.05 a0 (the slider itself steps 0.01 a0)', () => {
        expect(H2PLUS_CURVE_R[0]).toBe(0.5);
        expect(H2PLUS_CURVE_R[H2PLUS_CURVE_R.length - 1]).toBeCloseTo(10, 12);
        expect(H2PLUS_CURVE_R).toHaveLength(191);
    });
});
