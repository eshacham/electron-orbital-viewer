import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Rail from '../../src/shell/Rail';

describe('Rail (spec §8.2)', () => {
    it('is the view-mode navigation, with the names the tests and the old toggle used', () => {
        render(<Rail mode="atom" onModeChange={jest.fn()} isOwner={false} />);
        const nav = screen.getByRole('navigation', { name: 'view mode' });
        const names = within(nav).getAllByRole('button').map(b => b.getAttribute('aria-label'));
        // Controller ruling WCAG-2.5.3-detail: names are now "<Visible label>
        // (<old name>)" (e.g. "Atoms (atom mode)") so the visible label is in
        // the accessible name; switched from an exact toEqual to unanchored
        // regexes on the old name, which the pattern still contains.
        expect(names).toEqual([
            expect.stringMatching(/atom mode/),
            expect.stringMatching(/basic orbitals mode/),
            expect.stringMatching(/bonds mode/),
            expect.stringMatching(/molecule mode/),
        ]);
        // Same ruling: exact-string name queries become unanchored regexes.
        expect(within(nav).getByRole('button', { name: /atom mode/ })).toHaveAttribute('aria-pressed', 'true');
        expect(within(nav).getByRole('button', { name: /bonds mode/ })).toHaveAttribute('aria-pressed', 'false');
        expect(nav).toHaveTextContent('AtomsBasic OrbitalsBondsMolecules');
    });

    it('dispatches the mode the way the toggle did', () => {
        const onModeChange = jest.fn();
        render(<Rail mode="atom" onModeChange={onModeChange} isOwner={false} />);
        // Controller ruling WCAG-2.5.3-detail: exact name is now "Molecules (molecule mode)".
        fireEvent.click(screen.getByRole('button', { name: /molecule mode/ }));
        expect(onModeChange).toHaveBeenCalledWith('molecule');
    });

    it('links the dashboard for the owner only, and never shows Learning or Gallery (ruling R3)', () => {
        const { rerender } = render(<Rail mode="atom" onModeChange={jest.fn()} isOwner={false} />);
        expect(screen.queryByRole('link', { name: /admin/i })).toBeNull();
        rerender(<Rail mode="atom" onModeChange={jest.fn()} isOwner />);
        expect(screen.getByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin.html');
        expect(screen.queryByText(/learning|gallery/i)).toBeNull();
    });
});
