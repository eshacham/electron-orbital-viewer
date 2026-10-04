import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import BondsPanel from '../../src/components/BondsPanel';
import reducer, { selectBondsSystem, setBondsView, setScanPoint } from '../../src/store/bondsSlice';
import { bondsCaptions, densitySurfaceText, frontierText, orbitalCaveats } from '../../src/bonds/captions';
import { bondAxisMinimumDensity } from '../../src/bonds/bond_density';
import { MoleculeBasis, MoleculeMeta, MoleculeScan } from '../../src/molecules/types';

const handlers = { onSelectSystem: jest.fn(), onCommitH2PlusR: jest.fn(), onScanIndex: jest.fn(), onView: jest.fn(), onDensityIso: jest.fn() };
const empty = { scan: null, meta: null, basis: null, loading: false, error: null };
const h2plus = reducer(undefined, { type: '@@init' });

const fixture = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules/n2', file), 'utf8'));
/** The committed N₂ fixtures: generate.py's own output, so these captions meet the real shapes. */
const n2Scan: MoleculeScan = fixture('scan.json');
const n2Meta: MoleculeMeta = fixture('meta.json');
const n2Basis: MoleculeBasis = fixture('basis.json');

// He₂'s shape and numbers as the v1 data ship them (tools/molecules/out/v1/he2/scan.json).
const heScan = {
    id: 'he2', name: 'Helium dimer', formula: 'He₂', spin: 0,
    energyMethod: 'FCI/aug-cc-pVTZ (no counterpoise correction)', densityMethod: 'B3LYP/def2-TZVP',
    points: [2.4, 3.0, 3.6].map((RBohr, index) => ({ index, id: `he2@0${index}`, RBohr, energyHartree: -5.8 + 0.01 / RBohr, dftEnergyHartree: -5.8, t1Diagnostic: 0 })),
    equilibriumIndex: 1,
    fit: {
        ReBohr: 5.555, ReUncertaintyBohr: 1.18, EminHartree: -5.801235, DeHartree: 3.9e-5, DeEv: 0.00107, bound: false,
        separatedAtomsHartree: -5.801196, separatedAtomsMethod: 'He ¹S + He ¹S, FCI/aug-cc-pVTZ (no counterpoise correction)',
    },
    validity: { pointsComputed: 3, pointsShipped: 3, exact: true, t1Limit: null, t1AtRe: null, multireference: false, validUpToRBohr: 3.6, stoppedAtRBohr: null, stopReason: null },
    spinCheck: null,
    note: 'No chemical bond: bond order 0. The full-CI curve has only a van der Waals well of a few hundredths of a mHa, invisible at this scale.',
    reference: { ReAngstrom: null, source: null },
} as MoleculeScan;
// D15 (preflight.md): the plan's fixture had no totalEnergyHartree or method, so the energy line threw.
const heMeta = {
    id: 'he2@01', bondOrder: 0, totalEnergyHartree: -5.8, multireference: false, t1AtRe: null,
    method: { density: 'B3LYP/def2-TZVP', energies: 'FCI/aug-cc-pVTZ (no counterpoise correction)' },
    orbitals: [
        { index: 0, label: '1σg', energyHartree: -0.57, occupation: 2, spin: 'restricted' },
        { index: 1, label: '1σu*', energyHartree: -0.55, occupation: 2, spin: 'restricted', role: 'HOMO' }],
} as unknown as MoleculeMeta;
const he2 = reducer(reducer(undefined, selectBondsSystem('he2')), setScanPoint({ system: 'he2', index: 1, RBohr: 3.0 }));
const n2 = reducer(reducer(undefined, selectBondsSystem('n2')), setScanPoint({ system: 'n2', index: 7, RBohr: n2Scan.points[7].RBohr }));

