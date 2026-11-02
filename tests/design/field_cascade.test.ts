import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TEMPER_LEVELS, TOKENS, colorsAt, type ColorRole, type TemperLevel, type ThemeMode } from '../../src/design/tokens';

/**
 * Brass Instrument Task 3 (parked from Task 1): the resolved cascade, not the blocks' text. jsdom does not compute
 * custom properties through the cascade, so this resolves them itself from the shipped sheets -- the generated
 * tokens.css, app_shell.css (where the viewport cell takes its backdrop) and strip.css (a tile picture's scope) -- with the CSS rules that decide them here:
 * every matching selector competes by specificity, then source order; a custom property no rule sets on an element is
 * inherited from its parent; var() is substituted on the element that declares it. Matching is jsdom's own
 * Element.matches. At-rule blocks (@media, @keyframes) are skipped: none of them sets a colour role.
 */
interface Rule { selector: string; specificity: [number, number, number]; order: number; decls: Map<string, string> }

const sheet = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');

/** Splits at commas outside brackets and parentheses. */
function splitTop(text: string, separator: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    parts.push(text.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
}

// Enough for these sheets: no !important, and :not(X) counts as X alone, as in the browser (the :not() itself adds
// nothing). :is() and :where() are not modelled -- none of these sheets uses them to set a role.
function specificityOf(selector: string): [number, number, number] {
    let rest = selector.replace(/::[\w-]+/g, ' ');
    for (let before = ''; before !== rest;) { before = rest; rest = rest.replace(/:not\(((?:[^()]|\([^()]*\))*)\)/g, ' $1 '); }
    const count = (pattern: RegExp) => { const n = (rest.match(pattern) ?? []).length; rest = rest.replace(pattern, ' '); return n; };
    const ids = count(/#[\w-]+/g);
    const classes = count(/\[[^\]]*\]/g) + count(/\.[\w-]+/g) + count(/:[\w-]+(\([^)]*\))?/g);
    const types = rest.split(/[\s>+~*]+/).filter(part => /^[a-z]/i.test(part)).length;
    return [ids, classes, types];
}

function parseRules(css: string, startOrder: number): Rule[] {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules: Rule[] = [];
    let i = 0;
    let order = startOrder;
    while (i < text.length) {
        const open = text.indexOf('{', i);
        if (open < 0) break;
        const prelude = text.slice(i, open).trim();
        // The matching close brace (an at-rule block nests rules).
        let depth = 1;
        let close = open + 1;
        for (; close < text.length && depth > 0; close++) {
            if (text[close] === '{') depth++;
            else if (text[close] === '}') depth--;
        }
        const body = text.slice(open + 1, close - 1);
        i = close;
        if (prelude.startsWith('@')) continue;
        const decls = new Map<string, string>();
        for (const decl of splitTop(body, ';')) {
            const colon = decl.indexOf(':');
            if (colon > 0) decls.set(decl.slice(0, colon).trim(), decl.slice(colon + 1).trim());
        }
        order++;
        for (const selector of splitTop(prelude, ',')) rules.push({ selector, specificity: specificityOf(selector), order, decls });
    }
    return rules;
}

const RULES = [...parseRules(sheet('design/tokens.css'), 0), ...parseRules(sheet('shell/app_shell.css'), 100000), ...parseRules(sheet('shell/strip.css'), 200000)];

const beats = (a: Rule, b: Rule) => {
    for (let k = 0; k < 3; k++) if (a.specificity[k] !== b.specificity[k]) return a.specificity[k] > b.specificity[k];
    return a.order > b.order;
};

function matches(element: Element, selector: string): boolean {
    try { return element.matches(selector); } catch { return false; } // a selector jsdom cannot parse sets nothing here
}

/** The computed value of `property` on `element`: custom properties and `color` inherit, others do not. */
function computed(element: Element, property: string): string | undefined {
    let winner: Rule | null = null;
    for (const rule of RULES) {
        if (rule.decls.has(property) && matches(element, rule.selector) && (!winner || beats(rule, winner))) winner = rule;
    }
    if (!winner) return (property.startsWith('--') || property === 'color') && element.parentElement ? computed(element.parentElement, property) : undefined;
    return substitute(element, winner.decls.get(property)!);
}

