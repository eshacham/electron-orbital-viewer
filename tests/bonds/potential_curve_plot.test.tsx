import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import PotentialCurvePlot, { interpolateEnergy, CurveSeries, PLOT_PAD, plotX } from '../../src/components/PotentialCurvePlot';
import { seenText } from '../seen_text';

const series: CurveSeries[] = [
    { key: 'g', label: '1σg', color: '#ff0000', points: [{ R: 1, E: -0.4 }, { R: 2, E: -0.6 }, { R: 4, E: -0.55 }] },
    { key: 'u', label: '1σu*', color: '#0000ff', points: [{ R: 1, E: 0.5 }, { R: 2, E: -0.1 }, { R: 4, E: -0.45 }] },
];
const props = { title: 'Potential energy', unit: 'Ha', series, xRange: [0, 4] as [number, number], yRange: [-0.7, -0.3] as [number, number], markerR: 2, width: 300 };

describe('PotentialCurvePlot', () => {
    it('interpolates linearly and refuses R outside the curve', () => {
        expect(interpolateEnergy(series[0].points, 3)).toBeCloseTo(-0.575, 12);
        expect(interpolateEnergy(series[0].points, 5)).toBeNull();
    });

    // Task 7a: no caption under the plot -- the method and the zero are Info's (bondsInfo).
    it('draws one clipped path per series, coloured through style, and no caption', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        const paths = container.querySelectorAll('path.radial-plot-line');
        expect(paths).toHaveLength(2);
        // jsdom's CSSStyleDeclaration normalises known colour properties
        // (e.g. `color`) to rgb(), but not the SVG presentation properties
        // `stroke`/`fill` -- they read back exactly as set.
        expect((paths[1] as SVGPathElement).style.stroke).toBe('#0000ff');
        expect(container.querySelector('clipPath')).not.toBeNull();
        expect(container.querySelectorAll('.radial-plot-note')).toHaveLength(0);
    });

    // Task 8 (addendum 7): the legend names each curve with a real subscript -- 1σ<sub>g</sub>, 1σ<sub>u</sub>* -- not "1σg".
    it('typesets the legend\'s MO labels', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        const legend = Array.from(container.querySelectorAll('.radial-plot-legend-item'), item => item.innerHTML);
        expect(legend[0]).toContain('1σ<sub>g</sub>');
        // Final review: the typeset visual (aria-hidden) and its plain copy (typesetLabel), then the *.
        expect(legend[1]).toContain('1σ<sub>u</sub></span><span class="visually-hidden">1σu</span></span>*');
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

    // Task 3 (picture control), Review Focus 4: a tap left of the plot area takes the range's lower end, one right
    // of it the upper end -- never an R the curve does not cover.
    it('clamps a click outside the plot area to the ends of the range', () => {
        const onSelectR = jest.fn();
        const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} />);
        const svg = container.querySelector('svg')!;
        fireEvent.click(svg, { clientX: 5, clientY: 50 });
        expect(onSelectR).toHaveBeenLastCalledWith(0);
        fireEvent.click(svg, { clientX: 299, clientY: 50 });
        expect(onSelectR).toHaveBeenLastCalledWith(4);
    });

    // Task 3 (picture control): under Bonds' R slider the slider is the keyboard path, so the curve has no hidden range
    // input of its own (final polish F7 removed the opt-out and the input) -- Tab reaches one R control, not two.
    it('renders no range input: the caller\'s own slider is the keyboard path', () => {
        render(<PotentialCurvePlot {...props} markerR={1.2} snapRs={[1, 1.1, 1.2, 2, 4]} onSelectR={jest.fn()} />);
        expect(screen.queryByRole('slider')).toBeNull();
        expect(document.querySelector('input')).toBeNull();
    });

    // Task 3 (picture control), spec §3 "Dragging or tapping on the curve sets R": a drag reports each R it passes as
    // a draft (onDragR), and only the release commits (onSelectR) -- once, though a click follows the pointerup.
    describe('dragging', () => {
        // jsdom has no PointerEvent; a MouseEvent with a pointerId is all the plot reads.
        const original = (window as { PointerEvent?: unknown }).PointerEvent;
        beforeAll(() => {
            (window as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {
                pointerId: number;
                pointerType: string;
                constructor(type: string, init: PointerEventInit = {}) {
                    super(type, init);
                    this.pointerId = init.pointerId ?? 1;
                    this.pointerType = init.pointerType ?? '';
                }
            };
        });
        afterAll(() => { (window as { PointerEvent?: unknown }).PointerEvent = original; });
        const at = (fraction: number) => ({ clientX: 34 + 258 * fraction, clientY: 50, pointerId: 1, button: 0 });

        // Fix round 1 (M1): where the release is swallowed with no lost capture either (a macOS ctrl-click menu, an app
        // switch), the next mouse move comes with no button held -- that ends the drag as a cancel, not a commit.
        it('cancels a mouse drag whose button is found released, committing nothing', () => {
            const onSelectR = jest.fn();
            const onDragR = jest.fn();
            const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} onDragR={onDragR} />);
            const svg = container.querySelector('svg')!;
            const mouse = (fraction: number, buttons: number) => ({ ...at(fraction), pointerType: 'mouse', buttons });
            fireEvent.pointerDown(svg, mouse(0.25, 1));
            fireEvent.pointerMove(svg, mouse(0.5, 1));
            expect(onDragR).toHaveBeenLastCalledWith(2);
            fireEvent.pointerMove(svg, mouse(0.75, 0));
            expect(onDragR).toHaveBeenLastCalledWith(null);
            onDragR.mockClear();
            fireEvent.pointerMove(svg, mouse(0.5, 0));
            fireEvent.pointerUp(svg, mouse(0.5, 0));
            expect(onDragR).not.toHaveBeenCalled();
            expect(onSelectR).not.toHaveBeenCalled();
            // A touch or pen move reports its buttons its own way; only a mouse's is read.
            fireEvent.pointerDown(svg, { ...at(0.25), pointerType: 'touch', buttons: 1 });
            fireEvent.pointerMove(svg, { ...at(0.5), pointerType: 'touch', buttons: 0 });
            expect(onDragR).toHaveBeenLastCalledWith(2);
        });

        it('reports drafts while dragged and commits once on release', () => {
            const onSelectR = jest.fn();
            const onDragR = jest.fn();
            const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} onDragR={onDragR} />);
            const svg = container.querySelector('svg')!;
            fireEvent.pointerDown(svg, at(0.25));
            expect(onDragR).toHaveBeenLastCalledWith(1);
            fireEvent.pointerMove(svg, at(0.5));
            expect(onDragR).toHaveBeenLastCalledWith(2);
            // Dragged past the plot's left edge: clamped, as a click is.
            fireEvent.pointerMove(svg, { ...at(0), clientX: 0 });
            expect(onDragR).toHaveBeenLastCalledWith(0);
            expect(onSelectR).not.toHaveBeenCalled();
            fireEvent.pointerUp(svg, at(0.75));
            expect(onSelectR).toHaveBeenCalledTimes(1);
            expect(onSelectR).toHaveBeenLastCalledWith(3);
            fireEvent.click(svg, at(0.75));
            expect(onSelectR).toHaveBeenCalledTimes(1);
            // A move with no button down is a hover, not a drag.
            onDragR.mockClear();
            fireEvent.pointerMove(svg, at(0.5));
            expect(onDragR).not.toHaveBeenCalled();
            // The next plain click commits again.
            fireEvent.click(svg, at(0.5));
            expect(onSelectR).toHaveBeenCalledTimes(2);
        });

        it('drops the draft when the browser takes the gesture (a scroll), committing nothing', () => {
            const onSelectR = jest.fn();
            const onDragR = jest.fn();
            const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} onDragR={onDragR} />);
            const svg = container.querySelector('svg')!;
            fireEvent.pointerDown(svg, at(0.25));
            fireEvent.pointerCancel(svg, at(0.25));
            expect(onDragR).toHaveBeenLastCalledWith(null);
            expect(onSelectR).not.toHaveBeenCalled();
            // Over: a move is a hover again, and a release commits nothing.
            onDragR.mockClear();
            fireEvent.pointerMove(svg, at(0.5));
            fireEvent.pointerUp(svg, at(0.5));
            expect(onDragR).not.toHaveBeenCalled();
            expect(onSelectR).not.toHaveBeenCalled();
        });

        // Task 4 (T3 M1): a drag never sticks. When the capture is lost without a release (a context menu, a window
        // blur), the drag is cancelled -- the draft dropped, nothing committed -- and later hovers do not draft.
        it('cancels the drag when the pointer capture is lost, committing nothing', () => {
            const onSelectR = jest.fn();
            const onDragR = jest.fn();
            const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} onDragR={onDragR} />);
            const svg = container.querySelector('svg')!;
            fireEvent.pointerDown(svg, at(0.25));
            fireEvent.pointerMove(svg, at(0.5));
            fireEvent.lostPointerCapture(svg, at(0.5));
            expect(onDragR).toHaveBeenLastCalledWith(null);
            onDragR.mockClear();
            fireEvent.pointerMove(svg, at(0.75));
            fireEvent.pointerUp(svg, at(0.75));
            expect(onDragR).not.toHaveBeenCalled();
            expect(onSelectR).not.toHaveBeenCalled();
            // A capture lost after a release (the browser's own, after pointerup) cancels nothing.
            fireEvent.pointerDown(svg, at(0.25));
            fireEvent.pointerUp(svg, at(0.75));
            onDragR.mockClear();
            fireEvent.lostPointerCapture(svg, at(0.75));
            expect(onDragR).not.toHaveBeenCalled();
            expect(onSelectR).toHaveBeenCalledTimes(1);
            expect(onSelectR).toHaveBeenLastCalledWith(3);
        });

        // Task 4 (T3 M1): the drag belongs to the pointer that started it. A second finger's down, moves, release and
        // tap neither restart, draft nor commit it; the first pointer's release still commits once.
        it('follows only the pointer that started the drag', () => {
            const onSelectR = jest.fn();
            const onDragR = jest.fn();
            const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} onDragR={onDragR} />);
            const svg = container.querySelector('svg')!;
            fireEvent.pointerDown(svg, at(0.25));
            expect(onDragR).toHaveBeenLastCalledWith(1);
            onDragR.mockClear();
            const second = (fraction: number) => ({ ...at(fraction), pointerId: 2 });
            fireEvent.pointerDown(svg, second(0.75));
            fireEvent.pointerMove(svg, second(0.75));
            fireEvent.pointerCancel(svg, second(0.75));
            fireEvent.lostPointerCapture(svg, second(0.75));
            fireEvent.pointerUp(svg, second(0.75));
            fireEvent.click(svg, second(0.75));
            expect(onDragR).not.toHaveBeenCalled();
            expect(onSelectR).not.toHaveBeenCalled();
            fireEvent.pointerMove(svg, at(0.5));
            expect(onDragR).toHaveBeenLastCalledWith(2);
            fireEvent.pointerUp(svg, at(0.5));
            expect(onSelectR).toHaveBeenCalledTimes(1);
            expect(onSelectR).toHaveBeenLastCalledWith(2);
        });
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
        // Task 7a fix round 1 (M9): a true minus (U+2212), not a hyphen.
        expect(alt.textContent).toContain('−0.6000 Ha');
        // eV beside Ha, the same constraint applied to energy.
        expect(alt.textContent).toMatch(/−16\.33\s*eV/);
        expect(alt.textContent).not.toMatch(/-\d/);
    });

    // Task 7a fix round 1 (M9): the energy axis's ends read with a true minus.
    it('labels the energy axis ends with a true minus', () => {
        const { container } = render(<PotentialCurvePlot {...props} />);
        expect([...container.querySelectorAll('.potential-axis-label')].map(t => t.textContent)).toEqual(['−0.300', '−0.700']);
    });

    it('shows a reference point (e.g. where the fitted curve stops, or R_e/D_e) as visible text, not only a hover title', () => {
        const { container } = render(
            <PotentialCurvePlot {...props} referenceR={{ R: 3, label: 'CCSD(T) not valid beyond R = 3.00 a₀ (the bond breaks into open-shell atoms)' }} />,
        );
        expect(screen.getByText(/CCSD\(T\) not valid beyond R = 3\.00 a₀/)).toBeInTheDocument();
        const refLine = container.querySelector('.potential-reference')!;
        expect(Number(refLine.getAttribute('x1'))).toBeCloseTo(34 + 258 * 0.75, 6);
    });

    // Task 7a: no "_" shown -- the R_e marker's label sets R_e and D_e with a real subscript.
    it('sets the R_e marker label with real subscripts', () => {
        const { container } = render(
            <PotentialCurvePlot {...props} referenceR={{ R: 2, label: 'Dotted line: R_e = 2.086 a₀ (1.104 Å), fitted; D_e = 9.44 eV from separated atoms.' }} />,
        );
        const note = container.querySelector('.potential-reference-note')!;
        // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
        expect(seenText(note)).toBe('Dotted line: Re = 2.086 a₀ (1.104 Å), fitted; De = 9.44 eV from separated atoms.');
        expect([...note.querySelectorAll('sub')].map(sub => sub.textContent)).toEqual(['e', 'e']);
    });

    it('has an accessible role and label describing what it plots', () => {
        render(<PotentialCurvePlot {...props} />);
        expect(screen.getByRole('img', { name: /potential energy/i })).toBeInTheDocument();
    });

    // Task 4 (picture control), carried from Task 3: He₂'s low energy end, "−0.0664", is wider than the default left
    // margin, so it ran over the first scan tick and the axis. The margin widens to the measured labels, plain or not.
    it('widens its left margin to fit the energy labels, so no label overlaps the axis or a scan tick (He₂)', () => {
        const proto = SVGElement.prototype as unknown as { getComputedTextLength?: () => number };
        const charWidth = 6;
        proto.getComputedTextLength = function (this: SVGElement) { return (this.textContent ?? '').length * charWidth; };
        try {
            const he2 = { ...props, unit: 'eV', xRange: [2.4, 7.2] as [number, number], yRange: [-0.0664, 1.372] as [number, number],
                markerR: 4.4, snapRs: [2.4, 3.4, 4.4, 5.6, 7.2] };
            for (const plain of [false, true]) {
                const onSelectR = jest.fn();
                const { container, unmount } = render(<PotentialCurvePlot {...he2} plain={plain} onSelectR={onSelectR} />);
                const labels = [...container.querySelectorAll('.potential-axis-label')];
                // Task 5b (finish fix 6): at Basics the ends are rounded, 0 is labelled, and the bottom end -- 5 px
                // under the 0 in this old He₂ range -- gives way to it.
                expect(labels.map(t => t.textContent)).toEqual(plain ? ['1.4', '0'] : ['1.37', '−0.0664']);
                const labelsEnd = Math.max(...labels.map(t => Number(t.getAttribute('x')) + (t.textContent ?? '').length * charWidth));
                const axisStart = Number(container.querySelector('.radial-plot-axis')!.getAttribute('x1'));
                const ticks = [...container.querySelectorAll('.radial-plot-peak')].map(t => Number(t.getAttribute('x1')));
                expect([plain, labelsEnd < axisStart, labelsEnd < Math.min(...ticks)]).toEqual([plain, true, true]);
                // Fix round 1 (M4): the scale row's ends follow the wider margin too.
                expect((container.querySelector('.radial-plot-scale') as HTMLElement).style.paddingLeft).toBe(`${axisStart}px`);
                // The curve and a tap use the same, wider margin: a tap on the first tick is its R.
                fireEvent.click(container.querySelector('svg')!, { clientX: Math.min(...ticks), clientY: 50 });
                expect(onSelectR).toHaveBeenLastCalledWith(2.4);
                unmount();
            }
        } finally {
            delete proto.getComputedTextLength;
        }
    });

    // Task 4 (picture control): at Basics the curve speaks plainly -- the words only; what is drawn is the same.
    describe('plain words, for Basics', () => {
        const ev = { ...props, title: 'E − E(separated atoms)', unit: 'eV', xRange: [1.6594818936013664, 2.4062487457219808] as [number, number],
            yRange: [-10, 1] as [number, number], markerR: 2,
            referenceR: { R: 2.086, label: 'Dotted line: R_e = 2.086 a₀ (1.104 Å), fitted; D_e = 9.44 eV from separated atoms.',
                plainLabel: 'Dotted line: most stable, 1.10 Å' } };

        it('names the energy axis "Energy (eV)", and the image in the same words', () => {
            const { container } = render(<PotentialCurvePlot {...ev} plain />);
            expect(container.querySelector('.radial-plot-title')!.textContent).toBe('Energy (eV)');
            expect(screen.getByRole('img', { name: 'Energy against the distance between nuclei' })).toBeInTheDocument();
        });

        it('reads the distance axis "Distance between nuclei (Å)", its ends in Å (a₀ × 0.529177, two decimals)', () => {
            const { container } = render(<PotentialCurvePlot {...ev} plain />);
            const scale = container.querySelector('.radial-plot-scale')!;
            // 1.6595 a₀ = 0.878 Å; 2.4062 a₀ = 1.273 Å.
            expect([...scale.children].map(span => span.textContent)).toEqual(['0.88', 'Distance between nuclei (Å)', '1.27']);
            expect(scale.textContent).not.toMatch(/a₀|R \(/);
        });

        // Fix round 1 (M2): the plot says nothing of its own about the line -- its plain label is the caller's
        // (curve.ts), and a line given none keeps its one label rather than be called something it may not be.
        it("labels the reference line in the caller's plain words, or its own label if it has none", () => {
            const { container, unmount } = render(<PotentialCurvePlot {...ev} plain />);
            expect(seenText(container.querySelector('.potential-reference-note')!)).toBe('Dotted line: most stable, 1.10 Å');
            unmount();
            const other = render(<PotentialCurvePlot {...ev} plain referenceR={{ R: 2.2, label: 'CCSD(T) not valid beyond R = 2.20 a₀' }} />);
            expect(seenText(other.container.querySelector('.potential-reference-note')!)).toBe('CCSD(T) not valid beyond R = 2.20 a₀');
            expect(other.container).not.toHaveTextContent(/most stable/);
        });

        // Fix round 1 (M4): the axis ends' values stand under the axis ends, not under the energy labels.
        it('sets the end values under the ends of the axis, plain or not', () => {
            for (const plain of [false, true]) {
                const { container, unmount } = render(<PotentialCurvePlot {...ev} plain={plain} />);
                const scale = container.querySelector('.radial-plot-scale') as HTMLElement;
                const axis = container.querySelector('.radial-plot-axis')!;
                expect([plain, scale.style.width, scale.style.boxSizing, scale.style.paddingLeft, scale.style.paddingRight])
                    .toEqual([plain, '300px', 'border-box', `${axis.getAttribute('x1')}px`, `${300 - Number(axis.getAttribute('x2'))}px`]);
                unmount();
            }
        });

        // Task 5b (finish fix 6): labels aside -- the energy ends are rounded at Basics, and zero is labelled.
        it('draws the same curves, marker, ticks and Rₑ line as without plain words', () => {
            const geometry = (plain: boolean) => {
                const { container, unmount } = render(<PotentialCurvePlot {...ev} snapRs={[1.7, 2, 2.3]} plain={plain} />);
                const svg = container.querySelector('svg')!.cloneNode(true) as SVGSVGElement;
                svg.querySelectorAll('clipPath').forEach(clip => clip.removeAttribute('id'));
                svg.querySelectorAll('g').forEach(g => g.removeAttribute('clip-path'));
                svg.querySelectorAll('text').forEach(text => text.remove());
                const html = svg.innerHTML;
                const alt = container.querySelector('.potential-text-alt')!.textContent;
                unmount();
                return { html, alt };
            };
            expect(geometry(true)).toEqual(geometry(false));
        });

        // Task 5b (finish fix 6): at Basics the energy ends are rounded to 2 significant figures, and 0 is labelled at
        // the separated-atoms line. An end label that would sit on the 0 gives way to it (N₂'s top end, 0.47, is
        // just above zero). Without plain words the ends stay as they were, with no 0 of their own.
        describe('energy labels at Basics (finish fix 6)', () => {
            const labels = (container: HTMLElement) => [...container.querySelectorAll('.potential-axis-label')].map(t => t.textContent);
            const zeroY = (range: [number, number]) => 8 + (1 - (0 - range[0]) / (range[1] - range[0])) * 104;

            it('rounds the ends and labels zero, plain', () => {
                const range: [number, number] = [-4.0817, 8.1634];
                const { container } = render(<PotentialCurvePlot {...ev} yRange={range} plain />);
                expect(labels(container)).toEqual(['8.2', '−4.1', '0']);
                const zero = [...container.querySelectorAll('.potential-axis-label')].find(t => t.textContent === '0')!;
                expect(Number(zero.getAttribute('y'))).toBeCloseTo(zeroY(range) + 4, 6);
            });

            it('lets an end give way to the 0 it would sit on', () => {
                const { container } = render(<PotentialCurvePlot {...ev} yRange={[-9.9123, 0.4721]} plain />);
                expect(labels(container)).toEqual(['−9.9', '0']);
            });

            // Fix round 1 (verdict pass 1, regression 2): He₂'s 0 sat about 12.6 px over "−0.26" and the two crowded into
            // one cluster at the axis foot. The end gives way to the 0 there too, as N₂'s top end does.
            it("lets He₂'s bottom end give way to the 0 rather than crowd it", () => {
                const { container } = render(<PotentialCurvePlot {...ev} yRange={[-0.2614, 1.3704]} plain />);
                expect(labels(container)).toEqual(['1.4', '0']);
            });

            it('keeps the ends unrounded and adds no 0 without plain words', () => {
                const { container } = render(<PotentialCurvePlot {...ev} yRange={[-4.0817, 8.1634]} />);
                expect(labels(container)).toEqual(['8.16', '−4.08']);
            });

            it("names the curves in the caller's plain words, or their own labels if they have none", () => {
                const named = [{ ...series[0], plainLabel: 'bonding' }, series[1]];
                const { container, unmount } = render(<PotentialCurvePlot {...ev} series={named} plain />);
                const legend = () => [...container.querySelectorAll('.radial-plot-legend-item')].map(item => item.textContent);
                expect(legend()[0]).toBe('bonding');
                expect(legend()[1]).toMatch(/^1σu/);
                unmount();
                const technical = render(<PotentialCurvePlot {...ev} series={named} />);
                expect(technical.container.querySelector('.radial-plot-legend-item')!.textContent).toMatch(/^1σg/);
            });
        });

        it("says today's words without it", () => {
            const { container } = render(<PotentialCurvePlot {...ev} />);
            expect(container.querySelector('.radial-plot-title')!.textContent).toBe('E − E(separated atoms) (eV)');
            // Task 5b (finish fix 5): the ends alike, each with its unit; the maximum is no longer fused into "R (…)".
            expect([...container.querySelector('.radial-plot-scale')!.children].map(span => span.textContent)).toEqual(['1.66 a₀', 'R', '2.41 a₀']);
            expect(seenText(container.querySelector('.potential-reference-note')!)).toBe('Dotted line: Re = 2.086 a₀ (1.104 Å), fitted; De = 9.44 eV from separated atoms.');
        });
    });

    // Task 5b (picture control, finish fix 3): the R slider above the plot is inset by the plot's own margins, so its
    // thumb stands over the marker. The margins and the scale are the plot's, exported, and the plot reports the left
    // margin it actually draws with (it widens to fit the energy labels), so a caller never copies a number.
    describe('its scale and inset, shared (finish fix 3)', () => {
        it('draws R where the exported scale puts it', () => {
            const { container } = render(<PotentialCurvePlot {...props} markerR={3} />);
            const x1 = Number(container.querySelector('.potential-marker')!.getAttribute('x1'));
            expect(x1).toBeCloseTo(plotX(3, props.xRange, props.width, PLOT_PAD.left), 6);
            expect(plotX(0, [0, 4], 300, 34)).toBe(34);
            expect(plotX(4, [0, 4], 300, 34)).toBe(300 - PLOT_PAD.right);
        });

        it('reports the margins it draws with, the widened left one too, and withdraws them when it goes', () => {
            const onInset = jest.fn();
            const { unmount } = render(<PotentialCurvePlot {...props} onInset={onInset} />);
            expect(onInset).toHaveBeenLastCalledWith({ left: PLOT_PAD.left, right: PLOT_PAD.right });
            unmount();
            expect(onInset).toHaveBeenLastCalledWith(null);
            const proto = SVGElement.prototype as unknown as { getComputedTextLength?: () => number };
            proto.getComputedTextLength = function (this: SVGElement) { return (this.textContent ?? '').length * 6; };
            try {
                const wide = jest.fn();
                const { container } = render(<PotentialCurvePlot {...props} yRange={[-0.0664, 1.372]} onInset={wide} />);
                const axisStart = Number(container.querySelector('.radial-plot-axis')!.getAttribute('x1'));
                expect(axisStart).toBeGreaterThan(PLOT_PAD.left);
                expect(wide).toHaveBeenLastCalledWith({ left: axisStart, right: PLOT_PAD.right });
            } finally {
                delete proto.getComputedTextLength;
            }
        });
    });

    // Task 5b (finish fix 4): the curve invites a drag. Where R can be set on it, the marker carries a handle on the
    // first curve -- a dot at least 10 px across in that curve's colour, ringed in selected-edge, with the selected
    // halo (Deep Space only: the token is none in Light Clean) -- over a 44 px hit area with an ew-resize cursor.
    // The Rₑ line stays green and dotted, so the two never read alike.
    describe('a handle on the curve (finish fix 4)', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = (selector: string) => {
            const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
            if (!match) throw new Error(`No rule for ${selector}`);
            return match[2];
        };

        it('stands on the first curve at the marker, in its colour, over a 44 px ew-resize hit area', () => {
            const { container } = render(<PotentialCurvePlot {...props} onSelectR={jest.fn()} onDragR={jest.fn()} />);
            const handle = container.querySelector('.potential-handle') as HTMLElement;
            expect(handle).toHaveAttribute('aria-hidden', 'true');
            const markerX = Number(container.querySelector('.potential-marker')!.getAttribute('x1'));
            const dot = container.querySelector('.potential-marker-dot') as SVGCircleElement;
            expect(parseFloat(handle.style.left)).toBeCloseTo(markerX, 6);
            expect(parseFloat(handle.style.top)).toBeCloseTo(Number(dot.getAttribute('cy')), 6);
            expect(handle.style.backgroundColor).toBe('rgb(255, 0, 0)');
            const hit = container.querySelector('svg .potential-handle-hit') as SVGCircleElement;
            expect(Number(hit.getAttribute('r')) * 2).toBeGreaterThanOrEqual(44);
            expect(Number(hit.getAttribute('cx'))).toBeCloseTo(markerX, 6);
            expect(hit.style.cursor).toBe('ew-resize');
        });

        it('is drawn with tokens only: a 10 px dot, a selected-edge ring and the selected halo, and lets taps through', () => {
            const handle = rule('.potential-handle');
            // Found live: the app's border-box sizing left a 6 px dot inside the ring; the dot itself is 10 px across.
            expect(handle).toMatch(/box-sizing:\s*content-box;/);
            expect(handle).toMatch(/width:\s*10px;/);
            expect(handle).toMatch(/height:\s*10px;/);
            expect(handle).toMatch(/border:\s*2px solid var\(--ql-color-selected-edge\);/);
            expect(handle).toMatch(/box-shadow:\s*var\(--ql-shadow-selected-halo\);/);
            expect(handle).toMatch(/pointer-events:\s*none;/);
            expect(handle).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
        });

        // Final polish F6: on N₂'s blue fill the cyan ring alone ran into the dot. A 2 px gap in the plot's own ground
        // (surface-1, the card the Bonds block sits on) is drawn between them: the padding ring, painted over the fill by a
        // radial gradient whose transparent centre is the 10 px dot. Tokens only; the hollow off-plot handle stays as it was.
        it('draws a 2 px gap in the surface colour between the dot and its ring, and keeps the hollow handle as it was', () => {
            const handle = rule('.potential-handle');
            expect(handle).toMatch(/padding:\s*2px;/);
            expect(handle).toMatch(/background-image:\s*radial-gradient\(circle closest-side,\s*transparent 5px,\s*var\(--ql-color-surface-1\) 5px\);/);
            expect(handle).toMatch(/border:\s*2px solid var\(--ql-color-selected-edge\);/);
            expect(handle).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
            // The fill is the inline background-COLOR: a background shorthand there would wipe the gap's gradient.
            const { container } = render(<PotentialCurvePlot {...props} onSelectR={jest.fn()} onDragR={jest.fn()} />);
            const filled = container.querySelector('.potential-handle') as HTMLElement;
            expect(filled.getAttribute('style')).toMatch(/background-color:/);
            expect(filled.getAttribute('style')).not.toMatch(/background:/);
            // The ring's own hollow handle: the ring only, 10 px inside it, no gap ring and no padding.
            const hollow = rule('.potential-handle.off-scale');
            expect(hollow).toMatch(/background:\s*transparent;/);
            expect(hollow).toMatch(/padding:\s*0;/);
        });

        // Science corrections S5 (Meaning-Only Status): the Rₑ line states no outcome, so it is not green. It is a dotted
        // text-2 line, still unlike the marker (dashed text-1) and the hover rule (text-2, dashed 2 2).
        it('draws the Rₑ line and its note neutral: dotted text-2, never success green, unlike the dashed marker', () => {
            const reference = rule('.potential-reference');
            expect(reference).toMatch(/stroke:\s*var\(--ql-color-text-2\);/);
            expect(reference).toMatch(/stroke-dasharray:\s*1 3;/);
            expect(reference).toMatch(/stroke-width:\s*1;/);
            expect(rule('.potential-reference-note')).toMatch(/color:\s*var\(--ql-color-text-2\);/);
            for (const selector of ['.potential-reference', '.potential-reference-note']) {
                expect(rule(selector)).not.toMatch(/success|warning|danger/);
            }
            const marker = rule('.potential-marker');
            expect(marker).toMatch(/stroke:\s*var\(--ql-color-text-1\);/);
            expect(marker).toMatch(/stroke-dasharray:\s*3 2;/);
            expect(reference).not.toBe(marker);
        });

        it('keeps to the plot area where the first curve leaves it, and is not drawn where R cannot be set', () => {
            const { container, unmount } = render(<PotentialCurvePlot {...props} markerR={1} onSelectR={jest.fn()} onDragR={jest.fn()} />);
            // series g at R = 1 is −0.4, inside [−0.7, −0.3]; at R = 0.2 it has no value, so the handle rests on the axis.
            expect(container.querySelector('.potential-handle')).not.toBeNull();
            unmount();
            const outside = render(<PotentialCurvePlot {...props} markerR={0.2} onSelectR={jest.fn()} onDragR={jest.fn()} />);
            const handle = outside.container.querySelector('.potential-handle') as HTMLElement;
            const axisY = Number(outside.container.querySelector('.radial-plot-axis')!.getAttribute('y1'));
            expect(parseFloat(handle.style.top)).toBeCloseTo(axisY, 6);
            outside.unmount();
            const still = render(<PotentialCurvePlot {...props} />);
            expect(still.container.querySelector('.potential-handle')).toBeNull();
            expect(still.container.querySelector('.potential-handle-hit')).toBeNull();
        });
    });

    // Task 5b fix round 1 (review I1, I2, M2): the handle rides the curve its caller names (the drawn state), is drawn
    // hollow -- ring only -- where that curve is off the plot at R (D14: never a filled point at a false energy), and a
    // drag that grabs it off-centre moves it by the pointer's travel, not to the press point.
    describe('the handle, fix round 1', () => {
        const dragProps = { ...props, onSelectR: jest.fn(), onDragR: jest.fn() };

        it('rides the curve named by handleKey, and the first curve without one', () => {
            const { container, unmount } = render(<PotentialCurvePlot {...dragProps} yRange={[-0.7, 0]} handleKey="u" />);
            // series u at R = 2 is −0.1, inside [−0.7, 0].
            expect((container.querySelector('.potential-handle') as HTMLElement).style.backgroundColor).toBe('rgb(0, 0, 255)');
            unmount();
            const fallback = render(<PotentialCurvePlot {...dragProps} yRange={[-0.7, 0]} handleKey="nope" />);
            expect((fallback.container.querySelector('.potential-handle') as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 0)');
        });

        it('is hollow, not filled, where its curve is off the plot at R, and still grabbable at the edge', () => {
            // series u at R = 2 is −0.1, above yRange [−0.7, −0.3]: the handle keeps to the top edge, ring only.
            const { container } = render(<PotentialCurvePlot {...dragProps} handleKey="u" />);
            const handle = container.querySelector('.potential-handle') as HTMLElement;
            expect(handle).toHaveClass('off-scale');
            expect(handle.style.backgroundColor).toBe('');
            expect(parseFloat(handle.style.top)).toBeCloseTo(8, 6);
            expect(container.querySelector('.potential-handle-hit')).not.toBeNull();
            const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
            expect(css).toMatch(/\.potential-handle\.off-scale\s*\{[^}]*background:\s*transparent;/);
            // In range it is filled and not marked off-scale.
            const inRange = render(<PotentialCurvePlot {...dragProps} />).container.querySelector('.potential-handle')!;
            expect(inRange).not.toHaveClass('off-scale');
        });

        describe('grabbed off-centre', () => {
            const original = (window as { PointerEvent?: unknown }).PointerEvent;
            beforeAll(() => {
                (window as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {
                    pointerId: number;
                    pointerType: string;
                    constructor(type: string, init: PointerEventInit = {}) {
                        super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? '';
                    }
                };
            });
            afterAll(() => { (window as { PointerEvent?: unknown }).PointerEvent = original; });

            it('moves R by the travel from the press, so a press on the handle changes nothing', () => {
                const onSelectR = jest.fn();
                const onDragR = jest.fn();
                const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} onDragR={onDragR} />);
                const svg = container.querySelector('svg')!;
                jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 130, right: 300, bottom: 130, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
                const hit = container.querySelector('.potential-handle-hit')!;
                // The handle stands at x = 163 (R = 2); pressed 15 px right of its centre.
                fireEvent.pointerDown(hit, { clientX: 178, clientY: 50, pointerId: 1, button: 0 });
                expect(onDragR).toHaveBeenLastCalledWith(2);
                // 64.5 px of travel is 1 a₀ on this 258 px, 4 a₀ plot.
                fireEvent.pointerMove(svg, { clientX: 178 + 64.5, clientY: 50, pointerId: 1, buttons: 1 });
                expect(onDragR.mock.calls.at(-1)![0]).toBeCloseTo(3, 9);
                fireEvent.pointerUp(svg, { clientX: 178 + 64.5, clientY: 50, pointerId: 1, button: 0 });
                expect(onSelectR.mock.calls.at(-1)![0]).toBeCloseTo(3, 9);
                // A press and release on the handle with no travel commits the R it already had.
                fireEvent.pointerDown(hit, { clientX: 150, clientY: 50, pointerId: 1, button: 0 });
                fireEvent.pointerUp(svg, { clientX: 150, clientY: 50, pointerId: 1, button: 0 });
                expect(onSelectR.mock.calls.at(-1)![0]).toBeCloseTo(2, 9);
            });

            it('still sets R to a tap on the curve away from the handle', () => {
                const onSelectR = jest.fn();
                const onDragR = jest.fn();
                const { container } = render(<PotentialCurvePlot {...props} onSelectR={onSelectR} onDragR={onDragR} />);
                const svg = container.querySelector('svg')!;
                jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 130, right: 300, bottom: 130, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
                fireEvent.pointerDown(svg, { clientX: 34 + 258 * 0.75, clientY: 50, pointerId: 1, button: 0 });
                expect(onDragR).toHaveBeenLastCalledWith(3);
                fireEvent.pointerUp(svg, { clientX: 34 + 258 * 0.75, clientY: 50, pointerId: 1, button: 0 });
                expect(onSelectR).toHaveBeenLastCalledWith(3);
            });
        });
    });

    // Found live (Task 13, N₂): the axis ends were printed as raw floats --
    // "1.6594818936013664 … R (2.4062487457219808 a₀ · 1.27 Å)".
    it('prints the R axis ends to two decimals, as R is printed everywhere else', () => {
        const { container } = render(<PotentialCurvePlot {...props} xRange={[1.6594818936013664, 2.4062487457219808]} markerR={2} />);
        const scale = container.querySelector('.radial-plot-scale')!;
        expect(scale).toHaveTextContent('1.66');
        expect(scale).toHaveTextContent('2.41 a₀');
        expect(scale.textContent).not.toMatch(/\d{5}/);
    });

    // Task 5b (finish fix 5): the R axis ends read alike, each with its unit -- "0.50 a₀" … "10 a₀" -- and the axis is
    // named between them; the maximum was fused into the title ("R (10 a₀ · 5.29 Å)"), which read as "R in units of 10 a₀".
    it('gives both R axis ends the same format with a unit, and never fuses the maximum into the axis name', () => {
        const { container } = render(<PotentialCurvePlot {...props} xRange={[0.5, 10]} markerR={2} />);
        expect([...container.querySelector('.radial-plot-scale')!.children].map(span => span.textContent)).toEqual(['0.50 a₀', 'R', '10 a₀']);
    });
});
