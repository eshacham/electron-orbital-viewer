import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AppShell from '../../src/shell/AppShell';

const viewport = <main id="canvas-container" tabIndex={-1} aria-label="3D view">canvas</main>;

describe('AppShell (spec §7, §13 landmarks and skip links)', () => {
    it('lays the desktop grid out with skip links that move focus without touching the hash', () => {
        const { container } = render(<AppShell layout="desktop" topBar={<header>top</header>} rail={<nav aria-label="view mode" />}
            explore={<p>explore</p>} inspector={<aside aria-label="Inspector">inspector</aside>} viewport={viewport} />);
        expect(container.firstElementChild).toHaveClass('app-shell', 'desktop');
        expect(screen.getByRole('complementary', { name: 'Explore' })).toHaveClass('explore-panel', 'side-panel');
        expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
        const before = window.location.hash;
        fireEvent.click(screen.getByRole('link', { name: 'Skip to 3D view' }));
        expect(document.activeElement).toBe(screen.getByRole('main', { name: '3D view' }));
        expect(window.location.hash).toBe(before);
    });

    it('keeps the inspector out of the grid at medium width (it is a drawer in the viewport) and shows only the viewport on a phone', () => {
        const { container, rerender } = render(<AppShell layout="medium" explore={<p>explore</p>} inspector={<aside aria-label="Inspector" />} viewport={viewport} />);
        expect(container.firstElementChild).toHaveClass('medium');
        expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
        rerender(<AppShell layout="phone" explore={<p>explore</p>} viewport={viewport} />);
        expect(container.firstElementChild).toHaveClass('phone');
        expect(screen.queryByText('explore')).toBeNull();
    });
});
