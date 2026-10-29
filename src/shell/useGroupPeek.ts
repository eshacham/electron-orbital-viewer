import { useLayoutEffect, useState, type RefObject } from 'react';

/** A group's box in the list's scrolled content, px: its left edge (its snap edge) and its right edge. */
export interface GroupBox { start: number; end: number }

/** The snap rests' inset, the list's scroll-padding-inline, and the sideways fade's width, px (strip.css). */
const REST_INSET = 24;
const FADE = 24;
/** How much of the next group's first tile -- and so its label, set over it -- shows clear of the fade, px. */
const PEEK = 32;

/** A group's snapped rest, px of scroll: its start `REST_INSET` px in, never before the list's start. */
const restOf = (group: GroupBox) => Math.max(0, group.start - REST_INSET);

/**
 * Task 5b (picture control, finish fix 8): how much further on each group's snapped rest should sit, px, so that the
 * rest ends with part of the next group's first tile and its label clear of the right fade. Nothing changes for a
 * group whose own tiles run a fade's width or more past the view's edge (a tile plainly cut says "more" -- one that
 * only grazes the fade does not, found live), for one whose rest already shows the next group, or for the last group.
 */
export function peekShifts(groups: GroupBox[], viewWidth: number): number[] {
    return groups.map((group, index) => {
        const next = groups[index + 1];
        if (!next) return 0;
        const rest = restOf(group);
        if (group.end >= rest + viewWidth + FADE) return 0;
        const clearTo = rest + viewWidth - FADE;
        return Math.max(0, Math.ceil(next.start + PEEK - clearTo));
    });
}

/**
 * Task 5b (finish fix 8): where a pick should rest -- its group's snapped rest, shifted as `peekShifts` says -- when the
 * picked tile stands clear of both fades there (no fade is drawn before the list's start), so a pick ends as a snap
 * does; null when it would not, and the caller centres the tile instead.
 */
export function groupRest(groups: GroupBox[], shifts: number[], index: number, tile: GroupBox, viewWidth: number): number | null {
    const group = groups[index];
    if (!group) return null;
    const clearAt = (rest: number) => tile.start >= (rest > 0 ? rest + FADE : 0) && tile.end <= rest + viewWidth - FADE;
    const shifted = restOf(group) + (shifts[index] ?? 0);
    if (clearAt(shifted)) return shifted;
    // Fix round 1 (review (b)): a tile the shift would put under the left fade rests at the group's own snap instead --
    // a real snap position with its whole group in view -- before the caller falls back to centring it.
    return clearAt(restOf(group)) ? restOf(group) : null;
}

/** The scroller's snap groups (each carrying its `data-group-key`) and one element's box in its scrolled content, px. */
export function contentBoxes(list: HTMLElement): { groups: GroupBox[]; elements: HTMLElement[]; boxOf(element: Element): GroupBox } {
    const at = list.getBoundingClientRect();
    const origin = at.left + list.clientLeft - list.scrollLeft;
    const boxOf = (element: Element) => {
        const box = element.getBoundingClientRect();
        return { start: box.left - origin, end: box.right - origin };
    };
    const elements = Array.from(list.querySelectorAll<HTMLElement>(':scope > .strip-group-snap'));
    return { groups: elements.map(boxOf), elements, boxOf };
}

/** Each group's shift, by its `data-group-key`. */
export type GroupShifts = Record<string, number>;

/** `peekShifts` for the scroller's snap groups as they lie now, by group key. */
export function measureShifts(list: HTMLElement): GroupShifts {
    const { groups, elements } = contentBoxes(list);
    const shifts = peekShifts(groups, list.clientWidth);
    return Object.fromEntries(elements.map((element, i) => [element.dataset.groupKey ?? String(i), shifts[i]]));
}

/**
 * Task 5b (finish fix 8): `peekShifts` for the scroller's `.strip-group-snap` children as they lie, re-read when the
 * scroller or a group is resized and when the groups are swapped (a new Shell n). The caller applies each shift as a
 * negative scroll-margin on the group's snap edge, so the browser's own snap rests further on. Fix round 1 (review M6):
 * keyed by each group's `data-group-key`, so the caller pairs group and shift by name; a fresh object only when a shift
 * changes. `enabled: false` (every strip but Orbitals) does nothing at all and returns no shifts. `resetKey` picks up a
 * scroller that remounts, as useMoreSideways' does.
 */
export function useGroupPeek(ref: RefObject<HTMLElement | null>, { enabled, resetKey }: { enabled: boolean; resetKey?: unknown }): GroupShifts {
    const [shifts, setShifts] = useState<GroupShifts>({});

    useLayoutEffect(() => {
        const node = ref.current;
        if (!enabled || !node) {
            setShifts(previous => (Object.keys(previous).length === 0 ? previous : {}));
            return undefined;
        }
        const update = () => {
            const next = measureShifts(node);
            setShifts(previous => {
                const keys = Object.keys(next);
                return keys.length === Object.keys(previous).length && keys.every(key => previous[key] === next[key]) ? previous : next;
            });
        };
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        const observe = () => {
            if (!resize) return;
            resize.disconnect();
            resize.observe(node);
            for (const child of Array.from(node.children)) resize.observe(child);
        };
        const children = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { observe(); update(); });
        observe();
        children?.observe(node, { childList: true });
        update();
        return () => {
            resize?.disconnect();
            children?.disconnect();
        };
    }, [ref, enabled, resetKey]);

    return shifts;
}
