// tests/shell/use_more_sideways.test.tsx -- Task 2 (picture control): the sideways twin of useMoreBelow
// (tests/shell/more_below.test.tsx), shaped for a caller that already holds its own ref to the scroller
// (ThumbnailStrip's `listRef`): `before` while `scrollLeft > 1`, `after` while `scrollLeft + clientWidth <
// scrollWidth - 1`, re-read on scroll and on any resize, cleaned up on unmount. jsdom does no layout, so the sizes
// are stubbed, as more_below.test.tsx's `laidOut` does for the vertical case.
// Task 2 review fix round 1 (I1): `enabled`/`resetKey`, keyed like useRovingFocus's DX2 pattern, not rebuilt on
// every render; `enabled: false` does nothing at all (no observer, no listener, both flags false).
import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMoreSideways } from '../../src/shell/useMoreSideways';

/** What the browser would lay out: the scroller's width, its content's width and how far it is scrolled. */
function laidOut(element: HTMLElement, { client, scroll, left = 0 }: { client: number; scroll: number; left?: number }) {
    Object.defineProperty(element, 'clientWidth', { configurable: true, get: () => client });
    Object.defineProperty(element, 'scrollWidth', { configurable: true, get: () => scroll });
    element.scrollLeft = left;
}

/** A ResizeObserver that the test fires by hand (jsdom has none). */
class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: Element[] = [];
    constructor(private readonly callback: () => void) { FakeResizeObserver.instances.push(this); }
    observe(target: Element) { this.observed.push(target); }
    unobserve() {}
    disconnect() { this.observed = []; }
    fire() { this.callback(); }
}

function Probe({ enabled = true, resetKey, bump }: { enabled?: boolean; resetKey?: unknown; bump?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const { before, after } = useMoreSideways(ref, { enabled, resetKey });
    return <div ref={ref} data-testid="scroller" data-before={before ? 'true' : 'false'} data-after={after ? 'true' : 'false'} data-bump={bump} />;
}

describe('useMoreSideways (Task 2, sideways twin of useMoreBelow)', () => {
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    beforeEach(() => {
        FakeResizeObserver.instances = [];
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original; });

    it('returns before/after from scrollLeft, clientWidth and scrollWidth, re-reading on scroll', () => {
        render(<Probe />);
        const node = screen.getByTestId('scroller');
        laidOut(node, { client: 300, scroll: 800, left: 0 });
        fireEvent.scroll(node);
        expect(node).toHaveAttribute('data-before', 'false');
        expect(node).toHaveAttribute('data-after', 'true');

        laidOut(node, { client: 300, scroll: 800, left: 500 });
        fireEvent.scroll(node);
        expect(node).toHaveAttribute('data-before', 'true');
        expect(node).toHaveAttribute('data-after', 'false');
    });

    it('re-reads on a change of size, the scroller\'s or its content\'s', () => {
        render(<Probe />);
        const node = screen.getByTestId('scroller');
        const observer = FakeResizeObserver.instances.find(o => o.observed.includes(node))!;
        laidOut(node, { client: 300, scroll: 800 });
        act(() => observer.fire());
        expect(node).toHaveAttribute('data-after', 'true');
        laidOut(node, { client: 300, scroll: 300 });
        act(() => observer.fire());
        expect(node).toHaveAttribute('data-after', 'false');
    });

    // I1: the first cut rebuilt the observer and the listener on every render -- a re-render that changes nothing
    // the effect is keyed on (neither `enabled` nor `resetKey`) must leave them alone. `instances.length` (not
    // filtered by `observed`, which a disconnect empties) is the total ever constructed.
    it('I1: builds one observer per mount, and a re-render that changes neither enabled nor resetKey does not rebuild it', () => {
        const { rerender } = render(<Probe bump={0} />);
        expect(FakeResizeObserver.instances).toHaveLength(1);
        for (let bump = 1; bump <= 5; bump++) rerender(<Probe bump={bump} />);
        expect(FakeResizeObserver.instances).toHaveLength(1);
    });

    // I1: while `enabled` is false (every strip but Orbitals), the hook does nothing at all, not just withhold
    // its classes -- no observer, and no scroll listener of its own reacts: before/after stay false even once the
    // node is laid out as a real overflowing scroller and a scroll event fires.
    it('I1: enabled=false builds no observer, and before/after stay false on a scroll event', () => {
        render(<Probe enabled={false} />);
        const node = screen.getByTestId('scroller');
        expect(FakeResizeObserver.instances).toHaveLength(0);
        laidOut(node, { client: 300, scroll: 800, left: 500 });
        fireEvent.scroll(node);
        expect(node).toHaveAttribute('data-before', 'false');
        expect(node).toHaveAttribute('data-after', 'false');
    });

    // I1: resetKey is the DX2 pattern (useRovingFocus) -- a caller that mounts a fresh node (a collapse/expand)
    // re-attaches to it, rebuilding the observer rather than leaving it on the old node.
    it('I1: a changed resetKey rebuilds the observer', () => {
        const { rerender } = render(<Probe resetKey="a" />);
        expect(FakeResizeObserver.instances).toHaveLength(1);
        rerender(<Probe resetKey="b" />);
        expect(FakeResizeObserver.instances).toHaveLength(2);
    });

    // M6: confirm the listener removed on unmount is the very one this hook added to this node, not just "some"
    // scroll listener -- React's own root also adds one (continuous event delegation), so the spy is scoped to
    // calls whose `this` is `node` (`mock.instances`), not the first 'scroll' call seen anywhere.
    it('disconnects the observer and removes the exact scroll listener it added, on unmount', () => {
        const addEventListener = jest.spyOn(HTMLElement.prototype, 'addEventListener');
        const { unmount } = render(<Probe />);
        const node = screen.getByTestId('scroller');
        const observer = FakeResizeObserver.instances.find(o => o.observed.includes(node))!;
        const callIndex = addEventListener.mock.instances.findIndex((instance, i) => instance === node && addEventListener.mock.calls[i][0] === 'scroll');
        expect(callIndex).toBeGreaterThanOrEqual(0);
        const addedHandler = addEventListener.mock.calls[callIndex][1];
        const removeEventListener = jest.spyOn(node, 'removeEventListener');
        unmount();
        expect(observer.observed).toEqual([]);
        expect(removeEventListener).toHaveBeenCalledWith('scroll', addedHandler);
        addEventListener.mockRestore();
    });
});
