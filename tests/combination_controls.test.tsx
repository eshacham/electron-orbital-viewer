import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CombinationControls from '../src/components/CombinationControls';
import { NO_COMBINATION, CombinationSelection, OVERLAY_COLORS } from '../src/combinations';

function renderWith(selection: CombinationSelection) {
    const onChange = jest.fn();
    render(<CombinationControls selection={selection} onChange={onChange} />);
    return onChange;
}

function choose(option: string | RegExp) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText(option));
}

const fieldAt = (level: 1 | 2, field: number, stark: 'lower' | 'upper' | 'both' = 'lower'): CombinationSelection =>
    ({ kind: 'field', level, field, stark });

describe('CombinationControls', () => {
    it('offers None, sp, sp², sp³ and Electric field', () => {
        renderWith(NO_COMBINATION);
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /combination/i }));
        expect(within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent))
            .toEqual(['None (single orbital)', 'sp', 'sp²', 'sp³', 'Electric field']);
    });

    it('starts a hybrid set with all of them shown', () => {
        const onChange = renderWith(NO_COMBINATION);
        choose('sp³');
        expect(onChange).toHaveBeenCalledWith({ kind: 'hybrid', hybrid: 'sp3', member: 'all' });
    });

    it('starts the field at 0.03 a.u. for n = 1', () => {
        const onChange = renderWith(NO_COMBINATION);
        choose('Electric field');
        expect(onChange).toHaveBeenCalledWith({ kind: 'field', level: 1, field: 0.03, stark: 'lower' });
    });

    it('lets one hybrid be picked, with swatches matching the overlay', () => {
        const onChange = renderWith({ kind: 'hybrid', hybrid: 'sp3', member: 'all' });
        expect(screen.getAllByRole('button', { name: /^hybrid \d$/ })).toHaveLength(4);
        const swatch = screen.getByRole('button', { name: 'hybrid 2' }).querySelector('.combination-swatch') as HTMLElement;
        expect(swatch.style.background).toBe(OVERLAY_COLORS[1].replace(/^#(..)(..)(..)$/, (_m, r, g, b) =>
            `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`));
        fireEvent.click(screen.getByRole('button', { name: 'hybrid 2' }));
        expect(onChange).toHaveBeenCalledWith({ kind: 'hybrid', hybrid: 'sp3', member: 1 });
    });

    it('captions hybrids as a basis choice', () => {
        renderWith({ kind: 'hybrid', hybrid: 'sp2', member: 'all' });
        expect(screen.getByText(/a basis choice for one atom — hybrids describe bonding directions, not a free atom's ground state/i)).toBeInTheDocument();
    });

    it('shows the field in a.u. and V/m, the dipole with its method, and the validity', () => {
        renderWith(fieldAt(1, 0.03));
        expect(screen.getByText(/F = 0\.030 a\.u\. \(1\.54 × 10¹⁰ V\/m\)/)).toBeInTheDocument();
        expect(screen.getByText(/μ = αF = 0\.135 e·a₀ \(0\.343 D\)/)).toBeInTheDocument();
        expect(screen.getByText(/first-order perturbation theory/i)).toBeInTheDocument();
        expect(screen.getByText(/F ≪ 1 a\.u\.; ionisation by tunnelling is ignored/)).toBeInTheDocument();
        expect(screen.getByText(/about 4 %/)).toBeInTheDocument();
    });

    it('slides from 0 to 0.05 a.u. and commits the value', () => {
        const onChange = renderWith(fieldAt(1, 0.03));
        const slider = screen.getByRole('slider', { name: /field f/i });
        expect(slider).toHaveAttribute('max', '0.05');
        fireEvent.change(slider, { target: { value: '0.04' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ field: expect.closeTo(0.04, 6) }));
    });

    it('labels the n = 2 shifts ±3F, and caps the field where n = 2 stays bound', () => {
        renderWith(fieldAt(2, 0.0039));
        expect(screen.getByText(/\(2s \+ 2p_z\)\/√2: ΔE = −3F = −0\.0117 Ha \(−0\.32 eV\)/)).toBeInTheDocument();
        expect(screen.getByText(/\(2s − 2p_z\)\/√2: ΔE = \+3F = \+0\.0117 Ha \(\+0\.32 eV\)/)).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: /field f/i })).toHaveAttribute('max', '0.0039');
    });

    it('brings the field down into range when switching to n = 2', () => {
        const onChange = renderWith(fieldAt(1, 0.03));
        fireEvent.click(screen.getByRole('button', { name: /first excited level/i }));
        expect(onChange).toHaveBeenCalledWith({ kind: 'field', level: 2, field: 0.0039, stark: 'lower' });
    });

    // Review Focus 3.
    it.each([[fieldAt(1, 0.08), /refused/], [fieldAt(2, 0.01), /not bound/]] as const)(
        'says why %j is not drawn', (selection, message) => {
            renderWith(selection);
            expect(screen.getByRole('alert')).toHaveTextContent(message);
        });

    // Fix round 1: an out-of-range hybrid member (reachable once Phase 2's
    // URL state feeds selections in) used to suppress the mesh silently --
    // the Alert only rendered inside the 'field' branch. It must show for
    // any selection kind.
    it('says why an out-of-range hybrid member is not drawn', () => {
        renderWith({ kind: 'hybrid', hybrid: 'sp', member: 5 });
        expect(screen.getByRole('alert')).toHaveTextContent(/there is no hybrid 6/);
    });
});
