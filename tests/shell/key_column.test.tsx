import React from 'react';
import { render, screen } from '@testing-library/react';
import KeyColumn, { PhaseKey } from '../../src/shell/KeyColumn';

describe('KeyColumn (spec §8.5, §11.5)', () => {
    it('groups the colour keys, each with text', () => {
        render(<KeyColumn><PhaseKey /></KeyColumn>);
        const group = screen.getByRole('group', { name: 'colour keys' });
        expect(group).toHaveClass('key-column');
        expect(screen.getByLabelText('surface colour key')).toHaveTextContent('ψ > 0ψ < 0');
    });

    it('paints the swatches in the colours it is given', () => {
        const { container } = render(<KeyColumn><PhaseKey positive="#FF7A2F" negative="#2F6BFF" /></KeyColumn>);
        const swatches = container.querySelectorAll<HTMLElement>('.phase-legend-swatch');
        expect(swatches[0].style.background).toBe('rgb(255, 122, 47)');
        expect(swatches[1].style.background).toBe('rgb(47, 107, 255)');
    });
});
