// tests/shell/use_more_sideways.test.tsx -- Task 2 (picture control): the sideways twin of useMoreBelow
// (tests/shell/more_below.test.tsx), shaped for a caller that already holds its own ref to the scroller
// (ThumbnailStrip's `listRef`): `before` while `scrollLeft > 1`, `after` while `scrollLeft + clientWidth <
// scrollWidth - 1`, re-read on scroll and on any resize, cleaned up on unmount. jsdom does no layout, so the sizes
// are stubbed, as more_below.test.tsx's `laidOut` does for the vertical case.
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

function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const { before, after } = useMoreSideways(ref);
    return <div ref={ref} data-testid="scroller" data-before={before ? 'true' : 'false'} data-after={after ? 'true' : 'false'} />;
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

    it('disconnects the observer and removes the scroll listener on unmount', () => {
        const { unmount } = render(<Probe />);
        const node = screen.getByTestId('scroller');
        const observer = FakeResizeObserver.instances.find(o => o.observed.includes(node))!;
        const removeEventListener = jest.spyOn(node, 'removeEventListener');
        unmount();
        expect(observer.observed).toEqual([]);
        expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });
});
