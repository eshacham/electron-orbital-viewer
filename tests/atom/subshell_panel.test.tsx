import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import SubshellPanel, { spreadLabels, formatElectrons } from '../../src/components/SubshellPanel';
import { SerialisedSubshell } from '../../src/workers/atomWorker';

/** A neon-shaped list of subshells: 1s (n=1), 2s and 2p (n=2). */
function neonLikeSubshells(): SerialisedSubshell[] {
    const curve = (): Float64Array => new Float64Array(4);
    const R = (): Float64Array => new Float64Array(4);
    return [
        { n: 1, l: 0, electrons: 2, energy: -30.0, curve: curve(), R: R(), samplingRadius: 1, compositeSamplingRadius: 1 },
        { n: 2, l: 0, electrons: 2, energy: -1.3, curve: curve(), R: R(), samplingRadius: 5, compositeSamplingRadius: 5 },
        { n: 2, l: 1, electrons: 6, energy: -0.5, curve: curve(), R: R(), samplingRadius: 6, compositeSamplingRadius: 6 },
    ];
}

describe('SubshellPanel', () => {
    it('renders one chip per subshell of the selected shell, with label, occupancy and orbital energy in Hartree', () => {
        const { container } = render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={null}
                onSelectSubshell={() => {}}
                onSelectOrbital={() => {}}
            />
        );
        const chips = container.querySelectorAll('.subshell-chip');
        expect(chips).toHaveLength(2); // 2s and 2p only -- not 1s, which belongs to shell 1.

        const text = container.textContent ?? '';
        expect(text).toMatch(/2s/);
        expect(text).toMatch(/2p/);
        expect(text).toMatch(/2 of 2 e⁻/); // 2s occupancy: full, 2 of its own 2-electron capacity
        expect(text).toMatch(/6 of 6 e⁻/); // 2p occupancy: full, 6 of its own 6-electron capacity
        expect(text).toMatch(/-1\.300 Ha/);
        expect(text).toMatch(/-0\.500 Ha/);
        expect(text).toMatch(/orbital energy/i);
    });

    // Addendum 2: "convey the partial filling ... an explicit '2 of 6'
    // readout" -- carbon's 2p2 and neon's 2p6 must not read identically.
    it('shows an open subshell\'s occupancy explicitly against its full capacity, not just a bare electron count', () => {
        const carbonLike: SerialisedSubshell[] = [
            { n: 2, l: 0, electrons: 2, energy: -1.0, curve: new Float64Array(4), R: new Float64Array(4), samplingRadius: 5, compositeSamplingRadius: 5 },
            { n: 2, l: 1, electrons: 2, energy: -0.5, curve: new Float64Array(4), R: new Float64Array(4), samplingRadius: 6, compositeSamplingRadius: 6 },
        ];
        const { container } = render(
            <SubshellPanel
                subshells={carbonLike}
                shellN={2}
                selectedSubshell={null}
                onSelectSubshell={() => {}}
                onSelectOrbital={() => {}}
            />
        );
        const text = container.textContent ?? '';
        expect(text).toMatch(/2 of 6 e⁻/); // 2p2: two of its own six-electron capacity.
        expect(text).toMatch(/2 of 2 e⁻/); // 2s2: full.
    });

    // Ruling R19: an SCF eigenvalue is not an ionisation energy, and the UI
    // must never imply otherwise.
    it('never labels the value an ionisation energy', () => {
        const { container } = render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={null}
                onSelectSubshell={() => {}}
                onSelectOrbital={() => {}}
            />
        );
        expect(container.textContent ?? '').not.toMatch(/ionisation|ionization/i);
    });

    it('titles the energy diagram as orbital energies, not as the radial distribution it is not', () => {
        const { getByText, container } = render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={null}
                onSelectSubshell={() => {}}
                onSelectOrbital={() => {}}
            />
        );
        expect(getByText(/orbital energies/i)).toBeInTheDocument();
        expect(container.textContent ?? '').not.toMatch(/radial distribution/i);
    });

    it('drills to a subshell when its chip is clicked', () => {
        const onSelectSubshell = jest.fn();
        const { container } = render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={null}
                onSelectSubshell={onSelectSubshell}
                onSelectOrbital={() => {}}
            />
        );
        const pChip = container.querySelector('.subshell-chip[data-n="2"][data-l="1"]')!;
        fireEvent.click(pChip);
        expect(onSelectSubshell).toHaveBeenCalledWith(2, 1);
    });

    it('shows 2l+1 mₗ buttons named via orbitalName once a subshell is selected', () => {
        const onSelectOrbital = jest.fn();
        const { getByRole } = render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={{ n: 2, l: 1 }}
                onSelectSubshell={() => {}}
                onSelectOrbital={onSelectOrbital}
            />
        );
        // orbitalName(2, 1, ml): ml=-1 -> 2p_y, ml=0 -> 2p_z, ml=+1 -> 2p_x.
        expect(getByRole('button', { name: '2p_y' })).toBeInTheDocument();
        expect(getByRole('button', { name: '2p_z' })).toBeInTheDocument();
        expect(getByRole('button', { name: '2p_x' })).toBeInTheDocument();

        fireEvent.click(getByRole('button', { name: '2p_x' }));
        expect(onSelectOrbital).toHaveBeenCalledWith(2, 1, 1);
    });

    it('names the current shell\'s energy rules, and only those', () => {
        const { container } = render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={null}
                onSelectSubshell={() => {}}
                onSelectOrbital={() => {}}
            />
        );
        const labels = Array.from(container.querySelectorAll('.subshell-energy-label')).map(l => l.textContent);
        expect(labels).toEqual(['2s', '2p']);
    });

    it('draws one energy rule per subshell in the whole atom, with the current shell highlighted', () => {
        const { container } = render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={null}
                onSelectSubshell={() => {}}
                onSelectOrbital={() => {}}
            />
        );
        const rules = container.querySelectorAll('.subshell-energy-rule');
        expect(rules).toHaveLength(3); // 1s, 2s and 2p -- the whole atom, not just shell 2.

        const current = container.querySelectorAll('.subshell-energy-rule.current');
        expect(current).toHaveLength(2); // 2s and 2p belong to the selected shell.
    });

    /**
     * The panel stays mounted at the orbital level (bug fix, reported from a
     * phone): unmounting it took the mL buttons away the instant one was
     * used, leaving the breadcrumb as the only way back.
     */
    describe('at the orbital level', () => {
        const renderAtOrbital = (ml: number) => render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={{ n: 2, l: 1 }}
                selectedOrbital={{ n: 2, l: 1, ml }}
                onSelectSubshell={() => {}}
                onSelectOrbital={() => {}}
            />
        );

        it('still offers the whole mL row, so a sibling orbital is one tap away', () => {
            const { container } = renderAtOrbital(0);
            expect(container.querySelectorAll('.subshell-ml-button')).toHaveLength(3);
        });

        it('marks which orbital is showing, and only that one', () => {
            const { container } = renderAtOrbital(0);
            const pressed = container.querySelectorAll('.subshell-ml-button[aria-pressed="true"]');
            expect(pressed).toHaveLength(1);
            expect(pressed[0].textContent).toMatch(/2p_z/i);
        });

        it('says what is on screen, not what was on screen a level ago', () => {
            const { getByText } = renderAtOrbital(0);
            expect(getByText(/showing one orbital of 2p/i)).toBeInTheDocument();
        });
    });
});

