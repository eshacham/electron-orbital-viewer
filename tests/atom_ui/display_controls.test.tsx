import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AxesSwitch, SurfaceAndScheme } from '../../src/atom_ui/DisplayControls';
import { displayPref, renderPref } from '../../src/design/presentation';

afterEach(() => window.localStorage.clear());

describe('the Display tab (spec §9.1, ruling R1)', () => {
    it('offers Glow, Solid and Wireframe, with Glow the default', () => {
        render(<SurfaceAndScheme surfaceMode="solid" meshLevel onSurfaceMode={jest.fn()} />);
        const group = screen.getByRole('group', { name: 'surface style' });
        expect(group).toHaveTextContent('GlowSolidWireframe');
        expect(screen.getByRole('button', { name: 'glow surface' })).toHaveAttribute('aria-pressed', 'true');
    });

    // Ruling DB5 (WCAG 2.5.3 label-in-name): the toggle's visible text is
    // "Phase ψ", so its accessible name must contain that text -- "phase
    // colours" alone does not. It is also the default scheme.
    it('names the Phase ψ toggle so its accessible name contains its visible label', () => {
        render(<SurfaceAndScheme surfaceMode="solid" meshLevel={false} onSurfaceMode={jest.fn()} />);
        expect(screen.getByRole('button', { name: 'Phase ψ colours' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps Glow and Solid out of the link: both are the solid surface, the finish is local', () => {
        const onSurfaceMode = jest.fn();
        render(<SurfaceAndScheme surfaceMode="solid" meshLevel onSurfaceMode={onSurfaceMode} />);
        fireEvent.click(screen.getByRole('button', { name: 'solid surface' }));
        expect(renderPref.get().finish).toBe('solid');
        expect(onSurfaceMode).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'wireframe surface' }));
        expect(onSurfaceMode).toHaveBeenCalledWith('wireframe');
        expect(renderPref.get().finish).toBe('solid');
    });

    it('coming back from Wireframe to Glow restores the solid surface and the glow finish', () => {
        const onSurfaceMode = jest.fn();
        render(<SurfaceAndScheme surfaceMode="wireframe" meshLevel onSurfaceMode={onSurfaceMode} />);
        expect(screen.getByRole('button', { name: 'wireframe surface' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'glow surface' }));
        expect(onSurfaceMode).toHaveBeenCalledWith('solid');
        expect(renderPref.get().finish).toBe('glow');
    });

    it('chooses the colour scheme and says what each one shows', () => {
        render(<SurfaceAndScheme surfaceMode="solid" meshLevel={false} onSurfaceMode={jest.fn()} />);
        expect(screen.queryByRole('group', { name: 'surface style' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'density on the cut face' }));
        expect(renderPref.get().scheme).toBe('density');
        expect(screen.getByText(/\|ψ\|² on the cut face/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'classic colours' }));
        expect(renderPref.get().scheme).toBe('classic');
    });

    it('shows or hides the axes', () => {
        render(<AxesSwitch />);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Show axes' }));
        expect(displayPref.get().showAxes).toBe(false);
    });
});
