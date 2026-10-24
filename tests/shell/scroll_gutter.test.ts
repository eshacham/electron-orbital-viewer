// tests/shell/scroll_gutter.test.ts -- owner R25-A4: switching Molecules' surface (Density → ESP → Orbitals → No
// surface) changed how tall Explore's and the inspector's content was, so their scrollbars came and went and the
// content width jumped with them -- a flicker. Each of those scroll containers reserves the scrollbar's gutter, so
// the content width never depends on whether a scrollbar is showing. jsdom does no layout; the rules' own source
// is read (the project's way of pinning a CSS property), and the live check measures the widths frame by frame.
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sheet = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function rule(css: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^\\s*${escaped} \\{`, 'm').exec(css);
    if (!match) throw new Error(`No rule for ${selector}`);
    return css.slice(match.index, css.indexOf('}', match.index));
}

// Molecules' Explore scrolls in .molecule-explore-scroll, inside .explore-body (which then never overflows): only the
// inner one reserves a gutter, or the column would lose two.
describe('the panels reserve their scrollbar gutter (R25-A4)', () => {
    it.each([
        ['src/style.css', '.molecule-explore-scroll'],
        ['src/shell/inspector.css', '.inspector-body'],
        ['src/shell/inspector.css', '.inspector-section-body'],
    ])('%s %s', (path, selector) => {
        const body = rule(sheet(path), selector);
        expect(body).toMatch(/overflow-y: auto/);
        expect(body).toMatch(/scrollbar-gutter: stable/);
    });
});
