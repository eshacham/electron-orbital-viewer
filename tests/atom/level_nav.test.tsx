import React from 'react';
import { render, fireEvent, within } from '@testing-library/react';
import LevelNav, { NavigationTarget, relativisticEnergiesSentence, aboutRelativitySentence } from '../../src/components/LevelNav';
import { speciesConfiguration } from '../../src/atom/species';

describe('LevelNav', () => {
    it('does not claim a core for a one-shell atom', () => {
        const render1 = (Z: number) => render(
            <LevelNav Z={Z} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(render1(1).container.textContent).not.toMatch(/inside is core/);
        expect(render1(2).container.textContent).not.toMatch(/inside is core/);
        expect(render1(3).container.textContent).toMatch(/inside is core/);
    });

    it('offers an element button only when given somewhere to send it', () => {
        const onChangeElement = jest.fn();
        const { getByRole, rerender, queryByRole } = render(
            <LevelNav Z={26} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(queryByRole('button', { name: /change element/i })).toBeNull();
        rerender(
            <LevelNav Z={26} selectedShell={null} selectedSubshell={null} selectedOrbital={null}
                onNavigate={() => {}} onChangeElement={onChangeElement} />
        );
        fireEvent.click(getByRole('button', { name: /change element, currently Iron/i }));
        expect(onChangeElement).toHaveBeenCalled();
    });

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

    /**
     * Reported from a phone: after picking an orbital there was no easy way
     * back to the parent view. The breadcrumb was the only route, and its
     * segments are small text links partly under the sheet toggle.
     *
     * Back undoes exactly the last drill-down step, so the ladder out
     * mirrors the ladder in.
     */
    describe('stepping back out', () => {
        const back = (container: HTMLElement) =>
            container.querySelector<HTMLButtonElement>('.level-nav-back')!;

        it('is not offered at the whole-atom level, where there is nowhere to go', () => {
            const { container } = render(
                <LevelNav Z={26} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
            );
            expect(container.querySelector('.level-nav-back')).toBeNull();
        });

        it('from an orbital, goes back to its subshell rather than all the way out', () => {
            const onNavigate = jest.fn();
            const { container } = render(
                <LevelNav
                    Z={26}
                    selectedShell={3}
                    selectedSubshell={{ n: 3, l: 2 }}
                    selectedOrbital={{ n: 3, l: 2, ml: 0 }}
                    onNavigate={onNavigate}
                />
            );
            expect(back(container).textContent).toMatch(/back to 3d/i);
            fireEvent.click(back(container));
            expect(onNavigate).toHaveBeenCalledWith({ level: 'subshell', n: 3, l: 2 } as NavigationTarget);
        });

        it('from an isolated subshell, goes back to the whole shell', () => {
            const onNavigate = jest.fn();
            const { container } = render(
                <LevelNav Z={26} selectedShell={3} selectedSubshell={{ n: 3, l: 2 }} selectedOrbital={null} onNavigate={onNavigate} />
            );
            expect(back(container).textContent).toMatch(/back to M shell/i);
            fireEvent.click(back(container));
            expect(onNavigate).toHaveBeenCalledWith({ level: 'shell', n: 3 } as NavigationTarget);
        });

        it('from a shell, goes back to the whole atom, named', () => {
            const onNavigate = jest.fn();
            const { container } = render(
                <LevelNav Z={26} selectedShell={3} selectedSubshell={null} selectedOrbital={null} onNavigate={onNavigate} />
            );
            expect(back(container).textContent).toMatch(/back to Iron/i);
            fireEvent.click(back(container));
            expect(onNavigate).toHaveBeenCalledWith({ level: 'atom' } as NavigationTarget);
        });

        it('does not describe the view as a shell once an orbital is selected', () => {
            const { getByText, queryByText } = render(
                <LevelNav
                    Z={26}
                    selectedShell={3}
                    selectedSubshell={{ n: 3, l: 2 }}
                    selectedOrbital={{ n: 3, l: 2, ml: 0 }}
                    onNavigate={() => {}}
                />
            );
            expect(getByText(/one orbital of 3d/i)).toBeInTheDocument();
            expect(queryByText(/for the whole atom/i)).toBeNull();
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
        // Task 11 rewrites the "neutral, isolated atoms only" sentence to
        // "isolated atoms and their ions" (spec §5 Phase 3: the model now
        // covers ions and excited atoms too) -- this pins the replacement
        // wording rather than the word "neutral", which this sentence no
        // longer contains.
        expect(about.textContent).toMatch(/isolated atoms and their ions/i);
        expect(about.textContent).toMatch(/basis choice/i);
        // M5: an ion/excitation energy's own tooltip says it is never an
        // orbital eigenvalue and that these energies are spin-polarised;
        // the about text says the same, plus which solve draws the picture.
        expect(about.textContent).toMatch(/never orbital eigenvalues/i);
        expect(about.textContent).toMatch(/spin-polarised/i);
        // M5: the picture itself is the simpler, spin-restricted LDA, and
        // most anions -- Cl⁻ included -- are not bound in it (Fact 3; Global
        // Constraints' "Cl⁻ reported as unbound").
        expect(about.textContent).toMatch(/spin-restricted/i);
        expect(about.textContent).toMatch(/Cl⁻/);
        // Final review M7: UI copy uses real dashes, never a typed "--".
        expect(about.textContent).not.toContain('--');
    });
});

describe('LevelNav for a species', () => {
    it('LevelNav builds its shells from the species configuration', () => {
        const configuration = speciesConfiguration({ Z: 11, charge: 1, excitation: null });
        const { getByText, getByRole } = render(
            <LevelNav Z={11} configuration={configuration} speciesTitle="Sodium ion Na⁺" speciesSymbol="Na⁺"
                selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} onChangeElement={() => {}} />
        );
        expect(getByText('1s² 2s² 2p⁶')).toBeInTheDocument();
        const shells = within(getByRole('group', { name: 'shells' })).getAllByRole('button').map(b => b.textContent);
        expect(shells.some(label => /M shell/.test(label ?? ''))).toBe(false);
        // M10: the accessible name carries the species too, not only the
        // element -- "Na⁺ · Sodium", not a bare "Sodium" that would read
        // identically for the neutral atom and every one of its ions.
        const changeElement = getByRole('button', { name: /change element, currently Na⁺ · Sodium/i });
        expect(changeElement).toHaveTextContent('Na⁺ · Sodium');
    });

    // Review Focus 5 extends past ions: an excited atom can lose a shell
    // entirely too, when its one promoted electron was that shell's last.
    it('an excited atom with an emptied shell has no chip for it either (Na 3s → 4s)', () => {
        const configuration = speciesConfiguration({ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 4, l: 0 } } });
        const { getByRole } = render(
            <LevelNav Z={11} configuration={configuration} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        const shells = within(getByRole('group', { name: 'shells' })).getAllByRole('button').map(b => b.textContent);
        expect(shells.some(label => /M shell/.test(label ?? ''))).toBe(false);
        expect(shells.some(label => /N shell/.test(label ?? ''))).toBe(true);
    });

    it('renders species controls directly under the element button', () => {
        const { container } = render(
            <LevelNav Z={11} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}}
                onChangeElement={() => {}} speciesControls={<div className="probe">controls</div>} />
        );
        const probe = container.querySelector('.probe')!;
        const button = container.querySelector('.level-nav-change-element')!;
        expect(button.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(container.querySelector('.level-nav-configuration')!.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    });

    it('no longer claims to describe neutral atoms only', () => {
        const { container } = render(
            <LevelNav Z={6} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(container.textContent).not.toMatch(/no ions/);
        expect(container.textContent).toMatch(/isolated atoms and their ions/);
    });

    // Fix round 1, M1: an anion LDA does not bind has a configuration but
    // no picture, so there is no shell to open -- the chips say so instead
    // of looking clickable and doing nothing.
    it('shows the shells as unavailable while nothing is drawn, keeping the configuration', () => {
        const onNavigate = jest.fn();
        const configuration = speciesConfiguration({ Z: 17, charge: -1, excitation: null });
        const { getByRole, container } = render(
            <LevelNav Z={17} configuration={configuration} speciesSymbol="Cl⁻" selectedShell={null} selectedSubshell={null}
                selectedOrbital={null} onNavigate={onNavigate} shellsUnavailable />
        );
        const chips = within(getByRole('group', { name: 'shells' })).getAllByRole('button');
        expect(chips).toHaveLength(3);
        for (const chip of chips) {
            expect(chip).toHaveAttribute('aria-disabled', 'true');
            fireEvent.click(chip);
        }
        expect(onNavigate).not.toHaveBeenCalled();
        expect(container.querySelector('.level-nav-configuration')).toHaveTextContent('1s² 2s² 2p⁶ 3s² 3p⁶');
        expect(container.querySelector('.level-nav-valence')).toHaveTextContent('3s² 3p⁶');
        expect(container.querySelector('.level-nav-shell-hint')).toHaveTextContent(/nothing is drawn/i);
    });
    it('names j-levels in the breadcrumb and navigates with j', () => {
        const onNavigate = jest.fn();
        const { getByText } = render(
            <LevelNav Z={82} selectedShell={6} selectedSubshell={{ n: 6, l: 1, j: 1.5 }}
                selectedOrbital={{ n: 6, l: 1, ml: 0, j: 1.5 }} onNavigate={onNavigate} />
        );
        fireEvent.click(getByText('← Back to 6p³⁄₂'));
        expect(onNavigate).toHaveBeenCalledWith({ level: 'subshell', n: 6, l: 1, j: 1.5 });
    });

    it('carries j through every crumb, and says j-levels aloud', () => {
        const onNavigate = jest.fn();
        const { getByRole, container } = render(
            <LevelNav Z={82} selectedShell={6} selectedSubshell={{ n: 6, l: 1, j: 0.5 }}
                selectedOrbital={{ n: 6, l: 1, ml: 1, j: 0.5 }} onNavigate={onNavigate} />
        );
        const crumbs = within(getByRole('navigation', { name: 'breadcrumb' }));
        fireEvent.click(crumbs.getByRole('button', { name: '6p j = 1/2' }));
        expect(onNavigate).toHaveBeenLastCalledWith({ level: 'subshell', n: 6, l: 1, j: 0.5 });
        fireEvent.click(crumbs.getByRole('button', { name: '6p_x of 6p j = 1/2' }));
        expect(onNavigate).toHaveBeenLastCalledWith({ level: 'orbital', n: 6, l: 1, ml: 1, j: 0.5 });
        expect(crumbs.getByText('6p_x · 6p½')).toBeTruthy();
        expect(getByRole('button', { name: 'Back to 6p j = 1/2' })).toBeTruthy();
        expect(container.querySelector('.level-nav-shell-hint')).toHaveTextContent('One orbital of 6p½');
    });

    it('says j-levels aloud in the phone header too', () => {
        const { getByRole, container } = render(
            <LevelNav Z={82} selectedShell={6} selectedSubshell={{ n: 6, l: 1, j: 1.5 }}
                selectedOrbital={null} onNavigate={() => {}} variant="header" />
        );
        expect(getByRole('button', { name: 'back to P shell (n=6)' })).toBeTruthy();
        const location = container.querySelector('.level-nav-location')!;
        expect(location.querySelector('[aria-hidden="true"]')!.textContent).toBe('P shell (n=6) · 6p³⁄₂');
        expect(location.querySelector('.visually-hidden')!.textContent).toBe('P shell (n=6) · 6p j = 3/2');
    });

    it('leaves non-relativistic crumbs exactly as they were', () => {
        const onNavigate = jest.fn();
        const { getByText, getByRole, container } = render(
            <LevelNav Z={18} selectedShell={3} selectedSubshell={{ n: 3, l: 1 }}
                selectedOrbital={{ n: 3, l: 1, ml: 0 }} onNavigate={onNavigate} />
        );
        fireEvent.click(getByText('← Back to 3p'));
        expect(onNavigate).toHaveBeenCalledWith({ level: 'subshell', n: 3, l: 1 });
        expect(getByText('← Back to 3p').getAttribute('aria-label')).toBeNull();
        const crumbs = getByRole('navigation', { name: 'breadcrumb' });
        expect(Array.from(crumbs.querySelectorAll('button')).map(b => [b.textContent, b.getAttribute('aria-label')]))
            .toEqual([['Argon', null], ['M shell (n=3)', null], ['3p', null], ['3p_z', null]]);
        expect(container.querySelector('.visually-hidden')).toBeNull();
    });

    // Ruling C6: ΔSCF stays non-relativistic in every mode; with a
    // relativistic picture the About text has to say the two differ.
    describe('the energies against a relativistic picture', () => {
        const aboutText = (relativity?: 'off' | 'scalar' | 'spinOrbit') => {
            const { getByRole, container, unmount } = render(
                <LevelNav Z={79} relativity={relativity} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
            );
            fireEvent.click(getByRole('button', { name: /about this model/i }));
            const text = container.querySelector('.level-nav-about')!.textContent!;
            unmount();
            return text;
        };

        it('adds nothing to a non-relativistic picture\'s paragraph', () => {
            expect(relativisticEnergiesSentence('off')).toBe('');
            expect(aboutText('off')).toBe(aboutText());
            expect(aboutText()).toContain('extra electron at all. The individual s/p/d/f');
        });

        it.each([
            ['scalar', /This picture is scalar-relativistic; the ΔSCF energies are not/],
            ['spinOrbit', /This picture includes spin–orbit coupling \(Dirac equation\); the ΔSCF energies do not/],
        ] as const)('says so for %s', (mode, pattern) => {
            const text = aboutText(mode);
            expect(text).toMatch(pattern);
            expect(text).toMatch(/non-relativistic/);
            expect(text).toContain('extra electron at all. This picture');
        });
    });

    // Carry from Task 11: the "It is non-relativistic … no spin-orbit
    // coupling" clause used to sit next to Task 11's new ΔSCF sentence
    // unchanged in every mode, so a relativistic picture's About text
    // contradicted itself. aboutRelativitySentence makes that clause
    // mode-aware; off keeps today's wording verbatim.
    describe('the relativity clause of About this model', () => {
        it.each([
            ['scalar', /Koelling–Harmon/, /scalar-relativistic/],
            ['spinOrbit', /Dirac/, /j = l ± ½/],
        ] as const)('states the %s method in About this model', (mode, methodPattern, sentencePattern) => {
            const { getByRole, container } = render(
                <LevelNav Z={79} relativity={mode} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
            );
            fireEvent.click(getByRole('button', { name: /about this model/i }));
            expect(container.querySelector('.level-nav-method')!.textContent).toMatch(methodPattern);
            expect(container.querySelector('.level-nav-about')!.textContent).toMatch(sentencePattern);
            expect(container.querySelector('.level-nav-about')!.textContent).not.toMatch(/It is non-relativistic/);
        });

        it('keeps the non-relativistic wording when relativity is off', () => {
            expect(aboutRelativitySentence('off')).toMatch(/non-relativistic/);
        });
    });
});
