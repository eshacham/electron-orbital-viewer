import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { curveNote, diatomicCurveSpec, h2plusCurveSpec } from '../../src/bonds/curve';
import { bondsCaptions, plainLengthForms } from '../../src/bonds/captions';
import BondsCurvePlot from '../../src/components/BondsCurvePlot';
import reducer, { selectBondsSystem, setBondsView, setH2PlusR, setScanPoint } from '../../src/store/bondsSlice';
import { CURVE_COLORS } from '../../src/curve_colors';
import { HARTREE_TO_EV } from '../../src/bonds/systems';
import { nb } from '../../src/format/text';
import { MoleculeScan } from '../../src/molecules/types';

const n2Scan: MoleculeScan = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules/n2/scan.json'), 'utf8'));
const empty = { scan: null, meta: null, basis: null, loading: false, error: null };
const curve = {
    R: [0.5, 1, 2, 4, 10], sigmaG: [0.27, -0.45, -0.6026, -0.546, -0.5005], sigmaU: [2.3, 0.6, -0.1675, -0.4686, -0.5],
    equilibrium: { R: 1.9971924, totalEnergy: -0.6026346 },
};

/** He₂ as v1 ships it: a 0.04 mHa vdW well near 5.6 a₀, a 48 mHa wall at 2.4 a₀ (energies relative to the separated atoms). */
const heScan = {
    id: 'he2', formula: 'He₂', spin: 0, energyMethod: 'FCI/aug-cc-pVTZ (no counterpoise correction)', densityMethod: 'B3LYP/def2-TZVP',
    points: [[2.4, 0.04800], [3.4, 0.00300], [4.4, 0.00002], [5.6, -0.000039], [7.2, -0.000022]]
        .map(([RBohr, dE], index) => ({ index, id: `he2@0${index}`, RBohr, energyHartree: -5.801196 + dE, dftEnergyHartree: -5.8, t1Diagnostic: 0 })),
    equilibriumIndex: 2,
    fit: { ReBohr: 5.555, ReUncertaintyBohr: 1.18, EminHartree: -5.801235, DeHartree: 3.9e-5, DeEv: 0.00107, bound: false,
        separatedAtomsHartree: -5.801196, separatedAtomsMethod: 'He ¹S + He ¹S, FCI/aug-cc-pVTZ (no counterpoise correction)' },
    validity: { pointsComputed: 5, pointsShipped: 5, exact: true, t1Limit: null, t1AtRe: null, multireference: false, validUpToRBohr: 7.2, stoppedAtRBohr: null, stopReason: null },
    spinCheck: null, note: null, reference: { ReAngstrom: null, source: null },
} as unknown as MoleculeScan;

