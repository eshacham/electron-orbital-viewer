import React from 'react';
import { render, screen } from '@testing-library/react';
import KeyColumn, { AtomKeys, PhaseKey, ShellRingKey } from '../../src/shell/KeyColumn';
import { phaseColours } from '../../src/design/science';

describe('KeyColumn (spec §8.5, §11.5)', () => {
    it('groups the colour keys, each with text', () => {
        render(<KeyColumn><PhaseKey positive="#FF7A2F" negative="#2F6BFF" /></KeyColumn>);
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

describe('the Atom screen\'s keys (spec §11.5)', () => {
    const phase = phaseColours('dark');
    const shellItems = [{ label: 'n=1', colour: '#4da3ff' }, { label: 'n=2 valence', colour: '#ff6b6b' }];

    // Ruling R22a (owner) replaces the Density scheme's High/Low bar and "Pick a cut axis" note (Review
    // Focus 3): at orbital level the ψ key alone, in the theme's phase colours, cut or not.
    it('keys an orbital with the ψ key alone, in the phase colours', () => {
        const { container } = render(<KeyColumn><AtomKeys level="orbital" phase={phase} shellItems={shellItems} /></KeyColumn>);
        expect(screen.getByLabelText('surface colour key')).toHaveTextContent('ψ > 0ψ < 0');
        const swatches = container.querySelectorAll<HTMLElement>('.phase-legend-swatch');
        expect(swatches).toHaveLength(2);
        expect(swatches[0].style.background).toBe('rgb(255, 122, 47)');
        expect(screen.queryByLabelText('cut-face density key')).toBeNull();
        expect(screen.queryByText(/Pick a cut axis/)).toBeNull();
        expect(screen.queryByLabelText('shell colour key')).toBeNull();
    });

    it('keys a shell view by its rings, with the cut-face caption', () => {
        render(<KeyColumn><AtomKeys level="atom" phase={phase} shellItems={shellItems} /></KeyColumn>);
        expect(screen.queryByLabelText('surface colour key')).toBeNull();
        const key = screen.getByLabelText('shell colour key');
        expect(key).toHaveTextContent('n=2 valence');
        expect(key).toHaveTextContent('cut face shading is scaled to local shell structure');
    });

    // Ruling T16-tilekey (§3.3): at shell level the strip shows ψ-coloured orbital
    // tiles, so a phase key headed "Orbital tiles" sits beside the ring key.
    it('keys the strip\'s orbital tiles beside the shell rings when the strip shows them', () => {
        const { rerender } = render(<KeyColumn><AtomKeys level="shell" phase={phase} shellItems={shellItems} orbitalTiles /></KeyColumn>);
        expect(screen.getByLabelText('shell colour key')).toBeInTheDocument();
        const tiles = screen.getByLabelText('orbital tile colour key');
        expect(tiles).toHaveTextContent('Orbital tilesψ > 0ψ < 0');
        const swatches = tiles.querySelectorAll<HTMLElement>('.phase-legend-swatch');
        expect(swatches[0].style.background).toBe('rgb(255, 122, 47)');
        expect(swatches[1].style.background).toBe('rgb(47, 107, 255)');
        // Never mistaken for a key to the surface: the shell view has none.
        expect(screen.queryByLabelText('surface colour key')).toBeNull();
        rerender(<KeyColumn><AtomKeys level="shell" phase={phase} shellItems={shellItems} /></KeyColumn>);
        expect(screen.queryByLabelText('orbital tile colour key')).toBeNull();
    });

    it('labels every ring colour', () => {
        render(<ShellRingKey items={shellItems} />);
        expect(screen.getByLabelText('shell colour key')).toHaveTextContent('n=1');
    });
});
