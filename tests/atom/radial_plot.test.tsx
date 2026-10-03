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
        const lines = container.querySelectorAll<SVGPathElement>('.radial-plot-line');
        expect(lines).toHaveLength(2);
        // Asserted on the *computed* stroke, not a `stroke=` attribute (bug
        // fix, found in the running app). `.radial-plot-line` in style.css
        // sets `stroke: #4da3ff` for the single-curve plot, and a CSS
        // declaration beats an SVG presentation attribute -- so the old
        // assertion passed on an attribute the browser then ignored, and
        // every curve drew blue while its legend swatch drew the real
        // colour. Reading `style.stroke` is what the browser actually obeys.
        expect(lines[0].style.stroke).toBe('#ff0000');
        expect(lines[1].style.stroke).toBe('#00ff00');
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

    // Regression test (task 22, bug 1): "when i hover over the 3d image or
    // the 2d graph, the legend of the graph jumps, as the r formula is
    // toggled". The readout used to be omitted from the DOM entirely
    // whenever nothing was hovered, so the legend above it (and the scale
    // readout below the whole panel) reflowed by its height on every hover
    // in and out. The fix keeps its line present at all times; only the
    // text inside changes.
    it('keeps the hover-readout element present (reserving its height) even when nothing is hovered, so the legend never reflows', () => {
        const { container, rerender } = render(
            <RadialPlot n={2} l={1} Z={6} rMax={10} curves={twoCurves()} hoverRadius={null} onHoverRadius={() => {}} />
        );
        const readoutWhenIdle = container.querySelector('.radial-plot-hover-readout');
        expect(readoutWhenIdle).not.toBeNull();

        rerender(
            <RadialPlot n={2} l={1} Z={6} rMax={10} curves={twoCurves()} hoverRadius={1} onHoverRadius={() => {}} />
        );
        expect(container.querySelector('.radial-plot-hover-readout')).not.toBeNull();

        // Back to idle: the element -- and so its reserved line height --
        // must still be there, not removed again.
        rerender(
            <RadialPlot n={2} l={1} Z={6} rMax={10} curves={twoCurves()} hoverRadius={null} onHoverRadius={() => {}} />
        );
        const readoutBackToIdle = container.querySelector('.radial-plot-hover-readout');
        expect(readoutBackToIdle).not.toBeNull();
        // Non-breaking space, not empty -- an empty text node collapses to
        // zero height in a block element, which would silently reintroduce
        // the same jump this test guards against.
        expect(readoutBackToIdle?.textContent).toBe(' ');
    });

    it('names the cut-face scaling only where there is a cut face', () => {
        const { container, rerender } = render(<RadialPlot n={1} l={0} Z={18} rMax={5} curves={twoCurves()} cutFaceNote />);
        expect(container.textContent).toMatch(/cut face shading is scaled/);
        rerender(<RadialPlot n={1} l={0} Z={18} rMax={5} curves={twoCurves()} cutFaceNote={false} />);
        expect(container.textContent).not.toMatch(/cut face/);
    });

    it('labels the middle of the axis, a quarter of the range on a √ scale', () => {
        const { container, rerender } = render(<RadialPlot n={1} l={0} Z={18} rMax={4} curves={twoCurves()} />);
        expect(container.querySelector('.radial-plot-scale-mid')?.textContent).toBe('2.00');
        rerender(<RadialPlot n={1} l={0} Z={18} rMax={4} curves={twoCurves()} scale="sqrt" />);
        expect(container.querySelector('.radial-plot-scale-mid')?.textContent).toBe('1.00');
    });

    it('starts folded on a phone, where it would cover the atom, and opens on a tap', () => {
        const { container, getByRole } = render(<RadialPlot n={1} l={0} Z={18} rMax={5} curves={twoCurves()} compact />);
        expect(container.querySelector('svg')).toBeNull();
        fireEvent.click(getByRole('button', { name: /D\(r\) plot/ }));
        expect(container.querySelector('svg')).not.toBeNull();
    });

    // Task 10 carry: "6p³⁄₂" is read as superscripts and a fraction slash.
    // The visible label stays as it is; the spoken one rides beside it.
    it('says a j-level curve\'s name aloud as "6p j = 3/2"', () => {
        const curves: RadialCurve[] = [
            { label: '6s½', spokenLabel: '6s j = 1/2', color: '#f00', points: [{ r: 0, value: 0 }, { r: 1, value: 1 }] },
            { label: '6p³⁄₂', spokenLabel: '6p j = 3/2', color: '#0f0', points: [{ r: 0, value: 0 }, { r: 1, value: 1 }] },
            { label: 'n=1', color: '#00f', points: [{ r: 0, value: 0 }, { r: 1, value: 1 }] },
        ];
        const { container } = render(<RadialPlot n={1} l={0} Z={79} rMax={2} curves={curves} />);
        const items = Array.from(container.querySelectorAll('.radial-plot-legend-item'));
        expect(items.map(item => item.textContent)).toEqual(['6s½', '6p³⁄₂', 'n=1']);
        expect(items.map(item => item.getAttribute('aria-hidden'))).toEqual(['true', 'true', null]);
        const legend = container.querySelector('.radial-plot-legend')!;
        expect(Array.from(legend.querySelectorAll('.visually-hidden')).map(e => e.textContent)).toEqual(['6s j = 1/2', '6p j = 3/2']);
    });

    describe('non-relativistic comparison curves', () => {
        function withComparison(): RadialCurve[] {
            return [
                ...twoCurves(),
                { label: 'K shell non-relativistic', color: '#ff0000', dashed: true, points: [{ r: 0, value: 0 }, { r: 1, value: 20 }, { r: 2, value: 1 }] },
            ];
        }

        it('draws them dashed, in their shell\'s colour', () => {
            const { container } = render(<RadialPlot n={1} l={0} Z={79} rMax={10} curves={withComparison()} />);
            const lines = container.querySelectorAll<SVGPathElement>('.radial-plot-line');
            expect(lines).toHaveLength(3);
            expect(lines[2].style.stroke).toBe('#ff0000');
            expect(lines[2].style.strokeDasharray).toBe('4 3');
            expect(lines[0].style.strokeDasharray).toBe('');
        });

        it('puts every curve on one vertical scale, so the comparison is honest', () => {
            const { container } = render(<RadialPlot n={1} l={0} Z={79} rMax={10} curves={withComparison()} />);
            const lines = container.querySelectorAll<SVGPathElement>('.radial-plot-line');
            // The dashed curve's peak (20) is the global maximum: it reaches the top padding (y = 8).
            expect(lines[2].getAttribute('d')).toMatch(/,8\.00/);
            expect(lines[0].getAttribute('d')).not.toMatch(/,8\.00/);
        });

        it('keys the dashes once in the legend instead of listing each curve twice', () => {
            const { container } = render(<RadialPlot n={1} l={0} Z={79} rMax={10} curves={withComparison()} />);
            const items = Array.from(container.querySelectorAll('.radial-plot-legend-item')).map(e => e.textContent);
            expect(items).toEqual(['K shell', 'L shell']);
            expect(container.querySelector('.radial-plot-legend-dashed')!.textContent).toMatch(/non-relativistic/);
        });

        it('never names a dashed curve in the hover readout', () => {
            const { container } = render(
                <RadialPlot n={1} l={0} Z={79} rMax={10} curves={withComparison()} hoverRadius={1} onHoverRadius={() => {}} />
            );
            expect(container.querySelector('.radial-plot-hover-readout')!.textContent).toMatch(/K shell$/);
        });
    });
});
