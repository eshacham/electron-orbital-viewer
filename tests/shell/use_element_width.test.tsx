// tests/shell/use_element_width.test.tsx -- Task 3 (picture control): the width of a box, for a child that draws to a
// pixel width (Bonds' curve under the R slider). 0 until a ResizeObserver has measured it -- so the caller can draw
// nothing rather than draw at a guessed width -- then its content box's width, re-read on every resize. Task 4 (T3 M4):
// it hands out a callback ref, so a box mounted after the first render, or swapped for another, is measured too.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { useElementWidth } from '../../src/shell/useElementWidth';

/** A ResizeObserver that the test fires by hand (jsdom has none), with the width its entry reports. */
class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: Element[] = [];
    constructor(private readonly callback: ResizeObserverCallback) { FakeResizeObserver.instances.push(this); }
    observe(target: Element) { this.observed.push(target); }
    unobserve() {}
    disconnect() { this.observed = []; }
    resize(width: number) {
        const entries = this.observed.map(target => ({ target, contentRect: { width } }) as unknown as ResizeObserverEntry);
        this.callback(entries, this as unknown as ResizeObserver);
    }
}

/** Its box, when `box` says so: 'a' or 'b' (two different elements), or none. The width is shown either way. */
function Probe({ box = 'a' }: { box?: 'a' | 'b' | null }) {
    const [ref, width] = useElementWidth<HTMLDivElement>();
    return (
        <>
            <output data-testid="width">{width}</output>
            {box === 'a' && <div ref={ref} key="a" data-testid="box" data-width={width} />}
            {box === 'b' && <div ref={ref} key="b" data-testid="box-b" />}
        </>
    );
}

describe('useElementWidth (Task 3, picture control)', () => {
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    beforeEach(() => {
        FakeResizeObserver.instances = [];
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original; });

    it('is 0 until measured, then the content box width, whole pixels, following every resize', () => {
        render(<Probe />);
        const box = screen.getByTestId('box');
        expect(box).toHaveAttribute('data-width', '0');
        const [observer] = FakeResizeObserver.instances;
        expect(observer.observed).toEqual([box]);
        act(() => observer.resize(268.6));
        expect(box).toHaveAttribute('data-width', '268');
        act(() => observer.resize(300));
        expect(box).toHaveAttribute('data-width', '300');
    });

    it('stops observing on unmount', () => {
        const { unmount } = render(<Probe />);
        const [observer] = FakeResizeObserver.instances;
        unmount();
        expect(observer.observed).toEqual([]);
    });

    // Task 4 (T3 M4): keyed on the element, not on a ref object, so a box that mounts later is still observed.
    it('measures a box mounted after the first render', () => {
        const { rerender } = render(<Probe box={null} />);
        expect(screen.getByTestId('width')).toHaveTextContent('0');
        rerender(<Probe box="a" />);
        const box = screen.getByTestId('box');
        const observer = FakeResizeObserver.instances.at(-1)!;
        expect(observer.observed).toEqual([box]);
        act(() => observer.resize(240.2));
        expect(screen.getByTestId('width')).toHaveTextContent('240');
    });

    it('moves to a box that replaces the first, and is 0 while there is none', () => {
        const { rerender } = render(<Probe box="a" />);
        const first = FakeResizeObserver.instances.at(-1)!;
        act(() => first.resize(300));
        rerender(<Probe box="b" />);
        expect(first.observed).toEqual([]);
        const second = FakeResizeObserver.instances.at(-1)!;
        expect(second).not.toBe(first);
        expect(second.observed).toEqual([screen.getByTestId('box-b')]);
        act(() => second.resize(180));
        expect(screen.getByTestId('width')).toHaveTextContent('180');
        rerender(<Probe box={null} />);
        expect(second.observed).toEqual([]);
        expect(screen.getByTestId('width')).toHaveTextContent('0');
    });

    it('stays 0 where there is no ResizeObserver (jsdom), rather than guess', () => {
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
        render(<Probe />);
        expect(screen.getByTestId('box')).toHaveAttribute('data-width', '0');
    });
});
