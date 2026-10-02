import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
import SpeciesControls from '../../src/components/SpeciesControls';
import { EnergiesState } from '../../src/store/atomSlice';

const idle: EnergiesState = { speciesKey: null, status: 'idle', ionisation: null, excitation: null, message: null };
const renderControls = (overrides: Partial<React.ComponentProps<typeof SpeciesControls>> = {}) => {
    const props = {
        species: { Z: 11, charge: 0, excitation: null },
        onChargeChange: jest.fn(),
        onExcitationChange: jest.fn(),
        energies: idle,
        radii: null,
        unbound: null,
        ...overrides,
    };
    render(<SpeciesControls {...props} />);
    return props;
};

describe('SpeciesControls', () => {
    it('steps the charge within what the element offers', () => {
        const props = renderControls();
        expect(screen.getByRole('button', { name: 'decrease charge' })).toBeDisabled();    // Na has no anion
        fireEvent.click(screen.getByRole('button', { name: 'increase charge' }));
        expect(props.onChargeChange).toHaveBeenCalledWith(1);
    });

    it('shows the species and disables + at the highest charge', () => {
        renderControls({ species: { Z: 11, charge: 1, excitation: null } });
        expect(screen.getByLabelText('charge')).toHaveTextContent('Na⁺');
        expect(screen.getByRole('button', { name: 'increase charge' })).toBeDisabled();
    });

    it('offers "promote one electron to…" from the valence subshell, and back to the ground state', () => {
        const props = renderControls();
        fireEvent.click(screen.getByRole('button', { name: /excite one electron/i }));
        const menu = screen.getByRole('menu');
        expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(
            ['3s → 3p', '3s → 4s', '3s → 3d', '3s → 4p']);
        fireEvent.click(within(menu).getByText('3s → 3p'));
        expect(props.onExcitationChange).toHaveBeenCalledWith({ from: { n: 3, l: 0 }, to: { n: 3, l: 1 } });
    });

    it('labels every energy with its method, and never shows an eigenvalue', () => {
        renderControls({
            energies: { speciesKey: '11', status: 'done', ionisation: { valueEv: 5.368, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null, message: null },
        });
        const line = screen.getByText(/Ionisation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent('5.37 eV');
        expect(line).toHaveTextContent('ΔSCF, LDA');
        expect(line).toHaveTextContent('measured 5.139 eV');
        expect(line.querySelector('[title]')!.getAttribute('title')).toMatch(/difference of two self-consistent total energies/);
    });

    it('names an anion\'s ionisation energy as the electron affinity of the neutral', () => {
        renderControls({
            species: { Z: 35, charge: -1, excitation: null },
            energies: { speciesKey: '35-1', status: 'done', ionisation: { valueEv: 3.1, fromLabel: 'Br⁻', toLabel: 'Br' }, excitation: null, message: null },
        });
        expect(screen.getByText(/electron affinity of Br/)).toBeInTheDocument();
    });

    it('says it is computing while the ΔSCF runs', () => {
        renderControls({ energies: { ...idle, speciesKey: '11', status: 'computing' } });
        expect(screen.getByText(/computing/i)).toBeInTheDocument();
    });

    it('compares the drawn radius with the neutral atom\'s, naming the dashed ring', () => {
        renderControls({ species: { Z: 11, charge: 1, excitation: null }, radii: { displayRadius: 1.6, reference: { displayRadius: 3.2, contourRadius: 1.94 } } });
        const compare = screen.getByLabelText('size compared with the neutral atom');
        expect(compare).toHaveTextContent('dashed ring: neutral Na, drawn radius 3.20 a₀');
        expect(compare).toHaveTextContent('Na⁺ 1.60 a₀ (−50 %)');
    });

    it('states an unbound anion plainly', () => {
        renderControls({ species: { Z: 17, charge: -1, excitation: null }, unbound: 'LDA does not bind this anion: its 3p electron has no bound state (eigenvalue ≥ 0).' });
        expect(screen.getByRole('alert')).toHaveTextContent('LDA does not bind this anion');
    });
});
