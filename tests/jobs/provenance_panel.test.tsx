import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import ProvenancePanel from '../../src/components/ProvenancePanel';
import TierBadge from '../../src/components/TierBadge';
import { validatedLine } from '../../src/validation/geometry_honesty';
import type { MoleculeProvenance } from '../../src/molecules/types';
import type { LibraryMoleculeMeta } from '../../src/molecules/library_types';
import { waterMeta } from '../molecules/fixtures';
import { jobFixture } from './api_fixtures';

const KEY = jobFixture('get_done').key;
/** What build_library and the 6B-1 worker write since the TZVPD switch (the shared waterMeta fixture predates it). */
const TZVPD = { density: 'B3LYP/def2-TZVPD', energies: 'B3LYP/def2-TZVPD' };
const PROVENANCE: MoleculeProvenance = {
    jobKey: KEY, computeVersion: 1, recipe: 'single',
    geometrySource: { kind: 'pubchem', cid: 962, title: 'Water', query: 'water', retrievedAt: '2026-10-10' },
    caveats: ["The geometry is not optimised: it is PubChem's computed 3D conformer or as pasted."],
    generatorCommit: 'abc1234def567', imageDigest: 'local', pyscfVersion: '2.8.0', sizingVersion: 1, size: 'S',
    capacity: 'local', wallSeconds: 70.2, costUsd: null,
};
const computed = (over: Partial<MoleculeProvenance> = {}, extra: Record<string, unknown> = {}): LibraryMoleculeMeta =>
    waterMeta({ id: KEY, tier: 'computed', method: TZVPD, provenance: { ...PROVENANCE, ...over }, references: [], ...extra });
const open = () => fireEvent.click(screen.getByRole('button', { name: 'How this was computed' }));

