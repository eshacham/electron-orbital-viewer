import React from 'react';
import { render, screen } from '@testing-library/react';
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
});
