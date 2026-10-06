import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { filterMolecules, formatFormula, libraryEntries } from '../../src/molecules/catalogue';
import MoleculePicker from '../../src/components/MoleculePicker';
import MoleculePickerDialog from '../../src/components/MoleculePickerDialog';
import { LIBRARY_INDEX } from './fixtures';

const ids = (q: string, c: string | null = null) => filterMolecules(LIBRARY_INDEX, q, c).map(e => e.id);

describe('catalogue', () => {
    it('matches name, formula (with or without subscripts) and tags', () => {
        expect(ids('water')).toEqual(['h2o']);
        expect(ids('H2O')).toEqual(['h2o']);
        expect(ids('h₂o')).toEqual(['h2o']);
        expect(ids('c2')).toEqual(['c2h2', 'c2h4', 'c2h6', 'ethanol']);
        expect(ids('radical')).toEqual(['no2']);
    });
    it('filters by category, primary or tagged', () => {
        expect(ids('', 'aromatic')).toEqual(['benzene', 'pyridine']);
        expect(ids('', 'polarity')).toContain('h2o');
        expect(ids('', 'biomolecule-fragments')).toEqual(['ch3oh', 'hcooh', 'ethanol', 'acetone', 'formamide', 'glycine']);
    });
    it('writes formulas with subscripts and keeps only library entries', () => {
        expect(formatFormula('(CH3)2CO')).toBe('(CH₃)₂CO');
        expect(formatFormula('C6H6')).toBe('C₆H₆');
        expect(libraryEntries([...LIBRARY_INDEX, { id: 'h2', name: 'Hydrogen', formula: 'H2', category: 'diatomic', tags: [] }])).toHaveLength(25);
    });
});

describe('MoleculePicker', () => {
    it('searches, filters by category, and picks', () => {
        const onSelect = jest.fn();
        render(<MoleculePicker entries={LIBRARY_INDEX} error={null} selectedId="h2o" onSelect={onSelect} />);
        const list = screen.getByRole('list', { name: 'molecules' });
        expect(within(list).getAllByRole('button')).toHaveLength(25);
        fireEvent.click(screen.getByRole('button', { name: 'Aromatic' }));
        expect(within(list).getAllByRole('button')).toHaveLength(2);
        fireEvent.click(within(list).getByRole('button', { name: /Pyridine/ }));
        expect(onSelect).toHaveBeenCalledWith('pyridine');
    });
    it('picks the first match on Enter and says when nothing matches', () => {
        const onSelect = jest.fn();
        render(<MoleculePicker entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={onSelect} />);
        const box = screen.getByLabelText('filter molecules');
        fireEvent.change(box, { target: { value: 'benz' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith('benzene');
        fireEvent.change(box, { target: { value: 'xenon' } });
        expect(screen.getByText('No molecule matches “xenon”.')).toBeInTheDocument();
    });
    it('shows loading and failure explicitly', () => {
        const { rerender } = render(<MoleculePicker entries={null} error={null} selectedId={null} onSelect={() => {}} />);
        expect(screen.getByText('Loading the molecule library…')).toBeInTheDocument();
        rerender(<MoleculePicker entries={null} error="HTTP 500" selectedId={null} onSelect={() => {}} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load the molecule library: HTTP 500');
    });
    it('closes the phone dialog once a molecule is chosen', () => {
        const onSelect = jest.fn();
        const onClose = jest.fn();
        render(<MoleculePickerDialog open entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={onSelect} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /Water/ }));
        expect(onSelect).toHaveBeenCalledWith('h2o');
        expect(onClose).toHaveBeenCalled();
    });
});
