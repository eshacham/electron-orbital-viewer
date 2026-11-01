// Brass Instrument Task 4: the engraved graticule and the selection audit -- read from the CSS source, like
// final_polish_css.test.ts and serif_signature.test.ts.
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');
/** Every declaration block whose selector list contains `selector` exactly, joined. */
function rulesOf(text: string, selector: string): string {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const found: string[] = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    for (let match = pattern.exec(stripped); match; match = pattern.exec(stripped)) {
        if (match[1].split(',').map(part => part.trim()).includes(selector)) found.push(match[2]);
    }
    return found.join(' ');
}
const EDGE = 'var(--ql-color-selected-edge)';
const RING = 'var(--ql-shadow-selected)'; // 0 0 0 1px selected-edge (tokens.ts SHADOWS)

describe('the engraved scale bar (graticule)', () => {
    const style = src('style.css');

    it('is a 1 px accent rule, 8 px end ticks and 4 px graduations, all in the accent', () => {
        expect(rulesOf(style, '.scale-readout-bar')).toMatch(/border-bottom:\s*1px solid var\(--ql-color-accent\)/);
        expect(rulesOf(style, '.scale-readout-bar')).toMatch(/height:\s*9px/); // the 9 px the old bracket took: no layout moves
        expect(rulesOf(style, '.scale-tick')).toMatch(/width:\s*1px/);
        expect(rulesOf(style, '.scale-tick')).toMatch(/background:\s*var\(--ql-color-accent\)/);
        expect(rulesOf(style, '.scale-tick-end')).toMatch(/height:\s*8px/);
        expect(rulesOf(style, '.scale-tick-graduation')).toMatch(/height:\s*4px/);
    });

    it('sets the label in text-1, the same size as before, on the field\'s surface', () => {
        const readout = rulesOf(style, '.scale-readout');
        expect(readout).toMatch(/color:\s*var\(--ql-color-text-1\)/);
        expect(readout).toMatch(/font-size:\s*14px/);
        expect(rulesOf(style, '.scale-readout-label')).not.toMatch(/color:/); // inherits text-1
    });

    it('leaves no 2 px text-1 bracket on the bar', () => {
        expect(rulesOf(style, '.scale-readout-bar')).not.toMatch(/2px solid/);
        expect(rulesOf(style, '.scale-readout-bar')).not.toMatch(/text-1/);
    });
});

// Selection is never carried by a fill alone: each selected state also shows the brass edge (selected-edge) -- tabs a
// 2 px underline, toggles and chips a 1 px edge, the strip tile a 2 px ring.
describe('every selected state shows the brass edge, not the fill alone', () => {
    it('panel tabs and mode tabs: a 2 px selected-edge underline', () => {
        const tabs = src('shell/tabs.css');
        const underline = rulesOf(tabs, '.ql-tab[aria-selected="true"]::after');
        expect(underline).toMatch(/height:\s*2px/);
        expect(underline).toMatch(new RegExp(`background:\\s*${EDGE.replace(/[()]/g, '\\$&')}`));
        const bar = src('shell/top_bar.css');
        const mode = rulesOf(bar, '.app-topbar-tab[aria-current="page"]::after');
        expect(mode).toMatch(/height:\s*2px/);
        expect(mode).toContain(`background: ${EDGE}`);
        // The phone's sheet tabs mark the selected one with a 2 px top edge.
        const phone = src('style.css');
        expect(rulesOf(phone, '.phone-sheet-tab')).toMatch(/border-top:\s*2px solid transparent/);
        expect(rulesOf(phone, '.phone-sheet-tab[aria-selected="true"]')).toContain(`border-top-color: ${EDGE}`);
    });

    it('the phone\'s mode menu item: the selected-edge border and ring', () => {
        const item = rulesOf(src('shell/rail.css'), '.app-rail-item[aria-pressed="true"]');
        expect(item).toContain(`border-color: ${EDGE}`);
        expect(item).toContain(`box-shadow: ${RING}`);
    });

    it('the strip tile: a 2 px selected-edge ring', () => {
        expect(rulesOf(src('shell/strip.css'), '.strip-tile.selected .strip-tile-image::after')).toMatch(new RegExp(`border:\\s*2px solid ${EDGE.replace(/[()]/g, '\\$&')}`));
    });

    it('the chips: the Basics chip an edge border, the shell and subshell chips the selected ring', () => {
        expect(rulesOf(src('basic_ui/basic_explore.css'), '.basic-chip.selected')).toContain(`border: 1px solid ${EDGE}`);
        const style = src('style.css');
        expect(rulesOf(style, '.subshell-chip.selected')).toContain(`box-shadow: ${RING}`);
        expect(rulesOf(style, '.level-nav-shell-chip.selected')).toContain(`box-shadow: ${RING}`);
        expect(rulesOf(src('admin/admin.css'), '.admin-chips .admin-chip.is-selected')).toContain(`border-color: ${EDGE}`);
    });

    it('the magnetic-number buttons: the selected ring besides the tint', () => {
        expect(rulesOf(src('style.css'), '.subshell-ml-button.selected')).toContain(`box-shadow: ${RING}`);
    });

    it('the MO level buttons: a selected-edge border (not the fill\'s colour) and the ring', () => {
        const box = rulesOf(src('style.css'), '.mo-box.selected');
        expect(box).toContain(`border-color: ${EDGE}`);
        expect(box).toContain(`box-shadow: ${RING}`);
        expect(box).not.toMatch(/border-color:\s*var\(--ql-color-selected-fill\)/);
    });

    it('the orbital rows and the level control\'s options (bar and phone menu): the selected edge', () => {
        expect(rulesOf(src('style.css'), '.molecule-orbital-row.selected')).toContain(`border-color: ${EDGE}`);
        const levels = rulesOf(src('levels/levels.css'), '.level-control-option.checked');
        expect(levels).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--ql-color-selected-edge\)/);
    });

    it('the periodic table tiles: the selected ring', () => {
        expect(rulesOf(src('style.css'), '.periodic-tile.selected')).toContain(`box-shadow: 0 0 0 2px ${EDGE}`);
        expect(rulesOf(src('atom_ui/periodic_table_mini.css'), '.periodic-table-mini-cell.selected')).toContain(`box-shadow: 0 0 0 1px ${EDGE}`);
    });

    it('the pressed (i): the selected-edge border, over the fill', () => {
        const info = src('info/info.css');
        expect(rulesOf(info, '.info-button')).toMatch(/border:\s*1\.5px solid/);
        expect(rulesOf(info, '.info-button.is-active')).toContain(`border-color: ${EDGE}`);
    });
});

// Parked from Task 2: the title is set once, at the token size (17/24); nothing sets a 14 px title over it.
describe('Info\'s title keeps its token size', () => {
    it('has no .info-title rule that sets 14 px', () => {
        for (const file of ['info/info.css', 'style.css', 'shell/inspector.css', 'shell/viewport.css', 'design/design.css']) {
            expect(rulesOf(src(file), '.info-title')).not.toMatch(/font-size:\s*14px/);
            expect(rulesOf(src(file), '.info-title')).not.toMatch(/font:\s*[^;]*14px/);
        }
    });
});
