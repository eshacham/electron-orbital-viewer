import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ViewportToolbar from '../../src/shell/ViewportToolbar';
import TitleBlock from '../../src/shell/TitleBlock';
import { spokenTextOf, withSubscripts } from '../../src/format/subscripts';
import { seenText } from '../seen_text';

describe('the viewport frame (spec §8.5)', () => {
    // Task 8 (addendum 1): the title is typeset -- App hands it the node built once from the view's title -- so the
    // heading reads "2pz" with a real subscript, never "2p_z".
    it('titles the view with the page heading', () => {
        render(<TitleBlock title={withSubscripts('Carbon — 2p_z orbital')} subtitle="|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic" />);
        const heading = screen.getByRole('heading', { level: 1, name: 'Carbon — 2pz orbital' });
        expect(heading.innerHTML).toContain('2p<sub>z</sub>');
        // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
        expect(seenText(heading)).toBe('Carbon — 2pz orbital');
        expect(screen.getByText('|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic')).toHaveClass('viewport-subtitle');
    });

    // Owner, 2026-11-02, after the Hallmark audit: the title names the specimen and a second serif line under it, inside
    // the h1, names the view; a visually hidden ", " gives the heading its pause when read.
    it('sets the view as a second line inside the h1, read after a comma', () => {
        render(<TitleBlock title="Magnesium, excited 3s → 3p" view={withSubscripts('3d_z² orbital')} subtitle="electron density" />);
        const heading = screen.getByRole('heading', { level: 1 });
        // Heard as Info reads a title (spokenTextOf; jsdom's accessible name pads every element with spaces).
        expect(spokenTextOf(heading)).toBe('Magnesium, excited 3s → 3p, 3dz² orbital');
        const view = heading.querySelector('.viewport-title-view')!;
        expect(view).not.toBeNull();
        expect(seenText(view)).toBe('3dz² orbital');
        expect(view.innerHTML).toContain('3d<sub>z²</sub>');
        const pause = heading.querySelector('.visually-hidden.title-pause')!;
        expect(pause.textContent).toBe(', ');
        expect(pause.nextElementSibling).toBe(view);
        expect(screen.getByText('electron density')).toHaveClass('viewport-subtitle');
    });

    it('has no view line, and no pause, when the view has none', () => {
        render(<TitleBlock title="Water (H₂O)" subtitle="electron density" />);
        const heading = screen.getByRole('heading', { level: 1, name: 'Water (H₂O)' });
        expect(heading.querySelector('.viewport-title-view, .title-pause')).toBeNull();
    });

    it('offers Reset view, the share/export slot and Full screen as a toolbar', () => {
        const onResetView = jest.fn();
        const onToggleFullscreen = jest.fn();
        const { rerender } = render(<ViewportToolbar onResetView={onResetView} shareExport={<button>Share</button>} fullscreen={false} onToggleFullscreen={onToggleFullscreen} />);
        expect(screen.getByRole('toolbar', { name: 'View tools' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
        expect(onResetView).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
        expect(onToggleFullscreen).toHaveBeenCalled();
        rerender(<ViewportToolbar onResetView={onResetView} shareExport={null} fullscreen onToggleFullscreen={onToggleFullscreen} />);
        expect(screen.getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true');
    });
});
