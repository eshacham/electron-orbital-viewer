// tests/shell/use_group_peek.test.tsx -- Task 5b (picture control, finish fix 8): at a group-snapped rest on the
// desktop, n = 9's 9g filled the strip exactly, so the right fade fell on its own last tile and nothing of 9h showed:
// "more" was only faded, never seen. A group whose rest would end that way snaps a little further on (a negative
// scroll-margin on its snap edge), so the next group's first tile and its label stand clear of the fade. jsdom does no
// layout, so the boxes are stubbed.
import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { groupRest, peekShifts, useGroupPeek } from '../../src/shell/useGroupPeek';

describe('peekShifts (finish fix 8)', () => {
    // A 740 px strip, its snapped rests 24 px in (scroll-padding), its fade the last 24 px: content from 24 to 716 is
    // clear of both edges at a group's rest.
    const view = 740;

    it("snaps a group further on when its rest would end with nothing of the next group past the fade", () => {
        // The middle group rests at scroll 540 (564 − 24), so its clear view runs to 540 + 740 − 24 = 1256. It ends at
        // 1240, inside it, and the next group starts at 1252 -- 4 px short of the fade: nothing of it is seen. It snaps
        // on by 1252 + 32 − 1256 = 28, so 32 px of the next group's first tile and its label stand clear of the fade.
        const groups = [{ start: 0, end: 552 }, { start: 564, end: 1240 }, { start: 1252, end: 2100 }];
        expect(peekShifts(groups, view)).toEqual([0, 28, 0]);
    });

    it('leaves a rest alone whose own tiles already run under the fade, or that already shows the next group', () => {
        // The first group rests at scroll 0 (a rest cannot go before the start): its clear view ends at 716, and the
        // next group starts at 564, well clear of the fade -- shown already.
        expect(peekShifts([{ start: 0, end: 552 }, { start: 564, end: 1276 }], view)[0]).toBe(0);
        // A group wider than the view is cut by its own edge, plainly (a fade's width or more past it).
        expect(peekShifts([{ start: 0, end: 900 }, { start: 912, end: 1000 }], view)[0]).toBe(0);
        // The last group has no next to show.
        expect(peekShifts([{ start: 0, end: 300 }], view)).toEqual([0]);
    });
});

// Found live (n9-mid at 1440 px): 9g's last tile ran 9 px under the fade and past nothing -- not a cut anyone sees,
// and still nothing of 9h. Only a group running a fade's width or more past the view's edge counts as cut.
describe('peekShifts: a cut the eye sees (finish fix 8)', () => {
    it('snaps on a group whose last tile only grazes the fade', () => {
        // 9g at 1304–2031 in a 763 px view: rest 1280, clear to 2019, view edge 2043. 9h starts at 2043.
        expect(peekShifts([{ start: 1304, end: 2031 }, { start: 2043, end: 2933 }], 763)).toEqual([2043 + 32 - 2019, 0]);
        // Running 24 px or more past the edge, the group's own cut tile says "more".
        expect(peekShifts([{ start: 1304, end: 2067 }, { start: 2079, end: 2933 }], 763)[0]).toBe(0);
    });
});

// The rest a pick scrolls to (finish fix 8): its group's snapped rest, shifted as above, when the picked tile is in
// clear view there -- so a pick's rest ends as a snap's does; otherwise none (the strip centres the tile, as before).
describe('groupRest (finish fix 8)', () => {
    const groups = [{ start: 8, end: 80 }, { start: 1304, end: 2031 }, { start: 2043, end: 2933 }];
    const shifts = [0, 56, 0];

    it("gives the picked tile's group rest, shifted, when the tile is in clear view there", () => {
        // 9g's rest is 1280 + 56 = 1336; its fifth tile (1624–1704) stands clear of both fades (1360 … 2075).
        expect(groupRest(groups, shifts, 1, { start: 1624, end: 1704 }, 763)).toBe(1336);
        // The first group rests at 0, where no fade is drawn on the left.
        expect(groupRest(groups, shifts, 0, { start: 8, end: 80 }, 763)).toBe(0);
    });

    // Fix round 1 (review (b)): a tile under the left fade at the shifted rest falls back to the group's own snap (its
    // unshifted rest) when it is clear there -- a real snap position with the whole group in view -- before centring.
    it("falls back to the group's unshifted rest for a tile the shift would hide, and gives none past that", () => {
        // 9g's first tile (1304–1384) starts under the left fade of the shifted rest (clear from 1360); at the
        // unshifted rest, 1280, it is clear from 1304.
        expect(groupRest(groups, shifts, 1, { start: 1304, end: 1384 }, 763)).toBe(1280);
        expect(groupRest(groups, shifts, 2, { start: 2900, end: 2980 }, 763)).toBeNull();
    });
});

// Fix round 1 (review M6): the shifts come back keyed by each group's own key (its data-group-key), so the strip pairs
// a group with its shift by name, never by the order it happens to render in.
function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const shifts = useGroupPeek(ref, { enabled: true });
    return (
        <div ref={ref} data-testid="list" data-shifts={JSON.stringify(shifts)}>
            <div className="strip-group-snap" data-group-key="9f" data-start="0" data-end="552" />
            <div className="strip-group-snap" data-group-key="9g" data-start="564" data-end="1240" />
            <div className="strip-group-snap" data-group-key="9h" data-start="1252" data-end="2100" />
        </div>
    );
}

describe('useGroupPeek (finish fix 8)', () => {
    it("reads the list's groups where they lie and says each one's shift", () => {
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.dataset.testid === 'list' ? 740 : 0;
        });
        const rects = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const box = (left: number, right: number) => ({ left, right, width: right - left, top: 0, bottom: 90, height: 90, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
            // The list sits 100 px in; its groups lie where their data attributes say, in its content.
            if (this.dataset.testid === 'list') return box(100, 840);
            return box(100 + Number(this.dataset.start), 100 + Number(this.dataset.end));
        });
        try {
            render(<Probe />);
            expect(JSON.parse(screen.getByTestId('list').dataset.shifts!)).toEqual({ '9f': 0, '9g': 28, '9h': 0 });
        } finally {
            rects.mockRestore();
            width.mockRestore();
        }
    });

    it('does nothing while disabled', () => {
        function Off() {
            const ref = useRef<HTMLDivElement>(null);
            const shifts = useGroupPeek(ref, { enabled: false });
            return <div ref={ref} data-testid="off" data-shifts={JSON.stringify(shifts)}><div className="strip-group-snap" data-group-key="a" /></div>;
        }
        render(<Off />);
        expect(screen.getByTestId('off')).toHaveAttribute('data-shifts', '{}');
    });
});