function substitute(element: Element, value: string): string {
    const at = value.indexOf('var(');
    if (at < 0) return value;
    let depth = 0;
    let end = at + 4;
    for (; end < value.length; end++) {
        if (value[end] === '(') depth++;
        else if (value[end] === ')') { if (depth === 0) break; depth--; }
    }
    const [name, ...fallback] = splitTop(value.slice(at + 4, end), ',');
    const resolved = computed(element, name) ?? (fallback.length ? substitute(element, fallback.join(', ')) : '');
    return substitute(element, value.slice(0, at) + resolved + value.slice(end + 1));
}

/** The viewer's nesting: a page root, the workspace, the viewport cell in the field's mode, page chrome inside it. */
function mount(page: ThemeMode, level: TemperLevel) {
    const root = document.documentElement;
    root.setAttribute('data-theme', page);
    root.setAttribute('data-level', level);
    document.body.innerHTML = `
        <div class="app-shell"><div class="app-workspace">
            <main id="canvas-container" class="viewport-cell" data-theme="dark" data-field="">
                <div class="viewport-title"></div>
                <div class="page-scope" data-theme="${page}"><aside class="inspector view-panel"></aside></div>
            </main>
        </div></div>`;
    return {
        cell: document.getElementById('canvas-container')!,
        overlay: document.querySelector('.viewport-title')!,
        chrome: document.querySelector('.view-panel')!,
    };
}

const ROLES: ColorRole[] = ['bg-app', 'surface-1', 'surface-2', 'text-1', 'text-2', 'text-3', 'accent', 'selected-edge', 'focus-ring', 'success', 'scrim', 'canvas'];

afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-level');
});

// Final review M3: the resolver is what guards the cascade, so it is held to the real rule first.
describe('specificityOf', () => {
    it('counts :not(X) as X alone, and the other pseudo-classes as one class', () => {
        expect(specificityOf('[data-level="basics"] [data-theme]:not([data-field])')).toEqual([0, 3, 0]);
        expect(specificityOf('.a:not(.b):hover')).toEqual([0, 3, 0]);
        expect(specificityOf('div:not(#x)')).toEqual([1, 0, 1]);
        expect(specificityOf('.a:focus-visible')).toEqual([0, 2, 0]);
    });
});

