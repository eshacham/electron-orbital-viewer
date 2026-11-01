import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TEMPER_LEVELS, TOKENS, colorsAt, type ColorRole, type TemperLevel, type ThemeMode } from '../../src/design/tokens';

/**
 * Brass Instrument Task 3 (parked from Task 1): the resolved cascade, not the blocks' text. jsdom does not compute
 * custom properties through the cascade, so this resolves them itself from the shipped sheets -- the generated
 * tokens.css and app_shell.css, where the viewport cell takes its backdrop -- with the CSS rules that decide them here:
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

function specificityOf(selector: string): [number, number, number] {
    let rest = selector.replace(/::[\w-]+/g, ' ');
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

const RULES = [...parseRules(sheet('design/tokens.css'), 0), ...parseRules(sheet('shell/app_shell.css'), 100000)];

const beats = (a: Rule, b: Rule) => {
    for (let k = 0; k < 3; k++) if (a.specificity[k] !== b.specificity[k]) return a.specificity[k] > b.specificity[k];
    return a.order > b.order;
};

function matches(element: Element, selector: string): boolean {
    try { return element.matches(selector); } catch { return false; } // a selector jsdom cannot parse sets nothing here
}

/** The computed value of `property` on `element`: custom properties inherit, others do not. */
function computed(element: Element, property: string): string | undefined {
    let winner: Rule | null = null;
    for (const rule of RULES) {
        if (rule.decls.has(property) && matches(element, rule.selector) && (!winner || beats(rule, winner))) winner = rule;
    }
    if (!winner) return property.startsWith('--') && element.parentElement ? computed(element.parentElement, property) : undefined;
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
            <main id="canvas-container" class="viewport-cell" data-theme="dark">
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

describe('the resolved cascade of a dark field inside a page (Brass Instrument Task 3)', () => {
    it.each(TEMPER_LEVELS)('resolves a dark scope in a light %s page to (dark, that level), and its page chrome back to (light, that level)', level => {
        const { cell, overlay, chrome } = mount('light', level);
        for (const role of ROLES) {
            expect([role, computed(cell, `--ql-color-${role}`)]).toEqual([role, colorsAt('dark', level)[role]]);
            expect([role, computed(overlay, `--ql-color-${role}`)]).toEqual([role, colorsAt('dark', level)[role]]);
            expect([role, computed(chrome, `--ql-color-${role}`)]).toEqual([role, colorsAt('light', level)[role]]);
        }
        expect(computed(document.documentElement, '--ql-color-text-1')).toBe(colorsAt('light', level)['text-1']);
    });

    it('resolves the plan\'s case exactly: data-theme="dark" inside data-theme="light" data-level="research"', () => {
        const { cell } = mount('light', 'research');
        expect(computed(cell, '--ql-color-bg-app')).toBe('#101618');
        expect(computed(cell, '--ql-color-accent')).toBe('#B8A87C');
        expect(computed(cell, '--ql-color-text-1')).toBe('#E1E9EC');
    });

    // The light page's field is its own charcoal (light's canvas), not the dark page's: the cell wears the dark scope for
    // its overlays but takes its backdrop from the workspace, which is in the page's mode.
    it.each(['dark', 'light'] as const)('paints the cell with the %s page\'s own field', page => {
        const { cell } = mount(page, 'explore');
        expect(computed(cell, 'background')).toBe(TOKENS[page].canvas);
    });

    it('changes nothing in a dark page: every scope resolves to (dark, level)', () => {
        for (const level of TEMPER_LEVELS) {
            const { cell, chrome } = mount('dark', level);
            for (const role of ROLES) {
                expect(computed(cell, `--ql-color-${role}`)).toBe(colorsAt('dark', level)[role]);
                expect(computed(chrome, `--ql-color-${role}`)).toBe(colorsAt('dark', level)[role]);
            }
        }
    });
});
