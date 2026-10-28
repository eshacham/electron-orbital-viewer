import React from 'react';
import { render, fireEvent, screen, within, act } from '@testing-library/react';
import SpeciesControls from '../../src/components/SpeciesControls';
import { UnboundAnionError } from '../../src/atom/scf_shared';

const renderControls = (overrides: Partial<React.ComponentProps<typeof SpeciesControls>> = {}) => {
    const props = {
        species: { Z: 11, charge: 0, excitation: null },
        onChargeChange: jest.fn(),
        onExcitationChange: jest.fn(),
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

    // Task 9b: the panel's energy-line tests (the labelled value and its (i), its level, the cation, anion and -2 anion
    // names, ruling C5, the excitation line, waiting / computing / "—" / next ion not offered / failed, the s→d note,
    // FR-2's failed picture, no "measured", no method tooltip, the NIST and ring comparisons left to Info) moved with the
    // line to Info's energy fact: tests/info/atom_info.test.ts ('the energy fact says what the panel line said') and the
    // existing Info energy tests there pin each one.
    it('states an unbound anion plainly, with the solver\'s own message', () => {
        const message = new UnboundAnionError(3, 1).message;
        renderControls({ species: { Z: 17, charge: -1, excitation: null }, unbound: message });
        expect(screen.getByRole('alert')).toHaveTextContent('LDA does not bind this anion');
        expect(screen.getByRole('alert')).toHaveTextContent(message);
    });
});

// Task 9b (finish review, fix 2; controller ruling overriding Task 6's "stays at Advanced"): the energy has one home,
// Info's fact -- the panel keeps the Charge and Excite controls and no energy line at any level.
describe('SpeciesControls holds no energy line (Task 9b)', () => {
    it('shows no ionisation or excitation energy, even at Research', () => {
        renderControls({
            level: 'research',
        });
        expect(screen.queryByText(/Ionisation energy/)).toBeNull();
        expect(screen.queryByRole('button', { name: 'About Ionisation energy' })).toBeNull();
        expect(document.querySelector('.species-energy')).toBeNull();
    });
});

