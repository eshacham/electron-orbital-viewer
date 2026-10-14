import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Rail from '../../src/shell/Rail';

// Ruling R23a (round 23): the desktop/tablet rail is gone -- its four
// destinations moved into the top bar's tabs (App.test.tsx, top_bar.test.tsx)
// -- and Admin moved into the avatar menu (already there: OwnerBar's
// Dashboard link, owner_bar.test.tsx). This component is now only the
// phone's mode menu, so its tests drop the 'rail'/'wide' variants and the
// Admin link, and check the new order (Orbitals | Atoms | Bonds | Molecules).
describe('Rail (spec §8.2, as amended by ruling R23a: the phone mode menu)', () => {
    it('is the view-mode navigation, with the names the tests and the old toggle used', () => {
        render(<Rail mode="atom" onModeChange={jest.fn()} />);
        const nav = screen.getByRole('navigation', { name: 'view mode' });
        const names = within(nav).getAllByRole('button').map(b => b.getAttribute('aria-label'));
        // Controller ruling WCAG-2.5.3-detail: names are "<Visible label>
        // (<old name>)" (e.g. "Atoms (atom mode)") so the visible label is in
        // the accessible name; unanchored regexes on the old name, which the
        // pattern still contains.
        expect(names).toEqual([
            expect.stringMatching(/basic orbitals mode/),
            expect.stringMatching(/atom mode/),
            expect.stringMatching(/bonds mode/),
            expect.stringMatching(/molecule mode/),
        ]);
        expect(within(nav).getByRole('button', { name: /atom mode/ })).toHaveAttribute('aria-pressed', 'true');
        expect(within(nav).getByRole('button', { name: /bonds mode/ })).toHaveAttribute('aria-pressed', 'false');
        // Ruling R23a: reordered -- Orbitals before Atoms ("Basic Orbitals" renamed to "Orbitals").
        expect(nav).toHaveTextContent('OrbitalsAtomsBondsMolecules');
    });

    it('dispatches the mode the way the toggle did', () => {
        const onModeChange = jest.fn();
        render(<Rail mode="atom" onModeChange={onModeChange} />);
        fireEvent.click(screen.getByRole('button', { name: /molecule mode/ }));
        expect(onModeChange).toHaveBeenCalledWith('molecule');
    });
});
