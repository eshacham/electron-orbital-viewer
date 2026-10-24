import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import FirstViewHint from '../../src/shell/FirstViewHint';
import { hintPref } from '../../src/design/presentation';

afterEach(() => { window.localStorage.clear(); });

describe('FirstViewHint (Task 5, ruling P17)', () => {
    it('names how to explore the view, with a dismiss button', () => {
        render(<FirstViewHint />);
        const note = screen.getByRole('note');
        expect(note).toHaveTextContent('Drag to rotate · pick a shell to explore');
        expect(screen.getByRole('button', { name: 'Dismiss hint' })).toBeInTheDocument();
    });

    it('dismissing stores the pref, tells the caller, and takes the hint down', () => {
        const onDismiss = jest.fn();
        render(<FirstViewHint onDismiss={onDismiss} />);

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss hint' }));

        expect(hintPref.get()).toEqual({ rotateDismissed: true });
        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    it('renders nothing when the pref already says the hint was seen', () => {
        hintPref.set({ rotateDismissed: true });
        render(<FirstViewHint />);
        expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    // Spec §4.6-4.7: "nothing pulses, breathes or auto-rotates", and glows
    // aside this chip has none to begin with -- so there is no animation to
    // gate behind prefers-reduced-motion in the first place.
    it('never animates in', () => {
        render(<FirstViewHint />);
        const { animationName } = getComputedStyle(screen.getByRole('note'));
        expect(['none', '']).toContain(animationName);
    });
});

// 6G-2 Task 17 fix (Fail 1): centred on the free area, the hint ran into the scale readout (bottom-left) wherever the
// readout grew or the cell narrowed -- c-whole tablet 37 px, Pa desktop 10 px, Pa tablet 54 px. On a desktop or tablet
// it now stacks on the readout's own measured offset, as Molecules' label hint does (Task 14, review M7), and stops
// short of the right-hand zones the camera insets measure (key column, folded drawer). jsdom does no layout, so these
// pin the rules; shoot.mjs's `overlaps.hint` is the live proof (0 against every zone).
describe('FirstViewHint placement (Task 17 fix: never over the scale readout)', () => {
    const strip = (file: string) => readFileSync(resolve(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const css = strip('../../src/shell/first_view_hint.css');
    const rule = (source: string, selector: string) => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
        if (!match) throw new Error(`No rule for ${selector}`);
        return match[2];
    };
    const STACKED = 'calc(var(--scale-readout-bottom, 20px) + var(--scale-readout-height, 0px) + 8px)';

    it('on a desktop or tablet sits 8 px above the scale readout, on its left edge, and stops short of the right-hand zones', () => {
        const desktop = rule(css, '.app-shell:not(.phone) .first-view-hint');
        expect(desktop).toContain(`bottom: ${STACKED};`);
        expect(desktop).toMatch(/left:\s*calc\(var\(--free-left, 0px\) \+ 20px\);/);
        expect(desktop).toMatch(/transform:\s*none;/);
        expect(desktop).toMatch(/max-width:\s*calc\(100% - var\(--free-left, 0px\) - var\(--free-right, 0px\) - 32px\);/);
        // It may wrap inside that width rather than run under the key column.
        expect(desktop).toMatch(/white-space:\s*normal;/);
    });

    it('reads the same offset and left edge as the scale readout itself (style.css), so the two never drift apart', () => {
        const style = strip('../../src/style.css');
        const readout = rule(style, '.scale-readout');
        expect(readout).toMatch(/left:\s*calc\(var\(--free-left, 0px\) \+ 20px\);/);
        expect(readout).toMatch(/bottom:\s*var\(--scale-readout-bottom, 20px\);/);
    });

    it('while the canvas is busy on a desktop or tablet, clears the busy chip as well as the readout (D10)', () => {
        const busy = rule(css, '.app-shell:not(.phone) .viewport-cell:has(> .canvas-busy) .first-view-hint');
        expect(busy).toContain(`bottom: max(${STACKED}, calc(var(--free-bottom, 0px) + 12px + 44px));`);
    });

    it('on a phone keeps its own spot, centred above the sheet (the readout is at the top there)', () => {
        const phone = rule(css, '.first-view-hint');
        expect(phone).toMatch(/left:\s*var\(--free-center-x, 50%\);/);
        expect(phone).toMatch(/bottom:\s*calc\(var\(--free-bottom, 140px\) \+ 12px\);/);
    });
});
