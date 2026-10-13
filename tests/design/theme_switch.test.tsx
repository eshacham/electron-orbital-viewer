import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeSwitch from '../../src/design/ThemeSwitch';

afterEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('ThemeSwitch (spec §6.4)', () => {
    it('names the theme shown and offers Deep Space, Light Clean and Match system', () => {
        render(<ThemeSwitch />);
        fireEvent.click(screen.getByRole('button', { name: 'Theme: Deep Space' }));
        expect(screen.getAllByRole('menuitemradio').map(item => item.textContent)).toEqual(['Deep Space', 'Light Clean', 'Match system']);
        expect(screen.getByRole('menuitemradio', { name: 'Match system' })).toHaveAttribute('aria-checked', 'true');
    });

    it('switches, stores and announces the choice', () => {
        render(<ThemeSwitch />);
        fireEvent.click(screen.getByRole('button', { name: 'Theme: Deep Space' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light Clean' }));
        expect(window.localStorage.getItem('eov.theme')).toBe('light');
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(screen.getByRole('button', { name: 'Theme: Light Clean' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Theme: Light Clean' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'Match system' }));
        expect(window.localStorage.getItem('eov.theme')).toBeNull();
    });
});
