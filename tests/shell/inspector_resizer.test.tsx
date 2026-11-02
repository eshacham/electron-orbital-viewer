import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AppShell from '../../src/shell/AppShell';
import { clampInspectorWidth, inspectorMaxWidth } from '../../src/shell/InspectorResizer';
import { inspectorWidthPref } from '../../src/design/presentation';
import { createAppStore } from '../../src/store';
import { encodeStateOf, registerBuiltInUrlKeys, resetUrlKeysForTests } from '../../src/url_state';

const viewport = <main id="canvas-container" tabIndex={-1} aria-label="3D view">canvas</main>;
const inspector = <aside aria-label="Inspector">inspector</aside>;
const shell = (layout: 'desktop' | 'medium' | 'phone' = 'desktop', wide = false) =>
    <AppShell layout={layout} wide={wide} explore={<p>explore</p>} inspector={inspector} viewport={viewport} />;
const separator = () => screen.getByRole('separator', { name: 'Resize the right panel' });
const workspaceWidth = (container: HTMLElement) =>
    (container.querySelector('.app-workspace') as HTMLElement).style.getPropertyValue('--inspector-width');

function setViewport(width: number) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

describe('the right panel can be widened (panel fixes, P2)', () => {
    // jsdom has no PointerEvent; a MouseEvent with a pointerId is all the separator reads (as potential_curve_plot.test.tsx).
    const originalPointerEvent = (window as { PointerEvent?: unknown }).PointerEvent;
    beforeAll(() => {
        (window as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {
            pointerId: number;
            constructor(type: string, init: PointerEventInit = {}) {
                super(type, init);
                this.pointerId = init.pointerId ?? 1;
            }
        };
    });
    afterAll(() => { (window as { PointerEvent?: unknown }).PointerEvent = originalPointerEvent; });
    beforeEach(() => setViewport(1492));
    afterEach(() => { window.localStorage.clear(); document.body.style.userSelect = ''; });

    // Review Focus 2: dragging past the limits, or a viewport narrowed after a wide drag.
    it('clamps to [290, min(560, 45 % of the viewport, what leaves the canvas 520 px)]', () => {
        expect(clampInspectorWidth(200, 1500)).toBe(290);
        expect(clampInspectorWidth(9999, 1500)).toBe(560);
        expect(clampInspectorWidth(400.4, 1500)).toBe(400);
        // Ruling T2-max: 1300 - (315 + 4 x 12) - 520 = 417 (45 % would allow 585).
        expect(clampInspectorWidth(9999, 1300)).toBe(417);
        expect(clampInspectorWidth(9999, 1492)).toBe(560);
        // 45 % of the viewport (450 at 1000) is the spec's own bound; below the docked layout the canvas rule is under the minimum.
        expect(inspectorMaxWidth(1000)).toBe(290);
        // Never under the token minimum, whatever the viewport.
        expect(clampInspectorWidth(9999, 800)).toBe(290);
    });

    it('is a named, focusable vertical separator with its limits in px', () => {
        render(shell());
        expect(separator()).toHaveAttribute('aria-orientation', 'vertical');
        expect(separator()).toHaveAttribute('aria-valuemin', '290');
        // 0.45 x 1492 = 671 -> the 560 cap.
        expect(separator()).toHaveAttribute('aria-valuemax', '560');
        expect(separator()).toHaveAttribute('aria-valuenow', '290');
        expect(separator()).toHaveAttribute('tabindex', '0');
    });

    it('reads 320 when wide, and the default writes no variable to the grid', () => {
        const { container } = render(shell('desktop', true));
        expect(separator()).toHaveAttribute('aria-valuenow', '320');
        expect(workspaceWidth(container)).toBe('');
    });

    it('moves 16 px with the arrows -- left widens, right narrows -- and Home/End go to the limits', () => {
        const { container } = render(shell());
        fireEvent.keyDown(separator(), { key: 'ArrowLeft' });
        expect(separator()).toHaveAttribute('aria-valuenow', '306');
        expect(workspaceWidth(container)).toBe('306px');
        fireEvent.keyDown(separator(), { key: 'ArrowLeft' });
        expect(separator()).toHaveAttribute('aria-valuenow', '322');
        fireEvent.keyDown(separator(), { key: 'ArrowRight' });
        expect(separator()).toHaveAttribute('aria-valuenow', '306');
        fireEvent.keyDown(separator(), { key: 'End' });
        expect(separator()).toHaveAttribute('aria-valuenow', '560');
        fireEvent.keyDown(separator(), { key: 'ArrowLeft' });
        expect(separator()).toHaveAttribute('aria-valuenow', '560');
        fireEvent.keyDown(separator(), { key: 'Home' });
        expect(separator()).toHaveAttribute('aria-valuenow', '290');
        fireEvent.keyDown(separator(), { key: 'ArrowRight' });
        expect(separator()).toHaveAttribute('aria-valuenow', '290');
    });

    it('drags from the pointer: the width follows the x, the page cannot select text meanwhile, and release restores it', () => {
        render(shell());
        document.body.style.userSelect = 'text';
        const capture = jest.fn();
        (separator() as HTMLElement).setPointerCapture = capture;
        fireEvent.pointerDown(separator(), { pointerId: 1, button: 0, clientX: 1000 });
        expect(capture).toHaveBeenCalledWith(1);
        expect(document.body.style.userSelect).toBe('none');
        fireEvent.pointerMove(separator(), { pointerId: 1, clientX: 800 });
        expect(separator()).toHaveAttribute('aria-valuenow', '490');
        // The width is a local draft while the pointer is down; the pref is written once, on release.
        expect(inspectorWidthPref.get()).toBeNull();
        fireEvent.pointerMove(separator(), { pointerId: 1, clientX: 100 });
        expect(separator()).toHaveAttribute('aria-valuenow', '560');
        fireEvent.pointerMove(separator(), { pointerId: 1, clientX: 1000 });
        expect(separator()).toHaveAttribute('aria-valuenow', '290');
        fireEvent.pointerMove(separator(), { pointerId: 1, clientX: 900 });
        fireEvent.pointerUp(separator(), { pointerId: 1, clientX: 900 });
        expect(document.body.style.userSelect).toBe('text');
        expect(inspectorWidthPref.get()).toBe(390);
        // After release a move is a hover, not a drag.
        fireEvent.pointerMove(separator(), { pointerId: 1, clientX: 700 });
        expect(separator()).toHaveAttribute('aria-valuenow', '390');
    });

    describe('a drag ends cleanly, however it ends, and belongs to one pointer', () => {
        const start = () => {
            document.body.style.userSelect = 'text';
            const view = render(shell());
            fireEvent.pointerDown(separator(), { pointerId: 7, button: 0, clientX: 1000 });
            fireEvent.pointerMove(separator(), { pointerId: 7, clientX: 900 });
            expect(document.body.style.userSelect).toBe('none');
            expect(separator()).toHaveAttribute('aria-valuenow', '390');
            return view;
        };
        const ended = () => {
            expect(document.body.style.userSelect).toBe('text');
            // No drag any more: a move changes nothing.
            fireEvent.pointerMove(separator(), { pointerId: 7, clientX: 500 });
            expect(separator()).toHaveAttribute('aria-valuenow', '390');
            expect(inspectorWidthPref.get()).toBe(390);
        };

        it('on pointercancel', () => {
            start();
            fireEvent.pointerCancel(separator(), { pointerId: 7 });
            ended();
        });

        it('on lostpointercapture', () => {
            start();
            fireEvent(separator(), new window.PointerEvent('lostpointercapture', { bubbles: true, pointerId: 7 } as PointerEventInit));
            ended();
        });

        it('on unmount mid-drag', () => {
            const view = start();
            view.unmount();
            expect(document.body.style.userSelect).toBe('text');
            expect(inspectorWidthPref.get()).toBe(390);
        });

        it('ignores a second pointer: it neither starts nor moves nor ends the drag', () => {
            start();
            fireEvent.pointerDown(separator(), { pointerId: 8, button: 0, clientX: 300 });
            fireEvent.pointerMove(separator(), { pointerId: 8, clientX: 100 });
            expect(separator()).toHaveAttribute('aria-valuenow', '390');
            fireEvent.pointerUp(separator(), { pointerId: 8, clientX: 100 });
            expect(document.body.style.userSelect).toBe('none');
            expect(inspectorWidthPref.get()).toBeNull();
            // The owner still moves it, and its release is what ends it.
            fireEvent.pointerMove(separator(), { pointerId: 7, clientX: 800 });
            expect(separator()).toHaveAttribute('aria-valuenow', '490');
            fireEvent.pointerUp(separator(), { pointerId: 7 });
            expect(document.body.style.userSelect).toBe('text');
            expect(inspectorWidthPref.get()).toBe(490);
        });

        it('does not store anything for a press with no move', () => {
            render(shell());
            fireEvent.pointerDown(separator(), { pointerId: 7, button: 0, clientX: 1000 });
            fireEvent.pointerUp(separator(), { pointerId: 7, clientX: 1000 });
            expect(inspectorWidthPref.get()).toBeNull();
            expect(document.body.style.userSelect).toBe('');
        });
    });

    it('leaves a modified arrow to the browser (Alt+Left is history back)', () => {
        render(shell());
        for (const modifier of [{ altKey: true }, { metaKey: true }, { ctrlKey: true }]) {
            const notPrevented = fireEvent.keyDown(separator(), { key: 'ArrowLeft', ...modifier });
            expect(notPrevented).toBe(true);
        }
        fireEvent.keyDown(separator(), { key: 'Home', metaKey: true });
        expect(inspectorWidthPref.get()).toBeNull();
        expect(separator()).toHaveAttribute('aria-valuenow', '290');
    });

    it('names the inspector it resizes', () => {
        render(shell());
        expect(separator()).toHaveAttribute('aria-controls', 'inspector-panel');
    });

    it('goes back to the default (null) on a double click', () => {
        render(shell());
        fireEvent.keyDown(separator(), { key: 'End' });
        expect(inspectorWidthPref.get()).toBe(560);
        fireEvent.doubleClick(separator());
        expect(inspectorWidthPref.get()).toBeNull();
        expect(window.localStorage.getItem('eov.inspectorWidth')).toBeNull();
        expect(separator()).toHaveAttribute('aria-valuenow', '290');
    });

    it('remembers the width in eov.inspectorWidth, and a reload restores it', () => {
        const first = render(shell());
        fireEvent.keyDown(separator(), { key: 'ArrowLeft' });
        expect(window.localStorage.getItem('eov.inspectorWidth')).toBe('306');
        first.unmount();
        const { container } = render(shell());
        expect(separator()).toHaveAttribute('aria-valuenow', '306');
        expect(workspaceWidth(container)).toBe('306px');
    });

    it('clamps a stored width for display when the window is narrowed, without rewriting the pref until it moves', () => {
        act(() => inspectorWidthPref.set(560));
        const { container } = render(shell());
        expect(separator()).toHaveAttribute('aria-valuenow', '560');
        // The 560 cap holds down to 1443 px (the canvas rule: vw - 883 = 560); the docked layout starts at 1290.
        act(() => { setViewport(1450); window.dispatchEvent(new Event('resize')); });
        expect(separator()).toHaveAttribute('aria-valuemax', '560');
        act(() => { setViewport(1300); window.dispatchEvent(new Event('resize')); });
        expect(separator()).toHaveAttribute('aria-valuemax', '417');
        expect(separator()).toHaveAttribute('aria-valuenow', '417');
        expect(workspaceWidth(container)).toBe('417px');
        // Not rewritten: widening the window gives the stored 560 back, and a move starts from what was shown.
        expect(inspectorWidthPref.get()).toBe(560);
        fireEvent.keyDown(separator(), { key: 'ArrowRight' });
        expect(inspectorWidthPref.get()).toBe(401);
        act(() => { setViewport(1492); window.dispatchEvent(new Event('resize')); });
        expect(separator()).toHaveAttribute('aria-valuemax', '560');
        expect(separator()).toHaveAttribute('aria-valuenow', '401');
    });

    it('ignores a non-finite or non-numeric stored value', () => {
        window.localStorage.setItem('eov.inspectorWidth', '"wide"');
        render(shell());
        expect(separator()).toHaveAttribute('aria-valuenow', '290');
    });

    it('is absent at medium width and on a phone, and they ignore the stored width', () => {
        inspectorWidthPref.set(500);
        const { container, rerender } = render(shell('medium'));
        expect(screen.queryByRole('separator')).toBeNull();
        expect(workspaceWidth(container)).toBe('');
        rerender(shell('phone'));
        expect(screen.queryByRole('separator')).toBeNull();
        expect(workspaceWidth(container)).toBe('');
    });

    it('is not drawn in fullscreen, where the panel is hidden', () => {
        render(<AppShell layout="desktop" fullscreen explore={<p>explore</p>} inspector={inspector} viewport={viewport} />);
        expect(screen.queryByRole('separator')).toBeNull();
    });

    it('never reaches a link: encodeStateOf is byte-identical before and after a resize', () => {
        resetUrlKeysForTests();
        registerBuiltInUrlKeys();
        const store = createAppStore();
        const before = encodeStateOf(store.getState());
        render(shell());
        fireEvent.keyDown(separator(), { key: 'End' });
        fireEvent.keyDown(separator(), { key: 'ArrowRight' });
        expect(encodeStateOf(store.getState())).toBe(before);
        expect(before).not.toMatch(/inspector|width/i);
    });
});