describe('spreadLabels', () => {
    it('pushes labels that would overlap apart, keeping their order', () => {
        expect(spreadLabels([50, 51, 52], 11, 0, 100)).toEqual([50, 61, 72]);
    });

    it('slides a run that would leave the bottom back up', () => {
        const ys = spreadLabels([95, 96, 97], 11, 0, 100);
        expect(ys[2]).toBeLessThanOrEqual(100);
        expect(ys[1]).toBeLessThanOrEqual(ys[2] - 11);
        expect(ys[0]).toBeLessThanOrEqual(ys[1] - 11);
    });

    it('leaves well-separated labels where they are', () => {
        expect(spreadLabels([10, 60], 11, 0, 100)).toEqual([10, 60]);
    });
});

function leadLikeSpinOrbit(): SerialisedSubshell[] {
    const a = () => new Float64Array(4);
    return [
        { n: 6, l: 0, j: 0.5, electrons: 2, energy: -0.47, curve: a(), R: a(), samplingRadius: 5, compositeSamplingRadius: 5 },
        { n: 6, l: 1, j: 0.5, electrons: 2 / 3, energy: -0.16, curve: a(), R: a(), samplingRadius: 6, compositeSamplingRadius: 6 },
        { n: 6, l: 1, j: 1.5, electrons: 4 / 3, energy: -0.12, curve: a(), R: a(), samplingRadius: 6, compositeSamplingRadius: 6 },
    ];
}

