import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import BondsPanel from '../../src/components/BondsPanel';
import BondsCurvePlot from '../../src/components/BondsCurvePlot';
import reducer, { selectBondsSystem, setBondsView, setScanPoint } from '../../src/store/bondsSlice';
import { bondsCaptions, densitySurfaceText, frontierText, orbitalCaveats } from '../../src/bonds/captions';
import { bondAxisMinimumDensity } from '../../src/bonds/bond_density';
import { bondOrderNote, bondOrderOf } from '../../src/bonds/mo_diagram';

/** No-break spaces read as plain spaces. */
const flat = (text: string) => text.replace(/\u00A0/g, ' ');
import { MoleculeBasis, MoleculeMeta, MoleculeScan } from '../../src/molecules/types';

const handlers = { onSelectSystem: jest.fn(), onCommitH2PlusR: jest.fn(), onScanIndex: jest.fn(), onView: jest.fn(), onDensityIso: jest.fn() };
const empty = { scan: null, meta: null, basis: null, loading: false, error: null };
const h2plus = reducer(undefined, { type: '@@init' });

const fixture = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules/n2', file), 'utf8'));
/** The committed N₂ fixtures: generate.py's own output, so these captions meet the real shapes. */
const n2Scan: MoleculeScan = fixture('scan.json');
const n2Meta: MoleculeMeta = fixture('meta.json');
const n2Basis: MoleculeBasis = fixture('basis.json');

const o2Fixture = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules/o2', file), 'utf8'));
/** The committed O₂ fixture: real shipped shape, open-shell (spin: 2, SOMO/LUMO roles, no HOMO). */
const o2Meta: MoleculeMeta = o2Fixture('meta.json');

const hfFixture = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules/hf', file), 'utf8'));
/** The committed HF fixture (ruling T23e-COHF): real shipped shape, bondOrder: null (heteronuclear). */
const hfMeta: MoleculeMeta = hfFixture('meta.json');

/**
 * CO has no committed fixture directory; this is the real v3 data's shape
 * (meta.json, confirmed live against the published CDN before writing this
 * test), used only for the heteronuclear footer test below (ruling
 * T23e-COHF) -- same style as he2Meta/o2Scan's hand-rolled shapes elsewhere
 * in this file.
 */
