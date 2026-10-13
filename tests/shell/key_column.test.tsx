import React from 'react';
import { render, screen } from '@testing-library/react';
import KeyColumn, { AtomKeys, DensityRampKey, PhaseKey, ShellRingKey } from '../../src/shell/KeyColumn';
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
    const phase = phaseColours('dark', 'phase');
    const shellItems = [{ label: 'n=1', colour: '#4da3ff' }, { label: 'n=2 valence', colour: '#ff6b6b' }];

    it('density scheme without a cut says how to see it and shows no colour bar (Review Focus 3)', () => {
        render(<KeyColumn><AtomKeys level="orbital" scheme="density" cutOn={false} phase={phase} shellItems={shellItems} /></KeyColumn>);
        expect(screen.getByText('Pick a cut axis to see the density inside')).toBeInTheDocument();
        expect(screen.queryByLabelText('cut-face density key')).toBeNull();
        expect(screen.getByLabelText('surface colour key')).toBeInTheDocument();
    });

    it('with a cut, puts the High/Low bar beside the ψ key, with its exact caption', () => {
        render(<KeyColumn><AtomKeys level="orbital" scheme="density" cutOn phase={phase} shellItems={shellItems} /></KeyColumn>);
        const bar = screen.getByLabelText('cut-face density key');
        expect(bar).toHaveTextContent('High');
        expect(bar).toHaveTextContent('Low');
        expect(bar).toHaveTextContent('|ψ|² on the cut face: from the surface value (Low) to the peak (High), log scale');
        expect(screen.getByLabelText('surface colour key')).toBeInTheDocument();
    });

    it('never shows the bar beside a shell view, whatever the scheme', () => {
        render(<KeyColumn><AtomKeys level="atom" scheme="density" cutOn phase={phase} shellItems={shellItems} /></KeyColumn>);
        expect(screen.queryByLabelText('cut-face density key')).toBeNull();
        const key = screen.getByLabelText('shell colour key');
        expect(key).toHaveTextContent('n=2 valence');
        expect(key).toHaveTextContent('cut face shading is scaled to local shell structure');
    });

    it('draws the ramp from the six science stops', () => {
        const { container } = render(<DensityRampKey />);
        expect((container.querySelector('.density-ramp-bar') as HTMLElement).style.background).toMatch(/linear-gradient/);
    });

    it('labels every ring colour', () => {
        render(<ShellRingKey items={shellItems} />);
        expect(screen.getByLabelText('shell colour key')).toHaveTextContent('n=1');
    });
});
