import React from 'react';
import { render, fireEvent, screen, within, act } from '@testing-library/react';
import SpeciesControls from '../../src/components/SpeciesControls';
import { EnergiesState } from '../../src/store/atomSlice';
import { UnboundAnionError } from '../../src/atom/scf_shared';

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

    // M7: a disabled stepper button cannot keep a keyboard user's focus --
    // the other button should pick it up rather than letting focus fall
    // back to the document body.
    it('moves focus to the other stepper button once a step reaches the limit', () => {
        renderControls({ species: { Z: 11, charge: 0, excitation: null } }); // allowedCharges(11) = [0, 1]
        const increase = screen.getByRole('button', { name: 'increase charge' });
        const decrease = screen.getByRole('button', { name: 'decrease charge' });
        act(() => increase.focus());
        fireEvent.click(increase); // steps to 1, the highest charge Na offers
        expect(document.activeElement).toBe(decrease);
    });

    // M7: the charge value announces itself on change, and the whole card
    // is a named group of controls, not an anonymous cluster of buttons.
    it('exposes the charge value as a live status, and the card as a named group', () => {
        renderControls();
        expect(screen.getByLabelText('charge')).toHaveAttribute('role', 'status');
        expect(screen.getByRole('group', { name: 'ion and excitation' })).toBeInTheDocument();
    });

    it('offers "promote one electron to…" from the valence subshell, and back to the ground state', () => {
        const props = renderControls();
        const button = screen.getByRole('button', { name: /promote one electron to…/i });
        fireEvent.click(button);
        const menu = screen.getByRole('menu');
        expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(
            ['3s → 3p', '3s → 4s', '3s → 3d', '3s → 4p']);
        fireEvent.click(within(menu).getByText('3s → 3p'));
        expect(props.onExcitationChange).toHaveBeenCalledWith({ from: { n: 3, l: 0 }, to: { n: 3, l: 1 } });
    });

    // M6 (WCAG 2.5.3, Label in Name): the accessible name must contain the
    // visible label -- so there is no hidden aria-label overriding it -- and
    // the popup relationship is stated in ARIA, not just by behaviour.
    it('gives the excite button standard disclosure ARIA, and names the menu', () => {
        renderControls();
        const button = screen.getByRole('button', { name: /excite: promote one electron to…/i });
        expect(button).toHaveAttribute('aria-haspopup', 'menu');
        expect(button).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(button);
        expect(button).toHaveAttribute('aria-expanded', 'true');
        const menu = screen.getByRole('menu');
        expect(button.getAttribute('aria-controls')).toBe(menu.id);
        expect(menu).toHaveAccessibleName();
    });

    it('marks the current excitation selected in the menu, and lets it be cleared', () => {
        const props = renderControls({ species: { Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } } });
        fireEvent.click(screen.getByRole('button', { name: /excited 3s → 3p/i }));
        const menu = screen.getByRole('menu');
        const current = within(menu).getByText('3s → 3p');
        expect(current.closest('[aria-current="true"]')).not.toBeNull();

        fireEvent.click(within(menu).getByText('Back to the ground state'));
        expect(props.onExcitationChange).toHaveBeenCalledWith(null);
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

    // M4: without the "(Na⁺ → Na²⁺)" qualifier, a cation's own ionisation
    // energy reads exactly like the neutral atom's first ionisation energy.
    it('qualifies a cation\'s ionisation energy with which ionisation it is', () => {
        renderControls({
            species: { Z: 11, charge: 1, excitation: null },
            energies: { speciesKey: '11+1', status: 'done', ionisation: { valueEv: 47.3, fromLabel: 'Na⁺', toLabel: 'Na²⁺' }, excitation: null, message: null },
        });
        expect(screen.getByText(/Ionisation energy \(Na⁺ → Na²⁺\)/)).toBeInTheDocument();
    });

    it('names an anion\'s ionisation energy as the electron affinity of the neutral', () => {
        renderControls({
            species: { Z: 35, charge: -1, excitation: null },
            energies: { speciesKey: '35-1', status: 'done', ionisation: { valueEv: 3.1, fromLabel: 'Br⁻', toLabel: 'Br' }, excitation: null, message: null },
        });
        expect(screen.getByText(/electron affinity of Br/)).toBeInTheDocument();
    });

    // M3: O²⁻'s own ionisation energy is the electron affinity of O⁻, not of
    // neutral O -- ionising O²⁻ only ever gets you to O⁻.
    it('names a -2 anion\'s ionisation energy as the electron affinity of the -1 anion', () => {
        renderControls({
            species: { Z: 8, charge: -2, excitation: null },
            energies: { speciesKey: '8-2', status: 'done', ionisation: { valueEv: 1.9, fromLabel: 'O²⁻', toLabel: 'O⁻' }, excitation: null, message: null },
        });
        expect(screen.getByText(/electron affinity of O⁻/)).toBeInTheDocument();
    });

    // Ruling C5, enforced by the component itself (not only by the store's
    // selectSpeciesEnergies): a reply for a species no longer selected must
    // never paint as if it were the current species' own number.
    it('does not show another species\' energies (ruling C5)', () => {
        renderControls({
            species: { Z: 11, charge: 0, excitation: null }, // Na
            energies: { speciesKey: '11+1', status: 'done', ionisation: { valueEv: 47.3, fromLabel: 'Na⁺', toLabel: 'Na²⁺' }, excitation: null, message: null },
        });
        const line = screen.getByText(/Ionisation energy/).closest('.species-energy')!;
        expect(line).not.toHaveTextContent('47.3');
        expect(line).toHaveTextContent('—');
    });

    it('shows the excitation energy\'s own method label', () => {
        renderControls({
            species: { Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } },
            energies: { speciesKey: '11:3s>3p', status: 'done', ionisation: null, excitation: { valueEv: 2.19, fromLabel: 'Na', toLabel: 'Na 3s → 3p' }, message: null },
        });
        const line = screen.getByText(/Excitation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent('2.19 eV');
        expect(line).toHaveTextContent('ΔSCF, LDA');
    });

    it('says it is computing while the ΔSCF runs', () => {
        renderControls({ energies: { ...idle, speciesKey: '11', status: 'computing' } });
        expect(screen.getByText(/computing/i)).toBeInTheDocument();
    });

    it('shows a failed ΔSCF solve\'s own message', () => {
        renderControls({
            energies: { speciesKey: '11', status: 'failed', ionisation: null, excitation: null, message: 'The spin-polarised SCF did not converge for Na.' },
        });
        expect(screen.getByText(/did not converge for Na/)).toBeInTheDocument();
    });

    // C15: the NIST comparison only covers the neutral atom's own first
    // ionisation energy, H through Ar.
    it('never shows "measured" for an ion, even within Z ≤ 18', () => {
        renderControls({
            species: { Z: 11, charge: 1, excitation: null },
            energies: { speciesKey: '11+1', status: 'done', ionisation: { valueEv: 47.3, fromLabel: 'Na⁺', toLabel: 'Na²⁺' }, excitation: null, message: null },
        });
        expect(screen.queryByText(/measured/)).toBeNull();
    });

    it('never shows "measured" past Z = 18', () => {
        renderControls({
            species: { Z: 19, charge: 0, excitation: null }, // K
            energies: { speciesKey: '19', status: 'done', ionisation: { valueEv: 4.34, fromLabel: 'K', toLabel: 'K⁺' }, excitation: null, message: null },
        });
        expect(screen.queryByText(/measured/)).toBeNull();
    });

    it('compares the drawn radius with the neutral atom\'s, naming the dashed ring', () => {
        renderControls({ species: { Z: 11, charge: 1, excitation: null }, radii: { displayRadius: 1.6, reference: { displayRadius: 3.2, contourRadius: 1.94, framingRadius: 3.2 } } });
        const compare = screen.getByLabelText('size compared with the neutral atom');
        expect(compare).toHaveTextContent('dashed ring: neutral Na, drawn radius 3.20 a₀');
        expect(compare).toHaveTextContent('Na⁺ 1.60 a₀ (−50 %)');
    });

    // M11: a rounded 0 % reads as a typo ("−0 %"); say plainly that the
    // sizes are indistinguishable instead.
    it('says sizes are indistinguishable rather than showing a signed near-zero', () => {
        renderControls({ species: { Z: 11, charge: 1, excitation: null }, radii: { displayRadius: 1.999, reference: { displayRadius: 2.0, contourRadius: 1.2, framingRadius: 2.0 } } });
        const compare = screen.getByLabelText('size compared with the neutral atom');
        expect(compare).toHaveTextContent('≈ same size');
        expect(compare).not.toHaveTextContent('−0 %');
        expect(compare).not.toHaveTextContent('+0 %');
    });

    it('states an unbound anion plainly, with the solver\'s own message', () => {
        const message = new UnboundAnionError(3, 1).message;
        renderControls({ species: { Z: 17, charge: -1, excitation: null }, unbound: message });
        expect(screen.getByRole('alert')).toHaveTextContent('LDA does not bind this anion');
        expect(screen.getByRole('alert')).toHaveTextContent(message);
    });
});
