import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import AdvancedAppearance from '../src/components/AdvancedAppearance';
import { renderPref, DEFAULT_RENDER } from '../src/design/presentation';
import { themeChoicePref } from '../src/design/theme_storage';
import { GLOW_KEY, glowPref } from '../src/design/glow_pref';
import { GLOW_CAPS, GLOW_TUNING } from '../src/orbital_glow';

// Task 16d item 11: "Edge glow" is "Edge strength" (it drives Light Clean's ink rim too) and "Edge width (higher =
// thinner)" is "Edge sharpness"; item 13: "Edge whiteness" names what it acts on, density and lobes.
const DARK_LABELS = ['Edge strength', 'Edge sharpness', 'Brightness', 'Halo', 'Mesh lines', 'Mesh line whiteness', 'Edge whiteness (density and lobes)'];

function open() {
    fireEvent.click(screen.getByRole('button', { name: 'Advanced appearance' }));
}

beforeEach(() => { act(() => { themeChoicePref.set('dark'); renderPref.set(DEFAULT_RENDER); }); });
afterEach(() => { act(() => { themeChoicePref.set('system'); }); window.localStorage.clear(); });

// Task 16b ("Advanced appearance", owner R24-adv): Glow's tuning as a folded block in the Display section.
describe('AdvancedAppearance (Task 16b)', () => {
    // Owner R25-B1: "nor a wireframe" left this name with the Wireframe option.
    it('is there only under Glow while something drawn glows: not for the Solid finish, nor the whole atom', () => {
        const { rerender } = render(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} />);
        expect(screen.getByRole('button', { name: 'Advanced appearance' })).toBeInTheDocument();
        rerender(<AdvancedAppearance drawsGlow={false} phaselessDrawn lowPower={false} />);
        expect(screen.queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
        rerender(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} />);
        act(() => { renderPref.set({ finish: 'solid' }); });
        expect(screen.queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
    });

    it('is folded by default, and opens to real sliders named by their visible labels, each saying its value', () => {
        render(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} />);
        const toggle = screen.getByRole('button', { name: 'Advanced appearance' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryAllByRole('slider')).toHaveLength(0);
        open();
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(toggle).toHaveAttribute('aria-controls', document.querySelector('.advanced-appearance-body')!.id);
        const sliders = screen.getAllByRole('slider');
        expect(sliders.map(slider => slider.getAttribute('aria-labelledby')).map(id => document.getElementById(id!)!.textContent)).toEqual(DARK_LABELS);
        const edge = screen.getByRole('slider', { name: 'Edge strength' });
        expect(edge).toHaveAttribute('aria-valuetext', '0.75');
        expect(edge).toHaveAttribute('aria-valuemin', '0');
        expect(edge).toHaveAttribute('aria-valuemax', String(GLOW_CAPS.rimStrength.max));
        expect(screen.getByRole('slider', { name: 'Edge sharpness' })).toHaveAttribute('aria-valuetext', '3.0');
        expect(screen.getByRole('slider', { name: 'Mesh lines' })).toHaveAttribute('aria-valuetext', '0.020');
        // The value is on screen beside its label, too.
        expect(edge.closest('.advanced-appearance-row')!.querySelector('.advanced-appearance-value')).toHaveTextContent('0.75');
        open();
        expect(screen.queryAllByRole('slider')).toHaveLength(0);
    });

    it('offers only what the theme and the device draw: no halo or edge whiteness in Light Clean, no halo or lines on a phone', () => {
        const { rerender } = render(<AdvancedAppearance drawsGlow phaselessDrawn lowPower />);
        open();
        expect(screen.getAllByRole('slider').map(slider => slider.getAttribute('aria-labelledby')).map(id => document.getElementById(id!)!.textContent))
            .toEqual(['Edge strength', 'Edge sharpness', 'Brightness', 'Edge whiteness (density and lobes)']);
        act(() => { themeChoicePref.set('light'); });
        rerender(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} />);
        expect(screen.getAllByRole('slider').map(slider => slider.getAttribute('aria-labelledby')).map(id => document.getElementById(id!)!.textContent))
            .toEqual(['Edge strength', 'Edge sharpness', 'Brightness', 'Mesh lines', 'Mesh line whiteness']);
        expect(screen.getByRole('slider', { name: 'Edge strength' })).toHaveAttribute('aria-valuetext', GLOW_TUNING.light.rimStrength.toFixed(2));
    });

    it('stores a moved slider for this theme only, and Reset to default brings back the owner\'s values', () => {
        render(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} />);
        open();
        const reset = screen.getByRole('button', { name: 'Reset to default' });
        expect(reset).toBeDisabled();
        const halo = screen.getByRole('slider', { name: 'Halo' });
        fireEvent.keyDown(halo, { key: 'ArrowRight' });
        fireEvent.keyDown(halo, { key: 'ArrowRight' });
        expect(JSON.parse(window.localStorage.getItem(GLOW_KEY)!)).toEqual({ dark: { haloOpacity: 0.12 } });
        expect(halo).toHaveAttribute('aria-valuetext', '0.12');
        // Past the cap it holds.
        fireEvent.keyDown(screen.getByRole('slider', { name: 'Edge strength' }), { key: 'End' });
        expect(glowPref.get().dark).toEqual({ haloOpacity: 0.12, rimStrength: GLOW_CAPS.rimStrength.max });
        act(() => { glowPref.set({ ...glowPref.get(), light: { emissive: 0.3 } }); });
        expect(reset).toBeEnabled();
        fireEvent.click(reset);
        expect(glowPref.get()).toEqual({ dark: {}, light: { emissive: 0.3 } });
        expect(within(halo.closest('.advanced-appearance-row') as HTMLElement).getByText('0.10')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();
    });

    // Task 16d item 13: the edge whiteness acts only where vQlPhase is 0 -- a density, composition lobes, a
    // combination overlay -- so it is offered only while one is drawn (an orbital's rim is its phase's).
    it('offers the edge whiteness only while a phase-less surface is drawn', () => {
        const { rerender } = render(<AdvancedAppearance drawsGlow phaselessDrawn={false} lowPower={false} />);
        open();
        const labels = () => screen.getAllByRole('slider').map(slider => document.getElementById(slider.getAttribute('aria-labelledby')!)!.textContent);
        expect(labels()).toEqual(DARK_LABELS.slice(0, -1));
        rerender(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} />);
        expect(labels()).toEqual(DARK_LABELS);
    });

    // Task 16d item 10 (16b review concern 1): once the frame-time guard has taken the halo and mesh lines off
    // (ruling R10, until the appearance next changes), their three rows show disabled and say why.
    it('shows the halo and mesh rows disabled, saying why, while the frame-time guard has them off', () => {
        const { rerender } = render(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} extrasSuppressed />);
        open();
        const note = screen.getByText('Off to keep this device smooth');
        for (const name of ['Halo', 'Mesh lines', 'Mesh line whiteness']) {
            const slider = screen.getByRole('slider', { name });
            expect(slider).toBeDisabled();
            expect(slider).toHaveAccessibleDescription('Off to keep this device smooth');
        }
        for (const name of ['Edge strength', 'Edge sharpness', 'Brightness', 'Edge whiteness (density and lobes)']) {
            expect(screen.getByRole('slider', { name })).toBeEnabled();
        }
        expect(note).toBeVisible();
        rerender(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} extrasSuppressed={false} />);
        expect(screen.queryByText('Off to keep this device smooth')).toBeNull();
        expect(screen.getByRole('slider', { name: 'Halo' })).toBeEnabled();
    });
});

