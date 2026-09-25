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
    it('on a desktop, keeps the atom clear of the side panel, the view panel and the table', () => {
        const root = layout({ width: 1440, height: 900 }, {
            '.side-panel': { left: 20, right: 360, top: 20, bottom: 700, width: 340, height: 680 },
            '.view-panel': { left: 1100, right: 1420, top: 20, bottom: 760, width: 320, height: 740 },
            '.periodic-table-panel': { left: 434, right: 1006, top: 20, bottom: 70, width: 572, height: 50 },
        });
        expect(measureViewInsets(root, false)).toEqual({ top: 70, right: 340, bottom: 0, left: 360 });
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
