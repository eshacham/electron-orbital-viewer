// Ruling T2-plot (panel fixes): the docked inspector's plot follows the panel's content width, 258 only until measured.
import React from 'react';
import { act, render } from '@testing-library/react';
import MeasuredPlotSlot from '../../src/shell/MeasuredPlotSlot';
import RadialPlot from '../../src/components/RadialPlot';

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: Element[] = [];
    constructor(private readonly callback: ResizeObserverCallback) { FakeResizeObserver.instances.push(this); }
    observe(target: Element) { this.observed.push(target); }
    unobserve() {}
    disconnect() { this.observed = []; }
    resize(width: number) {
        this.callback(this.observed.map(target => ({ target, contentRect: { width } }) as unknown as ResizeObserverEntry), this as unknown as ResizeObserver);
    }
}

const plot = (width: number) => <RadialPlot n={2} l={0} Z={12} rMax={20} width={width} />;
const svgWidth = (container: HTMLElement) => container.querySelector('svg')!.getAttribute('width');

describe('MeasuredPlotSlot', () => {
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    beforeEach(() => {
        FakeResizeObserver.instances = [];
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original; });

    it('draws at the measured width, and at 258 where nothing can be measured (0)', () => {
        const { container } = render(<MeasuredPlotSlot fallbackWidth={258}>{plot}</MeasuredPlotSlot>);
        expect(svgWidth(container)).toBe('258');
        act(() => FakeResizeObserver.instances[0].resize(400));
        expect(svgWidth(container)).toBe('400');
        act(() => FakeResizeObserver.instances[0].resize(0));
        expect(svgWidth(container)).toBe('258');
    });

    it('draws at the measured width whenever there is one, even under 258 (the default 290 panel measures 241)', () => {
        const { container } = render(<MeasuredPlotSlot fallbackWidth={258}>{plot}</MeasuredPlotSlot>);
        act(() => FakeResizeObserver.instances[0].resize(241));
        expect(svgWidth(container)).toBe('241');
        act(() => FakeResizeObserver.instances[0].resize(403));
        expect(svgWidth(container)).toBe('403');
    });

    it('draws at 258 with no ResizeObserver at all (jsdom)', () => {
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
        const { container } = render(<MeasuredPlotSlot fallbackWidth={258}>{plot}</MeasuredPlotSlot>);
        expect(svgWidth(container)).toBe('258');
    });
});
