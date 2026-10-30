import React from 'react';
import { render, act } from '@testing-library/react';
import { useDrawOnSelection, DRAW_DEBOUNCE_MS } from '../../src/basic_ui/useDrawOnSelection';
import type { BasicSelection } from '../../src/store/orbitalSlice';

/**
 * A minimal harness: renders the hook against whatever `selection` prop it is
 * given, so the test can re-render with a new selection the way a real
 * parent (App, through BasicExplore) would after a chip click.
 */
function Harness({ selection, enabled, nonce = 0, draw }: {
    selection: BasicSelection; enabled: boolean; nonce?: number; draw: (s: BasicSelection) => void;
}) {
    useDrawOnSelection(selection, enabled, nonce, draw);
    return null;
}

const A: BasicSelection = { n: 3, l: 2, ml: 0 };
const B: BasicSelection = { n: 4, l: 2, ml: 0 };
const C: BasicSelection = { n: 4, l: 1, ml: 0 };
const D: BasicSelection = { n: 4, l: 1, ml: 1 };

describe('useDrawOnSelection (Ruling P3: chips draw on selection, debounced)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('never draws on mount', () => {
        const draw = jest.fn();
        render(<Harness selection={A} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS); });
        expect(draw).not.toHaveBeenCalled();
    });

    it('draws once, 150 ms after a single change, with that selection', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled draw={draw} />);
        rerender(<Harness selection={B} enabled draw={draw} />);
        expect(draw).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS - 1); });
        expect(draw).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(1); });
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(B);
    });

    // Review Focus 1: three chip changes (n, then l, then mₗ) within the debounce window
    // draw once, for the last of them -- never three separate draws.
    it('draws once, for the last of three quick changes within 150 ms (Review Focus 1)', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled draw={draw} />);
        rerender(<Harness selection={B} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(50); });
        rerender(<Harness selection={C} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(50); });
        rerender(<Harness selection={D} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS); });
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(D);
    });

    it('never draws while disabled', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled={false} draw={draw} />);
        rerender(<Harness selection={B} enabled={false} draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).not.toHaveBeenCalled();
    });

    it('cancels a pending draw when enabled turns false', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled draw={draw} />);
        rerender(<Harness selection={B} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(50); });
        rerender(<Harness selection={B} enabled={false} draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS); });
        expect(draw).not.toHaveBeenCalled();
    });

    // Final polish F1: the hook owns every draw of a plain orbital, so whatever turns `enabled` on -- entering the
    // mode, leaving a combination -- is drawn here, once and at once, never again 150 ms later for the same orbital.
    it('draws once, at once, when enabled turns true, and not again after the debounce', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled={false} draw={draw} />);
        rerender(<Harness selection={A} enabled draw={draw} />);
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(A);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).toHaveBeenCalledTimes(1);
    });

    it('draws a selection that changes in the same commit as enabled turning true once, at once (a pick leaving a combination)', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled={false} draw={draw} />);
        rerender(<Harness selection={B} enabled draw={draw} />);
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(B);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).toHaveBeenCalledTimes(1);
    });

    it('draws once, at once, for a draw request (a link), and not again for its new selection 150 ms later', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled nonce={1} draw={draw} />);
        draw.mockClear();
        rerender(<Harness selection={B} enabled nonce={2} draw={draw} />);
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(B);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).toHaveBeenCalledTimes(1);
    });

    it('draws once for a draw request that lands with enabled turning true (a link leaving a combination)', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled={false} nonce={1} draw={draw} />);
        rerender(<Harness selection={B} enabled nonce={2} draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(B);
    });

    it('draws a pending change at once when a draw request lands during the debounce, then nothing more', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled nonce={0} draw={draw} />);
        rerender(<Harness selection={B} enabled nonce={0} draw={draw} />);
        act(() => { jest.advanceTimersByTime(50); });
        rerender(<Harness selection={B} enabled nonce={1} draw={draw} />);
        expect(draw).toHaveBeenCalledTimes(1);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).toHaveBeenCalledTimes(1);
    });

    it('draws at mount for a draw request already made (a link opened at boot), and only once', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled nonce={1} draw={draw} />);
        rerender(<Harness selection={A} enabled nonce={1} draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(A);
    });

    it('ignores a draw request while disabled (a combination is drawn instead)', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled={false} nonce={1} draw={draw} />);
        rerender(<Harness selection={B} enabled={false} nonce={2} draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).not.toHaveBeenCalled();
    });

    // Review Focus 1 (final polish): a pick that comes back to the orbital already drawn draws it no extra time --
    // and a pick of a different one always draws.
    it('draws nothing when the selection comes back to the orbital already drawn before the debounce ends', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled={false} draw={draw} />);
        rerender(<Harness selection={A} enabled draw={draw} />);
        expect(draw).toHaveBeenCalledTimes(1);
        rerender(<Harness selection={B} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(50); });
        rerender(<Harness selection={A} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).toHaveBeenCalledTimes(1);
        rerender(<Harness selection={C} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS); });
        expect(draw).toHaveBeenCalledTimes(2);
        expect(draw).toHaveBeenLastCalledWith(C);
    });

    it('draws again after a combination, even for the orbital drawn before it', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled={false} draw={draw} />);
        rerender(<Harness selection={A} enabled draw={draw} />);
        rerender(<Harness selection={A} enabled={false} draw={draw} />);
        rerender(<Harness selection={A} enabled draw={draw} />);
        expect(draw).toHaveBeenCalledTimes(2);
    });

    it('never draws if unmounted before the debounce elapses', () => {
        const draw = jest.fn();
        const { rerender, unmount } = render(<Harness selection={A} enabled draw={draw} />);
        rerender(<Harness selection={B} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(50); });
        unmount();
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS); });
        expect(draw).not.toHaveBeenCalled();
    });
});