const coMeta = {
    id: 'co', bondOrder: null, spin: 0, totalEnergyHartree: -113.16206639693935, multireference: false, t1AtRe: null,
    method: { density: 'B3LYP/def2-TZVP', energies: 'CCSD(T)/aug-cc-pVTZ (frozen core)' },
    orbitals: [
        { index: 0, label: '1σ', energyHartree: -19.2382, occupation: 2, spin: 'restricted' },
        { index: 1, label: '2σ', energyHartree: -10.2948, occupation: 2, spin: 'restricted' },
        { index: 2, label: '3σ', energyHartree: -1.1719, occupation: 2, spin: 'restricted' },
        { index: 3, label: '4σ', energyHartree: -0.5836, occupation: 2, spin: 'restricted' },
        { index: 4, label: '1π', energyHartree: -0.4842, occupation: 2, spin: 'restricted' },
        { index: 5, label: '1π', energyHartree: -0.4842, occupation: 2, spin: 'restricted' },
        { index: 6, label: '5σ', energyHartree: -0.386, occupation: 2, spin: 'restricted', role: 'HOMO' },
        { index: 7, label: '2π', energyHartree: -0.0379, occupation: 0, spin: 'restricted', role: 'LUMO' },
        { index: 8, label: '2π', energyHartree: -0.0379, occupation: 0, spin: 'restricted' },
        { index: 9, label: '6σ', energyHartree: 0.5708, occupation: 0, spin: 'restricted' },
    ],
} as unknown as MoleculeMeta;

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
const o2 = reducer(reducer(undefined, selectBondsSystem('o2')), setScanPoint({ system: 'o2', index: 0, RBohr: 2.28 }));

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
        // Task 7a fix round 1 (M6): "no counterpoise correction" is said once, by the method ("Energies: FCI/… (no
        // counterpoise correction)."), not again here.
        expect(unbound).toBe("No chemical bond: bond order 0 — a van der Waals well of a few hundredths of a mHa "
            + "(0.04 mHa below the separated atoms, He ¹S + He ¹S, same method), comparable to this basis' superposition error.");
        expect(he.match(/counterpoise/g)).toHaveLength(1);
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
        // Task 8 fix round 1 (I1, M7): plain-text quantities use Unicode, Rₑ and Dₑ, never "_".
        expect(captions).toMatch(/Dₑ = 9\.44 eV \(0\.3470 Ha\) from separated atoms, N ⁴S \+ N ⁴S, UCCSD\(T\)\/aug-cc-pVTZ \(UHF reference, frozen core\)/);
        // Final review M8: the basis's known underbinding (N₂ 9.44 against 9.91 eV).
        expect(captions).toMatch(/without zero-point energy; aug-cc-pVTZ underbinds by a few % against experiment\./);
        expect(captions).toMatch(/Rₑ = 2\.086 a₀ \(1\.104 Å\), fitted to the scan points \(fit uncertainty < 0\.001 a₀\); experiment 1\.098 Å \(Huber & Herzberg/);
    });

    it('says where single-reference CCSD(T) stops being valid, and why', () => {
        expect(bondsCaptions('n2', n2Scan).join(' ')).toMatch(
            /Single-reference CCSD\(T\) is not valid beyond R = 2\.41 a₀ \(1\.273 Å\) \(the bond breaks into open-shell atoms\), so the curve stops there: T1 diagnostic 0\.0214 exceeds 0\.0200 at R = 2\.5307 a₀\./);
        expect(bondsCaptions('n2', n2Scan).join(' ')).toMatch(/Precomputed at 14 bond lengths \(of 20 computed\)/);
    });

    it('marks B₂ and C₂ as strongly multireference', () => {
        expect(bondsCaptions('c2', c2Scan)[0]).toBe(
            'Strongly multireference: single-reference CCSD(T) is only qualitative here (T1 = 0.038 at Rₑ).');
        expect(bondsCaptions('n2', n2Scan).join(' ')).not.toMatch(/multireference/);
    });

    // Ruling T4-d: past the single-reference limit from the start, so the stop is a relative one, not "valid until".
    it("says a multireference curve stops where T1 passes 1.5 × its value at R_e", () => {
        const captions = bondsCaptions('c2', c2Scan).join(' ');
        expect(captions).toMatch(/The curve stops at R = 3\.87 a₀ \(2\.050 Å\): at the next point T1 exceeds 1\.5 × its value at Rₑ \(0\.0576\) — T1 diagnostic 0\.0589 exceeds 0\.0576 at R = 4\.5786 a₀\./);
        expect(captions).not.toMatch(/not valid beyond/);
    });

    it("does not let Li₂'s exact valence treatment imply an exact R_e", () => {
        const captions = bondsCaptions('li2', li2Scan).join(' ');
        expect(captions).toMatch(/exact \(full CI\) for the two valence electrons/);
        expect(captions).toMatch(/Rₑ = 5\.102 a₀ \(2\.700 Å\), fitted to the scan points \(fit uncertainty < 0\.001 a₀\); experiment 2\.673 Å \(Huber & Herzberg, Constants of Diatomic Molecules \(1979\), via NIST Chemistry WebBook\)\. Exact only for the valence pair: core–valence correlation is frozen out, so Rₑ comes out 1\.0 % longer than experiment\./);
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
    // Task 7a (Task 6 ruling: energies read eV first, Ha in parentheses, in every mode): the one frontier text the Data
    // tab and Info share.
    it('names the HOMO and LUMO, once per degenerate set', () => {
        // Fix round 1 (M8): each entry is held on one line (no-break spaces); read here as plain spaces.
        expect(flat(frontierText(n2Meta.orbitals)!)).toBe('HOMO 3σg: ε = −11.92 eV (−0.438 Ha) · LUMO 1πg*: ε = −0.91 eV (−0.033 Ha)');
        expect(frontierText(n2Meta.orbitals)).toContain('−11.92\u00A0eV');
    });

    it("names O₂'s singly occupied pair", () => {
        const orbitals = [
            { index: 0, label: '1πg*', energyHartree: -0.4, occupation: 1, spin: 'alpha', role: 'SOMO' },
            { index: 1, label: '1πg*', energyHartree: -0.4, occupation: 1, spin: 'alpha', role: 'SOMO' },
            { index: 2, label: '1πg*', energyHartree: -0.2, occupation: 0, spin: 'beta', role: 'LUMO' },
        ] as MoleculeMeta['orbitals'];
        // Task 7a: eV first (see above).
        expect(flat(frontierText(orbitals)!)).toBe('SOMO 1πg* α ×2: ε = −10.88 eV (−0.400 Ha) · LUMO 1πg* β: ε = −5.44 eV (−0.200 Ha)');
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
        // Task 7a: the energy line is Info's now (E − E(H + H⁺) from Explore, the total at Research: bonds_info.test.ts).
        expect(screen.queryByText(/E = −0\.60263 Ha/)).toBeNull();
        expect(screen.getByRole('slider', { name: 'Internuclear distance R' })).toHaveAttribute('aria-valuetext', 'R = 2.00 a₀ (1.058 Å)');
        // Task 7a: the states' g/u is a real subscript, in one span with its word (a flex button drops a space between items).
        const bonding = screen.getByRole('button', { name: '1σg (bonding)' });
        expect(bonding.querySelector('span sub')).toHaveTextContent('g');
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(bonding.querySelector('span')).toHaveSeenText(/^1σg bonding$/);
    });

    // Task 7a: the bond-order footer ("Bond order 0 — no bond"), the density label and the energy line with its method
    // are Info's now (bonds_info.test.ts); the panel keeps the choices.
    it("shows He2's density choices, each labelled with its ρ, and its diagram", () => {
        render(<BondsPanel bonds={he2} data={{ ...empty, scan: heScan, meta: heMeta }} note={null} {...handlers} />);
        expect(screen.queryByText(/Bond order 0 — no bond/)).toBeNull();
        expect(screen.queryByText(/surface at ρ = 0\.002 e\/a₀³/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'ρ = 0.05 e/a₀³' }));
        expect(handlers.onDensityIso).toHaveBeenCalledWith(0.05);
        fireEvent.click(screen.getByRole('button', { name: /^1σu\* orbital,/ }));
        expect(handlers.onView).toHaveBeenCalledWith({ kind: 'mo', label: '1σu*', spin: 'restricted', component: 0 });
        expect(screen.queryByText(/FCI\/aug-cc-pVTZ/)).toBeNull();
        // The frontier line ("HOMO 1σu* …") moved to BondsInspector's Data tab
        // (Phase 6G-2 Task 9, ruling P19): BondsPanel is navigation now, not
        // "where this comes from" data. See bonds_inspector.test.tsx.
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

    // Task 7a: what the surface at this ρ shows is Info's now (bondsInfo, read off the same basis); the panel keeps the
    // ρ buttons, with the chosen one pressed.
    it('keeps the ρ buttons, the chosen one pressed, and leaves what the surface shows to Info', () => {
        const dense = { ...n2, densityIso: 0.2 };
        render(<BondsPanel bonds={dense} data={{ ...empty, scan: n2Scan, meta: n2Meta, basis: n2Basis }} note={null} {...handlers} />);
        expect(screen.getByRole('button', { name: 'ρ = 0.2 e/a₀³' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText(/one envelope around both nuclei/)).toBeNull();
    });

    it('lets an orbital view return to the total density', () => {
        const mo = reducer(n2, setBondsView({ kind: 'mo', label: '3σg', spin: 'restricted', component: 0 }));
        render(<BondsPanel bonds={mo} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
        expect(screen.getByRole('button', { name: /^3σg orbital,/ })).toHaveAttribute('aria-pressed', 'true');
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
        const { container } = render(<BondsPanel bonds={he2} data={{ ...empty, scan: heScan, meta: heMeta }} note="3σu* is not among the orbitals kept at this geometry; showing the total density." {...handlers} />);
        // Task 7a: the orbital's g/u is a real subscript, so the note's text is split around it.
        const note = container.querySelector('.bonds-note')!;
        expect(note).toHaveTextContent('3σu* is not among the orbitals kept at this geometry; showing the total density.');
        expect(note.querySelector('sub')).toHaveTextContent('u');
    });

    // The methods list and the near-tie caveat moved to BondsInspector's Data
    // tab (Phase 6G-2 Task 9, ruling P19) -- see bonds_inspector.test.tsx's
    // "lists the captions and the near-tie caveat" test. The footer this test
    // also checked ("Bond order 3.") is still BondsPanel's own (MoDiagram's
    // footer prop, unchanged) and stays covered by "leaves a homonuclear
    // molecule's footer as it was" below.

    // Ruling R23e: the list stays molecules, grouped by bond type, each with its bond order.
    describe('the System select', () => {
        it('is labelled "Molecule (by bond type)" and keeps the closed box reading as before', () => {
            render(<BondsPanel bonds={h2plus} data={empty} note={null} {...handlers} />);
            expect(screen.getByRole('combobox', { name: 'Molecule (by bond type)' }))
                .toHaveTextContent('H₂⁺ — Hydrogen molecular ion — exact');
        });

        it('groups every system by bond type, in order, each labelled with its bond order', () => {
            render(<BondsPanel bonds={h2plus} data={empty} note={null} {...handlers} />);
            fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Molecule (by bond type)' }));
            const listbox = screen.getByRole('listbox');
            ['One-electron bond (exact)', 'σ bonds from s orbitals', 'σ and π bonds (second-row homonuclear)', 'Polar bonds (heteronuclear)']
                .forEach(group => expect(within(listbox).getByText(group)).toBeInTheDocument());
            // MUI's Menu gives ListSubheader an 'option' role too (it is not interactive and carries no
            // aria-label, unlike a real MenuItem); keep only the eleven systems' own entries.
            const labels = within(listbox).getAllByRole('option').map(o => o.getAttribute('aria-label')).filter((label): label is string => label !== null);
            expect(labels).toEqual([
                'H₂⁺ — Hydrogen molecular ion — exact, one-electron bond, order ½',
                'H₂ — Hydrogen, single bond, order 1',
                'He₂ — Helium dimer, no bond, order 0',
                'Li₂ — Lithium, single bond, order 1',
                // Ruling T23e-B2: B₂'s two unpaired π electrons (spin: 2 in the shipped data) are paramagnetic too.
                'B₂ — Boron, single bond, order 1, paramagnetic',
                'C₂ — Carbon, double bond, order 2',
                'N₂ — Nitrogen, triple bond, order 3',
                'O₂ — Oxygen, double bond, order 2, paramagnetic',
                'F₂ — Fluorine, single bond, order 1',
                'CO — Carbon monoxide, triple bond, order 3',
                'HF — Hydrogen fluoride, single bond, order 1',
            ]);
        });

        it('still picks a system by clicking it', () => {
            render(<BondsPanel bonds={h2plus} data={empty} note={null} {...handlers} />);
            fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Molecule (by bond type)' }));
            fireEvent.click(screen.getByRole('option', { name: /^CO —/ }));
            expect(handlers.onSelectSystem).toHaveBeenCalledWith('co');
        });
    });

    // Ruling R23e: "Total density" / "One orbital" replaces the single lone
    // toggle, so it reads as a real two-way switch (owner: "Is Total density a
    // button?"), and the list below it gets a title and a legend.
    describe('the Show switch and the titled orbital list', () => {
        // Task 7a: the heading stays short, with an (i) to the MO diagram's entry; the legend is Info's (bondsInfo, from
        // Advanced: MO_LEGEND).
        it('titles the molecular-orbital list, with an (i), and leaves the legend to Info', () => {
            render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
            expect(screen.getByText('Molecular orbitals')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'About Molecular orbitals' })).toHaveClass('info-button');
            expect(screen.queryByText(/σ\/π: symmetry about the bond axis/)).toBeNull();
        });

        // Owner R26-3: pressing a level draws that orbital (today's behaviour, confirmed), and at Basics and Explore one
        // short pointer line under the heading says so -- a control hint, not an explanation (Info has the notation).
        it('draws the orbital of a pressed level (owner R26-3)', () => {
            handlers.onView.mockClear();
            render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
            fireEvent.click(screen.getByRole('button', { name: '2σg orbital, 2 electrons' }));
            expect(handlers.onView).toHaveBeenCalledWith({ kind: 'mo', label: '2σg', spin: 'restricted', component: 0 });
            fireEvent.click(screen.getByRole('button', { name: '1πu orbital (2 of 2), 2 electrons' }));
            expect(handlers.onView).toHaveBeenLastCalledWith({ kind: 'mo', label: '1πu', spin: 'restricted', component: 1 });
        });

        it.each(['basics', 'explore'] as const)('says "Pick a level to draw that orbital." under the heading at %s (owner R26-3)', level => {
            render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} level={level} />);
            const hint = screen.getByText('Pick a level to draw that orbital.');
            expect(hint).toHaveClass('mo-hint');
            const heading = screen.getByText('Molecular orbitals').closest('.mo-heading-row')!;
            expect(heading.nextElementSibling).toBe(hint);
        });

        it.each(['advanced', 'research'] as const)('leaves the pointer line out at %s (owner R26-3)', level => {
            render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} level={level} />);
            expect(screen.queryByText('Pick a level to draw that orbital.')).toBeNull();
        });

        it('shows Total density selected by default, and One orbital disabled until orbitals are known', () => {
            const fresh = reducer(undefined, selectBondsSystem('n2'));
            render(<BondsPanel bonds={fresh} data={{ ...empty, loading: true }} note={null} {...handlers} />);
            expect(screen.getByRole('button', { name: 'Total electron density' })).toHaveAttribute('aria-pressed', 'true');
            const oneOrbital = screen.getByRole('button', { name: 'One orbital' });
            expect(oneOrbital).toHaveAttribute('aria-pressed', 'false');
            expect(oneOrbital).toBeDisabled();
        });

        it('opens "One orbital" on the frontier orbital (HOMO) when nothing is picked yet', () => {
            render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
            fireEvent.click(screen.getByRole('button', { name: 'One orbital' }));
            expect(handlers.onView).toHaveBeenCalledWith({ kind: 'mo', label: '3σg', spin: 'restricted', component: 0 });
        });

        it('does nothing on "One orbital" when an orbital is already shown (it is already the frontier)', () => {
            const mo = reducer(n2, setBondsView({ kind: 'mo', label: '1πg*', spin: 'restricted', component: 0 }));
            handlers.onView.mockClear();
            render(<BondsPanel bonds={mo} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
            fireEvent.click(screen.getByRole('button', { name: 'One orbital' }));
            expect(handlers.onView).not.toHaveBeenCalled();
        });

        // frontierOccupiedIndex's fallback path: an open-shell ground state (O₂) names no
        // HOMO at all (its frontier orbital is singly occupied, role SOMO), unlike N₂ above.
        it('opens "One orbital" on the SOMO when the ground state is open-shell and nothing is picked yet', () => {
            render(<BondsPanel bonds={o2} data={{ ...empty, meta: o2Meta }} note={null} {...handlers} />);
            expect(o2Meta.orbitals.some(o => o.role === 'HOMO')).toBe(false);
            fireEvent.click(screen.getByRole('button', { name: 'One orbital' }));
            expect(handlers.onView).toHaveBeenCalledWith({ kind: 'mo', label: '1πg*', spin: 'alpha', component: 0 });
        });
    });

    // Ruling T23e-COHF (fix round 1): the footer used to say only that bond order "is not
    // defined by g/u counting" for CO/HF, while the System select (ruling R23e) shows a real
    // number for them -- a contradiction inside the same panel. Both now read
    // systems.ts' TEXTBOOK_BOND_ORDER (see tests/bonds/systems.test.ts for the cross-check).
    // Task 7a: the footer is Info's now. Fix round 1 (M5): Info's Bond order fact gives the number, and bondOrderNote
    // only the why -- tested here on the function; I2: H₂⁺'s 1σu* view says the ½ is the ground state's.
    describe('the heteronuclear footer', () => {
        it('says why g/u counting does not reach CO or HF, without repeating the number', () => {
            const why = "Counted from the valence orbitals' bonding or antibonding character; g/u labels do not apply to a heteronuclear molecule.";
            expect(bondOrderNote('co', coMeta)).toBe(why);
            expect(bondOrderNote('hf', hfMeta)).toBe(why);
            // Ruling T23e-COHF: the number is the System select's own.
            expect(bondOrderOf('co', coMeta)).toBe(3);
            expect(bondOrderOf('hf', hfMeta)).toBe(1);
        });

        it("adds nothing to a homonuclear molecule's own count, and says H₂⁺ is exact", () => {
            expect(bondOrderNote('n2', n2Meta)).toBeNull();
            expect(bondOrderOf('n2', n2Meta)).toBe(3);
            expect(bondOrderOf('he2', heMeta)).toBe(0);
            // Before a molecule's data lands, the textbook value.
            expect(bondOrderOf('o2', null)).toBe(2);
            expect(bondOrderOf('h2plus', null)).toBe(0.5);
            expect(bondOrderNote('h2plus', null)).toBe('One electron, so the energies are exact.');
            expect(bondOrderNote('h2plus', null, '1sigma_u')).toBe(
                'In the ground state (electron in 1σg) the bond order is ½; with the electron in 1σu* there is no bond. One electron, so the energies are exact.');
        });

        it('is no longer printed under the diagram', () => {
            const co = reducer(undefined, selectBondsSystem('co'));
            render(<BondsPanel bonds={co} data={{ ...empty, meta: coMeta }} note={null} {...handlers} />);
            expect(screen.getByLabelText('molecular orbital energy diagram')).toBeInTheDocument();
            expect(screen.queryByText(/Bond order/)).toBeNull();
        });
    });
});

