import React from 'react';
import { act, render } from '@testing-library/react';
import PhoneHeader from '../../src/shell/PhoneHeader';

// Task 8 fix round 1 (I2): a phone header two lines tall (a long molecule name wrapping beside its tier chip) covered
// the scale readout under it. The header now measures itself, and the overlays under it sit at its bottom edge.
describe('PhoneHeader', () => {
    const originalObserver = (window as unknown as { ResizeObserver?: unknown }).ResizeObserver;
    let resized: (() => void) | null = null;
    beforeEach(() => {
        (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
            constructor(callback: () => void) { resized = callback; }
            observe() {}
            disconnect() {}
        };
    });
    afterEach(() => { (window as unknown as { ResizeObserver?: unknown }).ResizeObserver = originalObserver; resized = null; });

    const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });

    it('sets the viewport\'s --phone-overlay-top to its own bottom edge plus a gap, follows its height, and clears it', () => {
        const { container, unmount } = render(<main data-testid="viewport"><PhoneHeader><p>Sulfur hexafluoride</p></PhoneHeader></main>);
        const viewport = container.querySelector('main')!;
        const header = container.querySelector('.phone-header')!;
        viewport.getBoundingClientRect = () => box(0, 844);
        header.getBoundingClientRect = () => box(60, 127);
        act(() => resized!());
        expect(viewport.style.getPropertyValue('--phone-overlay-top')).toBe('135px');
        header.getBoundingClientRect = () => box(60, 95);
        act(() => resized!());
        expect(viewport.style.getPropertyValue('--phone-overlay-top')).toBe('103px');
        unmount();
        expect(viewport.style.getPropertyValue('--phone-overlay-top')).toBe('');
    });
});
