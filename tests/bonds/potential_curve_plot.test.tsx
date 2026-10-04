import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import PotentialCurvePlot, { interpolateEnergy, CurveSeries } from '../../src/components/PotentialCurvePlot';

const series: CurveSeries[] = [
    { key: 'g', label: '1σg', color: '#ff0000', points: [{ R: 1, E: -0.4 }, { R: 2, E: -0.6 }, { R: 4, E: -0.55 }] },
    { key: 'u', label: '1σu*', color: '#0000ff', points: [{ R: 1, E: 0.5 }, { R: 2, E: -0.1 }, { R: 4, E: -0.45 }] },
];
const props = { title: 'Potential energy', unit: 'Ha', series, xRange: [0, 4] as [number, number], yRange: [-0.7, -0.3] as [number, number], markerR: 2, caption: 'exact', width: 300 };

describe('PotentialCurvePlot', () => {
    it('interpolates linearly and refuses R outside the curve', () => {
        expect(interpolateEnergy(series[0].points, 3)).toBeCloseTo(-0.575, 12);
        expect(interpolateEnergy(series[0].points, 5)).toBeNull();
    });

    it('draws one clipped path per series, coloured through style, with the caption', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        const paths = container.querySelectorAll('path.radial-plot-line');
        expect(paths).toHaveLength(2);
        // jsdom's CSSStyleDeclaration normalises known colour properties
        // (e.g. `color`) to rgb(), but not the SVG presentation properties
        // `stroke`/`fill` -- they read back exactly as set.
        expect((paths[1] as SVGPathElement).style.stroke).toBe('#0000ff');
        expect(container.querySelector('clipPath')).not.toBeNull();
        expect(screen.getByText('exact')).toBeInTheDocument();
    });

    it('marks the current R and only the curve(s) in range there', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        const marker = container.querySelector('.potential-marker')!;
        // left padding 34, plot width 300 - 34 - 8 = 258: R = 2 of [0, 4] is the middle.
        expect(Number(marker.getAttribute('x1'))).toBeCloseTo(34 + 129, 6);
        // series u's E(2) = -0.1 sits outside yRange [-0.7, -0.3] -- that dot
        // is correctly clipped off rather than drawn out of scale (D14: the
        // brief's "2 dots" expectation did not match this behaviour).
        const dots = container.querySelectorAll('.potential-marker-dot');
        expect(dots).toHaveLength(1);
        expect((dots[0] as SVGCircleElement).style.fill).toBe('#ff0000');
    });

    it('reports the R clicked', () => {
        const onSelectR = jest.fn();
        const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} />);
        const svg = container.querySelector('svg')!;
        jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 130, right: 300, bottom: 130, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
        fireEvent.click(svg, { clientX: 34 + 258 * 0.75, clientY: 50 });
        expect(onSelectR).toHaveBeenCalledWith(3);
    });

    it('is reachable by mouse: pointer events are not switched off by the floating plot default', () => {
        // .radial-plot is `pointer-events: none` in style.css (it floats,
        // click-through, over the canvas elsewhere); this plot is clickable,
        // so it must opt back in the same way RadialPlot's own interactive
        // mode does, or a click would never reach a real browser's svg.
        const { container } = render(<PotentialCurvePlot {...props} onSelectR={jest.fn()} />);
        expect(container.querySelector('.radial-plot.interactive')).not.toBeNull();
    });

    it('does not claim interactivity when there is nowhere to send a click', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        expect(container.querySelector('.radial-plot.interactive')).toBeNull();
        expect(container.querySelector('svg')!.style.cursor).not.toBe('pointer');
    });

    it('offers a native, keyboard-operable control alongside the mouse-only svg click', () => {
        const onSelectR = jest.fn();
        render(<PotentialCurvePlot {...props} onSelectR={onSelectR} />);
        const slider = screen.getByRole('slider', { name: /potential energy/i }) as HTMLInputElement;
        expect(slider.min).toBe('0');
        expect(slider.max).toBe('4');
        expect(slider.value).toBe('2');
        fireEvent.change(slider, { target: { value: '3' } });
        expect(onSelectR).toHaveBeenCalledWith(3);
    });

    // Final review M5: stepping by the smallest scan spacing (0.1 a₀ here)
    // from 1.2 lands on 1.3, which snaps straight back to 1.2 -- the keyboard
    // was trapped wherever the scan's points thin out. With scan points the
    // slider steps over their indices instead, and reads R aloud.
    it('steps a scan by point index, so a sparse stretch cannot trap the arrow keys', () => {
        const onSelectR = jest.fn();
        render(<PotentialCurvePlot {...props} markerR={1.2} snapRs={[1, 1.1, 1.2, 2, 4]} onSelectR={onSelectR} />);
        const slider = screen.getByRole('slider', { name: /potential energy/i }) as HTMLInputElement;
        expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['0', '4', '1', '2']);
        expect(slider).toHaveAttribute('aria-valuetext', 'R = 1.20 a₀ (0.64 Å)');
        fireEvent.change(slider, { target: { value: '3' } });
        expect(onSelectR).toHaveBeenCalledWith(2);
    });

    // Final review M9: the plot, its caption and text alternative are one named figure.
    it('is a named figure', () => {
        render(<PotentialCurvePlot {...props} />);
        expect(screen.getByRole('figure', { name: 'potential energy curve' })).toBeInTheDocument();
    });

    it('omits the slider when there is no click handler to drive', () => {
        render(<PotentialCurvePlot {...props} />);
        expect(screen.queryByRole('slider')).toBeNull();
    });

    it('states R and each in-range curve value as text, for a screen reader -- not only as pixels', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        const alt = container.querySelector('.potential-text-alt')!;
        expect(alt.textContent).toContain('R = 2.00 a₀');
        // Å beside the atomic-unit value (global constraint): 2 a0 = 1.058 Å.
        expect(alt.textContent).toMatch(/1\.06\s*Å/);
        expect(alt.textContent).toContain('1σg');
        expect(alt.textContent).toContain('-0.6000 Ha');
        // eV beside Ha, the same constraint applied to energy.
        expect(alt.textContent).toMatch(/-16\.33\s*eV/);
    });

    it('shows a reference point (e.g. where the fitted curve stops, or R_e/D_e) as visible text, not only a hover title', () => {
        const { container } = render(
            <PotentialCurvePlot {...props} referenceR={{ R: 3, label: 'CCSD(T) not valid beyond R = 3.00 a₀ (the bond breaks into open-shell atoms)' }} />,
        );
        expect(screen.getByText(/CCSD\(T\) not valid beyond R = 3\.00 a₀/)).toBeInTheDocument();
        const refLine = container.querySelector('.potential-reference')!;
        expect(Number(refLine.getAttribute('x1'))).toBeCloseTo(34 + 258 * 0.75, 6);
    });

    it('has an accessible role and label describing what it plots', () => {
        render(<PotentialCurvePlot {...props} />);
        expect(screen.getByRole('img', { name: /potential energy/i })).toBeInTheDocument();
    });

    // Found live (Task 13, N₂): the axis ends were printed as raw floats --
    // "1.6594818936013664 … R (2.4062487457219808 a₀ · 1.27 Å)".
    it('prints the R axis ends to two decimals, as R is printed everywhere else', () => {
        const { container } = render(<PotentialCurvePlot {...props} xRange={[1.6594818936013664, 2.4062487457219808]} markerR={2} />);
        const scale = container.querySelector('.radial-plot-scale')!;
        expect(scale).toHaveTextContent('1.66');
        expect(scale).toHaveTextContent('R (2.41 a₀ · 1.27 Å)');
        expect(scale.textContent).not.toMatch(/\d{5}/);
    });
});