describe('diatomicCurveSpec', () => {
    it('plots E relative to the separated atoms, so the well depth is D_e', () => {
        const spec = diatomicCurveSpec('n2', n2Scan, n2Scan.points[7].RBohr);
        expect(spec.title).toBe('E − E(separated atoms)');
        expect(spec.unit).toBe('eV');
        const lowest = Math.min(...spec.series[0].points.map(p => p.E));
        expect(lowest).toBeCloseTo((Math.min(...n2Scan.points.map(p => p.energyHartree)) - n2Scan.fit.separatedAtomsHartree) * HARTREE_TO_EV, 10);
        expect(spec.series[1]).toMatchObject({ key: 'atoms', label: 'separated atoms' });
        // The asymptote (0) and the well both fit.
        expect(spec.yRange[0]).toBeLessThan(lowest);
        expect(spec.yRange[1]).toBeGreaterThanOrEqual(0);
        expect(spec.snapRs).toEqual(n2Scan.points.map(p => p.RBohr));
        expect(spec.xRange).toEqual([n2Scan.points[0].RBohr, n2Scan.points[13].RBohr]);
    });

    // Task 7a: the plot keeps its axis labels and the R_e marker's label; its caption is Info's -- the zero here
    // (curveNote), the method and the validity stop in bondsCaptions, which Info prints just before it.
    it('marks the fitted R_e, and leaves the method, its zero and where it stops being valid to Info', () => {
        const spec = diatomicCurveSpec('n2', n2Scan, 2.07);
        // Task 4 fix round 1 (M2, M3): with its Basics words beside it -- the same line, named the same way.
        expect(spec.referenceR).toEqual({ R: n2Scan.fit.ReBohr, label: 'Dotted line: R_e = 2.086 a₀ (1.104 Å), fitted; D_e = 9.44 eV from separated atoms.',
            plainLabel: 'Dotted line: most stable, 1.10 Å' });
        expect(spec).not.toHaveProperty('caption');
        expect(curveNote('n2', n2Scan)).toBe('Plot: E − E(separated atoms), in eV. Zero: N ⁴S + N ⁴S, UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core), the grey line.');
        expect(bondsCaptions('n2', n2Scan).join(' ')).toMatch(/Single-reference CCSD\(T\) is not valid beyond R = 2\.41 a₀ \(1\.273 Å\) \(the bond breaks into open-shell atoms\), so the curve stops there: T1 diagnostic 0\.0214/);
    });

    // Task 7a: said once, by bondsCaptions (Info's "How this was computed"); the curve's own note adds only its zero.
    it('adds the multireference caveat for B₂ and C₂', () => {
        const c2 = { ...n2Scan, validity: { ...n2Scan.validity, multireference: true, t1AtRe: 0.0384, t1Limit: 0.0576 } } as MoleculeScan;
        expect(curveNote('c2', c2)).not.toMatch(/multireference|T1/);
        const caption = bondsCaptions('c2', c2).join(' ');
        // Task 8 fix round 1 (I1, M7): plain-text quantities use Unicode, Rₑ and Dₑ, never "_".
        expect(caption).toMatch(/Strongly multireference: single-reference CCSD\(T\) is only qualitative here \(T1 = 0\.038 at Rₑ\)\./);
        expect(caption).toMatch(/The curve stops at R = 2\.41 a₀ \(1\.273 Å\): at the next point T1 exceeds 1\.5 × its value at Rₑ \(0\.0576\)/);
        expect(caption).not.toMatch(/not valid beyond/);
    });

    // Task 10's carry: a 0.04 mHa well must not be stretched into a bond.
    it("draws He₂'s vdW well to the same kind of scale as a bond, so it stays invisible, and marks no R_e", () => {
        const spec = diatomicCurveSpec('he2', heScan, 4.4);
        expect(spec.referenceR).toBeNull();
        const span = spec.yRange[1] - spec.yRange[0];
        expect(span).toBeGreaterThanOrEqual(1);
        // The well, as a fraction of the plot's height: well under one pixel of a 104 px plot.
        expect((heScan.fit.DeEv / span) * 104).toBeLessThan(0.5);
        // Task 7a: the plot's own note says its zero and why the well cannot be seen; the unbound caption and the
        // method (bondsCaptions) are said with it in Info, and the note does not repeat either.
        expect(curveNote('he2', heScan)).toBe('Plot: E − E(separated atoms), in eV. Zero: He ¹S + He ¹S, same method, the grey line. At this scale the well is invisible.');
        expect(curveNote('he2', heScan)).not.toMatch(/counterpoise|No chemical bond/);
    });

    // Task 5b (finish fix 6): He₂'s zero line sat about 4 px over the x-axis, the scan ticks between them, and read as a
    // hollow bar. The axis now starts a fifth of the energy span below zero wherever the curve barely dips under it, so
    // the separated-atoms line stands clear of the floor -- at every level (lowering the level never changes the plot).
    it("stands He₂'s zero line clear of the x-axis, and leaves a bound molecule's range as it was", () => {
        const he = diatomicCurveSpec('he2', heScan, 4.4);
        const heSpan = he.yRange[1] - he.yRange[0];
        expect((0 - he.yRange[0]) / heSpan).toBeGreaterThanOrEqual(0.15);
        const n2 = diatomicCurveSpec('n2', n2Scan, 2.07);
        const lowest = Math.min(...n2.series[0].points.map(p => p.E));
        // N₂'s floor is still its well's bottom less 5 % of the span.
        expect(n2.yRange[0]).toBeCloseTo(lowest - 0.05 * (n2.yRange[1] - n2.yRange[0]) / 1.1, 6);
    });

    it("names the experiment Li₂'s R_e is compared with", () => {
        const li2 = { ...n2Scan, fit: { ...n2Scan.fit, ReBohr: 5.102 }, reference: { ReAngstrom: null, source: null } } as MoleculeScan;
        // Task 7a: Li₂'s caveat is bondsCaptions' (Info), where the R_e caption has just named the experiment.
        expect(bondsCaptions('li2', li2).join(' ')).toMatch(/experiment 2\.673 Å \(Huber & Herzberg.*Rₑ comes out 1\.0 % longer than experiment\./);
    });

    it('keeps the marker on the plotted range', () => {
        expect(diatomicCurveSpec('n2', n2Scan, 99).markerR).toBe(n2Scan.points[13].RBohr);
    });
});

// Fix round 1 (review M5): Basics' bond length in both forms from one helper -- the block's line, and the caption's
// lower-case qualifier -- so neither is string surgery on the other.
describe('plainLengthForms', () => {
    it('gives the line and the qualifier, in Å to two decimals', () => {
        expect(plainLengthForms(2.07)).toEqual({ line: 'Distance between nuclei 1.10 Å', qualifier: 'distance between nuclei 1.10 Å' });
    });
});

describe('h2plusCurveSpec', () => {
    // Like every molecule's: relative to the separated fragments, in eV.
    it('plots both exact curves relative to H + H⁺, with R_e and D_e marked', () => {
        const spec = h2plusCurveSpec(curve, 2);
        expect(spec.series.map(s => s.key)).toEqual(['g', 'u', 'limit']);
        expect(spec.title).toBe('E − E(H + H⁺)');
        expect(spec.unit).toBe('eV');
        expect(spec.series[0].points[2].E).toBeCloseTo((-0.6026 + 0.5) * HARTREE_TO_EV, 10);
        expect(spec.series[2].points.map(p => p.E)).toEqual([0, 0]);
        expect(spec.referenceR).toEqual({ R: 1.9971924, label: `Dotted line: R_e = 1.997 a₀ (1.057 Å), E = ${nb('−16.40 eV (−0.6026 Ha)')}; D_e = ${nb('2.79 eV (0.1026 Ha)')} to H + H⁺.`,
            plainLabel: 'Dotted line: most stable, 1.06 Å' });
        // Task 7a: the exact method is H2PLUS_CAPTIONS' (Info); the plot's own note is its zero.
        expect(spec).not.toHaveProperty('caption');
        expect(curveNote('h2plus', null)).toBe(`Plot: E − E(H + H⁺), in eV. Zero: H + H⁺ (${nb('−13.61 eV, −0.5 Ha')}), the grey line.`);
        expect(h2plusCurveSpec(curve, 0.1).markerR).toBe(0.5);
    });

    // Task 5b (finish fix 6): at Basics the legend says what each curve is in plain words; curve.ts says them, as it
    // says the Rₑ line's, so the plot makes no science claim of its own. N₂'s legend ("separated atoms") is plain already.
    // Fix round 1 (review I1): the handle wears Deep Selection, so it rides the drawn state's curve -- 1σu* when that
    // is drawn, 1σg otherwise; a molecule's handle rides its one curve.
    it("names the drawn state's curve as the one the handle rides", () => {
        expect(h2plusCurveSpec(curve, 2).handleKey).toBe('g');
        expect(h2plusCurveSpec(curve, 2, '1sigma_g').handleKey).toBe('g');
        expect(h2plusCurveSpec(curve, 2, '1sigma_u').handleKey).toBe('u');
        expect(diatomicCurveSpec('n2', n2Scan, 2.07).handleKey).toBe('e');
    });

    it('names its curves in plain words for Basics: bonding, antibonding, apart', () => {
        expect(h2plusCurveSpec(curve, 2).series.map(s => [s.label, s.plainLabel]))
            .toEqual([['1σg', 'bonding'], ['1σu*', 'antibonding'], ['H + H⁺', 'apart']]);
    });
});

describe('BondsCurvePlot', () => {
    const h2plus = reducer(undefined, { type: '@@init' });
    const n2 = reducer(reducer(undefined, selectBondsSystem('n2')), setScanPoint({ system: 'n2', index: 7, RBohr: n2Scan.points[7].RBohr }));
    const props = { width: 280, onCommitH2PlusR: jest.fn(), onScanIndex: jest.fn() };

    it('says the H₂⁺ curve is being computed, or why it could not be', () => {
        const { rerender } = render(<BondsCurvePlot bonds={h2plus} data={empty} h2plus={{ curve: null, error: null }} {...props} />);
        expect(screen.getByRole('status')).toHaveTextContent('Computing the exact H₂⁺ curves…');
        rerender(<BondsCurvePlot bonds={h2plus} data={empty} h2plus={{ curve: null, error: 'worker failed' }} {...props} />);
        expect(screen.getByRole('alert')).toHaveTextContent('The H₂⁺ potential curves could not be computed: worker failed');
    });

    /** The pixel for R on a plot of this width (PotentialCurvePlot's padding: 34 left, 8 right). */
    const pixelFor = (R: number, [lo, hi]: [number, number]) => 34 + ((R - lo) / (hi - lo)) * (props.width - 42);

    // Task 3 (picture control): the curve sits under the R slider, which is the keyboard path, so these commits go
    // through the svg (a tap) rather than the curve's own hidden range input, which it no longer has.
    it('commits an H₂⁺ R chosen on the curve', () => {
        render(<BondsCurvePlot bonds={h2plus} data={empty} h2plus={{ curve, error: null }} {...props} />);
        fireEvent.click(screen.getByRole('img', { name: /against R/ }), { clientX: pixelFor(3, [0.5, 10]) });
        expect(props.onCommitH2PlusR.mock.calls.at(-1)[0]).toBeCloseTo(3, 6);
    });

    it("snaps a molecule's R chosen on the curve to its nearest scan point", () => {
        render(<BondsCurvePlot bonds={n2} data={{ ...empty, scan: n2Scan }} h2plus={{ curve: null, error: null }} {...props} />);
        fireEvent.click(screen.getByRole('img', { name: /against R/ }), { clientX: 0 });
        expect(props.onScanIndex).toHaveBeenLastCalledWith(0);
        const range: [number, number] = [n2Scan.points[0].RBohr, n2Scan.points[13].RBohr];
        // Just past point 9, nearer it than point 10.
        const between = n2Scan.points[9].RBohr + 0.3 * (n2Scan.points[10].RBohr - n2Scan.points[9].RBohr);
        fireEvent.click(screen.getByRole('img', { name: /against R/ }), { clientX: pixelFor(between, range) });
        expect(props.onScanIndex).toHaveBeenLastCalledWith(9);
    });

    // Task 3 (picture control): one keyboard path for R -- the slider above the curve.
    it('offers no second keyboard control for R', () => {
        render(<BondsCurvePlot bonds={n2} data={{ ...empty, scan: n2Scan }} h2plus={{ curve: null, error: null }} {...props} />);
        expect(screen.queryByRole('slider')).toBeNull();
    });

    // Task 3 (picture control): while the slider is dragged the panel passes its draft R, so the marker moves with
    // the thumb before the store (and the picture) catch up on release.
    it('marks the R it is given, ahead of the store', () => {
        const { container } = render(
            <BondsCurvePlot bonds={n2} data={{ ...empty, scan: n2Scan }} h2plus={{ curve: null, error: null }} {...props} markerR={n2Scan.points[10].RBohr} />,
        );
        const range: [number, number] = [n2Scan.points[0].RBohr, n2Scan.points[13].RBohr];
        expect(Number(container.querySelector('.potential-marker')!.getAttribute('x1'))).toBeCloseTo(pixelFor(n2Scan.points[10].RBohr, range), 6);
    });

    // Task 3 (picture control), spec §3: dragging on the curve snaps as the slider does -- a molecule's draft is its
    // nearest scan point, H₂⁺'s the nearest 0.01 a₀ -- and a cancelled drag hands back null (the panel reverts).
    describe('dragging', () => {
        const original = (window as { PointerEvent?: unknown }).PointerEvent;
        beforeAll(() => {
            (window as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {
                pointerId: number;
                constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
            };
        });
        afterAll(() => { (window as { PointerEvent?: unknown }).PointerEvent = original; });

        it("drafts a molecule's nearest scan point and H₂⁺'s nearest 0.01 a₀", () => {
            const onDraftR = jest.fn();
            const { unmount } = render(
                <BondsCurvePlot bonds={n2} data={{ ...empty, scan: n2Scan }} h2plus={{ curve: null, error: null }} {...props} onDraftR={onDraftR} />,
            );
            const range: [number, number] = [n2Scan.points[0].RBohr, n2Scan.points[13].RBohr];
            const between = n2Scan.points[4].RBohr + 0.3 * (n2Scan.points[5].RBohr - n2Scan.points[4].RBohr);
            fireEvent.pointerDown(screen.getByRole('img', { name: /against R/ }), { clientX: pixelFor(between, range), pointerId: 1, button: 0 });
            expect(onDraftR).toHaveBeenLastCalledWith(n2Scan.points[4].RBohr);
            fireEvent.pointerCancel(screen.getByRole('img', { name: /against R/ }), { pointerId: 1 });
            expect(onDraftR).toHaveBeenLastCalledWith(null);
            unmount();

            render(<BondsCurvePlot bonds={h2plus} data={empty} h2plus={{ curve, error: null }} {...props} onDraftR={onDraftR} />);
            fireEvent.pointerDown(screen.getByRole('img', { name: /against R/ }), { clientX: pixelFor(3.123, [0.5, 10]), pointerId: 1, button: 0 });
            expect(onDraftR).toHaveBeenLastCalledWith(3.12);
        });
    });

    // Task 4 (picture control): below Explore the curve speaks plainly -- "Energy (eV)", "Distance between nuclei (Å)",
    // "most stable" -- and from Explore up it keeps its own words. Labels only: the same curve and marker either way.
    it('reads in plain words below Explore, for a molecule and for H₂⁺', () => {
        const title = (container: HTMLElement) => container.querySelector('.radial-plot-title')!.textContent;
        const note = (container: HTMLElement) => container.querySelector('.potential-reference-note')!.textContent;
        const scale = (container: HTMLElement) => [...container.querySelector('.radial-plot-scale')!.children].map(span => span.textContent);
        const marker = (container: HTMLElement) => container.querySelector('.potential-marker')!.getAttribute('x1');
        const n2At = (level: 'basics' | 'explore') => render(
            <BondsCurvePlot bonds={n2} data={{ ...empty, scan: n2Scan }} h2plus={{ curve: null, error: null }} {...props} level={level} />,
        );
        const basics = n2At('basics');
        expect(title(basics.container)).toBe('Energy (eV)');
        expect(scale(basics.container)[1]).toBe('Distance between nuclei (Å)');
        // N₂'s fitted Rₑ, 2.086 a₀ = 1.104 Å.
        expect(note(basics.container)).toBe('Dotted line: most stable, 1.10 Å');
        const basicsMarker = marker(basics.container);
        basics.unmount();
        const explore = n2At('explore');
        expect(title(explore.container)).toBe('E − E(separated atoms) (eV)');
        // Task 5b (finish fix 5): from Explore the axis is R, its ends in a₀ alike (no maximum fused into the title).
        expect(scale(explore.container)).toEqual(['1.66 a₀', 'R', '2.41 a₀']);
        expect(note(explore.container)).toMatch(/^Dotted line: R/);
        expect(marker(explore.container)).toBe(basicsMarker);
        explore.unmount();

        const h2 = render(<BondsCurvePlot bonds={h2plus} data={empty} h2plus={{ curve, error: null }} {...props} level="basics" />);
        expect(title(h2.container)).toBe('Energy (eV)');
        // H₂⁺'s exact Rₑ, 1.997 a₀ = 1.057 Å.
        expect(note(h2.container)).toBe('Dotted line: most stable, 1.06 Å');
        // Task 5b (finish fix 6): its legend in plain words at Basics, the technical names from Explore.
        const legend = (container: HTMLElement) => [...container.querySelectorAll('.radial-plot-legend-item')].map(item => item.textContent);
        expect(legend(h2.container)).toEqual(['bonding', 'antibonding', 'apart']);
        h2.unmount();
        const h2Explore = render(<BondsCurvePlot bonds={h2plus} data={empty} h2plus={{ curve, error: null }} {...props} level="explore" />);
        expect(legend(h2Explore.container)).toEqual(['1σg1σg', '1σu1σu*', 'H + H⁺']);
    });

    // Fix round 1 (review I1): with 1σu* drawn, the handle stands on 1σu*'s curve, in its colour -- not on 1σg's.
    it('puts the H₂⁺ handle on the drawn state\'s curve', () => {
        const colour = (container: HTMLElement) => (container.querySelector('.potential-handle') as HTMLElement).style.background;
        const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
        // At R = 4 a₀ both curves are on the plot.
        const at4 = reducer(h2plus, setH2PlusR(4));
        const g = render(<BondsCurvePlot bonds={at4} data={empty} h2plus={{ curve, error: null }} {...props} />);
        expect(colour(g.container)).toBe(rgb(CURVE_COLORS[0]));
        g.unmount();
        const drawnU = reducer(at4, setBondsView({ kind: 'h2plus', state: '1sigma_u' }));
        const u = render(<BondsCurvePlot bonds={drawnU} data={empty} h2plus={{ curve, error: null }} {...props} />);
        expect(colour(u.container)).toBe(rgb(CURVE_COLORS[1]));
    });

    it('draws nothing for a molecule whose scan has not loaded (the panel says so)', () => {
        const { container } = render(<BondsCurvePlot bonds={n2} data={{ ...empty, loading: true }} h2plus={{ curve: null, error: null }} {...props} />);
        expect(container).toBeEmptyDOMElement();
    });
});
