import { measureViewInsets } from '../src/useViewInsets';

/** A container with children at fixed rectangles, since jsdom does no layout. */
function layout(container: { width: number; height: number }, children: Record<string, Partial<DOMRect>>): HTMLElement {
    const root = document.createElement('div');
    const rect = (r: Partial<DOMRect>) => ({
        left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...r,
    } as DOMRect);
    root.getBoundingClientRect = () => rect({ right: container.width, bottom: container.height, ...container });
    for (const [selector, r] of Object.entries(children)) {
        const child = document.createElement('div');
        if (selector.startsWith('#')) {
            const [id, ...classes] = selector.slice(1).split('.');
            child.id = id;
            child.className = classes.join(' ');
        } else {
            child.className = selector.slice(1);
        }
        child.getBoundingClientRect = () => rect(r);
        root.appendChild(child);
    }
    return root;
}

describe('measureViewInsets', () => {
    it('on a desktop, keeps the object clear of every overlay zone of the viewport frame (spec §8.5)', () => {
        const root = layout({ width: 711, height: 820 }, {
            '.viewport-title': { left: 12, right: 330, top: 12, bottom: 76, width: 318, height: 64 },
            '.viewport-toolbar': { left: 495, right: 699, top: 12, bottom: 48, width: 204, height: 36 },
            '.key-column': { left: 640, right: 699, top: 300, bottom: 520, width: 59, height: 220 },
            '.thumbnail-strip': { left: 12, right: 699, top: 700, bottom: 808, width: 687, height: 108 },
        });
        expect(measureViewInsets(root, false)).toEqual({ top: 76, right: 71, bottom: 120, left: 0 });
    });

    // Ruling T20c-ptable-inset changes this test: the periodic table is no longer counted (the drawer still is).
    it('counts the inspector drawer, folded or open, but not the periodic table', () => {
        const root = layout({ width: 900, height: 700 }, {
            '.periodic-table-panel': { left: 12, right: 584, top: 12, bottom: 262, width: 572, height: 250 },
            '.inspector-drawer': { left: 566, right: 900, top: 0, bottom: 700, width: 334, height: 700 },
        });
        expect(measureViewInsets(root, false)).toEqual({ top: 0, right: 334, bottom: 0, left: 0 });
    });

    // Ruling T20c-ptable-inset: the table is a transient picker, not a §3.6 overlay zone, so opening it
    // measures the same insets as before -- setViewInsets then has nothing to change, and the camera stays put.
    it('measures the same insets with the periodic table open as with it closed', () => {
        const zones = {
            '.viewport-title': { left: 12, right: 330, top: 12, bottom: 76, width: 318, height: 64 },
            '.viewport-toolbar': { left: 495, right: 699, top: 12, bottom: 48, width: 204, height: 36 },
            '.thumbnail-strip': { left: 12, right: 699, top: 700, bottom: 808, width: 687, height: 108 },
        };
        const closed = measureViewInsets(layout({ width: 711, height: 820 }, zones), false);
        const open = measureViewInsets(layout({ width: 711, height: 820 }, {
            ...zones,
            '.periodic-table-panel': { left: 12, right: 584, top: 12, bottom: 358, width: 572, height: 346 },
        }), false);
        expect(open).toEqual(closed);
    });

    // Ruling T16-d, kept: Molecules' key stack along the bottom.
    it('on a desktop, keeps the molecule clear of the legend stack along the bottom', () => {
        const root = layout({ width: 711, height: 820 }, {
            '.molecule-legend-stack': { left: 120, right: 580, top: 640, bottom: 808, width: 460, height: 168 },
        });
        expect(measureViewInsets(root, false)).toEqual({ top: 0, right: 0, bottom: 180, left: 0 });
    });

    // The docked panels are siblings of the viewport now (spec §8.5: "the side-panel and view-panel selectors go").
    it('ignores a side or view panel, which no longer sits over the canvas', () => {
        const root = layout({ width: 711, height: 820 }, { '.side-panel': { left: 0, right: 315, top: 0, bottom: 820, width: 315, height: 820 } });
        expect(measureViewInsets(root, false)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('on a phone, counts the top bar and the header line below it (spec §9.8)', () => {
        const root = layout({ width: 390, height: 844 }, {
            '.phone-topbar': { left: 0, right: 390, top: 0, bottom: 52, width: 390, height: 52 },
            '.phone-header': { left: 8, right: 382, top: 60, bottom: 104, width: 374, height: 44 },
            '.phone-sheet': { left: 0, right: 390, top: 796, bottom: 844, width: 390, height: 48 },
        });
        expect(measureViewInsets(root, true)).toEqual({ top: 104, right: 0, bottom: 48, left: 0 });
    });

    it('on a phone held upright, counts the header as the top and the sheet as the bottom', () => {
        const root = layout({ width: 390, height: 844 }, {
            '.phone-header': { left: 8, right: 382, top: 8, bottom: 52, width: 374, height: 44 },
            '.phone-sheet': { left: 0, right: 390, top: 500, bottom: 844, width: 390, height: 344 },
        });
        expect(measureViewInsets(root, true)).toEqual({ top: 52, right: 0, bottom: 344, left: 0 });
    });

    it('on a phone turned sideways, counts the sheet docked down the right', () => {
        const root = layout({ width: 844, height: 390 }, {
            '.phone-header': { left: 8, right: 440, top: 8, bottom: 52, width: 432, height: 44 },
            '.phone-sheet': { left: 456, right: 844, top: 8, bottom: 390, width: 388, height: 382 },
        });
        expect(measureViewInsets(root, true)).toEqual({ top: 52, right: 388, bottom: 0, left: 0 });
    });

    it('counts only the tab bar of a folded sheet', () => {
        const root = layout({ width: 390, height: 844 }, {
            '.phone-sheet': { left: 0, right: 390, top: 796, bottom: 844, width: 390, height: 48 },
        });
        expect(measureViewInsets(root, true).bottom).toBe(48);
    });
});
