import React from 'react';
import { render, fireEvent, within, screen } from '@testing-library/react';
import LevelNav, { NavigationTarget } from '../../src/components/LevelNav';
// Fix round 1: About's text lives in atom_text (shared text helpers live in modules, not components).
import { relativisticEnergiesSentence, aboutRelativitySentence, aboutModelText } from '../../src/atom/atom_text';
import { speciesConfiguration } from '../../src/atom/species';
import { seenText } from '../seen_text';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { curvePalette } from '../../src/design/science';
import { CURVE_COLORS } from '../../src/curve_colors';

describe('LevelNav', () => {
    // Task 6: the valence line keeps its short labelled value; the core note is Info's (atomInfo, whose tests
    // pin that a one-shell atom claims no core).
    it('keeps the valence line a short labelled value, with no note beside it', () => {
        const { container } = render(
            <LevelNav Z={3} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(container.querySelector('.level-nav-valence')).toHaveTextContent(/^Valence: 2s¹$/);
        expect(container.textContent).not.toMatch(/inside is core/);
    });

    // Science corrections S3: the panel's valence label is the compact form of the rule Info's plain words use.
    it.each([
        [26, 0, 'Fe', 'Valence: 3d⁶ 4s²'],
        [26, 2, 'Fe²⁺', 'Valence: 3d⁶ (outside 3s² 3p⁶)'],
        [31, 3, 'Ga³⁺', 'Valence: 3d¹⁰ (outside 3s² 3p⁶)'],
        [64, 3, 'Gd³⁺', 'Valence: 5s² 5p⁶ · open 4f⁷'],
        [71, 3, 'Lu³⁺', 'Valence: 5s² 5p⁶'],
        [6, 0, 'C', 'Valence: 2s² 2p²'],
    ])('reads the valence line of %i/%i (%s) as "%s"', (Z, charge, symbol, line) => {
        const { container } = render(
            <LevelNav Z={Z} configuration={speciesConfiguration({ Z, charge, excitation: null })} speciesSymbol={symbol}
                selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(container.querySelector('.level-nav-valence')?.textContent).toBe(line);
    });

    // Science corrections S5 (Meaning-Only Status): the valence dot is the 3D view's own colour for that shell (the strip's
    // thumbnails read the same palette by the shell's position, ascending n), never warning amber.
    describe('the valence dot', () => {
        const dotColour = (chip: Element) => (chip as HTMLElement).style.getPropertyValue('--level-nav-shell-colour');
        it.each([
            ['dark', curvePalette('dark')],
            ['light', curvePalette('light')],
        ])('takes the %s palette colour of its shell', (_theme, palette) => {
            const { container } = render(
                <LevelNav Z={6} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} palette={palette} />
            );
            const chips = [...container.querySelectorAll('.level-nav-shell-chip')];
            expect(chips).toHaveLength(2);
            // Carbon: K (n = 1) is palette[0], L (n = 2, the valence shell) is palette[1].
            expect(chips[1]).toHaveClass('valence');
            expect(dotColour(chips[1])).toBe(palette[1]);
            // A core chip has no dot, so no colour to carry.
            expect(dotColour(chips[0])).toBe('');
        });
        it('follows the shell by position, so an ion with a shell missing keeps the 3D view colours', () => {
            const { container } = render(
                <LevelNav Z={11} configuration={speciesConfiguration({ Z: 11, charge: 0, excitation: { from: { n: 3, l: 0 }, to: { n: 4, l: 0 } } })}
                    selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
            );
            const chips = [...container.querySelectorAll('.level-nav-shell-chip')];
            // Na(3s→4s) holds K, L and N: the valence N shell is the third ring, palette[2].
            expect(chips.map(chip => chip.textContent)).toEqual([expect.stringContaining('K'), expect.stringContaining('L'), expect.stringContaining('N')]);
            expect(dotColour(chips[2])).toBe(CURVE_COLORS[2]);
        });
        // T5 review M2: on a selected chip the accent fill hides the dot, so it gets an on-fill ring there.
        it('is ringed in on-fill on a selected chip', () => {
            const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
            const rule = /\.level-nav-shell-chip\.valence\.selected \.MuiChip-label::before \{[^}]*\}/.exec(css)?.[0] ?? '';
            expect(rule).toMatch(/box-shadow:\s*0 0 0 1\.5px var\(--ql-color-on-fill\)/);
        });
        it('is painted from that colour, not from the warning token', () => {
            const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
            const rule = /\.level-nav-shell-chip\.valence \.MuiChip-label::before \{[^}]*\}/.exec(css)?.[0] ?? '';
            expect(rule).toMatch(/background:\s*var\(--level-nav-shell-colour\)/);
            expect(rule).not.toMatch(/warning/);
        });
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

    // Task 6: the method statement is Info's ("How this was computed", atomInfo).
    it('shows the element name and configuration label, and leaves the method to Info', () => {
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
        expect(screen.queryByText(/central-field SCF/)).toBeNull();
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
        // Final review M2: shell names are spaced, "L shell (n = 2)".
        expect(crumbs.getByText(/L shell \(n = 2\)/)).toBeInTheDocument();
        expect(crumbs.getByText('2p')).toBeInTheDocument();

        fireEvent.click(crumbs.getByRole('button', { name: 'Carbon' }));
        expect(onNavigate).toHaveBeenCalledWith({ level: 'atom' } as NavigationTarget);

        // Final review M2: shell names are spaced, "L shell (n = 2)".
        fireEvent.click(crumbs.getByRole('button', { name: /L shell \(n = 2\)/ }));
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
        // Task 6: a real subscript, spoken flat ("2px"), never "2p_x".
        const orbital = crumbs.getByRole('button', { name: '2px' });
        expect(orbital.querySelector('sub')).toHaveTextContent('x');
        expect(getByRole('navigation', { name: /breadcrumb/i }).textContent).not.toContain('_');
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
            // Final review M2: shell names are spaced, "L shell (n = 2)".
            fireEvent.click(chips.getByText(/L shell \(n = 2\)/));
            expect(onNavigate).toHaveBeenCalledWith({ level: 'atom' } as NavigationTarget);
        });

        it('clicking an unselected shell chip still selects it', () => {
            const onNavigate = jest.fn();
            const { getByRole } = renderWithShell(onNavigate);
            const chips = within(getByRole('group', { name: /shells/i }));
            // Final review M2: shell names are spaced, "L shell (n = 2)".
            fireEvent.click(chips.getByText(/M shell \(n = 3\)/));
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
            // Final review M2: shell names are spaced, "L shell (n = 2)".
            expect(pressed[0].textContent).toMatch(/L shell \(n = 2\)/);
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

        // Task 6: the hint on where you are is Info's (atomInfo); the panel keeps Back and the breadcrumb.
        it('leaves the hint on where you are to Info', () => {
            const { container, queryByText } = render(
                <LevelNav
                    Z={26}
                    selectedShell={3}
                    selectedSubshell={{ n: 3, l: 2 }}
                    selectedOrbital={{ n: 3, l: 2, ml: 0 }}
                    onNavigate={() => {}}
                />
            );
            expect(container.querySelector('.level-nav-shell-hint')).toBeNull();
            expect(queryByText(/one orbital of 3d/i)).toBeNull();
        });
    });

    // Discoverability: the rings on the cut face are clickable now
    // (orbital_visualizer.ts's onPickRadius), and nothing about a ring says
    // so on its own. Task 6: Info says so (atomInfo's hint); the shells carry an (i).
    it('leaves the click hint to Info, and offers an (i) beside the shells', () => {
        const { getByRole, container } = render(
            <LevelNav Z={18} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        expect(container.textContent).not.toMatch(/click a ring/i);
        expect(getByRole('button', { name: 'About Shell' })).toBeInTheDocument();
    });

    // Task 6: About is Info's ("How this was computed", atomInfo) -- no toggle in the panel; Help quotes it
    // (variant 'about'). The text itself is aboutModelText, pinned here as it was.
    it('states the approximations of "About this model" plainly, and has no toggle for it in the panel', () => {
        const { queryByRole } = render(
            <LevelNav
                Z={6}
                selectedShell={null}
                selectedSubshell={null}
                selectedOrbital={null}
                onNavigate={() => {}}
            />
        );
        expect(queryByRole('button', { name: /about this model/i })).toBeNull();
        const about = { textContent: aboutModelText('off', 'off', true) };
        expect(about.textContent).toMatch(/central-field/i);
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
        // Task 6: the JSX this replaces lost the space at a comment ("fortheir").
        expect(about.textContent).toContain('no bound state for their extra electron');
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

    // Task 6: About is Help's (variant 'about') and Info's, from aboutModelText.
    it('no longer claims to describe neutral atoms only', () => {
        const { container } = render(
            <LevelNav Z={6} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} variant="about" />
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
        // Task 6: why there is no shell to open is said in Info (atomInfo).
        expect(container.querySelector('.level-nav-shell-hint')).toBeNull();
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
        // Task 6: the orbital's name is spoken flat ("6px"), drawn with a real subscript.
        fireEvent.click(crumbs.getByRole('button', { name: '6px of 6p j = 1/2' }));
        expect(onNavigate).toHaveBeenLastCalledWith({ level: 'orbital', n: 6, l: 1, ml: 1, j: 0.5 });
        const orbitalCrumb = crumbs.getByRole('button', { name: '6px of 6p j = 1/2' });
        // Final review: a typeset label is its hidden visual and a plain copy, so its text is read as seen (toHaveSeenText).
        expect(orbitalCrumb).toHaveSeenText(/^6px · 6p½$/);
        expect(orbitalCrumb.querySelector('sub')).toHaveTextContent('x');
        expect(getByRole('button', { name: 'Back to 6p j = 1/2' })).toBeTruthy();
        expect(container.querySelector('.level-nav-shell-hint')).toBeNull();
    });

    it('says j-levels aloud in the phone header too', () => {
        const { getByRole, container } = render(
            <LevelNav Z={82} selectedShell={6} selectedSubshell={{ n: 6, l: 1, j: 1.5 }}
                selectedOrbital={null} onNavigate={() => {}} variant="header" />
        );
        // Final review M2: shell names are spaced, "L shell (n = 2)".
        expect(getByRole('button', { name: 'back to P shell (n = 6)' })).toBeTruthy();
        const location = container.querySelector('.level-nav-location')!;
        // Final review M2: shell names are spaced, "L shell (n = 2)".
        expect(location.querySelector('[aria-hidden="true"]')!.textContent).toBe('P shell (n = 6) · 6p³⁄₂');
        // Final review M2: shell names are spaced, "L shell (n = 2)".
        expect(location.querySelector('.visually-hidden')!.textContent).toBe('P shell (n = 6) · 6p j = 3/2');
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
        // Final review: a typeset label is its hidden visual and a plain copy -- read as seen (seenText).
        expect(Array.from(crumbs.querySelectorAll('button')).map(b => [seenText(b), b.getAttribute('aria-label')]))
            // Task 6: the orbital crumb reads "3pz" (a real subscript), never "3p_z".
            // Final review M2: shell names are spaced, "L shell (n = 2)".
            .toEqual([['Argon', null], ['M shell (n = 3)', null], ['3p', null], ['3pz', null]]);
        // Final review: a typeset label's own plain copy (typesetLabel) is not a j-level's spoken name.
        expect(container.querySelector(':not(.typeset-label) > .visually-hidden')).toBeNull();
    });

    // Ruling C6: ΔSCF stays non-relativistic in every mode; with a
    // relativistic picture the About text has to say the two differ.
    describe('the energies against a relativistic picture', () => {
        // Task 6: About is Help's (variant 'about') and Info's; the panel has no toggle for it any more.
        const aboutText = (relativity?: 'off' | 'scalar' | 'spinOrbit') => {
            const { container, unmount } = render(
                <LevelNav Z={79} relativity={relativity} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} variant="about" />
            );
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

        // Final review M6: with no picture on screen (an unbound verdict, a
        // failed solve) there is no "this picture" to describe -- the
        // paragraph reads as off's does at that point, whatever the switch says.
        it('says nothing about "this picture" when there is none', () => {
            const { container } = render(
                <LevelNav Z={85} relativity="scalar" pictureShown={false} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} variant="about" />
            );
            const text = container.querySelector('.level-nav-about')!.textContent!;
            expect(text).not.toMatch(/This picture/);
            expect(text).toContain('extra electron at all. The individual s/p/d/f');
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
            const { container } = render(
                <LevelNav Z={79} relativity={mode} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} variant="about" />
            );
            expect(container.querySelector('.level-nav-method')!.textContent).toMatch(methodPattern);
            expect(container.querySelector('.level-nav-about')!.textContent).toMatch(sentencePattern);
            expect(container.querySelector('.level-nav-about')!.textContent).not.toMatch(/It is non-relativistic/);
        });

        it('keeps the non-relativistic wording when relativity is off', () => {
            expect(aboutRelativitySentence('off')).toMatch(/non-relativistic/);
        });
    });
});

describe('LevelNav parts for the Explore panel (spec §9.1)', () => {
    const base = { Z: 6, selectedShell: 2, selectedSubshell: { n: 2, l: 1 }, selectedOrbital: { n: 2, l: 1, ml: 0 }, onNavigate: jest.fn() };

    it('crumbs: the back step and the whole breadcrumb', () => {
        render(<LevelNav {...base} variant="crumbs" />);
        expect(screen.getByRole('button', { name: /Back to 2p/ })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Carbon');
        expect(screen.queryByText(/Valence/)).toBeNull();
    });

    // Controller ruling T10-crumb: at the whole atom the breadcrumb would be
    // only the root, which the element tile above already names.
    it('crumbs: nothing at the whole atom, where the tile already names the subject', () => {
        const { container } = render(<LevelNav {...base} selectedShell={null} selectedSubshell={null} selectedOrbital={null} variant="crumbs" />);
        expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
        expect(container.querySelector('.level-nav-crumbs')).toBeNull();
    });

    it('crumbs: a shell has its back step and the breadcrumb root', () => {
        render(<LevelNav {...base} selectedShell={2} selectedSubshell={null} selectedOrbital={null} variant="crumbs" />);
        expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Carbon');
        expect(screen.getByRole('button', { name: /Back to Carbon/ })).toBeInTheDocument();
    });

    it('configuration: configuration, valence and shell chips, with its children', () => {
        render(<LevelNav {...base} variant="configuration"><span>subshell chips</span></LevelNav>);
        expect(screen.getByText(/1s² 2s² 2p²/)).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'shells' })).toBeInTheDocument();
        expect(screen.getByText('subshell chips')).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();
    });

    it('about: the method and the model, expanded, with no toggle', () => {
        const { container } = render(<LevelNav {...base} variant="about" />);
        expect(container.querySelector('.level-nav-about')).toHaveTextContent(/central-field model/);
        expect(screen.queryByRole('button', { name: /about this model/i })).toBeNull();
    });
});

// Task 9b (finish review, fix 7): an (i) sits beside the word it explains. The shells' (i) floated at the panel's right
// edge, beside no term; it now follows a short label naming the row, as Orbitals' "Shell n (i)" does.
describe('LevelNav: the shells\' (i) beside its term (Task 9b)', () => {
    it('puts the (i) right after a "Shells" label, outside the chip row', () => {
        const { getByRole, container } = render(
            <LevelNav Z={18} selectedShell={null} selectedSubshell={null} selectedOrbital={null} onNavigate={() => {}} />
        );
        const button = getByRole('button', { name: 'About Shell' });
        const term = button.closest('.info-term')!;
        expect(term).not.toBeNull();
        expect(button.previousElementSibling).toHaveTextContent(/^Shells$/);
        expect(term.querySelector('.level-nav-shells')).toBeNull();
        expect(container.querySelector('.level-nav-shells')!.previousElementSibling).toBe(term);
    });
});

