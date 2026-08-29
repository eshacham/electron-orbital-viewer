import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RadialPlot, { RadialCurve } from '../../src/components/RadialPlot';

/**
 * Non-compact plot geometry, mirrored from RadialPlot.tsx's own constants,
 * so tests can predict exact pixel positions rather than guessing at them.
 */
const WIDTH = 260;
const PADDING = { left: 6, right: 6 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;

/** Mocks getBoundingClientRect so pointer events map to predictable x. */
function mockRect(element: Element) {
    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, right: WIDTH, bottom: 96, width: WIDTH, height: 96,
        x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
}

function twoCurves(): RadialCurve[] {
    return [
        {
            label: 'K shell',
            color: '#ff0000',
            points: [{ r: 0, value: 0 }, { r: 1, value: 10 }, { r: 2, value: 1 }],
        },
        {
            label: 'L shell',
            color: '#00ff00',
            points: [{ r: 0, value: 0 }, { r: 1, value: 2 }, { r: 2, value: 6 }, { r: 5, value: 8 }],
        },
    ];
}

describe('RadialPlot', () => {
    it('single-curve mode renders exactly one path, unchanged from today', () => {
        const { container } = render(<RadialPlot n={2} l={1} Z={6} rMax={10} />);
        expect(container.querySelectorAll('.radial-plot-line')).toHaveLength(1);
        expect(container.querySelectorAll('.radial-plot-fill')).toHaveLength(1);
        expect(screen.getByText('Radial distribution — r²R(r)²')).toBeInTheDocument();
        // No multi-curve decoration leaks into the original mode.
        expect(container.querySelector('.radial-plot-legend')).toBeNull();
    });

    it('multi-curve mode renders one path per curve with distinct labels', () => {
        const { container, getByText } = render(
            <RadialPlot n={2} l={1} Z={6} rMax={10} curves={twoCurves()} />
        );
        const lines = container.querySelectorAll('.radial-plot-line');
        expect(lines).toHaveLength(2);
        expect(lines[0]).toHaveAttribute('stroke', '#ff0000');
        expect(lines[1]).toHaveAttribute('stroke', '#00ff00');
        expect(getByText('K shell')).toBeInTheDocument();
        expect(getByText('L shell')).toBeInTheDocument();
        expect(getByText(/radial distribution d\(r\) = 4πr²ρ\(r\)/i)).toBeInTheDocument();
    });

    it('renders a peak marker at each given radius', () => {
        const { container } = render(
            <RadialPlot n={2} l={1} Z={6} rMax={10} curves={twoCurves()} peaks={[1, 5]} />
        );
        const markers = container.querySelectorAll('.radial-plot-peak');
        expect(markers).toHaveLength(2);
        const expectedX1 = PADDING.left + (1 / 10) * PLOT_WIDTH;
        const expectedX2 = PADDING.left + (5 / 10) * PLOT_WIDTH;
        expect(Number(markers[0].getAttribute('x1'))).toBeCloseTo(expectedX1, 1);
        expect(Number(markers[1].getAttribute('x1'))).toBeCloseTo(expectedX2, 1);
    });

    // jsdom (26.x) has no PointerEvent constructor, so @testing-library/dom's
    // fireEvent.pointerMove/pointerLeave fall back to a plain `Event` whose
    // constructor silently drops clientX/clientY. A MouseEvent carries the
    // same coordinate fields and React's delegated listeners match purely on
    // event.type, so it exercises the onPointerMove/onPointerLeave handlers
    // identically.
    it('fires onHoverRadius with the radius under the pointer', () => {
        const onHoverRadius = jest.fn();
        const { container } = render(
            <RadialPlot n={2} l={1} Z={6} rMax={10} curves={twoCurves()} hoverRadius={null} onHoverRadius={onHoverRadius} />
        );
        const svg = container.querySelector('svg')!;
        mockRect(svg);

        // clientX chosen so the mapped x sits exactly halfway across the plot area -> r = 5.
        const clientX = PADDING.left + PLOT_WIDTH / 2;
        fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, clientX, clientY: 0 }));

        expect(onHoverRadius).toHaveBeenCalledTimes(1);
        expect(onHoverRadius.mock.calls[0][0]).toBeCloseTo(5, 1);
    });

    it('fires onHoverRadius(null) on pointerleave', () => {
        const onHoverRadius = jest.fn();
        const { container } = render(
            <RadialPlot n={2} l={1} Z={6} rMax={10} curves={twoCurves()} hoverRadius={5} onHoverRadius={onHoverRadius} />
        );
        const svg = container.querySelector('svg')!;
        mockRect(svg);

        // React implements onPointerLeave via the bubbling 'pointerout'
        // event plus a relatedTarget check, not a raw 'pointerleave' native
        // event — so the relatedTarget has to be outside the svg for React
        // to synthesize the leave.
        fireEvent(svg, new MouseEvent('pointerout', { bubbles: true, clientX: 5, clientY: 0, relatedTarget: document.body }));

        expect(onHoverRadius).toHaveBeenCalledWith(null);
    });

    it('shows a hover readout with r and the shell it falls in', () => {
        const { container } = render(
            <RadialPlot n={2} l={1} Z={6} rMax={10} curves={twoCurves()} hoverRadius={1} onHoverRadius={() => {}} />
        );
        // At r=1, the K-shell curve (value 10) dominates the L-shell curve (value 2).
        const readout = container.querySelector('.radial-plot-hover-readout');
        expect(readout?.textContent).toMatch(/r = 1\.00 a₀/);
        expect(readout?.textContent).toMatch(/K shell/);
    });
});
