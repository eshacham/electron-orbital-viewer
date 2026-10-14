import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const SRC = resolve(__dirname, '../../src');
function cssFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith('.css') ? [path] : [];
    });
}
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Selectors allowed to drop the default outline, each because a replacement ring is drawn elsewhere. */
const OUTLINE_REPLACED: Record<string, string> = {
    '.global-search-input': '.global-search:focus-within draws the 2 px ring on the whole control',
    '#canvas-container.viewport-cell:focus': '#canvas-container.viewport-cell:focus-visible draws it for keyboard focus',
    // Ruling R23b-1 (owner): these draw their own 2 px focus-ring fieldset border (theme.ts) instead.
    '.MuiOutlinedInput-input:focus-visible': 'the fieldset border theme.ts pins to the focus-ring token is the replacement ring',
    '.MuiSelect-select:focus-visible': 'the fieldset border theme.ts pins to the focus-ring token is the replacement ring',
};

describe('focus is never removed (spec §13)', () => {
    it('removes an outline only where a replacement ring is drawn', () => {
        for (const file of cssFiles(SRC)) {
            const css = strip(readFileSync(file, 'utf8'));
            for (const match of css.matchAll(/([^{}]+)\{[^}]*outline:\s*(none|0)\b[^}]*\}/g)) {
                const selectors = match[1].split(',').map(s => s.trim());
                for (const selector of selectors) expect([file, selector, OUTLINE_REPLACED[selector] ?? 'NOT ALLOWED']).not.toContain('NOT ALLOWED');
            }
        }
    });

    it('draws a 2 px focus-ring outline with a 2 px offset everywhere', () => {
        const design = strip(readFileSync(join(SRC, 'design/design.css'), 'utf8'));
        expect(design).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--ql-color-focus-ring\);\s*outline-offset:\s*2px;\s*\}/);
    });

    it('stops every movement under prefers-reduced-motion, glows included only as static light (§4.7)', () => {
        const design = strip(readFileSync(join(SRC, 'design/design.css'), 'utf8'));
        expect(design).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*transition-duration:\s*0ms !important;[^@]*animation-duration:\s*0ms !important;[^@]*scroll-behavior:\s*auto !important;/);
    });

    // Ruling T18-a11y-carry (c): a scrolling list clips whatever leaves its padding box, and the
    // ring reaches 4 px past a tile (2 px offset + 2 px width), so the strip's first and last
    // tiles need 4 px of padding on every side or their ring is cut off.
    it('leaves the strip room for a whole ring around its first and last tiles', () => {
        const css = strip(readFileSync(join(SRC, 'shell/strip.css'), 'utf8'));
        const rule = /\.strip-list\s*\{([^}]*)\}/.exec(css)![1];
        expect(rule).toMatch(/overflow-x:\s*auto/);
        const padding = /padding:\s*([^;]+);/.exec(rule)![1].trim().split(/\s+/).map(value => parseFloat(value));
        const [top, right = top, bottom = top, left = right] = padding;
        expect(Math.min(top, right, bottom, left)).toBeGreaterThanOrEqual(4);
    });
});
