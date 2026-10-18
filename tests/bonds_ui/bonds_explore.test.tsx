import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen } from '@testing-library/react';
import BondsExplore from '../../src/bonds_ui/BondsExplore';
import reducer, { selectBondsSystem, setScanPoint } from '../../src/store/bondsSlice';
import { MoleculeMeta, MoleculeScan } from '../../src/molecules/types';

const handlers = { onSelectSystem: jest.fn(), onCommitH2PlusR: jest.fn(), onScanIndex: jest.fn(), onView: jest.fn(), onDensityIso: jest.fn() };
const empty = { scan: null, meta: null, basis: null, loading: false, error: null };
const h2plus = reducer(undefined, { type: '@@init' });

const fixture = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/molecules/n2', file), 'utf8'));
/** The committed N₂ fixtures: generate.py's own output, as bonds_panel.test.tsx uses them. */
const n2Scan: MoleculeScan = fixture('scan.json');
const n2Meta: MoleculeMeta = fixture('meta.json');
const n2 = reducer(reducer(undefined, selectBondsSystem('n2')), setScanPoint({ system: 'n2', index: 7, RBohr: n2Scan.points[7].RBohr }));

describe('BondsExplore (spec §9.3, Phase 6G-2 Task 9)', () => {
    it("heads the panel with N₂'s formula, name, bond-type group and textbook bond order", () => {
        render(<BondsExplore bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
        expect(screen.getByText('N₂')).toBeInTheDocument();
        expect(screen.getByText('Nitrogen')).toBeInTheDocument();
        expect(screen.getByText('σ and π bonds (second-row homonuclear)')).toBeInTheDocument();
        expect(screen.getByText('triple bond, order 3')).toBeInTheDocument();
        // Ruling: the "exact" chip names only H₂⁺, the one system solved here rather than precomputed.
        expect(screen.queryByText('exact')).not.toBeInTheDocument();
    });

    it('marks H₂⁺ "exact", the one system solved here rather than precomputed', () => {
        render(<BondsExplore bonds={h2plus} data={empty} note={null} {...handlers} />);
        expect(screen.getByText('H₂⁺')).toBeInTheDocument();
        expect(screen.getByText('Hydrogen molecular ion — exact')).toBeInTheDocument();
        expect(screen.getByText('One-electron bond (exact)')).toBeInTheDocument();
        expect(screen.getByText('one-electron bond, order ½')).toBeInTheDocument();
        // WCAG 2.5.3: the chip's accessible name contains its visible label ("exact").
        const chip = screen.getByText('exact').closest('.MuiChip-root');
        expect(chip).toHaveAttribute('aria-label', 'exact solution');
    });

    it("still renders BondsPanel's own navigation -- the select, the R slider and the Show switch", () => {
        render(<BondsExplore bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
        expect(screen.getByRole('combobox', { name: 'Molecule (by bond type)' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Internuclear distance R' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Total electron density' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'One orbital' })).toBeInTheDocument();
    });

    // Ruling P19 (Phase 6G-2 Task 9): the frontier line, caveats and methods
    // list are BondsInspector's Data tab now -- see bonds_inspector.test.tsx.
    it('keeps the methods list out of the Explore panel', () => {
        render(<BondsExplore bonds={n2} data={{ ...empty, scan: n2Scan, meta: n2Meta }} note={null} {...handlers} />);
        expect(screen.queryByRole('list', { name: 'methods' })).not.toBeInTheDocument();
    });
});
