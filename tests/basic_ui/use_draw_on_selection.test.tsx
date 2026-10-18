import React from 'react';
import { render, act } from '@testing-library/react';
import { useDrawOnSelection, DRAW_DEBOUNCE_MS } from '../../src/basic_ui/useDrawOnSelection';
import type { BasicSelection } from '../../src/store/orbitalSlice';

/**
 * A minimal harness: renders the hook against whatever `selection` prop it is
 * given, so the test can re-render with a new selection the way a real
 * parent (App, through BasicExplore) would after a chip click.
 */
function Harness({ selection, enabled, draw }: { selection: BasicSelection; enabled: boolean; draw: (s: BasicSelection) => void }) {
    useDrawOnSelection(selection, enabled, draw);
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

    // Entering the mode (App.tsx) flips `enabled` from false to true for the same,
    // unchanged selection the nonce effect already drew once; if that alone restarted
    // the debounce, entering the mode would draw a second time, 150 ms later, for
    // nothing new.
    it('does not draw merely because enabled turns true for an unchanged selection', () => {
        const draw = jest.fn();
        const { rerender } = render(<Harness selection={A} enabled={false} draw={draw} />);
        rerender(<Harness selection={A} enabled draw={draw} />);
        act(() => { jest.advanceTimersByTime(DRAW_DEBOUNCE_MS * 2); });
        expect(draw).not.toHaveBeenCalled();
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
