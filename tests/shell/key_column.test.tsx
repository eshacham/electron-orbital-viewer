import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
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

// 6G-2 Task 17 round 2 (ruling T17-key, spec §3.3: every colour keyed on screen). On a phone the compact key is a
// row; Pa's seven shell rings and the cut-face caption ran past the screen's right edge (n=5 cut, n=6, n=7 and the
// caption hidden). The row now wraps inside the column's 220 px, and the caption takes a line of its own. jsdom does
// no layout, so these pin the rules; shoot.mjs's `keyColumn.hidden` [] is the live proof.
describe('the compact (phone) key wraps rather than running off screen (ruling T17-key)', () => {
    const strip = (file: string) => readFileSync(resolve(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (source: string, selector: string) => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
        if (!match) throw new Error(`No rule for ${selector}`);
        return match[2];
    };
    const viewport = strip('../../src/shell/viewport.css');

    it('wraps the compact row onto as many lines as its keys need', () => {
        const row = rule(viewport, '.key-column.compact .phase-legend');
        expect(row).toMatch(/flex-direction:\s*row;/);
        expect(row).toMatch(/flex-wrap:\s*wrap;/);
    });

    it('gives the cut-face caption a line of its own in the compact key, never squeezed beside the swatches', () => {
        expect(rule(viewport, '.key-column.compact .key-caption')).toMatch(/flex-basis:\s*100%;/);
    });

    it('keeps the phone key column inside the screen: right 12 px, at most 220 px, under the header (one rule for its top)', () => {
        expect(rule(viewport, '.key-column')).toMatch(/right:\s*12px;/);
        expect(rule(viewport, '.key-column')).toMatch(/max-width:\s*220px;/);
        const style = strip('../../src/style.css');
        // DB6/DX7: style.css holds the single phone top rule, keyed on --phone-overlay-top; nothing else re-sets it.
        // Task 2 fix round 1 (M2): the same one rule, plus the visit notice's room while it shows (PhoneNoticeSlot).
        expect(style.match(/\.key-column\.compact\s*\{[^}]*top:\s*calc\(var\(--phone-overlay-top\) \+ var\(--phone-notice-offset, 0px\) \+ 2px\)/g)).toHaveLength(1);
        expect(viewport).not.toMatch(/\.key-column\.compact\s*\{[^}]*top:/);
    });

    it('renders every one of seven rings and the caption as its own item (Pa, Z = 91)', () => {
        const rings = [1, 2, 3, 4, 5, 6, 7].map(n => ({ label: n >= 5 ? `n=${n} valence` : `n=${n}`, colour: '#4da3ff' }));
        const { container } = render(<KeyColumn compact><ShellRingKey items={rings} /></KeyColumn>);
        expect(container.querySelectorAll('.phase-legend-item')).toHaveLength(7);
        expect(container.querySelector('.key-caption')).toHaveTextContent('cut face shading is scaled to local shell structure');
    });
});