describe('the resolved cascade of a dark field inside a page (Brass Instrument Task 3)', () => {
    // Finish ruling F2: the viewing field does not change with the level -- the field resolves to its mode's Explore at
    // every level; page chrome nested back inside it keeps the page's mode and the root's level.
    it.each(TEMPER_LEVELS)('resolves the field in a light %s page to dark Explore, and its page chrome back to (light, that level)', level => {
        const { cell, overlay, chrome } = mount('light', level);
        for (const role of ROLES) {
            expect([role, computed(cell, `--ql-color-${role}`)]).toEqual([role, TOKENS.dark[role]]);
            expect([role, computed(overlay, `--ql-color-${role}`)]).toEqual([role, TOKENS.dark[role]]);
            expect([role, computed(chrome, `--ql-color-${role}`)]).toEqual([role, colorsAt('light', level)[role]]);
        }
        expect(computed(document.documentElement, '--ql-color-text-1')).toBe(colorsAt('light', level)['text-1']);
    });

    it('resolves the brief\'s cases exactly: the field at a Research or Basics root is dark Explore', () => {
        for (const level of ['research', 'basics'] as const) for (const page of ['light', 'dark'] as const) {
            const { cell, overlay, chrome } = mount(page, level);
            expect([level, page, computed(cell, '--ql-color-bg-app')]).toEqual([level, page, '#141513']);
            expect([level, page, computed(overlay, '--ql-color-accent')]).toEqual([level, page, '#C4A15A']);
            expect([level, page, computed(overlay, '--ql-color-text-1')]).toEqual([level, page, '#EEE7D8']);
            expect([level, page, computed(chrome, '--ql-color-accent')]).toEqual([level, page, colorsAt(page, level).accent]);
        }
    });

    // The field's cards keep one size too: Basics' larger body and rounder corners stop at the field and come back on
    // the page chrome inside it.
    it('puts Basics\' sizes back to the base on the field, and Basics\' own on the page chrome inside it', () => {
        const { cell, overlay, chrome } = mount('light', 'basics');
        for (const el of [cell, overlay]) {
            expect(computed(el, '--ql-type-body-size')).toBe('13px');
            expect(computed(el, '--ql-type-caption-line')).toBe('16px');
            expect(computed(el, '--ql-radius-md')).toBe('8px');
        }
        expect(computed(chrome, '--ql-type-body-size')).toBe('14px');
        expect(computed(chrome, '--ql-radius-lg')).toBe('14px');
        expect(computed(document.documentElement, '--ql-type-body-size')).toBe('14px');
        const research = mount('dark', 'research');
        expect(computed(research.overlay, '--ql-type-body-size')).toBe('13px');
        expect(computed(research.chrome, '--ql-type-body-size')).toBe('13px');
    });

    // A window of the field inside page chrome (a phone sheet's tile picture, a phone header over the field) carries
    // data-field too, so it wears the field, not the sheet's level.
    it.each(TEMPER_LEVELS)('resolves a field window inside the %s page chrome to dark Explore', level => {
        const { chrome } = mount('light', level);
        chrome.innerHTML = '<span class="strip-tile-image" data-theme="dark" data-field=""><svg></svg></span>';
        const window = chrome.querySelector('.strip-tile-image')!;
        for (const role of ROLES) expect([role, computed(window, `--ql-color-${role}`)]).toEqual([role, TOKENS.dark[role]]);
        expect(computed(window.querySelector('svg')!, '--ql-color-text-1')).toBe(TOKENS.dark['text-1']);
    });

    // The light page's field is its own charcoal (light's canvas), not the dark page's: the cell wears the dark scope for
    // its overlays but takes its backdrop from the workspace, which is in the page's mode.
    it.each(['dark', 'light'] as const)('paints the cell with the %s page\'s own field', page => {
        const { cell } = mount(page, 'explore');
        expect(computed(cell, 'background')).toBe(TOKENS[page].canvas);
    });

    // Task 3 fix round 1: a light phone sheet's tile picture is a window of the dark field (its own data-theme); what
    // is drawn in it -- the back tile's arrow takes `currentColor` -- must take the field's ink, not the sheet's.
    it.each(['dark', 'light'] as const)('inks a tile picture in its own scope on a %s page', page => {
        const { chrome } = mount(page, 'explore');
        chrome.innerHTML = '<div class="strip-tile"><span class="strip-tile-image" data-theme="dark" data-field=""><svg></svg></span><span class="strip-tile-label"></span></div>';
        expect(computed(chrome.querySelector('svg')!, 'color')).toBe(TOKENS.dark['text-1']);
        expect(computed(chrome.querySelector('.strip-tile-label')!, 'color')).toBe(TOKENS[page]['text-2']);
    });

    it('in a dark page: the field resolves to dark Explore and its page chrome to (dark, level)', () => {
        for (const level of TEMPER_LEVELS) {
            const { cell, chrome } = mount('dark', level);
            for (const role of ROLES) {
                expect(computed(cell, `--ql-color-${role}`)).toBe(TOKENS.dark[role]);
                expect(computed(chrome, `--ql-color-${role}`)).toBe(colorsAt('dark', level)[role]);
            }
        }
    });

    // Finish ruling F3 (replacing Task 3 fix round 1's light chips): what a phone draws straight over the field -- its
    // header: the nav chip, the tier chip, the caption, the sideways top bar -- is a window of the field (data-field on
    // .phone-header), so it wears the field's tokens; no page-mode chip rule is left to key on a mode mismatch.
    it('puts the phone header in the field scope and keeps no page-mode chip rules for it', () => {
        const { chrome } = mount('light', 'research');
        chrome.insertAdjacentHTML('afterend', '<div class="phone-header" data-theme="dark" data-field=""><p class="phone-caption"></p></div>');
        const caption = document.querySelector('.phone-caption')!;
        for (const role of ROLES) expect([role, computed(caption, `--ql-color-${role}`)]).toEqual([role, TOKENS.dark[role]]);
        const css = sheet('shell/phone_top_bar.css') + sheet('style.css');
        expect(css).not.toMatch(/data-field-mismatch/);
        expect(css).toMatch(/\.phone-header \{[^}]*color: var\(--ql-color-text-1\)/);
    });
});
