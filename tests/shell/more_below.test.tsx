// tests/shell/more_below.test.tsx -- Task 9b (finish review, fix 4): Info's scroller says there is more below with a
// tonal cue -- a ~24 px bottom fade (mask-image), shown only while content runs past its bottom edge, on the docked or
// drawer Info slot and on the phone sheet's body. A class carries it, set from the scroll position on scroll and on any
// change of size (a ResizeObserver on the scroller and its content). Never a shadow, a glow, an arrow or a "More"
// label; nothing animates it. jsdom does no layout, so the sizes are stubbed and the rule's own source is read (the
// project's way of pinning a CSS property, as scroll_gutter.test.ts does); the live check shoots it showing and not.
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { act, fireEvent, render } from '@testing-library/react';
import Inspector from '../../src/shell/Inspector';
import PhoneSheet from '../../src/components/PhoneSheet';
import { MORE_BELOW } from '../../src/shell/useMoreBelow';

/** What the browser would lay out: the scroller's height, its content's height and how far it is scrolled. */
function laidOut(element: HTMLElement, { client, scroll, top = 0 }: { client: number; scroll: number; top?: number }) {
    Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => client });
    Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => scroll });
    element.scrollTop = top;
}

/** A ResizeObserver that the test fires by hand (jsdom has none). */
class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: Element[] = [];
    constructor(private readonly callback: () => void) { FakeResizeObserver.instances.push(this); }
    observe(target: Element) { this.observed.push(target); }
    unobserve() {}
    disconnect() { this.observed = []; }
    fire() { this.callback(); }
}

describe('the "more below" cue on Info\'s scroller (Task 9b)', () => {
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    beforeEach(() => {
        FakeResizeObserver.instances = [];
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original; });

    it('marks the docked Info slot while content runs below it, and clears it at the bottom', () => {
        const { container } = render(<Inspector variant="docked" sections={[]} info={<section>Info</section>} />);
        const slot = container.querySelector('.inspector-info') as HTMLElement;
        expect(slot).not.toHaveClass(MORE_BELOW);
        laidOut(slot, { client: 200, scroll: 500 });
        fireEvent.scroll(slot);
        expect(slot).toHaveClass(MORE_BELOW);
        laidOut(slot, { client: 200, scroll: 500, top: 300 });
        fireEvent.scroll(slot);
        expect(slot).not.toHaveClass(MORE_BELOW);
    });

    it('re-reads on a change of size -- the scroller\'s or its content\'s (a new selection, a resized window)', () => {
        const { container } = render(<Inspector variant="docked" sections={[]} info={<section>Info</section>} />);
        const slot = container.querySelector('.inspector-info') as HTMLElement;
        const observer = FakeResizeObserver.instances.find(o => o.observed.includes(slot))!;
        expect(observer.observed).toEqual(expect.arrayContaining([slot, slot.firstElementChild]));
        laidOut(slot, { client: 200, scroll: 500 });
        act(() => observer.fire());
        expect(slot).toHaveClass(MORE_BELOW);
        laidOut(slot, { client: 200, scroll: 180 });
        act(() => observer.fire());
        expect(slot).not.toHaveClass(MORE_BELOW);
    });

    it('marks the phone sheet\'s body the same way', () => {
        const tabs = [{ key: 'info', label: 'Info', content: <p>long</p> }];
        const { container } = render(<PhoneSheet tabs={tabs} active="info" onChange={() => {}} />);
        const body = container.querySelector('.phone-sheet-body') as HTMLElement;
        laidOut(body, { client: 300, scroll: 900 });
        fireEvent.scroll(body);
        expect(body).toHaveClass(MORE_BELOW);
        laidOut(body, { client: 300, scroll: 900, top: 600 });
        fireEvent.scroll(body);
        expect(body).not.toHaveClass(MORE_BELOW);
    });

    describe('the cue itself (CSS source)', () => {
        const sheet = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const ruleFor = (css: string, selector: string) => {
            const at = css.indexOf(selector);
            if (at < 0) throw new Error(`No rule for ${selector}`);
            return css.slice(at, css.indexOf('}', at));
        };

        // Task 9b review I1: a mask covers the border box, so Info's fade keeps its last pixel -- the hairline under Info --
        // opaque; the phone sheet's body has no border and fades to its edge.
        const FADE_TO_EDGE = '[^,]+ calc\\(100% - 24px\\), transparent\\)';
        const FADE_ABOVE_HAIRLINE = '[^,]+ calc\\(100% - 25px\\), transparent calc\\(100% - 1px\\), [^,]+ calc\\(100% - 1px\\)\\)';
        it.each([
            ['src/shell/inspector.css', `.inspector-info.${MORE_BELOW}`, FADE_ABOVE_HAIRLINE],
            ['src/style.css', `.phone-sheet-body.${MORE_BELOW}`, FADE_TO_EDGE],
        ])('%s %s fades its bottom 24 px with a mask, tonal only', (path, selector, stops) => {
            const rule = ruleFor(sheet(path), selector);
            expect(rule).toMatch(new RegExp(`(^|[^-])mask-image: linear-gradient\\(to bottom, ${stops}`));
            expect(rule).toMatch(new RegExp(`-webkit-mask-image: linear-gradient\\(to bottom, ${stops}`));
            expect(rule).not.toMatch(/shadow|transition|animation|content:/);
            // No colour of its own: the mask only needs an opaque stop (the text colour) to fade to transparent.
            expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
        });
    });
});
