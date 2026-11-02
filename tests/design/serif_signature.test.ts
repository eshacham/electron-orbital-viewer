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
    // Owner, 2026-11-02, after the Hallmark audit: the specimen title's view line, Info title's size at the regular weight.
    it('sizes the specimen title\'s view line 17/24 at 400 and emits it', () => {
        expect(TYPE.specimenView).toEqual({ size: 17, line: 24, weight: 400 });
        const css = tokensCss();
        expect(css).toContain('--ql-type-specimen-view-size: 17px;');
        expect(css).toContain('--ql-type-specimen-view-line: 24px;');
        expect(css).toContain('--ql-type-specimen-view-weight: 400;');
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
    // Owner, 2026-11-02, after the Hallmark audit: the view of the specimen, a second serif line in text-2.
    // Owner, 2026-11-02 (subtitle contrast): the view line is what is drawn in every mode, so it reads in text-1; the
    // subtitle under it steps to 14/20 (TYPE.subtitle), still text-2.
    it('sets the specimen title\'s view line in serif at TYPE.specimenView, text-1, on its own line', () => {
        const rule = rulesOf(src('shell/viewport.css'), '.viewport-title-view').join(' ');
        expect(rule).toMatch(/var\(--ql-type-specimen-view-weight\) var\(--ql-type-specimen-view-size\) \/ var\(--ql-type-specimen-view-line\) var\(--ql-font-serif\)/);
        expect(rule).toMatch(/color:\s*var\(--ql-color-text-1\)/);
        expect(rule).toMatch(/display:\s*block/);
    });
    it('sets the subtitle at TYPE.subtitle, 14/20 regular, in Inter and text-2', () => {
        expect(TYPE.subtitle).toEqual({ size: 14, line: 20, weight: 400 });
        const css = src('design/tokens.css');
        expect(css).toContain('--ql-type-subtitle-size: 14px;');
        expect(css).toContain('--ql-type-subtitle-line: 20px;');
        const rule = rulesOf(src('shell/viewport.css'), '.viewport-subtitle').join(' ');
        expect(rule).toMatch(/var\(--ql-type-subtitle-weight\) var\(--ql-type-subtitle-size\) \/ var\(--ql-type-subtitle-line\) var\(--ql-font-sans\)/);
        expect(rule).toMatch(/color:\s*var\(--ql-color-text-2\)/);
    });
    it('sets Info title\'s view line at body size, regular weight, text-1, on its own line', () => {
        const rule = rulesOf(src('info/info.css'), '.info-title-view').join(' ');
        expect(rule).toMatch(/font-size:\s*var\(--ql-type-body-size\)/);
        expect(rule).toMatch(/line-height:\s*var\(--ql-type-body-line\)/);
        expect(rule).toMatch(/font-weight:\s*400/);
        expect(rule).toMatch(/color:\s*var\(--ql-color-text-1\)/);
        expect(rule).toMatch(/display:\s*block/);
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
