import React from 'react';
import { render, fireEvent, within } from '@testing-library/react';
import LevelNav, { NavigationTarget } from '../../src/components/LevelNav';

describe('LevelNav', () => {
    it('shows the element name, configuration label and method statement', () => {
        const { getByText } = render(
            <LevelNav
                Z={6}
                selectedShell={null}
                selectedSubshell={null}
                selectedOrbital={null}
                onNavigate={() => {}}
            />
        );
        expect(getByText('Carbon')).toBeInTheDocument();
        expect(getByText('1s² 2s² 2p²')).toBeInTheDocument();
        expect(getByText(/central-field SCF, LDA exchange with VWN correlation, spherically averaged/)).toBeInTheDocument();
    });

    it('builds a breadcrumb trail down to whatever is selected, and each segment is clickable', () => {
        const onNavigate = jest.fn();
        const { getByRole } = render(
            <LevelNav
                Z={6}
                selectedShell={2}
                selectedSubshell={{ n: 2, l: 1 }}
                selectedOrbital={null}
                onNavigate={onNavigate}
            />
        );

        const crumbs = within(getByRole('navigation', { name: /breadcrumb/i }));
        expect(crumbs.getByText('Carbon')).toBeInTheDocument();
        expect(crumbs.getByText(/L shell \(n=2\)/)).toBeInTheDocument();
        expect(crumbs.getByText('2p')).toBeInTheDocument();

        fireEvent.click(crumbs.getByRole('button', { name: 'Carbon' }));
        expect(onNavigate).toHaveBeenCalledWith({ level: 'atom' } as NavigationTarget);

        fireEvent.click(crumbs.getByRole('button', { name: /L shell \(n=2\)/ }));
        expect(onNavigate).toHaveBeenCalledWith({ level: 'shell', n: 2 } as NavigationTarget);

        fireEvent.click(crumbs.getByRole('button', { name: '2p' }));
        expect(onNavigate).toHaveBeenCalledWith({ level: 'subshell', n: 2, l: 1 } as NavigationTarget);
    });

    it('extends the breadcrumb to a fourth segment once an orbital is selected', () => {
        const { getByRole } = render(
            <LevelNav
                Z={6}
                selectedShell={2}
                selectedSubshell={{ n: 2, l: 1 }}
                selectedOrbital={{ n: 2, l: 1, ml: 1 }}
                onNavigate={() => {}}
            />
        );
        const crumbs = within(getByRole('navigation', { name: /breadcrumb/i }));
        expect(crumbs.getByText('2p_x')).toBeInTheDocument();
    });

    // Ruling R26 regression: iron has 4 occupied shells (K, L, M, N) but its
    // total D(r) resolves only 3 peaks. The shell picker must come from the
    // configuration (shellsFor), never from shellPeaks, so it must still
    // expose all 4 shells as clickable targets.
    it('exposes one clickable shell per occupied shell, not per resolved peak (iron: 4 shells)', () => {
        const onNavigate = jest.fn();
        const { container } = render(
            <LevelNav
                Z={26}
                selectedShell={null}
                selectedSubshell={null}
                selectedOrbital={null}
                onNavigate={onNavigate}
            />
        );
        const shellChips = container.querySelectorAll('.level-nav-shell-chip');
        expect(shellChips).toHaveLength(4);

        fireEvent.click(shellChips[3]);
        expect(onNavigate).toHaveBeenCalledWith({ level: 'shell', n: 4 });
    });

    // Addendum 2's selection affordance: "is there a way to unselect one?".
    // The breadcrumb was already a way out and testing showed nobody found
    // it, so the selected shell chip is itself the way back.
    describe('deselecting a shell', () => {
        const renderWithShell = (onNavigate: jest.Mock) => render(
            <LevelNav
                Z={18}
                selectedShell={2}
                selectedSubshell={null}
                selectedOrbital={null}
                onNavigate={onNavigate}
            />
        );

        it('clicking the selected shell chip goes back to the whole atom', () => {
            const onNavigate = jest.fn();
            const { getByRole } = renderWithShell(onNavigate);
            const chips = within(getByRole('group', { name: /shells/i }));
            fireEvent.click(chips.getByText(/L shell \(n=2\)/));
            expect(onNavigate).toHaveBeenCalledWith({ level: 'atom' } as NavigationTarget);
        });

        it('clicking an unselected shell chip still selects it', () => {
            const onNavigate = jest.fn();
            const { getByRole } = renderWithShell(onNavigate);
            const chips = within(getByRole('group', { name: /shells/i }));
            fireEvent.click(chips.getByText(/M shell \(n=3\)/));
            expect(onNavigate).toHaveBeenCalledWith({ level: 'shell', n: 3 } as NavigationTarget);
        });

        it('offers an explicit ✕ on the selected chip, and only on that one', () => {
            const onNavigate = jest.fn();
            const { container } = renderWithShell(onNavigate);
            const deletes = container.querySelectorAll('.level-nav-shell-chip .MuiChip-deleteIcon');
            expect(deletes).toHaveLength(1);
            fireEvent.click(deletes[0]);
            expect(onNavigate).toHaveBeenCalledWith({ level: 'atom' } as NavigationTarget);
        });

        it('marks the selected chip pressed, so the state is not carried by colour alone', () => {
            const { container } = renderWithShell(jest.fn());
            const pressed = container.querySelectorAll('.level-nav-shell-chip[aria-pressed="true"]');
            expect(pressed).toHaveLength(1);
            expect(pressed[0].textContent).toMatch(/L shell \(n=2\)/);
        });
    });

    // Discoverability: the rings on the cut face are clickable now
    // (orbital_visualizer.ts's onPickRadius), and nothing about a ring says
    // so on its own.
    it('says the rings are clickable, and how to get back out once one is open', () => {
        const { getByText, rerender } = render(
            <LevelNav Z={18} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(getByText(/click a ring in the 3d view/i)).toBeInTheDocument();

        rerender(
            <LevelNav Z={18} selectedShell={2} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(getByText(/for the whole atom/i)).toBeInTheDocument();
    });

    it('has a collapsed "About this model" section stating the approximations plainly', () => {
        const { getByRole, getByText } = render(
            <LevelNav
                Z={6}
                selectedShell={null}
                selectedSubshell={null}
                selectedOrbital={null}
                onNavigate={() => {}}
            />
        );
        const toggle = getByRole('button', { name: /about this model/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const about = getByText(/central-field/i, { selector: '.level-nav-about' });
        expect(about.textContent).toMatch(/spherically averaged/i);
        expect(about.textContent).toMatch(/LDA/);
        expect(about.textContent).toMatch(/VWN/);
        expect(about.textContent).toMatch(/non-relativistic/i);
        expect(about.textContent).toMatch(/neutral/i);
        expect(about.textContent).toMatch(/basis choice/i);
    });
});
