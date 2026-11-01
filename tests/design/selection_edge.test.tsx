import React from 'react';
import { render } from '@testing-library/react';
import { ListItemButton, MenuItem, ThemeProvider, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { quantumTheme } from '../../src/design/theme';
import { TEMPER_LEVELS, THEME_MODES, colorsAt } from '../../src/design/tokens';

// Brass Instrument Task 4 (selection audit): the MUI selected states wear the brass edge, not the tint alone. Built from
// the theme the app uses, rendered for real (emotion injects the rules into jsdom's document) and read back computed.

describe.each(THEME_MODES)('MUI selected states in %s', mode => {
    it.each(TEMPER_LEVELS)('%s: a selected toggle has the selected-edge border on all four sides, in a group too', level => {
        const edge = colorsAt(mode, level)['selected-edge'];
        const { getByRole } = render(
            <ThemeProvider theme={quantumTheme(mode, level)}>
                <ToggleButtonGroup exclusive value="b">
                    <ToggleButton value="a">A</ToggleButton>
                    <ToggleButton value="b">B</ToggleButton>
                    <ToggleButton value="c">C</ToggleButton>
                </ToggleButtonGroup>
            </ThemeProvider>,
        );
        const selected = getByRole('button', { name: 'B' });
        const style = window.getComputedStyle(selected);
        // The group makes every non-first button's left border transparent (to share the neighbour's); the selected one
        // takes its edge back, so its left side shows brass too.
        for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
            expect([side, style.getPropertyValue(`border-${side.toLowerCase()}-color`)]).toEqual([side, hexToRgb(edge)]);
        }
        expect(getByRole('button', { name: 'A' }).getAttribute('aria-pressed')).toBe('false');
        // jsdom does not model the group's own `.grouped:not(:first-of-type)` rule, so the override that wins over it in a
        // browser is pinned here as the theme says it (and checked live: the report's shot).
        const group = quantumTheme(mode, level).components!.MuiToggleButtonGroup!.styleOverrides!.root as Record<string, Record<string, unknown>>;
        expect(group['& .MuiToggleButtonGroup-grouped.Mui-selected:not(:first-of-type)']).toEqual({ borderColor: edge });
    });

    it('a selected list row and menu item carry an inset 2 px selected-edge marker', () => {
        const edge = colorsAt(mode, 'explore')['selected-edge'];
        const { getByRole } = render(
            <ThemeProvider theme={quantumTheme(mode)}>
                <ul><ListItemButton selected>Row</ListItemButton></ul>
                <ul><MenuItem selected>Item</MenuItem></ul>
            </ThemeProvider>,
        );
        for (const element of [getByRole('button', { name: 'Row' }), getByRole('menuitem', { name: 'Item' })]) {
            const shadow = window.getComputedStyle(element).boxShadow.replace(/\s+/g, ' ').toLowerCase();
            expect(shadow).toBe(`inset 2px 0 0 ${edge.toLowerCase()}`);
        }
    });
});

function hexToRgb(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