/** C₂ and B₂ (ruling T4-d): kept, with T1 at R_e above the single-reference limit. */
const c2Scan = {
    ...n2Scan, id: 'c2', formula: 'C₂', note: 'C₂ has strong multi-reference character; single-reference CCSD(T) and B3LYP are approximate here.',
    validity: { ...n2Scan.validity, multireference: true, t1AtRe: 0.03843, t1Limit: 0.05765, validUpToRBohr: 3.8742, stoppedAtRBohr: 4.5786,
        stopReason: 'T1 diagnostic 0.0589 exceeds 0.0576 at R = 4.5786 a₀' },
} as MoleculeScan;
/** Li₂ (ruling T4-c): 1s frozen, so CCSD(T) is full CI for the valence pair, and the whole curve ships. */
const li2Scan = {
    ...n2Scan, id: 'li2', formula: 'Li₂', energyMethod: 'CCSD(T)/aug-cc-pVTZ, 1s frozen: exact (full CI) for the two valence electrons',
    fit: { ...n2Scan.fit, ReBohr: 5.102, DeEv: 1.0325, DeHartree: 0.037944 },
    validity: { ...n2Scan.validity, exact: true, t1Limit: null, t1AtRe: null, stoppedAtRBohr: null, stopReason: null },
    note: 'Both 1s shells are frozen, so CCSD(T) correlates only the two valence electrons, where it is exact (full CI): the whole curve is kept.',
    reference: { ReAngstrom: null, source: null },
} as MoleculeScan;
const o2Scan = {
    ...n2Scan, id: 'o2', formula: 'O₂', spin: 2, energyMethod: 'UCCSD(T)/aug-cc-pVTZ (UHF reference, frozen core)',
    spinCheck: { RBohr: 2.2818, tripletHartree: -150.140976, singletHartree: -150.0932, method: 'UCCSD(T) triplet vs closed-shell CCSD(T) singlet, aug-cc-pVTZ, frozen core' },
} as MoleculeScan;

