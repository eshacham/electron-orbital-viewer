import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { useQuantumTheme } from '../../src/design/useQuantumTheme';

/** A matchMedia whose prefers-color-scheme answer the test can change, with its listeners. */
function controllableMedia(light: boolean) {
    const listeners = new Set<() => void>();
    let matches = light;
    window.matchMedia = ((query: string) => ({
        get matches() { return query.includes('prefers-color-scheme: light') ? matches : false; },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })) as unknown as typeof window.matchMedia;
    return { setLight(next: boolean) { matches = next; listeners.forEach(l => l()); } };
}

function Probe() {
    const { mode, choice, setChoice } = useQuantumTheme();
    return (
        <div>
            <span data-testid="mode">{mode}</span><span data-testid="choice">{choice}</span>
            <button onClick={() => setChoice('dark')}>dark</button>
        </div>
    );
}

afterEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('useQuantumTheme (spec §6.1, §6.3)', () => {
    it('follows the system live while nothing is chosen', () => {
        const media = controllableMedia(false);
        render(<Probe />);
        expect(screen.getByTestId('mode')).toHaveTextContent('dark');
        expect(screen.getByTestId('choice')).toHaveTextContent('system');
        act(() => media.setLight(true));
        expect(screen.getByTestId('mode')).toHaveTextContent('light');
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('keeps an explicit choice whatever the system says', () => {
        const media = controllableMedia(true);
        render(<Probe />);
        act(() => screen.getByText('dark').click());
        expect(window.localStorage.getItem('eov.theme')).toBe('dark');
        act(() => media.setLight(true));
        expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    });

    it('follows another tab through the storage event', () => {
        controllableMedia(false);
        render(<Probe />);
        act(() => {
            window.localStorage.setItem('eov.theme', 'light');
            window.dispatchEvent(new StorageEvent('storage', { key: 'eov.theme', newValue: 'light' }));
        });
        expect(screen.getByTestId('mode')).toHaveTextContent('light');
    });
});
