import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { TEMPER_LEVELS, THEME_MODES, colorsAt } from '../../src/design/tokens';

/**
 * Final review M7: text-3 (4.33-4.43:1) and accent-text (4.32:1 in light Basics) fall under 4.5:1 on selected-fill in
 * the tempers, so a selected row, chip or option may never draw them. Every stylesheet rule that paints selected-fill, and
 * every rule for a part inside a selected row, takes on-fill (text-1) or text-2 ink -- both pinned AA on it below.
 */
const SRC = resolve(__dirname, '../../src');
function stylesheets(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return stylesheets(path);
        return name.endsWith('.css') && name !== 'tokens.css' ? [path] : [];
    });
}

const SELECTED_STATE = '(?:\\.selected|\\.checked|\\.chosen|\\.is-selected|\\.is-active|\\[aria-(?:pressed|checked|selected)="true"\\])';
const INSIDE_SELECTED = new RegExp(`${SELECTED_STATE}(?::hover)?\\s+\\S`);
const ALLOWED_INK = ['on-fill', 'text-1', 'text-2'];

interface Rule { file: string; selector: string; ink: string[] }
const rules: Rule[] = [];
const paintsSelectedFill: Rule[] = [];
for (const file of stylesheets(SRC)) {
    const sheet = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1].trim().replace(/\s+/g, ' ');
        const ink = [...match[2].matchAll(/(?:^|[;\s])color:\s*var\(--ql-color-([\w-]+)\)/g)].map(m => m[1]);
        const rule = { file: file.slice(SRC.length + 1), selector, ink };
        if (/background(?:-color)?:[^;]*--ql-color-selected-fill/.test(match[2])) paintsSelectedFill.push(rule);
        if (selector.split(',').some(part => INSIDE_SELECTED.test(part.trim()))) rules.push(rule);
    }
}

describe('selected rows draw on-fill or text-2, never text-3 or accent-text', () => {
    it('finds the stylesheets\' selected-fill rules (so the scan cannot go quietly empty)', () => {
        expect(paintsSelectedFill.length).toBeGreaterThanOrEqual(6);
    });

    it.each(paintsSelectedFill.map(rule => [`${rule.file}: ${rule.selector}`, rule] as const))('%s', (_name, rule) => {
        for (const role of rule.ink) expect(ALLOWED_INK).toContain(role);
    });

    it('keeps every rule for a part inside a selected row off text-3 and accent-text', () => {
        const offending = rules.flatMap(rule => rule.ink.filter(role => role === 'text-3' || role === 'accent-text').map(role => `${rule.file}: ${rule.selector} -> ${role}`));
        expect(offending).toEqual([]);
    });

    it('draws the MUI selected style (theme.ts) in on-fill', () => {
        const theme = readFileSync(join(SRC, 'design/theme.ts'), 'utf8');
        expect(theme).toMatch(/backgroundColor: t\['selected-fill'\], color: t\['on-fill'\]/);
    });

    it.each(THEME_MODES.flatMap(mode => TEMPER_LEVELS.map(level => [mode, level] as const)))('on-fill and text-2 are at least 4.5:1 on selected-fill in %s / %s', (mode, level) => {
        const t = colorsAt(mode, level);
        const ratio = (fg: string, bg: string) => { const [r1, g1, b1] = parseCssColor(fg); const [r2, g2, b2] = parseCssColor(bg); return contrastRatio([r1, g1, b1], [r2, g2, b2]); };
        for (const ink of ['on-fill', 'text-2'] as const) expect([ink, ratio(t[ink], t['selected-fill']) >= 4.5]).toEqual([ink, true]);
    });
});