describe('bondsCaptions', () => {
    it('states the method of every quantity', () => {
        const exact = bondsCaptions('h2plus', null).join(' ');
        expect(exact).toMatch(/Exact within Born–Oppenheimer \(nuclei fixed\)/);
        expect(exact).toMatch(/12\.5 a₀/);
        const he = bondsCaptions('he2', heScan).join(' ');
        expect(he).toMatch(/Energies: FCI\/aug-cc-pVTZ/);
        expect(he).toMatch(/orbital energies are B3LYP\/def2-TZVP Kohn–Sham eigenvalues — not ionisation energies/);
        const unbound = bondsCaptions('he2', heScan).find(c => c.startsWith('No chemical bond'));
        expect(unbound).toBe("No chemical bond: bond order 0 — a van der Waals well of a few hundredths of a mHa "
            + "(0.04 mHa below the separated atoms, He ¹S + He ¹S, same method), comparable to this basis' superposition error, "
            + 'with no counterpoise correction.');
        // He₂ has no bond, so it has no R_e or D_e to state.
        expect(he).not.toMatch(/D_e|R_e =/);
    });

    // Fix round 1, M4: He₂ opens at its lowest-energy point; say what that is.
    it('says an unbound pair opens at van der Waals contact, not a bond', () => {
        const contact = bondsCaptions('he2', heScan).find(c => /van der Waals contact/.test(c));
        expect(contact).toBe('The view opens at R = 3.60 a₀ (1.905 Å), the lowest energy on the scan: van der Waals contact, not a bond.');
        expect(bondsCaptions('n2', n2Scan).some(c => /van der Waals contact/.test(c))).toBe(false);
    });

    it('takes D_e from separated atoms, with their method, and R_e with its fit uncertainty', () => {
        const captions = bondsCaptions('n2', n2Scan).join(' ');
        expect(captions).toMatch(/D_e = 9\.44 eV \(0\.3470 Ha\) from separated atoms, N ⁴S \+ N ⁴S, UCCSD\(T\)\/aug-cc-pVTZ \(UHF reference, frozen core\)/);
        expect(captions).toMatch(/R_e = 2\.086 a₀ \(1\.104 Å\), fitted to the scan points \(fit uncertainty < 0\.001 a₀\); experiment 1\.098 Å \(Huber & Herzberg/);
    });

    it('says where single-reference CCSD(T) stops being valid, and why', () => {
        expect(bondsCaptions('n2', n2Scan).join(' ')).toMatch(
            /Single-reference CCSD\(T\) is not valid beyond R = 2\.41 a₀ \(1\.273 Å\) \(the bond breaks into open-shell atoms\), so the curve stops there: T1 diagnostic 0\.0214 exceeds 0\.0200 at R = 2\.5307 a₀\./);
        expect(bondsCaptions('n2', n2Scan).join(' ')).toMatch(/Precomputed at 14 bond lengths \(of 20 computed\)/);
    });

    it('marks B₂ and C₂ as strongly multireference', () => {
        expect(bondsCaptions('c2', c2Scan)[0]).toBe(
            'Strongly multireference: single-reference CCSD(T) is only qualitative here (T1 = 0.038 at R_e).');
        expect(bondsCaptions('n2', n2Scan).join(' ')).not.toMatch(/multireference/);
    });

    // Ruling T4-d: past the single-reference limit from the start, so the stop is a relative one, not "valid until".
    it("says a multireference curve stops where T1 passes 1.5 × its value at R_e", () => {
        const captions = bondsCaptions('c2', c2Scan).join(' ');
        expect(captions).toMatch(/The curve stops at R = 3\.87 a₀ \(2\.050 Å\): at the next point T1 exceeds 1\.5 × its value at R_e \(0\.0576\) — T1 diagnostic 0\.0589 exceeds 0\.0576 at R = 4\.5786 a₀\./);
        expect(captions).not.toMatch(/not valid beyond/);
    });

    it("does not let Li₂'s exact valence treatment imply an exact R_e", () => {
        const captions = bondsCaptions('li2', li2Scan).join(' ');
        expect(captions).toMatch(/exact \(full CI\) for the two valence electrons/);
        expect(captions).toMatch(/R_e = 5\.102 a₀ \(2\.700 Å\), fitted to the scan points \(fit uncertainty < 0\.001 a₀\); experiment 2\.673 Å \(Huber & Herzberg, Constants of Diatomic Molecules \(1979\), via NIST Chemistry WebBook\)\. Exact only for the valence pair: core–valence correlation is frozen out, so R_e comes out 1\.0 % longer than experiment\./);
        // The reference is stated once, where the comparison is made.
        expect(captions.match(/2\.673 Å/g)).toHaveLength(1);
        expect(captions).not.toMatch(/not valid beyond/);
    });

    it("states O₂'s triplet–singlet gap with its method", () => {
        const captions = bondsCaptions('o2', o2Scan).join(' ');
        expect(captions).toMatch(/Unrestricted Kohn–Sham/);
        expect(captions).toMatch(/The triplet lies 0\.0478 Ha \(1\.30 eV\) below the closed-shell singlet at R = 2\.28 a₀ \(UCCSD\(T\) triplet vs closed-shell CCSD\(T\) singlet/);
    });
});

describe('frontierText and orbitalCaveats', () => {
    it('names the HOMO and LUMO, once per degenerate set', () => {
        expect(frontierText(n2Meta.orbitals)).toBe('HOMO 3σg (ε = −0.438 Ha) · LUMO 1πg* (ε = −0.033 Ha)');
    });

    it("names O₂'s singly occupied pair", () => {
        const orbitals = [
            { index: 0, label: '1πg*', energyHartree: -0.4, occupation: 1, spin: 'alpha', role: 'SOMO' },
            { index: 1, label: '1πg*', energyHartree: -0.4, occupation: 1, spin: 'alpha', role: 'SOMO' },
            { index: 2, label: '1πg*', energyHartree: -0.2, occupation: 0, spin: 'beta', role: 'LUMO' },
        ] as MoleculeMeta['orbitals'];
        expect(frontierText(orbitals)).toBe('SOMO 1πg* α ×2 (ε = −0.400 Ha) · LUMO 1πg* β (ε = −0.200 Ha)');
    });

    it('says when a kept orbital shape is a near tie with another virtual', () => {
        const meta = { ...n2Meta, orbitals: n2Meta.orbitals.map(o => (o.label === '3σu*'
            ? { ...o, nearTie: { minaoWeight: 0.3484, runnerUpMinaoWeight: 0.316, runnerUpEnergyHartree: 0.2243 } } : o)) };
        expect(orbitalCaveats(meta)).toEqual([
            "3σu*: this orbital's shape mixes with another σ virtual of the same symmetry at this R — a tie in MINAO weight (0.348 against 0.316), "
                + 'not in energy — so either shape is as fair a picture.',
        ]);
        expect(orbitalCaveats(n2Meta)).toEqual([]);
    });
});

describe('the density surface label', () => {
    // The reviewer's reading of the v1 grids: N₂ 0.71 e/a₀³ at its bond midpoint.
    it("finds N₂'s lowest ρ along the bond from the shipped basis", () => {
        expect(bondAxisMinimumDensity(n2Basis)).toBeCloseTo(0.707, 2);
    });

    it('keeps the conventional meaning for 0.002 only, and says from the data whether the surface is one envelope', () => {
        expect(densitySurfaceText(0.002, 'B3LYP/def2-TZVP', 0.707)).toBe(
            'Total electron density (B3LYP/def2-TZVP), surface at ρ = 0.002 e/a₀³, the conventional molecular outline: '
            + 'one envelope around both nuclei here (ρ stays above 0.71 e/a₀³ along the bond).');
        expect(densitySurfaceText(0.2, 'B3LYP/def2-TZVP', 0.707)).toBe(
            'Total electron density (B3LYP/def2-TZVP), surface at ρ = 0.2 e/a₀³, a higher-density contour, closer to the nuclei: '
            + 'one envelope around both nuclei here (ρ stays above 0.71 e/a₀³ along the bond).');
        // Li₂ (0.0125 e/a₀³ at its midpoint).
        expect(densitySurfaceText(0.05, null, 0.0125)).toBe(
            'Total electron density, surface at ρ = 0.05 e/a₀³, a higher-density contour, closer to the nuclei: '
            + 'separate around each nucleus here (ρ falls to 0.013 e/a₀³ between them).');
        expect(densitySurfaceText(0.05, null, null)).toBe('Total electron density, surface at ρ = 0.05 e/a₀³, a higher-density contour, closer to the nuclei.');
    });
});

describe('BondsPanel', () => {
    it('offers H2+ bonding and antibonding and a continuous R', () => {
        render(<BondsPanel bonds={h2plus} data={empty} note={null} {...handlers} />);
        expect(screen.getByRole('button', { name: '1σg (bonding)' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: '1σu* (antibonding)' }));
        expect(handlers.onView).toHaveBeenCalledWith({ kind: 'h2plus', state: '1sigma_u' });
        expect(screen.getByText(/R = 2\.00 a₀ \(1\.058 Å\)/)).toBeInTheDocument();
        expect(screen.getByText(/E = −0\.60263 Ha \(exact, Born–Oppenheimer\)/)).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Internuclear distance R' })).toHaveAttribute('aria-valuetext', 'R = 2.00 a₀ (1.058 Å)');
    });

    it("shows He2's zero bond order and the density choices, each labelled with its ρ", () => {
        render(<BondsPanel bonds={he2} data={{ ...empty, scan: heScan, meta: heMeta }} note={null} {...handlers} />);
        expect(screen.getByText(/Bond order 0 — no bond/)).toBeInTheDocument();
        expect(screen.getByText(/surface at ρ = 0\.002 e\/a₀³, the conventional molecular outline/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'ρ = 0.05 e/a₀³' }));
        expect(handlers.onDensityIso).toHaveBeenCalledWith(0.05);
        fireEvent.click(screen.getByRole('button', { name: /1σu\* \(1 of 1\)/ }));
        expect(handlers.onView).toHaveBeenCalledWith({ kind: 'mo', label: '1σu*', spin: 'restricted', component: 0 });
        expect(screen.getByText(/E = −5\.80000 Ha, FCI\/aug-cc-pVTZ \(no counterpoise correction\)/)).toBeInTheDocument();
        expect(screen.getByText('HOMO 1σu* (ε = −0.550 Ha)')).toBeInTheDocument();
    });

    it("snaps a molecule's R slider to the scan's points", () => {
        render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
        const slider = screen.getByRole('slider', { name: 'Internuclear distance R' });
        expect(slider).toHaveAttribute('aria-valuetext', `R = ${n2Scan.points[7].RBohr.toFixed(2)} a₀ (${(n2Scan.points[7].RBohr * 0.529177210903).toFixed(3)} Å), point 8 of 14`);
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
        expect(handlers.onScanIndex).toHaveBeenLastCalledWith(8);
        // The readout follows the thumb, before the store (here, never) catches up.
        expect(screen.getByText(new RegExp(`^R = ${n2Scan.points[8].RBohr.toFixed(2)} a₀`))).toBeInTheDocument();
    });

    // Fix round 1, M5 (WAI-ARIA slider): Home and End go to the first and
    // last points; MUI's own handling with step={null} moved one mark.
    it('jumps to the first and last scan points with Home and End', () => {
        handlers.onScanIndex.mockClear();
        render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
        const slider = screen.getByRole('slider', { name: 'Internuclear distance R' });
        fireEvent.keyDown(slider, { key: 'End' });
        expect(handlers.onScanIndex).toHaveBeenLastCalledWith(n2Scan.points.length - 1);
        expect(screen.getByText(new RegExp(`^R = ${n2Scan.points[n2Scan.points.length - 1].RBohr.toFixed(2)} a₀`))).toBeInTheDocument();
        fireEvent.keyDown(slider, { key: 'Home' });
        expect(handlers.onScanIndex).toHaveBeenLastCalledWith(0);
        expect(handlers.onScanIndex).toHaveBeenCalledTimes(2);
    });

    it('says, from the loaded basis, that N₂ at ρ = 0.2 is one envelope', () => {
        const dense = { ...n2, densityIso: 0.2 };
        render(<BondsPanel bonds={dense} data={{ ...empty, scan: n2Scan, meta: n2Meta, basis: n2Basis }} note={null} {...handlers} />);
        expect(screen.getByText(/surface at ρ = 0\.2 e\/a₀³, a higher-density contour, closer to the nuclei: one envelope around both nuclei here/)).toBeInTheDocument();
    });

    it('lets an orbital view return to the total density', () => {
        const mo = reducer(n2, setBondsView({ kind: 'mo', label: '3σg', spin: 'restricted', component: 0 }));
        render(<BondsPanel bonds={mo} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
        expect(screen.getByRole('button', { name: /3σg \(1 of 1\)/ })).toHaveAttribute('aria-pressed', 'true');
        const density = screen.getByRole('button', { name: 'Total electron density' });
        expect(density).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(density);
        expect(handlers.onView).toHaveBeenCalledWith({ kind: 'density' });
    });

    // Review Focus 3.
    it('says the canvas still shows the previous system when loading fails', () => {
        const fresh = reducer(undefined, selectBondsSystem('n2'));
        render(<BondsPanel bonds={fresh} data={{ ...empty, error: 'Could not load /molecules/n2/scan.json (HTTP 404)' }} note={null} {...handlers} />);
        expect(screen.getByRole('alert')).toHaveTextContent('N₂ could not be loaded: Could not load /molecules/n2/scan.json (HTTP 404). The view still shows the previous system.');
    });

    it('announces loading politely', () => {
        const fresh = reducer(undefined, selectBondsSystem('n2'));
        const { rerender } = render(<BondsPanel bonds={fresh} data={{ ...empty, loading: true }} note={null} {...handlers} />);
        expect(screen.getByRole('status')).toHaveTextContent('Loading N₂…');
        expect(screen.getByRole('progressbar', { name: 'Loading N₂' })).toBeInTheDocument();
        rerender(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
        expect(screen.getByRole('status')).toHaveTextContent(`N₂ at R = ${n2Scan.points[7].RBohr.toFixed(2)} a₀ loaded.`);
    });

    it('shows why the picture differs from the selection', () => {
        render(<BondsPanel bonds={he2} data={{ ...empty, scan: heScan, meta: heMeta }} note="3σu* is not among the orbitals kept at this geometry; showing the total density." {...handlers} />);
        expect(screen.getByText(/3σu\* is not among the orbitals kept/)).toBeInTheDocument();
    });

    it('lists the captions and the near-tie caveat under the diagram', () => {
        const meta = { ...n2Meta, orbitals: n2Meta.orbitals.map(o => (o.label === '3σu*'
            ? { ...o, nearTie: { minaoWeight: 0.3484, runnerUpMinaoWeight: 0.316, runnerUpEnergyHartree: 0.2243 } } : o)) };
        render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta }} note={null} {...handlers} />);
        const list = screen.getByRole('list', { name: 'methods' });
        expect(within(list).getByText(/not valid beyond R = 2\.41 a₀/)).toBeInTheDocument();
        expect(screen.getByText(/3σu\*: this orbital's shape mixes with another σ virtual of the same symmetry/)).toBeInTheDocument();
        expect(screen.getByText(/Bond order 3\./)).toBeInTheDocument();
    });
});