// Task 3 (picture control): Bonds' R story in one place -- the slider, then the curve that sets R, as one "Bond
// length" block in the left panel. The panel measures the block (useElementWidth, a ResizeObserver) and draws the
// curve at that width, nothing before; it hands the curve its draft R, so the marker follows the thumb before release.
describe('the Bond length block (Task 3, picture control)', () => {
    /** Reports every observed box at `width` (jsdom has no ResizeObserver, so it never measures by itself). */
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
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    beforeEach(() => {
        FakeResizeObserver.instances = [];
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original; });
    const measure = (width: number) => act(() => FakeResizeObserver.instances.forEach(observer => observer.resize(width)));
    const WIDTH = 268;
    /** The pixel PotentialCurvePlot draws R at, on a plot WIDTH wide (34 px left padding, 8 right). */
    const pixelFor = (R: number) => {
        const [lo, hi] = [n2Scan.points[0].RBohr, n2Scan.points[n2Scan.points.length - 1].RBohr];
        return 34 + ((R - lo) / (hi - lo)) * (WIDTH - 42);
    };
    const n2Curve = (width: number, markerR: number | null, onDraftR: (R: number | null) => void) => (
        <BondsCurvePlot bonds={n2} data={{ ...empty, scan: n2Scan }} h2plus={{ curve: null, error: null }} width={width} markerR={markerR}
            onDraftR={onDraftR} onCommitH2PlusR={handlers.onCommitH2PlusR} onScanIndex={handlers.onScanIndex} />
    );

    it('holds the slider and then the curve, under one "Bond length" heading with the curve\'s (i)', () => {
        render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} curve={n2Curve} />);
        const block = screen.getByRole('region', { name: 'Bond length' });
        const slider = within(block).getByRole('slider', { name: 'Internuclear distance R' });
        // Not measured yet: no curve drawn at a guessed width.
        expect(within(block).queryByRole('figure')).toBeNull();
        measure(WIDTH);
        const figure = within(block).getByRole('figure', { name: /potential energy curve/ });
        expect(slider.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(figure.querySelector('svg')).toHaveAttribute('width', String(WIDTH));
        // The glossary's curve entry, from the panel's own place -- not Info's fact (i), which is 'info:potentialCurve'.
        expect(within(block).getByRole('button', { name: 'About Potential energy curve' })).toHaveClass('info-button');
        // One keyboard path for R: the slider (the curve's own hidden range input is left out here).
        expect(within(block).getAllByRole('slider')).toEqual([slider]);
    });

    it('moves the marker with the slider while it is dragged, before release commits', () => {
        handlers.onScanIndex.mockClear();
        const { container } = render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} curve={n2Curve} />);
        measure(WIDTH);
        const marker = () => Number(container.querySelector('.potential-marker')!.getAttribute('x1'));
        expect(marker()).toBeCloseTo(pixelFor(n2Scan.points[7].RBohr), 6);
        // A drag on the track (MUI's change, with no commit until the button is released): the track laid out 100 px
        // wide at x = 0, pressed at point 10's place. (A change on its hidden input is the keyboard's, which commits.)
        const root = container.querySelector('.bonds-length .MuiSlider-root') as HTMLElement;
        jest.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
        const [lo, hi] = [n2Scan.points[0].RBohr, n2Scan.points[n2Scan.points.length - 1].RBohr];
        fireEvent.mouseDown(root, { button: 0, clientX: ((n2Scan.points[10].RBohr - lo) / (hi - lo)) * 100, clientY: 10 });
        expect(handlers.onScanIndex).not.toHaveBeenCalled();
        expect(marker()).toBeCloseTo(pixelFor(n2Scan.points[10].RBohr), 6);
        // Released: the same point is committed, and the marker stays.
        fireEvent.mouseUp(document, { button: 0, clientX: ((n2Scan.points[10].RBohr - lo) / (hi - lo)) * 100, clientY: 10 });
        expect(handlers.onScanIndex).toHaveBeenLastCalledWith(10);
    });

    it('moves the slider, the readout and the marker with a drag on the curve, and reverts a cancelled one', () => {
        const original = (window as { PointerEvent?: unknown }).PointerEvent;
        (window as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {
            pointerId: number;
            constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
        };
        try {
            handlers.onScanIndex.mockClear();
            const { container } = render(<BondsPanel bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} curve={n2Curve} />);
            measure(WIDTH);
            const svg = screen.getByRole('img', { name: /against R/ });
            const marker = () => Number(container.querySelector('.potential-marker')!.getAttribute('x1'));
            fireEvent.pointerDown(svg, { clientX: pixelFor(n2Scan.points[11].RBohr), pointerId: 1, button: 0 });
            expect(marker()).toBeCloseTo(pixelFor(n2Scan.points[11].RBohr), 6);
            expect(screen.getByRole('slider', { name: 'Internuclear distance R' })).toHaveAttribute('aria-valuetext', expect.stringMatching(/point 12 of 14$/));
            expect(screen.getByText(new RegExp(`^R = ${n2Scan.points[11].RBohr.toFixed(2)} a₀`))).toBeInTheDocument();
            expect(handlers.onScanIndex).not.toHaveBeenCalled();
            fireEvent.pointerCancel(svg, { pointerId: 1 });
            expect(marker()).toBeCloseTo(pixelFor(n2Scan.points[7].RBohr), 6);
            fireEvent.pointerDown(svg, { clientX: pixelFor(n2Scan.points[11].RBohr), pointerId: 1, button: 0 });
            fireEvent.pointerUp(svg, { clientX: pixelFor(n2Scan.points[11].RBohr), pointerId: 1, button: 0 });
            expect(handlers.onScanIndex).toHaveBeenCalledTimes(1);
            expect(handlers.onScanIndex).toHaveBeenLastCalledWith(11);
        } finally {
            (window as { PointerEvent?: unknown }).PointerEvent = original;
        }
    });

    // The panel draws what it is given; App gives it BondsCurvePlot (src/App.tsx), and a node is drawn as is.
    it('draws a curve given as a node, as it is', () => {
        render(<BondsPanel bonds={h2plus} data={empty} note={null} {...handlers} curve={<p>the curve</p>} />);
        expect(within(screen.getByRole('region', { name: 'Bond length' })).getByText('the curve')).toBeInTheDocument();
    });
});
