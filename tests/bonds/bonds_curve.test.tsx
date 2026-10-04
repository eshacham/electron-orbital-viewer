import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { diatomicCurveSpec, h2plusCurveSpec } from '../../src/bonds/curve';
import BondsCurvePlot from '../../src/components/BondsCurvePlot';
import reducer, { selectBondsSystem, setScanPoint } from '../../src/store/bondsSlice';
import { HARTREE_TO_EV } from '../../src/bonds/systems';
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

    it('marks the fitted R_e and says where the method stops being valid', () => {
        const spec = diatomicCurveSpec('n2', n2Scan, 2.07);
        expect(spec.referenceR).toEqual({ R: n2Scan.fit.ReBohr, label: 'Dotted line: R_e = 2.086 a₀ (1.104 Å), fitted; D_e = 9.44 eV from separated atoms.' });
        expect(spec.caption).toMatch(/^CCSD\(T\)\/aug-cc-pVTZ \(frozen core\)\. Zero: N ⁴S \+ N ⁴S, UCCSD\(T\)/);
        expect(spec.caption).toMatch(/Single-reference CCSD\(T\) is not valid beyond R = 2\.41 a₀ \(1\.273 Å\) \(the bond breaks into open-shell atoms\), so the curve stops there: T1 diagnostic 0\.0214/);
    });

    it('adds the multireference caveat for B₂ and C₂', () => {
        const c2 = { ...n2Scan, validity: { ...n2Scan.validity, multireference: true, t1AtRe: 0.0384, t1Limit: 0.0576 } } as MoleculeScan;
        const caption = diatomicCurveSpec('c2', c2, 2.36).caption;
        expect(caption).toMatch(/Strongly multireference: single-reference CCSD\(T\) is only qualitative here \(T1 = 0\.038 at R_e\)\./);
        expect(caption).toMatch(/The curve stops at R = 2\.41 a₀ \(1\.273 Å\): at the next point T1 exceeds 1\.5 × its value at R_e \(0\.0576\)/);
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
        expect(spec.caption).toMatch(/^FCI\/aug-cc-pVTZ \(no counterpoise correction\)\. Zero: He ¹S \+ He ¹S, same method\. /);
        expect(spec.caption).toMatch(/No chemical bond: bond order 0 — a van der Waals well of a few hundredths of a mHa \(0\.04 mHa\), comparable to this basis' superposition error\. At this scale the well is invisible\./);
        // Said once, in the method.
        expect(spec.caption.match(/counterpoise/g)).toHaveLength(1);
    });

    it("names the experiment Li₂'s R_e is compared with", () => {
        const li2 = { ...n2Scan, fit: { ...n2Scan.fit, ReBohr: 5.102 }, reference: { ReAngstrom: null, source: null } } as MoleculeScan;
        expect(diatomicCurveSpec('li2', li2, 5.1).caption).toMatch(/R_e comes out 1\.0 % longer than experiment \(2\.673 Å, Huber & Herzberg/);
    });

    it('keeps the marker on the plotted range', () => {
        expect(diatomicCurveSpec('n2', n2Scan, 99).markerR).toBe(n2Scan.points[13].RBohr);
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
        expect(spec.referenceR).toEqual({ R: 1.9971924, label: 'Dotted line: R_e = 1.997 a₀ (1.057 Å), E = −0.6026 Ha; D_e = 2.79 eV (0.1026 Ha) to H + H⁺.' });
        expect(spec.caption).toMatch(/^Exact within Born–Oppenheimer \(nuclei fixed\)/);
        expect(h2plusCurveSpec(curve, 0.1).markerR).toBe(0.5);
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

    it('commits an H₂⁺ R chosen on the curve', () => {
        render(<BondsCurvePlot bonds={h2plus} data={empty} h2plus={{ curve, error: null }} {...props} />);
        fireEvent.change(screen.getByLabelText('E − E(H + H⁺): choose R'), { target: { value: '3' } });
        expect(props.onCommitH2PlusR).toHaveBeenCalledWith(3);
    });

    it("snaps a molecule's R chosen on the curve to its nearest scan point", () => {
        render(<BondsCurvePlot bonds={n2} data={{ ...empty, scan: n2Scan }} h2plus={{ curve: null, error: null }} {...props} />);
        fireEvent.click(screen.getByRole('img', { name: /against R/ }), { clientX: 0 });
        expect(props.onScanIndex).toHaveBeenLastCalledWith(0);
        // The keyboard path steps over scan points by index (final review M5).
        fireEvent.change(screen.getByLabelText('E − E(separated atoms): choose R'), { target: { value: '9' } });
        expect(props.onScanIndex).toHaveBeenLastCalledWith(9);
    });

    it('draws nothing for a molecule whose scan has not loaded (the panel says so)', () => {
        const { container } = render(<BondsCurvePlot bonds={n2} data={{ ...empty, loading: true }} h2plus={{ curve: null, error: null }} {...props} />);
        expect(container).toBeEmptyDOMElement();
    });
});
