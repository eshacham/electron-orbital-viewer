import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import SubshellPanel from '../../src/components/SubshellPanel';
import { SerialisedSubshell } from '../../src/workers/atomWorker';

/** A neon-shaped list of subshells: 1s (n=1), 2s and 2p (n=2). */
function neonLikeSubshells(): SerialisedSubshell[] {
    const curve = (): Float64Array => new Float64Array(4);
    const R = (): Float64Array => new Float64Array(4);
    return [
        { n: 1, l: 0, electrons: 2, energy: -30.0, curve: curve(), R: R(), samplingRadius: 1 },
        { n: 2, l: 0, electrons: 2, energy: -1.3, curve: curve(), R: R(), samplingRadius: 5 },
        { n: 2, l: 1, electrons: 6, energy: -0.5, curve: curve(), R: R(), samplingRadius: 6 },
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
            { n: 2, l: 0, electrons: 2, energy: -1.0, curve: new Float64Array(4), R: new Float64Array(4), samplingRadius: 5 },
            { n: 2, l: 1, electrons: 2, energy: -0.5, curve: new Float64Array(4), R: new Float64Array(4), samplingRadius: 6 },
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

    it('reads the radial-distribution legend as D(r) = 4πr²ρ(r), never "density"', () => {
        const { getByText } = render(
            <SubshellPanel
                subshells={neonLikeSubshells()}
                shellN={2}
                selectedSubshell={null}
                onSelectSubshell={() => {}}
                onSelectOrbital={() => {}}
            />
        );
        expect(getByText(/radial distribution d\(r\) = 4πr²ρ\(r\)/i)).toBeInTheDocument();
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
});
