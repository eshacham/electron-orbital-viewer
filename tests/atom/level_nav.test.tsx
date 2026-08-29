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
