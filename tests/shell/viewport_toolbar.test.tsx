import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ViewportToolbar from '../../src/shell/ViewportToolbar';
import TitleBlock from '../../src/shell/TitleBlock';
import { withSubscripts } from '../../src/format/subscripts';

describe('the viewport frame (spec §8.5)', () => {
    // Task 8 (addendum 1): the title is typeset -- App hands it the node built once from the view's title -- so the
    // heading reads "2pz" with a real subscript, never "2p_z".
    it('titles the view with the page heading', () => {
        render(<TitleBlock title={withSubscripts('Carbon — 2p_z orbital')} subtitle="|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic" />);
        const heading = screen.getByRole('heading', { level: 1, name: 'Carbon — 2pz orbital' });
        expect(heading.innerHTML).toContain('2p<sub>z</sub>');
        expect(heading.textContent).toBe('Carbon — 2pz orbital');
        expect(screen.getByText('|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic')).toHaveClass('viewport-subtitle');
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
