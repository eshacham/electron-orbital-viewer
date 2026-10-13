import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import LevelNav from '../../src/components/LevelNav';
import SubshellPanel from '../../src/components/SubshellPanel';
import { neonProfile } from '../export/fixtures';

describe('chip groups take the arrow keys and are one Tab stop (spec §13)', () => {
    it('the shells', () => {
        render(<LevelNav Z={10} selectedShell={2} selectedSubshell={null} selectedOrbital={null} onNavigate={jest.fn()} variant="configuration" />);
        const chips = within(screen.getByRole('group', { name: 'shells' })).getAllByRole('button').filter(b => b.classList.contains('level-nav-shell-chip'));
        expect(chips.map(chip => chip.tabIndex)).toEqual([-1, 0]);
        chips[1].focus();
        fireEvent.keyDown(chips[1], { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(chips[0]);
    });

    it('the subshells and the mₗ row', () => {
        const profile = neonProfile();
        render(<SubshellPanel subshells={profile.subshells} shellN={2} selectedSubshell={{ n: 2, l: 1 }} selectedOrbital={{ n: 2, l: 1, ml: 0 }}
            onSelectSubshell={jest.fn()} onSelectOrbital={jest.fn()} part="chips" />);
        const row = screen.getByRole('group', { name: 'magnetic quantum number' });
        const buttons = within(row).getAllByRole('button');
        expect(buttons.map(button => button.tabIndex)).toEqual([-1, 0, -1]);
        buttons[1].focus();
        fireEvent.keyDown(buttons[1], { key: 'ArrowRight' });
        expect(document.activeElement).toBe(buttons[2]);
        const chips = within(screen.getByRole('group', { name: 'subshells in this shell' })).getAllByRole('button');
        expect(chips.filter(chip => chip.tabIndex === 0)).toHaveLength(1);
    });

    // Ruling DX2: at shell level the panel mounts with no subshell picked, so the mₗ row
    // appears only later -- roving focus has to attach to it then, not just at mount.
    it('the mₗ row that mounts only after a subshell is picked', () => {
        const profile = neonProfile();
        const props = { subshells: profile.subshells, shellN: 2, onSelectSubshell: jest.fn(), onSelectOrbital: jest.fn(), part: 'chips' as const };
        const { rerender } = render(<SubshellPanel {...props} selectedSubshell={null} selectedOrbital={null} />);
        expect(screen.queryByRole('group', { name: 'magnetic quantum number' })).toBeNull();
        rerender(<SubshellPanel {...props} selectedSubshell={{ n: 2, l: 1 }} selectedOrbital={{ n: 2, l: 1, ml: 0 }} />);
        const buttons = within(screen.getByRole('group', { name: 'magnetic quantum number' })).getAllByRole('button');
        expect(buttons.map(button => button.tabIndex)).toEqual([-1, 0, -1]);
        buttons[1].focus();
        fireEvent.keyDown(buttons[1], { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(buttons[0]);
        fireEvent.keyDown(buttons[0], { key: 'End' });
        expect(document.activeElement).toBe(buttons[2]);
    });
});
