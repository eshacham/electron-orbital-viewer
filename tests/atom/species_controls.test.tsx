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

    // Task 6: a short labelled value with an (i); its method (ΔSCF), NIST comparison and limitation note are Info's
    // (tests/info/atom_info.test.ts pins them there).
    it('shows the energy as a short labelled value with an (i), never an eigenvalue', () => {
        renderControls({
            energies: { speciesKey: '11', status: 'done', ionisation: { valueEv: 5.368, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null, message: null },
        });
        const line = screen.getByText(/Ionisation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent(/^Ionisation energy \(Na → Na⁺\): 5\.37 eV$/);
        expect(within(line as HTMLElement).getByRole('button', { name: 'About Ionisation energy' })).toBeInTheDocument();
        expect(screen.queryByText('ΔSCF, LDA')).toBeNull();
        expect(screen.queryByText(/measured/)).toBeNull();
        expect(line.querySelector('[title]')).toBeNull();
    });

    // Task 6: the energy line is Advanced's, with Charge and Excite; below it the panel holds no energy at all.
    it('hides the energy line below Advanced', () => {
        renderControls({
            level: 'explore',
            energies: { speciesKey: '11', status: 'done', ionisation: { valueEv: 5.368, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null, message: null },
        });
        expect(screen.queryByText(/Ionisation energy/)).toBeNull();
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
        expect(line).toHaveTextContent('waiting for the picture…');
    });

    // Task 6: the method is Info's; the line is the label and the value.
    it('shows the excitation energy as a labelled value', () => {
        renderControls({
            species: { Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } },
            energies: { speciesKey: '11:3s>3p', status: 'done', ionisation: null, excitation: { valueEv: 2.19, fromLabel: 'Na', toLabel: 'Na 3s → 3p' }, message: null },
        });
        const line = screen.getByText(/Excitation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent(/^Excitation energy 3s → 3p: 2\.19 eV$/);
    });

    // Fix round 1, M3: "—" means "not defined" (Na⁺ has no ionisation the
    // neon core allows); before the ΔSCF has even started -- it waits for
    // the picture (ruling C15) -- the line must not claim that.
    it('says it is waiting for the picture before the ΔSCF starts', () => {
        renderControls();
        expect(screen.getByText(/Ionisation energy/).closest('.species-energy')).toHaveTextContent('Ionisation energy (Na → Na⁺): waiting for the picture…');
    });

    it('shows "—" only once the ΔSCF has said there is no value', () => {
        renderControls({
            species: { Z: 11, charge: 1, excitation: null },
            energies: { speciesKey: '11+1', status: 'done', ionisation: null, excitation: null, message: null },
        });
        const line = screen.getByText(/Ionisation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent('—');
        expect(line).not.toHaveTextContent('waiting');
    });

    // Final review M6: "—" alone does not say why. Na²⁺ would break the neon
    // core, so the app offers no Na²⁺ and Na⁺ has no ionisation to show.
    it('says why there is no ionisation energy when the next ion is not offered', () => {
        renderControls({
            species: { Z: 11, charge: 1, excitation: null },
            energies: { speciesKey: '11+1', status: 'done', ionisation: null, excitation: null, message: null },
        });
        expect(screen.getByText(/Ionisation energy/).closest('.species-energy')).toHaveTextContent('Ionisation energy: — (next ion not offered)');
    });

    // Final review M4 wanted the full method reachable by keyboard and touch, not a `title` alone. Task 6: it is
    // Info's "How this was computed" (atomInfo's computed, pinned in atom_info.test.ts) -- text, not a tooltip.
    it('carries no method tooltip of its own', () => {
        renderControls({ energies: { speciesKey: '11', status: 'done', ionisation: { valueEv: 5.37, fromLabel: 'Na', toLabel: 'Na⁺' }, excitation: null, message: null } });
        expect(screen.queryByText('ΔSCF, LDA')).toBeNull();
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    // Ruling FR-1: LDA puts some s → d excited configurations below the
    // ground one; a bare negative number would read as a bug or a typo.
    it('notes a negative excitation energy as LDA ordering the configurations wrongly', () => {
        renderControls({
            species: { Z: 28, charge: 0, excitation: { from: { n: 4, l: 0 }, to: { n: 3, l: 2 } } },
            energies: { speciesKey: '28:4s>3d', status: 'done', ionisation: null, excitation: { valueEv: -1.572, fromLabel: 'Ni', toLabel: 'Ni 4s → 3d' }, message: null },
        });
        expect(screen.getByText(/Excitation energy/).closest('.species-energy'))
            .toHaveTextContent('−1.57 eV (below the ground configuration in LDA — a known LDA error for s→d transfer)');
    });

    it('adds no note to a positive excitation energy', () => {
        renderControls({
            species: { Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 3, l: 1 } } },
            energies: { speciesKey: '11:3s>3p', status: 'done', ionisation: null, excitation: { valueEv: 2.19, fromLabel: 'Na', toLabel: 'Na 3s → 3p' }, message: null },
        });
        expect(screen.queryByText(/below the ground configuration/)).toBeNull();
    });

    it('keeps the s→d note off an ionisation energy, even a negative one', () => {
        renderControls({
            species: { Z: 35, charge: -1, excitation: null },
            energies: { speciesKey: '35-1', status: 'done', ionisation: { valueEv: -0.2, fromLabel: 'Br⁻', toLabel: 'Br' }, excitation: null, message: null },
        });
        expect(screen.queryByText(/below the ground configuration/)).toBeNull();
    });

    // Ruling FR-2: the energies wait for the picture (C15); a picture that
    // never lands must not leave them "waiting" for ever.
    it('says the energies were not computed when the picture\'s SCF did not converge', () => {
        renderControls({
            species: { Z: 19, charge: 0, excitation: { from: { n: 4, l: 0 }, to: { n: 4, l: 2 } } },
            pictureFailed: true,
        });
        const line = screen.getByText(/Excitation energy/).closest('.species-energy')!;
        expect(line).toHaveTextContent('not computed — the picture\'s solve failed');
        expect(line).not.toHaveTextContent('waiting');
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

    // Task 6: the NIST comparison and limitation note (ruling P15, D6), the dashed-ring comparison (M9, M11, spec
    // §3.1) and the ΔSCF method worded for the picture (C6) moved to Info -- tests/info/atom_info.test.ts and
    // tests/atom/species_controls_energies.test.tsx pin them there. The panel says none of them.
    it('leaves the NIST comparison, the limitation note and the dashed-ring comparison to Info', () => {
        renderControls({
            species: { Z: 26, charge: 0, excitation: null }, // Fe
            energies: { speciesKey: '26', status: 'done', ionisation: { valueEv: 8.042, fromLabel: 'Fe', toLabel: 'Fe⁺' }, excitation: null, message: null },
        });
        expect(screen.queryByText(/measured|NIST|open shells; expect larger errors/)).toBeNull();
        expect(screen.queryByLabelText('size compared with the neutral atom')).toBeNull();
    });

    it('states an unbound anion plainly, with the solver\'s own message', () => {
        const message = new UnboundAnionError(3, 1).message;
        renderControls({ species: { Z: 17, charge: -1, excitation: null }, unbound: message });
        expect(screen.getByRole('alert')).toHaveTextContent('LDA does not bind this anion');
        expect(screen.getByRole('alert')).toHaveTextContent(message);
    });
});
