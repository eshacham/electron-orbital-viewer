import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ViewportToolbar from '../../src/shell/ViewportToolbar';
import TitleBlock from '../../src/shell/TitleBlock';

describe('the viewport frame (spec §8.5)', () => {
    it('titles the view with the page heading', () => {
        render(<TitleBlock title="Carbon — 2p_z orbital" subtitle="|ψ|² isosurface · 90 % enclosed · LDA, non-relativistic" />);
        expect(screen.getByRole('heading', { level: 1, name: 'Carbon — 2p_z orbital' })).toBeInTheDocument();
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
