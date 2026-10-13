import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AtomExplore from '../../src/atom_ui/AtomExplore';
import OrbitalEnergyList from '../../src/atom_ui/OrbitalEnergyList';
import { neonProfile } from '../export/fixtures';

describe('AtomExplore (spec §9.1)', () => {
    // Ruling R20b-atoms (owner decision): Display moved to the inspector, so Explore has two tabs.
    it('heads the panel with the subject and tabs Configuration and Orbitals', () => {
        render(<AtomExplore header={<p>tile</p>} configuration={<p>config</p>} orbitals={<p>orbitals</p>} />);
        expect(screen.getByText('tile')).toBeInTheDocument();
        expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Configuration', 'Orbitals']);
        expect(screen.getByRole('tabpanel')).toHaveTextContent('config');
        fireEvent.click(screen.getByRole('tab', { name: 'Orbitals' }));
        expect(screen.getByRole('tabpanel')).toHaveTextContent('orbitals');
    });

    it('lists orbital energies, never as ionisation energies (ruling R19)', () => {
        render(<OrbitalEnergyList subshells={neonProfile().subshells} relativity="off" />);
        const table = screen.getByRole('table', { name: 'orbital energies, whole atom' });
        expect(table).toHaveTextContent('Orbital energies (eigenvalues, Ha), non-relativistic LDA');
        expect(screen.getAllByRole('row')).toHaveLength(4);
        expect(table.textContent).not.toMatch(/ionisation energy/i);
    });
});
