import React from 'react';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import LevelControl from '../../src/levels/LevelControl';
import { useLevel } from '../../src/levels/useLevel';
import { LEVEL_KEY, levelPref, raiseForVisit, clearVisit, visitLevel } from '../../src/levels/level_pref';

afterEach(() => {
    window.localStorage.clear();
    clearVisit();
});

describe('LevelControl (Task 2: the level switch)', () => {
    it('is a group named "Learning level" of four radios, Explore checked on a first visit', () => {
        render(<LevelControl variant="segmented" />);
        const group = screen.getByRole('radiogroup', { name: 'Learning level' });
        const radios = Array.from(group.querySelectorAll('[role="radio"]')).map(radio => radio.textContent);
        expect(radios).toEqual(['Basics', 'Explore', 'Advanced', 'Research']);
        expect(screen.getByRole('radio', { name: 'Explore' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: 'Basics' })).toHaveAttribute('aria-checked', 'false');
    });

    it('is one Tab stop: only the checked radio is in the tab order', () => {
        render(<LevelControl variant="segmented" />);
        expect(screen.getByRole('radio', { name: 'Explore' })).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('radio', { name: 'Research' })).toHaveAttribute('tabindex', '-1');
    });

    it('moves with the arrow keys, Home and End, checking the radio it lands on', () => {
        render(<LevelControl variant="segmented" />);
        const explore = screen.getByRole('radio', { name: 'Explore' });
        explore.focus();
        fireEvent.keyDown(explore, { key: 'ArrowRight' });
        const advanced = screen.getByRole('radio', { name: 'Advanced' });
        expect(advanced).toHaveAttribute('aria-checked', 'true');
        expect(advanced).toHaveFocus();
        fireEvent.keyDown(advanced, { key: 'ArrowLeft' });
        expect(screen.getByRole('radio', { name: 'Explore' })).toHaveFocus();
        fireEvent.keyDown(screen.getByRole('radio', { name: 'Explore' }), { key: 'End' });
        expect(screen.getByRole('radio', { name: 'Research' })).toHaveAttribute('aria-checked', 'true');
        fireEvent.keyDown(screen.getByRole('radio', { name: 'Research' }), { key: 'ArrowDown' });
        // Wraps, as a radio group does.
        expect(screen.getByRole('radio', { name: 'Basics' })).toHaveAttribute('aria-checked', 'true');
        fireEvent.keyDown(screen.getByRole('radio', { name: 'Basics' }), { key: 'Home' });
        expect(screen.getByRole('radio', { name: 'Basics' })).toHaveFocus();
    });

    it('stores the level chosen', () => {
        render(<LevelControl variant="segmented" />);
        fireEvent.click(screen.getByRole('radio', { name: 'Advanced' }));
        expect(window.localStorage.getItem(LEVEL_KEY)).toBe('advanced');
        expect(screen.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('aria-checked', 'true');
    });

    it('shows a visit raise as the level in use, and a choice ends the raise', () => {
        act(() => raiseForVisit('advanced'));
        render(<LevelControl variant="segmented" />);
        expect(screen.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByRole('radio', { name: 'Explore' }));
        expect(visitLevel()).toBeNull();
        expect(screen.getByRole('radio', { name: 'Explore' })).toHaveAttribute('aria-checked', 'true');
    });

    it('the phone menu variant is the same group, laid out as a list', () => {
        render(<LevelControl variant="menu" />);
        const group = screen.getByRole('radiogroup', { name: 'Learning level' });
        expect(group).toHaveClass('level-control-menu');
        fireEvent.click(screen.getByRole('radio', { name: 'Research' }));
        expect(levelPref.get()).toBe('research');
    });
});

describe('LevelControl, compact (below 1024 px)', () => {
    // Fix round 1 (M4): it opens a dialog holding the radios, and focus lands on the level in use.
    it('says it opens a dialog, and puts focus on the checked level when it does', () => {
        render(<LevelControl variant="compact" />);
        const button = screen.getByRole('button', { name: 'Learning level: Explore' });
        expect(button).toHaveAttribute('aria-haspopup', 'dialog');
        fireEvent.click(button);
        expect(screen.getByRole('radio', { name: 'Explore' })).toHaveFocus();
    });

    it('is one button naming the level, opening the four radios', () => {
        render(<LevelControl variant="compact" />);
        const button = screen.getByRole('button', { name: 'Learning level: Explore' });
        expect(button).toHaveTextContent('Explore');
        fireEvent.click(button);
        fireEvent.click(screen.getByRole('radio', { name: 'Advanced' }));
        expect(levelPref.get()).toBe('advanced');
        // The list stays open (the arrow keys choose as they move); the button behind it already names the choice.
        expect(screen.getByRole('button', { name: 'Learning level: Advanced', hidden: true })).toBeInTheDocument();
    });
});

describe('useLevel', () => {
    it('is the stored level, raised for the visit when a link needs more', () => {
        levelPref.set('basics');
        const { result } = renderHook(() => useLevel());
        expect(result.current).toMatchObject({ level: 'basics', stored: 'basics', raised: false });
        act(() => raiseForVisit('advanced'));
        expect(result.current).toMatchObject({ level: 'advanced', stored: 'basics', raised: true });
    });

    it('is not raised by a visit level at or below the stored one', () => {
        levelPref.set('research');
        act(() => raiseForVisit('advanced'));
        const { result } = renderHook(() => useLevel());
        expect(result.current).toMatchObject({ level: 'research', raised: false });
    });

    it('setLevel stores the level and ends the visit raise', () => {
        act(() => raiseForVisit('advanced'));
        const { result } = renderHook(() => useLevel());
        act(() => result.current.setLevel('advanced'));
        expect(levelPref.get()).toBe('advanced');
        expect(visitLevel()).toBeNull();
        expect(result.current).toMatchObject({ level: 'advanced', stored: 'advanced', raised: false });
    });
});
