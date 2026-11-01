import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useTheme } from '@mui/material/styles';
import ViewerRoot from '../../src/ViewerRoot';
import { useLevel } from '../../src/levels/useLevel';
import { LEVEL_KEY, clearVisit, levelPref, setVisitLevel } from '../../src/levels/level_pref';
import { themeChoicePref } from '../../src/design/theme_storage';

/** Brass Instrument Task 1: the effective learning level tempers the chrome through data-level and the MUI theme. */
afterEach(() => {
    act(() => { clearVisit(); themeChoicePref.set('system'); });
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-level');
    document.documentElement.removeAttribute('data-theme');
});

describe('useLevel keeps data-level on the document (Brass Instrument)', () => {
    it('sets data-level to the level in use, and updates it when the level changes', () => {
        const { result } = renderHook(() => useLevel());
        expect(document.documentElement.dataset.level).toBe('explore');
        act(() => result.current.setLevel('research'));
        expect(document.documentElement.dataset.level).toBe('research');
        act(() => result.current.setLevel('basics'));
        expect(document.documentElement.dataset.level).toBe('basics');
    });

    it('follows a link\'s visit level, and leaves the stored level alone', () => {
        window.localStorage.setItem(LEVEL_KEY, 'basics');
        renderHook(() => useLevel());
        expect(document.documentElement.dataset.level).toBe('basics');
        act(() => setVisitLevel('advanced'));
        expect(document.documentElement.dataset.level).toBe('advanced');
        expect(window.localStorage.getItem(LEVEL_KEY)).toBe('basics');
        expect(levelPref.get()).toBe('basics');
        // The link ends: back to the viewer's own level.
        act(() => clearVisit());
        expect(document.documentElement.dataset.level).toBe('basics');
    });
});

describe('ViewerRoot (the viewer\'s MUI theme follows the effective level)', () => {
    function Probe() {
        const theme = useTheme();
        return <span data-testid="primary">{theme.palette.primary.main}</span>;
    }

    it('tempers palette.primary to the stored level, and to a link\'s visit level without storing it', () => {
        themeChoicePref.set('dark');
        render(<ViewerRoot><Probe /></ViewerRoot>);
        expect(screen.getByTestId('primary')).toHaveTextContent('#C4A15A'); // Explore
        act(() => levelPref.set('research'));
        expect(screen.getByTestId('primary')).toHaveTextContent('#B8A87C');
        act(() => setVisitLevel('basics'));
        expect(screen.getByTestId('primary')).toHaveTextContent('#DAAA54');
        expect(document.documentElement.dataset.level).toBe('basics');
        expect(window.localStorage.getItem(LEVEL_KEY)).toBe('research');
    });
});
