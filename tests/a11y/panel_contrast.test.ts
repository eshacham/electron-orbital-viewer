import { readFileSync } from 'fs';
import { resolve } from 'path';
import { contrastRatio, parseCssColor } from '../../src/a11y/contrast';
import { ColorRole, THEME_MODES, TOKENS } from '../../src/design/tokens';

/**
 * Spec §13: panel_contrast reads TOKENS instead of regex-parsing literal
 * colours. Two halves: (1) style.css and admin.css paint with tokens -- no
 * stray colour literal survives except the listed science colours; (2) each
 * rule that sets text declares the tokens named here, and that pair is AA
 * in both themes.
 */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const css = read('src/style.css');
const adminCss = read('src/admin/admin.css');

/** The top-level rule for `selector`, anchored to a line start. */
function rule(selector: string, sheet: string = css): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^\\s*${escaped} \\{`, 'm').exec(sheet);
    if (!match) throw new Error(`No rule for ${selector}`);
    return sheet.slice(match.index, sheet.indexOf('}', match.index));
}

/** Colour literals allowed to stay: fixed badges and decoration (Task 12 moved the single-curve and ψ-legend literals to science.ts, set inline). */
const STYLE_LITERALS_ALLOWED = new Set([
    'rgba(91, 141, 217, 0.20)', 'rgba(217, 139, 74, 0.20)', 'rgba(74, 168, 138, 0.20)', 'rgba(157, 122, 212, 0.20)', // periodic blocks
    'rgba(0, 0, 0, 0.6)', // the structure preview's atom outlines, drawn on CPK colours
    '#a84300', '#ffffff', // the Computed tier chip and its white text (5.6:1 in both themes)
]);
const literals = (sheet: string) => [...sheet.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g)].map(m => m[0]);

const rgb = (css: string): [number, number, number] => { const [r, g, b] = parseCssColor(css); return [r, g, b]; };

interface Pair { selector: string; declares: string[]; fg: ColorRole; bg: ColorRole }
const v = (role: ColorRole) => `var(--ql-color-${role})`;
const PAIRS: Pair[] = [
    { selector: '.scale-readout', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.radial-plot', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.radial-plot-title', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.radial-plot-note', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-2' },
    { selector: '.radial-plot-scale', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-2' },
    { selector: '.radial-plot-legend', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.canvas-busy', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.canvas-unbound', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.phase-legend', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '#controls', declares: [`background-color: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.side-panel .level-nav', declares: [`background-color: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.level-nav-breadcrumbs', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    // Task 6: the valence note, the shell and isolate hints, the j-level note, the ΔSCF method label, the NIST and
    // dashed-ring lines and the relativity readout left the panels for Info (atomInfo), and their rules with them.
    { selector: '.level-nav-method', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.level-nav-about', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.subshell-panel-legend', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.periodic-table-panel', declares: [`background: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.mo-diagram', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    // Owner R26-3: a level is a pressable tile -- surface-2 at rest, surface-3 on hover, Deep Selection when drawn.
    { selector: '.mo-box', declares: [`border-bottom: 2px solid ${v('text-1')}`, `background: ${v('surface-2')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.mo-box:hover', declares: [`background: ${v('surface-3')}`], fg: 'text-1', bg: 'surface-3' },
    { selector: '.mo-box.selected,\n.mo-box.selected:hover', declares: [`background: ${v('selected-fill')}`, `color: ${v('on-fill')}`], fg: 'on-fill', bg: 'selected-fill' },
    { selector: '.mo-hint', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.mo-break', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.mo-note', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.mo-footer', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.mo-heading', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.mo-legend', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.side-panel .bonds-panel', declares: [`background-color: ${v('surface-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.bonds-panel', declares: [`color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.bonds-captions', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.bonds-density-label', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.bonds-frontier', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.bonds-note', declares: [`color: ${v('warning')}`], fg: 'warning', bg: 'surface-1' },
    { selector: '.esp-legend', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    // Task 7b: the ESP key's notes moved into Info; the key names its two ends instead, in the notes' colour.
    { selector: '.esp-legend-ends', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.molecule-picker-name', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.molecule-picker-status', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.molecule-readout', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.molecule-caption', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.molecule-orbital-degeneracy', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    // Ruling R23f: the orbital list moved from its own right-column card
    // (`.molecule-orbital-card`, removed from style.css) into the Explore
    // panel's `.molecule-nav`, whose own pairing already covers its text.
    // Task 7b fix round 1: the list's gap note, its caveat and its key moved into Info (info.css's own pairs), so their
    // rules -- `.molecule-orbital-gap`, `-gap-caveat`, `.molecule-orbital-legend` -- are gone and are not paired here.
    // Ruling R23f: the "Showing <orbital> -- pick another ... on the right"
    // summary (`.molecule-nav-orbital`) is retired along with the move --
    // the list itself, now beside the switch, already names the orbital drawn.
    { selector: '.molecule-error', declares: [`background-color: ${v('error-bg')}`, `color: ${v('error-text')}`], fg: 'error-text', bg: 'error-bg' },
    { selector: '.sign-in-error', declares: [`background-color: ${v('error-bg')}`, `color: ${v('error-text')}`], fg: 'error-text', bg: 'error-bg' },
    { selector: '.tier-badge', declares: [`background: ${v('surface-2')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-2' },
    { selector: '.molecule-jobs .job-status', declares: [`background-color: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.quote-option-note', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
    { selector: '.quote-option-unavailable', declares: [`color: ${v('warning')}`], fg: 'warning', bg: 'surface-1' },
    // Owner R25-A1: the local job server's muted line, and the command folded under it.
    { selector: '.local-server-note', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.local-server-command', declares: [`background: ${v('surface-3')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-3' },
];
// Phase 6G-3: the jobs page's text, each on the darkest/lightest surface it sits on (a row's hover and its details
// are surface-2). The cost panel's .cost-billed and the daily chart's .daily-spend-* went with them.
const ADMIN_PAIRS: Pair[] = [
    { selector: '.eov-admin-dashboard', declares: [`background: ${v('bg-app')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'bg-app' },
    { selector: '.admin-strip', declares: [`background: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.admin-strip-label', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-1' },
    { selector: '.admin-strip-note', declares: [`color: ${v('text-2')}`, `background: ${v('surface-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.admin-band-label', declares: [`fill: ${v('text-3')}`], fg: 'text-3', bg: 'bg-app' },
    { selector: '.admin-band-name', declares: [`fill: ${v('text-2')}`], fg: 'text-2', bg: 'bg-app' },
    { selector: '.admin-band-legend', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'bg-app' },
    { selector: '.admin-chip-count', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'bg-app' },
    { selector: '.admin-list', declares: [`background: ${v('surface-1')}`, `color: ${v('text-1')}`], fg: 'text-1', bg: 'surface-1' },
    { selector: '.admin-muted', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-2' },
    { selector: '.admin-molecule-meta', declares: [`color: ${v('text-3')}`], fg: 'text-3', bg: 'surface-2' },
    { selector: '.admin-over', declares: [`color: ${v('warning')}`], fg: 'warning', bg: 'surface-2' },
    { selector: '.admin-row-error', declares: [`color: ${v('danger')}`], fg: 'danger', bg: 'surface-2' },
    { selector: '.admin-detail-title', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.admin-note', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-2' },
    { selector: '.admin-error', declares: [`color: ${v('danger')}`], fg: 'danger', bg: 'surface-2' },
    { selector: '.admin-absorbed', declares: [`color: ${v('warning')}`], fg: 'warning', bg: 'surface-2' },
    { selector: '.admin-empty', declares: [`color: ${v('text-2')}`], fg: 'text-2', bg: 'surface-1' },
];

describe('the stylesheets paint with tokens', () => {
    it('style.css has no colour literal outside the listed science colours', () => {
        expect(literals(css).filter(l => !STYLE_LITERALS_ALLOWED.has(l))).toEqual([]);
    });
    it('admin.css has no colour literal at all', () => {
        expect(literals(adminCss)).toEqual([]);
    });
});

describe.each(THEME_MODES)('panel text meets WCAG AA in %s', mode => {
    it.each(PAIRS.map(p => [p.selector, p] as const))('%s', (selector, pair) => {
        for (const declaration of pair.declares) expect(rule(selector)).toContain(declaration);
        expect(contrastRatio(rgb(TOKENS[mode][pair.fg]), rgb(TOKENS[mode][pair.bg]))).toBeGreaterThanOrEqual(4.5);
    });
    it.each(ADMIN_PAIRS.map(p => [p.selector, p] as const))('admin.css %s', (selector, pair) => {
        for (const declaration of pair.declares) expect(rule(selector, adminCss)).toContain(declaration);
        expect(contrastRatio(rgb(TOKENS[mode][pair.fg]), rgb(TOKENS[mode][pair.bg]))).toBeGreaterThanOrEqual(4.5);
    });
    it('the Computed chip keeps white on its own amber', () => {
        expect(rule('.tier-badge .tier-chip-computed')).toContain('background-color: #a84300');
        expect(contrastRatio([255, 255, 255], rgb('#a84300'))).toBeGreaterThanOrEqual(4.5);
    });
    it('a chosen quote is outlined at 3:1 or better', () => {
        expect(rule('.quote-option.chosen')).toContain(`border: 2px solid ${v('selected-edge')}`);
        expect(contrastRatio(rgb(TOKENS[mode]['selected-edge']), rgb(TOKENS[mode]['surface-1']))).toBeGreaterThanOrEqual(3);
    });
});
