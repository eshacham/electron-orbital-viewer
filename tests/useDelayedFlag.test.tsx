import { renderHook, act } from '@testing-library/react';
import { useDelayedFlag } from '../src/useDelayedFlag';

describe('useDelayedFlag', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('stays down while the work is still short', () => {
        const { result, rerender } = renderHook(
            ({ active }) => useDelayedFlag(active, 400),
            { initialProps: { active: false } }
        );

        rerender({ active: true });
        expect(result.current).toBe(false);

        act(() => { jest.advanceTimersByTime(399); });
        expect(result.current).toBe(false);
    });

    it('goes up once the work outlasts the delay', () => {
        const { result, rerender } = renderHook(
            ({ active }) => useDelayedFlag(active, 400),
            { initialProps: { active: false } }
        );

        rerender({ active: true });
        act(() => { jest.advanceTimersByTime(400); });
        expect(result.current).toBe(true);
    });

    it('never goes up for work that finishes inside the delay', () => {
        const { result, rerender } = renderHook(
            ({ active }) => useDelayedFlag(active, 400),
            { initialProps: { active: false } }
        );

        rerender({ active: true });
        act(() => { jest.advanceTimersByTime(380); });
        rerender({ active: false });
        act(() => { jest.advanceTimersByTime(1000); });

        expect(result.current).toBe(false);
    });

    it('comes down as soon as the work ends', () => {
        const { result, rerender } = renderHook(
            ({ active }) => useDelayedFlag(active, 400),
            { initialProps: { active: true } }
        );

        act(() => { jest.advanceTimersByTime(400); });
        expect(result.current).toBe(true);

        rerender({ active: false });
        expect(result.current).toBe(false);
    });

    it('restarts the delay for each new stretch of work', () => {
        const { result, rerender } = renderHook(
            ({ active }) => useDelayedFlag(active, 400),
            { initialProps: { active: true } }
        );

        act(() => { jest.advanceTimersByTime(300); });
        rerender({ active: false });
        rerender({ active: true });
        act(() => { jest.advanceTimersByTime(300); });
        expect(result.current).toBe(false);   // not 600ms of one stretch

        act(() => { jest.advanceTimersByTime(100); });
        expect(result.current).toBe(true);
    });
});
