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

    it('on a phone held upright, counts the full-width navigation card as the top and the open sheet as the bottom', () => {
        const root = layout({ width: 390, height: 844 }, {
            '.level-nav': { left: 8, right: 382, top: 8, bottom: 235, width: 374, height: 227 },
            '#controls.open': { left: 0, right: 390, top: 540, bottom: 844, width: 390, height: 304 },
            // Small corner overlays do not count.
            '.scale-readout': { left: 12, right: 117, top: 270, bottom: 310, width: 105, height: 40 },
        });
        expect(measureViewInsets(root, true)).toEqual({ top: 235, right: 0, bottom: 304, left: 0 });
    });

    it('on a phone turned sideways, counts the navigation column as the left', () => {
        const root = layout({ width: 844, height: 390 }, {
            '.level-nav': { left: 8, right: 428, top: 8, bottom: 125, width: 420, height: 117 },
        });
        expect(measureViewInsets(root, true)).toEqual({ top: 0, right: 0, bottom: 0, left: 428 });
    });

    it('ignores a closed sheet', () => {
        const root = layout({ width: 390, height: 844 }, {
            '#controls.closed': { left: 0, right: 390, top: 844, bottom: 1150, width: 390, height: 306 },
        });
        expect(measureViewInsets(root, true).bottom).toBe(0);
    });
});
