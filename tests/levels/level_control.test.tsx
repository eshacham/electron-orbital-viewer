import React from 'react';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import LevelControl from '../../src/levels/LevelControl';
import { useLevel } from '../../src/levels/useLevel';
import { LEVEL_KEY, levelPref, setVisitLevel, clearVisit, visitLevel } from '../../src/levels/level_pref';

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

    // Final review I1: raiseForVisit became setVisitLevel (a link sets the visit level both ways).
    it('shows a visit raise as the level in use, and a choice ends the raise', () => {
        act(() => setVisitLevel('advanced'));
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

// Final review I1 (ruled): a link sets the visit level both ways -- `raised` became `visiting` (the visit differs from
// the stored level), raiseForVisit became setVisitLevel, and a visit below the stored level is now in use too.
describe('useLevel', () => {
    it('is the stored level, or the level a link set for the visit', () => {
        levelPref.set('basics');
        const { result } = renderHook(() => useLevel());
        expect(result.current).toMatchObject({ level: 'basics', stored: 'basics', visiting: false });
        act(() => setVisitLevel('advanced'));
        expect(result.current).toMatchObject({ level: 'advanced', stored: 'basics', visiting: true });
    });

    it('uses a visit level below the stored one too', () => {
        levelPref.set('research');
        act(() => setVisitLevel('basics'));
        const { result } = renderHook(() => useLevel());
        expect(result.current).toMatchObject({ level: 'basics', stored: 'research', visiting: true, asked: null });
    });

    it('names the lvl a link asked for when its view needed more', () => {
        act(() => setVisitLevel('advanced', 'basics'));
        const { result } = renderHook(() => useLevel());
        expect(result.current).toMatchObject({ level: 'advanced', stored: 'explore', visiting: true, asked: 'basics' });
    });

    it('is not a visit when the link\'s level is the stored one', () => {
        levelPref.set('advanced');
        act(() => setVisitLevel('advanced'));
        const { result } = renderHook(() => useLevel());
        expect(result.current).toMatchObject({ level: 'advanced', visiting: false });
    });

    it('setLevel stores the level and ends the visit', () => {
        act(() => setVisitLevel('advanced'));
        const { result } = renderHook(() => useLevel());
        act(() => result.current.setLevel('advanced'));
        expect(levelPref.get()).toBe('advanced');
        expect(visitLevel()).toBeNull();
        expect(result.current).toMatchObject({ level: 'advanced', stored: 'advanced', visiting: false });
    });
});
