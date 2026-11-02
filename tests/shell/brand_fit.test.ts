// Brass Instrument fix (fix-topbar): the serif wordmark is 150 px wide at 24 px, so the brand fits the top bar by
// stepping the wordmark down by width -- through the TYPE tokens, never a literal -- and, on a narrow phone, by never
// letting the brand shrink under its own text. Read from the CSS source, like serif_signature.test.ts.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TYPE, tokensCss } from '../../src/design/tokens';

const src = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
/** The body of the one `@media <query>` block (its nested rules), or '' when there is none. */
function mediaBody(text: string, query: string): string {
    const css = strip(text);
    const start = css.indexOf(`@media ${query} {`);
    if (start < 0) return '';
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
    }
    return '';
}
/** Every declaration block whose selector list contains `selector` exactly, joined; at the top level of `text`. */
function rulesOf(text: string, selector: string): string {
    const found: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    for (let match = pattern.exec(strip(text)); match; match = pattern.exec(strip(text))) {
        if (match[1].split(',').map(part => part.trim()).includes(selector)) found.push(match[2]);
    }
    return found.join(' ');
}
const topBar = src('shell/top_bar.css');
const phoneBar = src('shell/phone_top_bar.css');
const step = (name: 'compact' | 'tight') =>
    new RegExp(`font-size:\\s*var\\(--ql-type-wordmark-${name}-size\\);\\s*line-height:\\s*var\\(--ql-type-wordmark-${name}-line\\)`);

describe('the wordmark\'s steps are tokens', () => {
    it('has a 20/24 and an 18/22 step at the wordmark\'s weight, emitted through tokens.css', () => {
        expect(TYPE.wordmarkCompact).toEqual({ size: 20, line: 24, weight: TYPE.wordmark.weight });
        expect(TYPE.wordmarkTight).toEqual({ size: 18, line: 22, weight: TYPE.wordmark.weight });
        const css = tokensCss();
        for (const [name, size, line] of [['compact', 20, 24], ['tight', 18, 22]] as const) {
            expect(css).toContain(`--ql-type-wordmark-${name}-size: ${size}px;`);
            expect(css).toContain(`--ql-type-wordmark-${name}-line: ${line}px;`);
        }
    });
});

describe('the desktop top bar fits the brand by width band', () => {
    it('keeps the brand box to its content: the mark, a gap and the text, with no padding or fixed width of its own', () => {
        const brand = rulesOf(topBar, '.app-topbar-brand');
        expect(brand).not.toMatch(/padding|width|margin/);
    });

    it('steps the wordmark to 20/24 below 1160 px and 18/22 from 860 px down, from the tokens, and closes the gaps to 16', () => {
        const compact = mediaBody(topBar, '(max-width: 1159px)');
        expect(rulesOf(compact, '.app-topbar .ql-wordmark')).toMatch(step('compact'));
        expect(rulesOf(compact, '.app-topbar')).toMatch(/gap:\s*16px/);
        expect(rulesOf(mediaBody(topBar, '(max-width: 860px)'), '.app-topbar .ql-wordmark')).toMatch(step('tight'));
        // 24/28 stays the default above 1160 px: no rule outside a media block sets the bar's wordmark size.
        const outside = strip(topBar).replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
        expect(rulesOf(outside, '.app-topbar .ql-wordmark')).toBe('');
    });

    it('lets the full search shrink to 150 px between 1100 and 1290 px so the widest level control fits at 1100', () => {
        const band = mediaBody(topBar, '(min-width: 1100px) and (max-width: 1290px)');
        expect(rulesOf(band, '.app-topbar-search')).toMatch(/min-width:\s*150px/);
    });
});

describe('the phone top bar fits the brand from 320 to 430 px', () => {
    it('never shrinks the brand under its own text, and never shrinks the mode button under its label', () => {
        expect(rulesOf(phoneBar, '.phone-topbar .app-topbar-brand')).not.toMatch(/min-width/);
        expect(rulesOf(phoneBar, '.phone-mode-button.MuiButton-root')).toMatch(/flex:\s*0 0 auto/);
    });

    it('sets the wordmark 20/24 from the tokens, 18/22 under 380 px, with no size literal', () => {
        expect(rulesOf(phoneBar, '.phone-topbar .ql-wordmark')).toMatch(step('compact'));
        expect(rulesOf(mediaBody(phoneBar, '(max-width: 379px)'), '.phone-topbar .ql-wordmark')).toMatch(step('tight'));
        expect(strip(phoneBar)).not.toMatch(/\.ql-wordmark[^}]*font-size:\s*\d/);
    });

    it('drops the atom mark under 370 px and closes the row\'s padding and gap under 350 px', () => {
        expect(rulesOf(mediaBody(phoneBar, '(max-width: 369px)'), '.phone-topbar .ql-brand-mark')).toMatch(/display:\s*none/);
        const narrow = mediaBody(phoneBar, '(max-width: 349px)');
        expect(rulesOf(narrow, '.phone-topbar')).toMatch(/gap:\s*2px;\s*padding:\s*0 4px/);
    });
});
