import React from 'react';
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
