// Final polish, Task 2 (F4): token radii, one-line energy headers, a visible MO level hover -- read from the CSS source.
import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');
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

describe('radii (final polish F4)', () => {
    const style = css('style.css');
    it('draws no 10 px corner: the phone caption, the level header and the job status take a radius token', () => {
        expect(style).not.toMatch(/border-radius:\s*10px/);
        expect(rulesOf(style, '.phone-caption').join(' ')).toMatch(/border-radius:\s*var\(--ql-radius-(md|lg)\)/);
        expect(rulesOf(style, '.level-nav-header').join(' ')).toMatch(/border-radius:\s*var\(--ql-radius-(md|lg)\)/);
        expect(rulesOf(style, '.molecule-jobs .job-status').join(' ')).toMatch(/border-radius:\s*var\(--ql-radius-(md|lg)\)/);
        expect(rulesOf(style, '.molecule-jobs .MuiAccordion-root').join(' ')).toMatch(/border-radius:\s*var\(--ql-radius-(md|lg)\)/);
    });
});

describe('the orbital energies table header (final polish F4)', () => {
    // "Energy (eV)" held on one line is wider than a heavy atom's column in the 300 px Explore panel (measured live: the
    // table scrolled sideways), so the headers are "eV" and "Ha", which can never wrap.
    it('holds each header to one line', () => {
        const rule = rulesOf(css('atom_ui/element_tile.css'), '.orbital-energy-list th').join(' ');
        expect(rule).toMatch(/white-space:\s*nowrap/);
    });
    it('right-aligns both number columns (eV, Ha) and their headers, and pads cells 4 px', () => {
        const sheet = css('atom_ui/element_tile.css');
        expect(rulesOf(sheet, '.orbital-energy-list td:nth-last-child(-n+2)').join(' ')).toMatch(/text-align:\s*right/);
        expect(rulesOf(sheet, '.orbital-energy-list th:nth-last-child(-n+2)').join(' ')).toMatch(/text-align:\s*right/);
        expect(rulesOf(sheet, '.orbital-energy-list td').join(' ')).toMatch(/padding:\s*4px;/);
    });
});

describe('the MO level hover (final polish F4, owner R26)', () => {
    const style = css('style.css');
    it('takes surface-3 on hover, and nothing later in style.css puts surface-2 back on a hovered box', () => {
        const hover = rulesOf(style, '.mo-box:hover');
        expect(hover).toHaveLength(1);
        expect(hover[0]).toMatch(/background(-color)?:\s*var\(--ql-color-surface-3\)/);
        // Surface-3 alone is a few points off surface-2 in Deep Space (measured live): the hairline strengthens as well,
        // and never on the bottom edge, which is the 2 px level line.
        expect(hover[0]).toMatch(/border-top-color:\s*var\(--ql-color-border-strong\)/);
        expect(hover[0]).toMatch(/border-left-color:\s*var\(--ql-color-border-strong\)/);
        expect(hover[0]).toMatch(/border-right-color:\s*var\(--ql-color-border-strong\)/);
        expect(hover[0]).not.toMatch(/border-bottom|border-color:/);
        const at = style.indexOf('.mo-box:hover');
        const later = style.slice(at + 1);
        expect(later).not.toMatch(/\.mo-box(?![-\w:.])[^{]*\{[^}]*background(-color)?:\s*var\(--ql-color-surface-2\)/);
    });
});