describe('TierBadge', () => {
    // Final review I2: the line says what this molecule's own references check, never a fixed claim -- after
    // Phase 6D nine library molecules (methane among them) have neither a dipole nor an optimised geometry.
    const EXPERIMENT = 'experiment (CCCBDB)';
    const methane = waterMeta({
        id: 'ch4', geometrySource: EXPERIMENT, references: [
            { quantity: 'bond', value: 1.087, unit: 'Å', source: EXPERIMENT, tolerance: 0.01, atoms: [0, 1], label: 'C–H' },
            { quantity: 'angle', value: 109.47, unit: 'deg', source: EXPERIMENT, tolerance: 1, atoms: [1, 0, 2], label: 'H–C–H' },
            { quantity: 'dipole', value: 0, unit: 'D', source: 'zero by symmetry', tolerance: 0.01 }],
    });
    const water = waterMeta({
        geometrySource: EXPERIMENT, references: [
            { quantity: 'bond', value: 0.958, unit: 'Å', source: EXPERIMENT, tolerance: 0.01, atoms: [0, 1], label: 'O–H' },
            { quantity: 'angle', value: 104.5, unit: 'deg', source: EXPERIMENT, tolerance: 1, atoms: [1, 0, 2], label: 'H–O–H' },
            { quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook, via CCCBDB', tolerance: 0.1855 }],
    });
    const PLAUSIBLE = 'experiment (CCCBDB); plausibility check of the optimised geometry';
    const methanol = waterMeta({
        id: 'ch3oh', geometrySource: 'B3LYP-D3(BJ)/def2-TZVP optimised (PySCF + geomeTRIC)',
        geometryOptimisation: { converged: true, steps: 6 }, references: [
            { quantity: 'bond', value: 1.427, unit: 'Å', source: PLAUSIBLE, tolerance: 0.02, atoms: [0, 1], label: 'C–O' },
            { quantity: 'bond', value: 0.956, unit: 'Å', source: PLAUSIBLE, tolerance: 0.02, atoms: [1, 5], label: 'O–H' },
            { quantity: 'dihedral', value: 180, unit: 'deg', source: 'conformer check', tolerance: 10, atoms: [2, 0, 1, 5] },
            { quantity: 'dipole', value: 1.7, unit: 'D', source: 'CRC Handbook, via CCCBDB', tolerance: 0.17 }],
    });
    it('says plainly when nothing about the method is checked (methane: no dipole, geometry from experiment)', () => {
        expect(validatedLine(methane)).toBe('Curated; geometry from experiment; no property checked against experiment yet.');
        render(<TierBadge meta={methane} />);
        expect(screen.getByRole('note', { name: 'data tier' }))
            .toHaveTextContent('LibraryCurated; geometry from experiment; no property checked against experiment yet.');
        expect(screen.getByRole('note', { name: 'data tier' })).not.toHaveTextContent(/dipole|optimised/);
    });
    it('names the dipole only where one is checked (water), and the optimised geometry only where there is one', () => {
        expect(validatedLine(water)).toBe('Curated; geometry from experiment; dipole checked against published values.');
        expect(validatedLine(methanol)).toBe('Curated; optimised geometry; bond lengths and dipole checked against published values.');
        expect(validatedLine(waterMeta({ id: 'n2', geometrySource: 'experimental R_e (Huber & Herzberg)', references: [
            { quantity: 'R_e', value: 1.098, unit: 'Å', source: 'Huber & Herzberg' }] })))
            .toBe('Curated; geometry from experiment; equilibrium bond length (from its energy curve) checked against published values.');
        expect(validatedLine(waterMeta({ id: 'he2', geometrySource: 'no equilibrium: scan centre', references: [] })))
            .toBe('Curated; no property checked against experiment yet.');
    });
    it('names the tier and says what it means', () => {
        const { rerender } = render(<TierBadge meta={water} />);
        expect(screen.getByRole('note', { name: 'data tier' }))
            .toHaveTextContent('LibraryCurated; geometry from experiment; dipole checked against published values.');
        rerender(<TierBadge meta={computed()} />);
        expect(screen.getByRole('note', { name: 'data tier' }))
            .toHaveTextContent('ComputedComputed on request by the same method; not benchmarked against experiment.');
        // V1: the Computed chip takes the darker amber style.css declares (contrast-tested), not MUI's warning (3.1:1).
        expect(screen.getByText('Computed').closest('.MuiChip-root')).toHaveClass('tier-chip-computed');
        expect(screen.getByText('Computed').closest('.MuiChip-root')).not.toHaveClass('MuiChip-colorWarning');
    });
    // V2: the compact badge's title is its only pointer hint, and the legend stack takes no pointer events.
    it('compact, takes the pointer, so its title can show', () => {
        const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
        const rule = /^\.tier-badge\.compact \{[^}]*\}/m.exec(css)?.[0] ?? '';
        expect(rule).toContain('pointer-events: auto');
    });
    // Preflight D13 / ruling T16-c: on a phone the two-line badge pushed the
    // stack over the molecule; compact, it is the chip alone, its line kept
    // for a pointer (title) and a screen reader (the note's description).
    it('compact, is the chip alone, with its line still told', () => {
        render(<TierBadge meta={computed()} compact />);
        const note = screen.getByRole('note', { name: 'data tier' });
        expect(note).toHaveClass('compact');
        expect(note).toHaveAttribute('title', 'Computed on request by the same method; not benchmarked against experiment.');
        expect(note).toHaveAccessibleDescription('Computed on request by the same method; not benchmarked against experiment.');
        expect(note.querySelector('.tier-badge-line')).toBeNull();
        expect(note.querySelector('.visually-hidden')).toHaveTextContent('Computed on request');
    });
    it('compact, tells a validated molecule its own line too', () => {
        render(<TierBadge meta={methane} compact />);
        const note = screen.getByRole('note', { name: 'data tier' });
        expect(note).toHaveAttribute('title', validatedLine(methane));
        expect(note).toHaveAccessibleDescription('Curated; geometry from experiment; no property checked against experiment yet.');
    });
});

describe('ProvenancePanel', () => {
    it('states a validated molecule’s method, its geometry and what it was checked against', () => {
        render(<ProvenancePanel meta={waterMeta({ method: TZVPD })} ownerJob={null} />);
        open();
        expect(screen.getByText('Method: B3LYP/def2-TZVPD, PySCF 2.6.0.')).toBeInTheDocument();
        expect(screen.getByText('Geometry: experiment (CCCBDB).')).toBeInTheDocument();
        expect(screen.getByText('dipole: 1.855 D — CRC Handbook, via CCCBDB')).toBeInTheDocument();
        expect(screen.getByText(/Generated by tools\/molecules\/build_library\.py at commit abc1234\./)).toBeInTheDocument();
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
    it('links a computed molecule’s PubChem record, states its caveats, and links its four files', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={null} />);
        open();
        expect(screen.getByText('Method: B3LYP/def2-TZVPD, PySCF 2.8.0.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '962' })).toHaveAttribute('href', 'https://pubchem.ncbi.nlm.nih.gov/compound/962');
        expect(screen.getByText(/its computed 3D conformer, retrieved 2026-10-10, not optimised\./)).toBeInTheDocument();
        expect(screen.getByText(PROVENANCE.caveats[0])).toBeInTheDocument();
        for (const name of ['input.py', 'output.log', 'geometry.xyz', 'job.json']) {
            expect(screen.getByRole('link', { name })).toHaveAttribute('href', `/molecules/jobs/${KEY}/${name}`);
        }
        expect(screen.getByText(/Ran on This Mac: 1 min 10 s of wall time\. Generator commit abc1234; sized by sizing rule v1\./)).toBeInTheDocument();
        expect(screen.queryByText(/Cost:/)).toBeNull();
    });
    it('says an optimised geometry was optimised, from what, and adds the trajectory', () => {
        render(<ProvenancePanel meta={computed({ recipe: 'optimise', geometrySource: { kind: 'xyz' } }, { geometryOptimisation: { steps: 7, converged: true } })} ownerJob={null} />);
        open();
        expect(screen.getByText(/optimised at B3LYP\/def2-SVP with geomeTRIC in 7 steps, starting from pasted XYZ coordinates\./)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'trajectory.xyz' })).toHaveAttribute('href', `/molecules/jobs/${KEY}/trajectory.xyz`);
    });
    it('says a resumed optimisation attempt and its step count (D10)', () => {
        render(<ProvenancePanel meta={computed({ recipe: 'optimise', geometrySource: { kind: 'xyz' } }, { geometryOptimisation: { steps: 3, converged: true, resumedFrom: 1 } })} ownerJob={null} />);
        open();
        // M5: the step count is said once, as this attempt's.
        expect(screen.getByText('Geometry: optimised at B3LYP/def2-SVP with geomeTRIC, starting from pasted XYZ coordinates, resumed from attempt 1’s last frame (3 steps in this attempt).')).toBeInTheDocument();
    });
    // m5: MUI already gives the details region the summary's aria-controls id; a second element with it is invalid.
    it('leaves one element with its region id', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={null} />);
        open();
        expect(document.querySelectorAll('#provenance-body')).toHaveLength(1);
    });
    it('shows the owner the time against its prediction, and the cost', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={jobFixture('get_done')} />);
        open();
        expect(screen.getByText(/Owner only: 1 min 10 s of wall time, peak memory 0\.52 GB \(predicted .+ sizing v\d+ prediction\)\./)).toBeInTheDocument();
        expect(screen.getByText(/Cost: spent \$0\.00 \(This Mac\)\./)).toBeInTheDocument();
    });
    it('shows a cost not settled yet as reserved, for a record from before quotes', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={{ ...jobFixture('get_done'), backend: 'aws', actualUsd: null, reservedUsd: 0.0894, approvedQuote: null, charged: null }} />);
        open();
        expect(screen.getByText(/Cost: reserved \$0\.09, not settled yet\./)).toBeInTheDocument();
    });
    // Phase 6C: an AWS job approved from a quote shows its maximum and what it was charged.
    it('shows what a quoted job was charged against its approved maximum', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={jobFixture('get_done_aws')} />);
        open();
        expect(screen.getByText(/Cost: charged \$0\.00\d+ of up to \$0\.02 approved \(Spot\)\./)).toBeInTheDocument();
    });
    it('says when the owner’s job record could not be read', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={null} ownerJobError="offline" />);
        open();
        expect(screen.getByRole('alert')).toHaveTextContent('The job record could not be read: offline');
    });

    // Phase 6D: what compute version 2 writes.
    const D3 = { density: 'B3LYP-D3(BJ)/def2-TZVPD', energies: 'B3LYP-D3(BJ)/def2-TZVPD' };
    const checked = (extra: Record<string, unknown> = {}, over: Partial<MoleculeProvenance> = {}) => computed(
        { computeVersion: 2, recipe: 'optimise', geometrySource: { kind: 'xyz' }, geometryMethod: 'B3LYP-D3(BJ)/def2-SVP',
          frequencyCheck: 'true minimum (no imaginary frequencies)', timeLimitSeconds: 600, ...over },
        { method: D3, totalEnergyHartree: -76.358723, dispersion: { model: 'D3(BJ)', energyHartree: -0.000574, backend: 'pyscf-dispersion 1.5.0' },
          geometryOptimisation: { steps: 4, converged: true },
          frequencyCheck: { result: 'minimum', summary: 'true minimum (no imaginary frequencies)', imaginaryCount: 0,
                            zeroPointEnergyHartree: 0.021134, method: 'B3LYP-D3(BJ)/def2-SVP' }, ...extra });

    it('states the dispersion correction and that the total energy includes it', () => {
        render(<ProvenancePanel meta={checked()} ownerJob={null} />);
        open();
        expect(screen.getByText('Dispersion: Grimme D3(BJ) (Becke–Johnson damping), computed with pyscf-dispersion 1.5.0. '
            + 'It changes energies and forces only, not the orbitals, density or potential. '
            + 'Total energy −76.358723 Ha, including −0.000574 Ha of D3(BJ).')).toBeInTheDocument();
        expect(screen.getByText(/optimised at B3LYP-D3\(BJ\)\/def2-SVP with geomeTRIC in 4 steps/)).toBeInTheDocument();
        expect(screen.queryByText(/before dispersion was added/)).toBeNull();
    });
    it('states the frequency check and links frequencies.json', () => {
        render(<ProvenancePanel meta={checked()} ownerJob={null} />);
        open();
        expect(screen.getByText('Frequency check (B3LYP-D3(BJ)/def2-SVP): true minimum (no imaginary frequencies); '
            + 'zero-point energy 0.021134 Ha.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'frequencies.json' })).toHaveAttribute('href', `/molecules/jobs/${KEY}/frequencies.json`);
    });
    it('says a saddle point is a saddle point, and a time-limited optimisation is not converged', () => {
        render(<ProvenancePanel meta={checked({
            geometryOptimisation: { steps: 30, converged: false, stoppedBy: 'time-limit', maxGradient: 0.0021 },
            frequencyCheck: { result: 'not-run', summary: 'not checked: the optimisation stopped at its time limit',
                              method: 'B3LYP-D3(BJ)/def2-SVP' } })} ownerJob={null} />);
        open();
        expect(screen.getByText('The optimisation stopped at its time limit, not converged (max force, the largest Cartesian gradient component: 2.1e-3 Ha/bohr).')).toBeInTheDocument();
        expect(screen.getByText(/Frequency check \(B3LYP-D3\(BJ\)\/def2-SVP\): not checked: the optimisation stopped at its time limit\./)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'frequencies.json' })).toBeNull();
    });
    it('a legacy job says it was computed before dispersion (Review Focus 5)', () => {
        render(<ProvenancePanel meta={computed({ recipe: 'optimise', geometrySource: { kind: 'xyz' } }, { geometryOptimisation: { steps: 7, converged: true } })} ownerJob={null} />);
        open();
        expect(screen.getByText('Computed before dispersion was added (compute version 1): B3LYP/def2-TZVPD without D3(BJ), '
            + 'and its optimised structure was not checked for imaginary frequencies.')).toBeInTheDocument();
        expect(screen.queryByText(/^Frequency check/)).toBeNull();
        expect(screen.queryByText(/^Dispersion:/)).toBeNull();
    });
    it('says an experimental geometry\'s bond and angle are not a test of the method', () => {
        render(<ProvenancePanel meta={waterMeta({ method: TZVPD, references: [
            { quantity: 'bond', value: 0.958, unit: 'Å', source: 'experiment (CCCBDB)', tolerance: 0.01 },
            { quantity: 'dipole', value: 1.855, unit: 'D', source: 'CRC Handbook, via CCCBDB', tolerance: 0.1855 }] })} ownerJob={null} />);
        open();
        expect(screen.getByText('bond: 0.958 Å — experiment (CCCBDB); geometry from experiment (not a test of the method)')).toBeInTheDocument();
        expect(screen.getByText('dipole: 1.855 D — CRC Handbook, via CCCBDB')).toBeInTheDocument();
    });

    // Beyond the brief: the rest of what compute version 2 records, said where the method is.
    it('a legacy single point says only that it has no D3(BJ)', () => {
        render(<ProvenancePanel meta={computed()} ownerJob={null} />);
        open();
        expect(screen.getByText('Computed before dispersion was added (compute version 1): B3LYP/def2-TZVPD without D3(BJ).')).toBeInTheDocument();
        expect(screen.queryByText(/time limit/)).toBeNull();
    });
    it('gives a saddle point\'s zero-point energy with its caveat, and still links its frequencies', () => {
        render(<ProvenancePanel meta={checked({
            geometryOptimisation: { steps: 9, converged: true },
            frequencyCheck: { result: 'saddle-point', summary: 'saddle point (1 imaginary frequency), not a minimum', imaginaryCount: 1,
                              imaginaryWavenumbers: [-830.05], zeroPointEnergyHartree: 0.0331,
                              zeroPointEnergyNote: 'at a saddle point: the imaginary modes are left out of the sum, so this is not the zero-point energy of a minimum',
                              method: 'B3LYP-D3(BJ)/def2-SVP' } })} ownerJob={null} />);
        open();
        expect(screen.getByText('Frequency check (B3LYP-D3(BJ)/def2-SVP): saddle point (1 imaginary frequency), not a minimum; '
            + 'zero-point energy 0.033100 Ha (at a saddle point: the imaginary modes are left out of the sum, so this is not the zero-point energy of a minimum).'))
            .toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'frequencies.json' })).toBeInTheDocument();
    });
    it('states an open shell\'s mixed method, the final geometry and SCF, and the time limit', () => {
        const provenance = {
            openShell: { methods: 'geometry and frequencies: UKS; properties: ROKS', expectedS2: 0.75, geometryS2: 0.7518, frequenciesS2: 0.7519, contaminated: false },
            finalGeometry: { symmetrised: true, groupOrder: null, maxDisplacementAngstrom: 0, pointGroup: 'Coov',
                             summary: 'symmetrised to Coov before the final SCF (largest move 0.0e+00 Å)' },
            finalScf: { symmetry: 'off', retried: true, summary: 'the final SCF did not converge with point-group symmetry, so it was run again without it, and converged' },
        } as Partial<MoleculeProvenance>;
        render(<ProvenancePanel meta={checked({}, provenance)} ownerJob={null} />);
        open();
        expect(screen.getByText('Open shell: geometry and frequencies: UKS; properties: ROKS. '
            + 'UKS ⟨S²⟩ 0.752 at the last geometry step and 0.752 at the frequency check, against S(S+1) = 0.750.')).toBeInTheDocument();
        expect(screen.getByText('Final geometry: symmetrised to Coov before the final SCF (largest move 0.0e+00 Å).')).toBeInTheDocument();
        expect(screen.getByText('Final SCF: the final SCF did not converge with point-group symmetry, so it was run again without it, and converged.')).toBeInTheDocument();
        expect(screen.getByText(/sized by sizing rule v1; time limit 10 min 00 s\.$/)).toBeInTheDocument();
    });
    it('says when an open shell\'s UKS steps were spin-contaminated', () => {
        const note = 'UKS spin contamination: <S^2> 0.900 at the last geometry step, against S(S+1) = 0.750 (more than 10 % off)';
        render(<ProvenancePanel meta={checked({}, { openShell: { methods: 'geometry and frequencies: UKS; properties: ROKS', expectedS2: 0.75,
            geometryS2: 0.9, frequenciesS2: null, contaminated: true, note } } as Partial<MoleculeProvenance>)} ownerJob={null} />);
        open();
        expect(screen.getByText(`Open shell: geometry and frequencies: UKS; properties: ROKS. ${note}.`)).toBeInTheDocument();
    });
});
