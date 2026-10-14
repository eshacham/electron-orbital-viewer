import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AxesSwitch, SurfaceStyleControl } from '../../src/atom_ui/DisplayControls';
import { displayPref, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('the Display tab (spec §9.1, ruling R1)', () => {
    it('offers Glow, Solid and Wireframe, with Glow the default', () => {
        render(<SurfaceStyleControl surfaceMode="solid" meshLevel onSurfaceMode={jest.fn()} />);
        const group = screen.getByRole('group', { name: 'surface style' });
        expect(group).toHaveTextContent('GlowSolidWireframe');
        expect(screen.getByRole('button', { name: 'glow surface' })).toHaveAttribute('aria-pressed', 'true');
    });

    // Ruling R22a (owner) replaces the Phase ψ toggle's label-in-name test (ruling DB5) and the
    // scheme chooser's: there is no colour-scheme control -- the surface is always phase-coloured.
    it('offers no colour-scheme choice, at a mesh level or a shell view', () => {
        const { rerender, container } = render(<SurfaceStyleControl surfaceMode="solid" meshLevel onSurfaceMode={jest.fn()} />);
        expect(screen.queryByRole('group', { name: 'colour scheme' })).toBeNull();
        expect(screen.queryByText('Colour scheme')).toBeNull();
        expect(screen.queryByRole('button', { name: /Phase ψ|density on the cut face|classic colours/ })).toBeNull();
        rerender(<SurfaceStyleControl surfaceMode="solid" meshLevel={false} onSurfaceMode={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('keeps Glow and Solid out of the link: both are the solid surface, the finish is local', () => {
        const onSurfaceMode = jest.fn();
        render(<SurfaceStyleControl surfaceMode="solid" meshLevel onSurfaceMode={onSurfaceMode} />);
        fireEvent.click(screen.getByRole('button', { name: 'solid surface' }));
        expect(renderPref.get().finish).toBe('solid');
        expect(onSurfaceMode).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'wireframe surface' }));
        expect(onSurfaceMode).toHaveBeenCalledWith('wireframe');
        expect(renderPref.get().finish).toBe('solid');
    });

    it('coming back from Wireframe to Glow restores the solid surface and the glow finish', () => {
        const onSurfaceMode = jest.fn();
        render(<SurfaceStyleControl surfaceMode="wireframe" meshLevel onSurfaceMode={onSurfaceMode} />);
        expect(screen.getByRole('button', { name: 'wireframe surface' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'glow surface' }));
        expect(onSurfaceMode).toHaveBeenCalledWith('solid');
        expect(renderPref.get().finish).toBe('glow');
    });

    it('shows or hides the axes', () => {
        render(<AxesSwitch />);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Show axes' }));
        expect(displayPref.get().showAxes).toBe(false);
    });
});
