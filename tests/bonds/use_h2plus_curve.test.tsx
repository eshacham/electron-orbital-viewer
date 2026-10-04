import { renderHook, act } from '@testing-library/react';

const worker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null as ((e: { data: unknown }) => void) | null };
jest.mock('../../src/workers/createH2PlusCurveWorker', () => ({ createH2PlusCurveWorker: jest.fn(() => worker) }));

import { createH2PlusCurveWorker } from '../../src/workers/createH2PlusCurveWorker';
import { useH2PlusCurve, resetH2PlusCurveForTests, H2PLUS_CURVE_R } from '../../src/bonds/useH2PlusCurve';

const curve = { R: [1], sigmaG: [-0.5], sigmaU: [0.2], equilibrium: { R: 1.997, totalEnergy: -0.6026 } };

// Ruling C7: the worker starts only in Bonds with H2+ selected -- never on
// page load -- and is terminated when the caller leaves before it answers.
describe('useH2PlusCurve', () => {
    beforeEach(() => {
        resetH2PlusCurveForTests();
        jest.clearAllMocks();
    });

    it('never starts the worker while disabled', () => {
        const { result } = renderHook(() => useH2PlusCurve(false));
        expect(result.current).toBeNull();
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
        expect(result.current).toBeNull();

        // The worker's reply lands inside a promise's .then(), a microtask --
        // a plain sync act() returns before it runs, so the assertion below
        // would still see the pre-resolution value without the `async` here.
        await act(async () => { worker.onmessage!({ data: curve }); });
        expect(result.current).toEqual(curve);
        expect(worker.terminate).toHaveBeenCalledTimes(1);

        const second = renderHook(() => useH2PlusCurve(true));
        expect(second.result.current).toEqual(curve);
        expect(createH2PlusCurveWorker).toHaveBeenCalledTimes(1);
    });

    it('kills an unfinished computation when the view is left, and starts fresh on return', () => {
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

    it('spans the slider range in 0.05 a0 steps', () => {
        expect(H2PLUS_CURVE_R[0]).toBe(0.5);
        expect(H2PLUS_CURVE_R[H2PLUS_CURVE_R.length - 1]).toBeCloseTo(10, 12);
        expect(H2PLUS_CURVE_R).toHaveLength(191);
    });
});
