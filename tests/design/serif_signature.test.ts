// Brass Instrument, Task 2: Source Serif 4 for the wordmark, the specimen title and Info's title -- read from the CSS
// source and the entries, like final_polish_css.test.ts.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FONT_SANS, FONT_SERIF, TYPE, tokensCss } from '../../src/design/tokens';

const src = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');
/** Every declaration block whose selector list contains `selector` exactly. */
function rulesOf(text: string, selector: string): string[] {
    const found: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        const selectors = match[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(part => part.trim());
        if (selectors.includes(selector)) found.push(match[2]);
    }
    return found;
}
const SERIF = /font-family:\s*var\(--ql-font-serif\)/;

describe('the serif tokens', () => {
    it('names Source Serif 4 first and falls back to Georgia', () => {
        expect(FONT_SERIF).toBe('"Source Serif 4 Variable", "Source Serif 4", Georgia, serif');
        expect(FONT_SERIF).not.toBe(FONT_SANS);
    });
    it('sizes the wordmark 24/28, the specimen title 26/32 at 500 and Info\'s title 17/24 at 600', () => {
        expect(TYPE.wordmark).toEqual({ size: 24, line: 28, weight: 600 });
        expect(TYPE.specimen).toEqual({ size: 26, line: 32, weight: 500 });
        expect(TYPE.infoTitle).toEqual({ size: 17, line: 24, weight: 600 });
    });
    it('emits the family and the new roles through tokens.css', () => {
        const css = tokensCss();
        expect(css).toContain(`--ql-font-serif: ${FONT_SERIF};`);
        expect(css).toContain('--ql-type-specimen-size: 26px;');
        expect(css).toContain('--ql-type-specimen-line: 32px;');
        expect(css).toContain('--ql-type-specimen-weight: 500;');
        expect(css).toContain('--ql-type-info-title-size: 17px;');
        expect(css).toContain('--ql-type-info-title-line: 24px;');
        expect(css).toContain('--ql-type-info-title-weight: 600;');
        expect(css).toContain('--ql-type-wordmark-size: 24px;');
    });
});

describe('the font ships with both entries', () => {
    it.each(['main.tsx', 'admin/main.tsx'])('%s imports the variable font beside Inter', entry => {
        const text = src(entry);
        expect(text).toContain("import '@fontsource-variable/inter';");
        expect(text).toContain("import '@fontsource-variable/source-serif-4';");
    });
    it('declares a weight range that covers 500 and 600', () => {
        const face = readFileSync(resolve(__dirname, '../../node_modules/@fontsource-variable/source-serif-4/index.css'), 'utf8');
        const ranges = [...face.matchAll(/font-weight:\s*(\d+)\s+(\d+);/g)].map(m => [Number(m[1]), Number(m[2])]);
        expect(ranges.length).toBeGreaterThan(0);
        for (const [low, high] of ranges) expect(low <= 500 && high >= 600).toBe(true);
    });
});

describe('where the serif is set', () => {
    it('sets the wordmark in serif, 24/28 on the bar and 20/24 (the compact step) on a phone, in one colour', () => {
        const design = src('design/design.css');
        const rule = rulesOf(design, '.ql-wordmark').join(' ');
        expect(rule).toMatch(SERIF);
        expect(rule).toMatch(/var\(--ql-type-wordmark-size\)/);
        expect(rule).toMatch(/color:\s*var\(--ql-color-accent-text\)/);
        expect(design.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/gradient|background-clip|text-fill-color|--ql-brand-/);
        const phone = rulesOf(src('shell/phone_top_bar.css'), '.phone-topbar .ql-wordmark').join(' ');
        // The phone's 20/24 is the wordmarkCompact token now (fix-topbar), with 18/22 under 380 px; brand_fit.test.ts pins the bands.
        expect(phone).toMatch(/font-size:\s*var\(--ql-type-wordmark-compact-size\)/);
        expect(phone).toMatch(/line-height:\s*var\(--ql-type-wordmark-compact-line\)/);
        expect(TYPE.wordmarkCompact).toMatchObject({ size: 20, line: 24 });
    });
    it('sets the specimen title in serif at TYPE.specimen, the subtitle in Inter', () => {
        const viewport = src('shell/viewport.css');
        const title = rulesOf(viewport, '.viewport-title h1').join(' ');
        expect(title).toMatch(/var\(--ql-type-specimen-weight\) var\(--ql-type-specimen-size\) \/ var\(--ql-type-specimen-line\) var\(--ql-font-serif\)/);
        expect(rulesOf(viewport, '.viewport-subtitle').join(' ')).toMatch(/var\(--ql-font-sans\)/);
        expect(rulesOf(viewport, '.viewport-title').join(' ')).toMatch(/max-width:\s*calc\(100% - 280px\)/);
    });
    it('sets Info\'s title in serif at TYPE.infoTitle', () => {
        const rule = rulesOf(src('info/info.css'), '.info-title').join(' ');
        expect(rule).toMatch(SERIF);
        expect(rule).toMatch(/var\(--ql-type-info-title-size\)/);
        expect(rule).toMatch(/var\(--ql-type-info-title-line\)/);
        expect(rule).toMatch(/var\(--ql-type-info-title-weight\)/);
    });

    // Finish ruling F4: a subscript in the serif titles drops below the baseline and shrinks, without growing the line.
    it.each([['shell/viewport.css', '.viewport-title h1 sub'], ['info/info.css', '.info-title sub'], ['style.css', '.phone-caption-name sub']])(
        '%s drops and shrinks %s', (file, selector) => {
            const rule = rulesOf(src(file), selector).join(' ');
            expect(rule).toMatch(/font-size:\s*0\.68em/);
            expect(rule).toMatch(/vertical-align:\s*-0\.28em/);
            expect(rule).toMatch(/font-variant-position:\s*normal/);
        });
    it('sets the phone caption\'s name in the serif, its qualifier in Inter', () => {
        expect(rulesOf(src('style.css'), '.phone-caption-name').join(' ')).toMatch(SERIF);
        expect(rulesOf(src('style.css'), '.phone-caption-qualifier').join(' ')).not.toMatch(SERIF);
        expect(rulesOf(src('style.css'), '.phone-caption').join(' ')).not.toMatch(SERIF);
    });
});
