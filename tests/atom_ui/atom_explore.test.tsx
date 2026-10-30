import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AtomExplore from '../../src/atom_ui/AtomExplore';
import OrbitalEnergyList from '../../src/atom_ui/OrbitalEnergyList';
import SubshellPanel from '../../src/components/SubshellPanel';
import InfoButton from '../../src/info/InfoButton';
import { InfoTopicProvider, useInfoTopic } from '../../src/info/useInfoTopic';
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
        render(<OrbitalEnergyList subshells={neonProfile().subshells} />);
        const table = screen.getByRole('table', { name: 'orbital energies, whole atom' });
        expect(screen.getAllByRole('row')).toHaveLength(4);
        expect(table.textContent).not.toMatch(/ionisation energy/i);
    });

    // Science corrections S2: eV first, then Ha, each in its own column, each with a true minus (U+2212).
    it('gives the table an eV column, then a Ha one: carbon 2p reads −5.41 and −0.199', () => {
        const carbon = neonProfile().subshells.map(subshell => (
            subshell.n === 1 ? { ...subshell, electrons: 2, energy: -9.95 }
                : subshell.l === 0 ? { ...subshell, electrons: 2, energy: -0.5 } : { ...subshell, electrons: 2, energy: -0.1988 }));
        render(<OrbitalEnergyList subshells={carbon} />);
        const table = screen.getByRole('table', { name: 'orbital energies, whole atom' });
        expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Subshell', 'Electrons', 'eV', 'Ha']);
        const row = screen.getByRole('row', { name: /2p/ });
        // Final polish F4: the headers are the bare units on one line; each accessible name says what the column is, and
        // holds the visible text (WCAG 2.5.3).
        expect(screen.getByRole('columnheader', { name: 'Energy (eV)' })).toHaveTextContent(/^eV$/);
        expect(screen.getByRole('columnheader', { name: 'Energy (Ha)' })).toHaveTextContent(/^Ha$/);
        expect(Array.from(row.querySelectorAll('td')).map(cell => cell.textContent).slice(-2)).toEqual(['−5.41', '−0.199']);
        expect(table.textContent).not.toMatch(/\d Ha/);
    });

    // Owner R26-2: the table's caption is a short label with its unit and a Kohn–Sham (i) beside it; its method words
    // ("eigenvalues", "non-relativistic LDA") are Info's (the energyLevels entry, and "How this was computed").
    it('captions the table "Orbital energies" with a Kohn–Sham (i), and no method words (owner R26-2)', () => {
        render(<OrbitalEnergyList subshells={neonProfile().subshells} />);
        const caption = screen.getByRole('table', { name: 'orbital energies, whole atom' }).querySelector('caption')!;
        expect(caption).toHaveSeenText('Orbital energies');
        expect(caption.textContent).not.toMatch(/eigenvalue|LDA|relativistic/i);
        expect(caption.querySelector('button.info-button')).toHaveAccessibleName('About Kohn–Sham orbitals');
    });

    // Owner R26-2 (the place:topic rule): the table's Kohn–Sham (i) and the diagram's (i) each light alone -- a
    // Kohn–Sham (i) elsewhere (Info's 'info' place) stays at rest when the table's is pressed.
    it("lights only the pressed (i): the table's Kohn–Sham one, the diagram's, never another place's (owner R26-2)", () => {
        const Harness: React.FC = () => {
            const { topic, setTopic } = useInfoTopic('6|0|0|whole');
            return (
                <InfoTopicProvider topic={topic} setTopic={setTopic}>
                    <SubshellPanel subshells={neonProfile().subshells} shellN={null} selectedSubshell={null}
                        onSelectSubshell={() => {}} onSelectOrbital={() => {}} part="diagram" />
                    <OrbitalEnergyList subshells={neonProfile().subshells} />
                    <InfoButton topic="kohnSham" label="Kohn–Sham orbitals" place="info" />
                </InfoTopicProvider>
            );
        };
        render(<Harness />);
        const kohnSham = screen.getAllByRole('button', { name: 'About Kohn–Sham orbitals' });
        const diagram = screen.getByRole('button', { name: 'About Orbital energies' });
        fireEvent.click(kohnSham[0]);
        expect(kohnSham.map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
        fireEvent.click(diagram);
        expect(diagram).toHaveAttribute('aria-pressed', 'true');
        expect(kohnSham.map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    });
});