describe('SubshellPanel with spin–orbit', () => {
    it('shows one chip per j-level, labelled 6p½ / 6p³⁄₂, with 2j+1 capacity and fractional occupancy', () => {
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        const labels = Array.from(container.querySelectorAll('.subshell-chip-label')).map(e => e.textContent);
        expect(labels).toEqual(['6s½', '6p½', '6p³⁄₂']);
        const text = container.textContent ?? '';
        expect(text).toMatch(/0\.67 of 2 e⁻/);
        expect(text).toMatch(/1\.33 of 4 e⁻/);
        expect(text).toMatch(/2 of 2 e⁻/);
        // The energy diagram names the j-levels too.
        const diagramLabels = Array.from(container.querySelectorAll('.subshell-energy-label')).map(e => e.textContent);
        expect(diagramLabels).toEqual(['6s½', '6p½', '6p³⁄₂']);
    });

    it('reports j with the selection, and marks only the chosen j-level', () => {
        const onSelectSubshell = jest.fn();
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={{ n: 6, l: 1, j: 1.5 }}
                relativity="spinOrbit" onSelectSubshell={onSelectSubshell} onSelectOrbital={() => {}} />
        );
        const chips = container.querySelectorAll('.subshell-chip');
        expect(chips[1].getAttribute('aria-pressed')).toBe('false');
        expect(chips[2].getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(chips[1]);
        expect(onSelectSubshell).toHaveBeenCalledWith(6, 1, 0.5);
        // The lobes drawn for a j-level are the l basis; say so (spec §3.3).
        expect(container.textContent).toMatch(/j-level/);
        expect(container.querySelector('.subshell-j-note')!.textContent)
            .toBe('The lobes are the p orbitals\' shapes, sized by 6p³⁄₂\'s own radial function — a basis choice. '
                + 'A j-level mixes mₗ with spin, so its own states have other shapes (a p½ state is spherical).');
        expect(container.querySelector('.subshell-isolate-hint')!.textContent).toMatch(/Showing 6p³⁄₂ alone/);
    });

    it('drills into an orbital of the chosen j-level, and marks it only for that j-level', () => {
        const onSelectOrbital = jest.fn();
        const { container, rerender } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={{ n: 6, l: 1, j: 0.5 }}
                selectedOrbital={{ n: 6, l: 1, ml: 0, j: 0.5 }}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={onSelectOrbital} />
        );
        const buttons = container.querySelectorAll('.subshell-ml-button');
        expect(buttons).toHaveLength(3);
        expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(buttons[2]);
        expect(onSelectOrbital).toHaveBeenCalledWith(6, 1, 1, 0.5);
        expect(container.querySelector('.subshell-isolate-hint')!.textContent).toMatch(/one orbital of 6p½/);
        // An orbital of the other j-level is not this row's current one.
        rerender(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={{ n: 6, l: 1, j: 0.5 }}
                selectedOrbital={{ n: 6, l: 1, ml: 0, j: 1.5 }}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={onSelectOrbital} />
        );
        expect(Array.from(container.querySelectorAll('.subshell-ml-button')).some(b => b.getAttribute('aria-pressed') === 'true')).toBe(false);
    });

    // Fix round 1, I1: the unisolated shell draws every j-level's l lobes
    // overlapping, which needs the same caveat as an isolated one.
    it('gives the basis caveat for the whole shell too, naming its j-levels', () => {
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(container.querySelector('.subshell-j-note')!.textContent)
            .toBe('Each j-level is drawn as its l orbitals\' lobes, sized by its own radial function — a basis choice. '
                + '6p½ and 6p³⁄₂ overlap here; a j-level\'s own states have other shapes (a p½ state is spherical).');
    });

    // M3: the p½ example only where there is a p level to be it.
    it('names every j-level of a shell with several, and keeps the p½ example to p levels', () => {
        const a = () => new Float64Array(4);
        const level = (l: number, j: number, electrons: number, energy: number): SerialisedSubshell =>
            ({ n: 5, l, j, electrons, energy, curve: a(), R: a(), samplingRadius: 5, compositeSamplingRadius: 5 });
        const fifthShell = [level(0, 0.5, 2, -3), level(1, 0.5, 2, -2), level(1, 1.5, 4, -1.8), level(2, 1.5, 4, -0.6), level(2, 2.5, 6, -0.5)];
        const { container, rerender } = render(
            <SubshellPanel subshells={fifthShell} shellN={5} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(container.querySelector('.subshell-j-note')!.textContent)
            .toMatch(/ 5p½, 5p³⁄₂, 5d³⁄₂ and 5d⁵⁄₂ overlap here; .*\(a p½ state is spherical\)\.$/);
        rerender(
            <SubshellPanel subshells={fifthShell} shellN={5} selectedSubshell={{ n: 5, l: 2, j: 2.5 }}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(container.querySelector('.subshell-j-note')!.textContent)
            .toBe('The lobes are the d orbitals\' shapes, sized by 5d⁵⁄₂\'s own radial function — a basis choice. '
                + 'A j-level mixes mₗ with spin, so its own states have other shapes.');
        // A shell with only d levels: no p½ example either.
        rerender(
            <SubshellPanel subshells={fifthShell.filter(s => s.l !== 1)} shellN={5} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(container.querySelector('.subshell-j-note')!.textContent)
            .toMatch(/ 5d³⁄₂ and 5d⁵⁄₂ overlap here; a j-level's own states have other shapes\.$/);
    });

    it('gives no caveat for a shell of s½ levels only', () => {
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(container.querySelector('.subshell-j-note')).not.toBeNull();
        const sOnly = leadLikeSpinOrbit().filter(s => s.l === 0);
        const { container: sContainer } = render(
            <SubshellPanel subshells={sOnly} shellN={6} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(sContainer.querySelector('.subshell-j-note')).toBeNull();
    });

    it('does not claim an s½ level looks different from its sphere', () => {
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={{ n: 6, l: 0, j: 0.5 }}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(container.querySelector('.subshell-j-note')).toBeNull();
    });

    it('gives j-level chips a name a screen reader can say', () => {
        const { getByRole } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(getByRole('button', { name: /^6p j = 3\/2, 1\.33 of 4 electrons, -0\.120 Ha orbital energy$/ })).toBeTruthy();
        expect(getByRole('button', { name: /^6p j = 1\/2,/ })).toBeTruthy();
        expect(getByRole('button', { name: /^6s j = 1\/2,/ })).toBeTruthy();
    });

    it('states the method on every energy', () => {
        const { container } = render(
            <SubshellPanel subshells={leadLikeSpinOrbit()} shellN={6} selectedSubshell={null}
                relativity="spinOrbit" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        const energies = Array.from(container.querySelectorAll('.subshell-chip-energy'));
        expect(energies).toHaveLength(3);
        for (const energy of energies) expect(energy.getAttribute('title')).toMatch(/Dirac/);
    });

    it('states the scalar method too', () => {
        const { container } = render(
            <SubshellPanel subshells={neonLikeSubshells()} shellN={2} selectedSubshell={null}
                relativity="scalar" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        const energies = Array.from(container.querySelectorAll('.subshell-chip-energy'));
        expect(energies).toHaveLength(2);
        for (const energy of energies) expect(energy.getAttribute('title')).toMatch(/Koelling–Harmon/);
    });

    it('leaves the non-relativistic panel exactly as it was', () => {
        const onSelectSubshell = jest.fn();
        const { container } = render(
            <SubshellPanel subshells={neonLikeSubshells()} shellN={2} selectedSubshell={{ n: 2, l: 1 }}
                onSelectSubshell={onSelectSubshell} onSelectOrbital={() => {}} />
        );
        const chips = container.querySelectorAll('.subshell-chip');
        expect(Array.from(chips).map(c => c.getAttribute('aria-label'))).toEqual([null, null]);
        expect(Array.from(chips).map(c => c.getAttribute('data-j'))).toEqual([null, null]);
        expect(container.querySelector('.subshell-chip-energy')!.getAttribute('title')).toBeNull();
        expect(container.querySelector('.subshell-j-note')).toBeNull();
        fireEvent.click(chips[0]);
        expect(onSelectSubshell).toHaveBeenCalledWith(2, 0);
        const { container: wholeShell } = render(
            <SubshellPanel subshells={neonLikeSubshells()} shellN={2} selectedSubshell={null}
                relativity="scalar" onSelectSubshell={() => {}} onSelectOrbital={() => {}} />
        );
        expect(wholeShell.querySelector('.subshell-j-note')).toBeNull();
    });

    it('formats electron counts', () => {
        expect(formatElectrons(2)).toBe('2');
        expect(formatElectrons(9 / 7)).toBe('1.29');
    });
});
