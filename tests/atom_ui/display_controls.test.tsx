import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AxesSwitch, SurfaceStyleControl } from '../../src/atom_ui/DisplayControls';
import { displayPref, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('the Display tab (spec §9.1, ruling R1)', () => {
    // Owner R25-B1: the Wireframe option is gone; Glow and Solid are both the solid surface, the finish the viewer's own.
    it('offers Glow and Solid only, with Glow the default -- no Wireframe (owner R25-B1)', () => {
        render(<SurfaceStyleControl meshLevel />);
        const group = screen.getByRole('group', { name: 'surface style' });
        expect(group).toHaveTextContent(/^GlowSolid$/);
        expect(within(group).getAllByRole('button')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: /wireframe/i })).toBeNull();
        expect(screen.getByRole('button', { name: 'glow surface' })).toHaveAttribute('aria-pressed', 'true');
    });

    // Ruling R22a (owner) replaces the Phase ψ toggle's label-in-name test (ruling DB5) and the
    // scheme chooser's: there is no colour-scheme control -- the surface is always phase-coloured.
    it('offers no colour-scheme choice, at a mesh level or a shell view', () => {
        const { rerender, container } = render(<SurfaceStyleControl meshLevel />);
        expect(screen.queryByRole('group', { name: 'colour scheme' })).toBeNull();
        expect(screen.queryByText('Colour scheme')).toBeNull();
        expect(screen.queryByRole('button', { name: /Phase ψ|density on the cut face|classic colours/ })).toBeNull();
        rerender(<SurfaceStyleControl meshLevel={false} />);
        expect(container).toBeEmptyDOMElement();
    });

    // Owner R25-B1: with Wireframe gone the control only sets the local finish (eov.render) -- nothing for a link.
    it('keeps Glow and Solid out of the link: the finish is local', () => {
        render(<SurfaceStyleControl meshLevel />);
        fireEvent.click(screen.getByRole('button', { name: 'solid surface' }));
        expect(renderPref.get().finish).toBe('solid');
        expect(screen.getByRole('button', { name: 'solid surface' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'glow surface' }));
        expect(renderPref.get().finish).toBe('glow');
    });

    it('shows or hides the axes', () => {
        render(<AxesSwitch />);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Show axes' }));
        expect(displayPref.get().showAxes).toBe(false);
    });
});
