// tests/shell/use_element_width.test.tsx -- Task 3 (picture control): the width of a box, for a child that draws to a
// pixel width (Bonds' curve under the R slider). 0 until a ResizeObserver has measured it -- so the caller can draw
// nothing rather than draw at a guessed width -- then its content box's width, re-read on every resize.
import React, { useRef } from 'react';
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

function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const width = useElementWidth(ref);
    return <div ref={ref} data-testid="box" data-width={width} />;
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

    it('stays 0 where there is no ResizeObserver (jsdom), rather than guess', () => {
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
        render(<Probe />);
        expect(screen.getByTestId('box')).toHaveAttribute('data-width', '0');
    });
});
