import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EspLegend from '../../src/components/EspLegend';

describe('EspLegend', () => {
    it('states the scale, units, the fixed surface and method, and when this molecule saturates it', () => {
        const { container } = render(<EspLegend range={[-0.061, 0.071]} method="B3LYP/def2-TZVP" />);
        expect(screen.getByText('−0.05')).toBeInTheDocument();
        expect(screen.getByText('+0.05 Ha/e')).toBeInTheDocument();
        expect(container.textContent).toMatch(/±31 kcal\/mol/);
        // Ruling D4: the surface is fixed, not an enclosed fraction -- the
        // legend says so rather than implying a search over the grid.
        expect(container.textContent).toMatch(/fixed at ρ = 0\.001 e\/a₀³ \(not an enclosed fraction\) · B3LYP\/def2-TZVP/);
        expect(container.textContent).toMatch(/this molecule: −0\.061 to \+0\.071 Ha\/e, saturated beyond the scale/);
        expect(container.querySelector('[data-gradient]')?.getAttribute('data-gradient')).toMatch(/^linear-gradient/);
    });

    it('does not claim saturation for a weakly polar molecule', () => {
        const { container } = render(<EspLegend range={[-0.02, 0.019]} method="B3LYP/def2-TZVP" />);
        expect(container.textContent).not.toMatch(/saturated/);
    });

    it('still states the scale and surface before a molecule has drawn one', () => {
        const { container } = render(<EspLegend range={null} method="B3LYP/def2-TZVP" />);
        expect(container.textContent).toMatch(/fixed at ρ = 0\.001 e\/a₀³ \(not an enclosed fraction\)/);
        expect(container.textContent).not.toMatch(/this molecule:/);
    });

    // Ruling T16-c: on a sideways phone the key is the bar and its scale;
    // the notes -- the method among them -- are one tap away, not gone.
    it('compact: shows the bar and scale, with the notes behind an info toggle', () => {
        const { container } = render(<EspLegend range={[-0.061, 0.071]} method="B3LYP/def2-TZVP" compact />);
        expect(container.querySelector('.esp-legend.compact')).not.toBeNull();
        expect(screen.getByText('+0.05 Ha/e')).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/B3LYP/);
        const toggle = screen.getByRole('button', { name: 'about this colour key' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(container.textContent).toMatch(/fixed at ρ = 0\.001 e\/a₀³ \(not an enclosed fraction\) · B3LYP\/def2-TZVP/);
        expect(container.textContent).toMatch(/this molecule: −0\.061 to \+0\.071 Ha\/e/);
    });

    it('is not compact, and has no toggle, by default', () => {
        render(<EspLegend range={null} method="B3LYP/def2-TZVP" />);
        expect(screen.queryByRole('button', { name: 'about this colour key' })).toBeNull();
    });
});