// Owner R25-B2: Advanced appearance stays in Display's body but must read as a sub-section of it, not as a section
// of its own -- the owner took its header (13/600 text-1, a full-width chevron at the right, like Display's) for a
// panel beside Display. A lighter subheading row, a smaller chevron beside the words, the content on a left rule,
// and a thin divider above it inside Display.
describe('Advanced appearance as a sub-section of Display (owner R25-B2)', () => {
    // Comments out, so every rule follows the closing brace of the one before it.
    const css = readFileSync(resolve(__dirname, '../src/components/advanced_appearance.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    /** The declarations of the one rule whose selector is exactly `selector`. */
    const rule = (selector: string): string => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const found = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
        if (!found) throw new Error(`no rule for ${selector}`);
        return found[1];
    };

    it('heads it with a lighter caption-sized subheading, not a section header', () => {
        const toggle = rule('.advanced-appearance-toggle');
        expect(toggle).toMatch(/font:\s*500 var\(--ql-type-caption-size\)/);
        expect(toggle).toMatch(/color:\s*var\(--ql-color-text-2\)/);
        // The chevron sits beside the words, not pushed to the far right as a section header's is.
        expect(toggle).not.toMatch(/space-between/);
        expect(toggle).not.toMatch(/width:\s*100%/);
        render(<AdvancedAppearance drawsGlow phaselessDrawn lowPower={false} />);
        const button = screen.getByRole('button', { name: 'Advanced appearance' });
        expect(button.closest('h1, h2, h3, h4, h5, h6')).toBeNull();
        expect(button).not.toHaveClass('inspector-section-toggle');
    });

    it('draws its disclosure chevron smaller than a section header\'s', () => {
        expect(rule('.advanced-appearance-toggle .advanced-appearance-chevron')).toMatch(/font-size:\s*16px/);
    });

    it('sets its content on a left rule, under a thin divider inside Display', () => {
        const body = rule('.advanced-appearance-body');
        expect(body).toMatch(/border-left:\s*2px solid var\(--ql-color-border-subtle\)/);
        expect(body).toMatch(/padding:\s*\S+ \S+ \S+ 10px/);
        expect(rule('.advanced-appearance')).toMatch(/border-top:\s*1px solid var\(--ql-color-border-subtle\)/);
    });
});
