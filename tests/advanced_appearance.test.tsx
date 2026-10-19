import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import AdvancedAppearance from '../src/components/AdvancedAppearance';
import { renderPref, DEFAULT_RENDER } from '../src/design/presentation';
import { themeChoicePref } from '../src/design/theme_storage';
import { GLOW_KEY, glowPref } from '../src/design/glow_pref';
import { GLOW_CAPS, GLOW_TUNING } from '../src/orbital_glow';

const DARK_LABELS = ['Edge glow', 'Edge width (higher = thinner)', 'Brightness', 'Halo', 'Mesh lines', 'Mesh line whiteness', 'Edge whiteness (density)'];

function open() {
    fireEvent.click(screen.getByRole('button', { name: 'Advanced appearance' }));
}

beforeEach(() => { act(() => { themeChoicePref.set('dark'); renderPref.set(DEFAULT_RENDER); }); });
afterEach(() => { act(() => { themeChoicePref.set('system'); }); window.localStorage.clear(); });

// Task 16b ("Advanced appearance", owner R24-adv): Glow's tuning as a folded block in the Display section.
describe('AdvancedAppearance (Task 16b)', () => {
    it('is there only under Glow while something drawn glows: not for the Solid finish, nor a wireframe or the whole atom', () => {
        const { rerender } = render(<AdvancedAppearance drawsGlow lowPower={false} />);
        expect(screen.getByRole('button', { name: 'Advanced appearance' })).toBeInTheDocument();
        rerender(<AdvancedAppearance drawsGlow={false} lowPower={false} />);
        expect(screen.queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
        rerender(<AdvancedAppearance drawsGlow lowPower={false} />);
        act(() => { renderPref.set({ finish: 'solid' }); });
        expect(screen.queryByRole('button', { name: 'Advanced appearance' })).toBeNull();
    });

    it('is folded by default, and opens to real sliders named by their visible labels, each saying its value', () => {
        render(<AdvancedAppearance drawsGlow lowPower={false} />);
        const toggle = screen.getByRole('button', { name: 'Advanced appearance' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryAllByRole('slider')).toHaveLength(0);
        open();
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(toggle).toHaveAttribute('aria-controls', document.querySelector('.advanced-appearance-body')!.id);
        const sliders = screen.getAllByRole('slider');
        expect(sliders.map(slider => slider.getAttribute('aria-labelledby')).map(id => document.getElementById(id!)!.textContent)).toEqual(DARK_LABELS);
        const edge = screen.getByRole('slider', { name: 'Edge glow' });
        expect(edge).toHaveAttribute('aria-valuetext', '0.75');
        expect(edge).toHaveAttribute('aria-valuemin', '0');
        expect(edge).toHaveAttribute('aria-valuemax', String(GLOW_CAPS.rimStrength.max));
        expect(screen.getByRole('slider', { name: 'Edge width (higher = thinner)' })).toHaveAttribute('aria-valuetext', '3.0');
        expect(screen.getByRole('slider', { name: 'Mesh lines' })).toHaveAttribute('aria-valuetext', '0.020');
        // The value is on screen beside its label, too.
        expect(edge.closest('.advanced-appearance-row')!.querySelector('.advanced-appearance-value')).toHaveTextContent('0.75');
        open();
        expect(screen.queryAllByRole('slider')).toHaveLength(0);
    });

    it('offers only what the theme and the device draw: no halo or edge whiteness in Light Clean, no halo or lines on a phone', () => {
        const { rerender } = render(<AdvancedAppearance drawsGlow lowPower />);
        open();
        expect(screen.getAllByRole('slider').map(slider => slider.getAttribute('aria-labelledby')).map(id => document.getElementById(id!)!.textContent))
            .toEqual(['Edge glow', 'Edge width (higher = thinner)', 'Brightness', 'Edge whiteness (density)']);
        act(() => { themeChoicePref.set('light'); });
        rerender(<AdvancedAppearance drawsGlow lowPower={false} />);
        expect(screen.getAllByRole('slider').map(slider => slider.getAttribute('aria-labelledby')).map(id => document.getElementById(id!)!.textContent))
            .toEqual(['Edge glow', 'Edge width (higher = thinner)', 'Brightness', 'Mesh lines', 'Mesh line whiteness']);
        expect(screen.getByRole('slider', { name: 'Edge glow' })).toHaveAttribute('aria-valuetext', GLOW_TUNING.light.rimStrength.toFixed(2));
    });

    it('stores a moved slider for this theme only, and Reset to default brings back the owner\'s values', () => {
        render(<AdvancedAppearance drawsGlow lowPower={false} />);
        open();
        const reset = screen.getByRole('button', { name: 'Reset to default' });
        expect(reset).toBeDisabled();
        const halo = screen.getByRole('slider', { name: 'Halo' });
        fireEvent.keyDown(halo, { key: 'ArrowRight' });
        fireEvent.keyDown(halo, { key: 'ArrowRight' });
        expect(JSON.parse(window.localStorage.getItem(GLOW_KEY)!)).toEqual({ dark: { haloOpacity: 0.12 } });
        expect(halo).toHaveAttribute('aria-valuetext', '0.12');
        // Past the cap it holds.
        fireEvent.keyDown(screen.getByRole('slider', { name: 'Edge glow' }), { key: 'End' });
        expect(glowPref.get().dark).toEqual({ haloOpacity: 0.12, rimStrength: GLOW_CAPS.rimStrength.max });
        act(() => { glowPref.set({ ...glowPref.get(), light: { emissive: 0.3 } }); });
        expect(reset).toBeEnabled();
        fireEvent.click(reset);
        expect(glowPref.get()).toEqual({ dark: {}, light: { emissive: 0.3 } });
        expect(within(halo.closest('.advanced-appearance-row') as HTMLElement).getByText('0.10')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();
    });
});
