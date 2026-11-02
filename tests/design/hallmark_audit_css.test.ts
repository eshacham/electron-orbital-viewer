// Hallmark audit fixes, read from the source: the search field's edge, the page's overflow, the pages' descriptions,
// balanced titles and the colour literal outside the tokens.
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
/** Every declaration block whose selector list contains `selector` exactly. */
function rulesOf(text: string, selector: string): string[] {
    const found: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    const clean = withoutComments(text);
    for (let match = pattern.exec(clean); match; match = pattern.exec(clean)) {
        if (match[1].split(',').map(part => part.trim()).includes(selector)) found.push(match[2]);
    }
    return found;
}

describe('the search field\'s edge (audit FAIL 40)', () => {
    it('rests on control-edge, not the 1.5:1 border-subtle; focus keeps its brass ring', () => {
        const rule = rulesOf(read('src/shell/search.css'), '.global-search').join(' ');
        expect(rule).toMatch(/border:\s*1px solid var\(--ql-color-control-edge\)/);
        expect(rule).not.toContain('border-subtle');
        expect(rulesOf(read('src/shell/search.css'), '.global-search:focus-within').join(' ')).toContain('var(--ql-color-focus-ring)');
    });
    it('is a generated token in every temper block', () => {
        const css = read('src/design/tokens.css');
        expect(css.match(/--ql-color-control-edge:/g)).toHaveLength(2 + 8 + 2); // modes, tempers, field blocks
    });
});

describe('the page\'s overflow (audit FAIL 34)', () => {
    it('clips html, body and #root, never hides them (a hidden box is a scroll container and breaks sticky)', () => {
        const rule = rulesOf(read('src/style.css'), 'html').join(' ');
        expect(rule).toMatch(/overflow(-x)?:\s*clip\b/);
        expect(rule).not.toMatch(/overflow(-x)?:\s*hidden/);
        expect(rulesOf(read('src/style.css'), '#root').join(' ')).not.toMatch(/overflow(-x)?:\s*hidden/);
    });
});

describe('the pages\' descriptions (audit F23)', () => {
    it('gives the viewer and the dashboard one meta description each', () => {
        const viewer = read('public/index.html');
        const admin = read('public/admin.html');
        expect(viewer.match(/<meta name="description"/g)).toHaveLength(1);
        expect(admin.match(/<meta name="description"/g)).toHaveLength(1);
        expect(viewer).toContain('<meta name="description" content="QuantumLab: interactive 3D orbitals, atoms, bonds and molecules, computed from quantum mechanics, with every method and limit stated.">');
        expect(admin).toContain('<meta name="description" content="QuantumLab owner dashboard: molecule calculation jobs and their cost.">');
    });
});

describe('balanced titles (audit F3)', () => {
    it('sets the specimen title and Info\'s title to text-wrap: balance', () => {
        expect(rulesOf(read('src/shell/viewport.css'), '.viewport-title h1').join(' ')).toMatch(/text-wrap:\s*balance/);
        expect(rulesOf(read('src/info/info.css'), '.info-title').join(' ')).toMatch(/text-wrap:\s*balance/);
    });
    // Owner, 2026-11-02, after the Hallmark audit: the view line under each title balances too.
    // Live check (Chrome's accessibility tree): an absolutely positioned visually-hidden ", " is read as a block, so the h1
    // was named "Magnesium, excited 3s → 3p , whole atom". The pause stays inline, clipped to nothing.
    it('keeps the title\'s pause inline and clipped, so the heading is named "<title>, <view>"', () => {
        const rule = rulesOf(read('src/style.css'), '.visually-hidden.title-pause').join(' ');
        expect(rule).toMatch(/position:\s*static/);
        expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
        expect(rule).toMatch(/clip:\s*auto/);
    });
    it('balances the view lines under the specimen title and Info\'s title', () => {
        expect(rulesOf(read('src/shell/viewport.css'), '.viewport-title-view').join(' ')).toMatch(/text-wrap:\s*balance/);
        expect(rulesOf(read('src/info/info.css'), '.info-title-view').join(' ')).toMatch(/text-wrap:\s*balance/);
    });
});

// Final review M1: a typeset label's plain copy ("H2" beside the visual H<sub>2</sub>) sat in an absolutely positioned
// box, and Chrome pads an out-of-flow box with spaces when it names an element from its content: the canvas h1 was named
// "Water ( H2 O)", "Nitrogen ( N2 )". An inline-block copy was padded the same way (checked live), so the copy is inline
// text at font-size 0 in a 1 x 1 box with no advance, clipped to nothing. Checked in Chrome's CDP accessibility tree
// ("Water (H2O)", "Nitrogen (N2)"); jsdom computes no layout, so this pins the CSS shape and the jsdom tests the text.
describe('a typeset label\'s plain copy is read in the line (final review M1)', () => {
    const rule = rulesOf(read('src/style.css'), '.typeset-label > .visually-hidden').join(' ');
    it('is in flow and inline (never absolute, never an inline-block), so the browser adds no space around it', () => {
        expect(rule).toMatch(/position:\s*static/);
        expect(rule).toMatch(/display:\s*inline;/);
    });
    it('takes no advance and keeps the line\'s height: font-size 0, line-height 0, a 1 px box taken back by the margin', () => {
        expect(rule).toMatch(/font-size:\s*0;/);
        expect(rule).toMatch(/line-height:\s*0;/);
        expect(rule).toMatch(/padding:\s*1px 0 0 1px/);
        expect(rule).toMatch(/margin:\s*0 0 0 -1px/);
        expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
        expect(rule).toMatch(/white-space:\s*nowrap/);
    });
    it('still cannot be selected, so copied text reads once', () => {
        expect(rule).toMatch(/user-select:\s*none/);
    });
});

describe('the structure preview\'s atom rim (audit FAIL 48)', () => {
    it('is drawn in a token (the backdrop it sits on), not an rgba literal', () => {
        const rule = rulesOf(read('src/style.css'), '.structure-preview-atom').join(' ');
        expect(rule).toMatch(/stroke:\s*var\(--ql-color-canvas-solid\)/);
        expect(rule).toMatch(/stroke-opacity:\s*0?\.6/);
        expect(rule).not.toMatch(/rgba?\(/);
    });
});
