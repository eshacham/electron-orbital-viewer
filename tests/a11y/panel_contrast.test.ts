import { readFileSync } from 'fs';
import { resolve } from 'path';
import { worstCaseContrast } from '../../src/a11y/contrast';
import { appTheme } from '../../src/theme';

/**
 * Every panel is translucent over the 3D view, so its text has to read over
 * the worst thing that can sit behind it: the black scene or a lit lobe.
 * These pin WCAG AA (4.5:1) on the colours style.css actually declares.
 */
const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8');
/** The top-level rule for `selector` -- anchored to a line start, so `.view-panel .radial-plot {` is not mistaken for `.radial-plot {`. */
function rule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^\\s*${escaped} \\{`, 'm').exec(css);
    if (!match) throw new Error(`No rule for ${selector}`);
    return css.slice(match.index, css.indexOf('}', match.index));
}

const DARK_85 = 'rgba(8, 8, 10, 0.85)';
const LIGHT_96 = 'rgba(240, 240, 240, 0.96)';
const PAIRS: Array<{ selector: string; declared: string; fg: string; bg: string }> = [
    { selector: '.scale-readout', declared: `background: ${DARK_85}`, fg: '#ffffff', bg: DARK_85 },
    { selector: '.radial-plot', declared: `background: ${DARK_85}`, fg: '#ffffff', bg: DARK_85 },
    { selector: '.radial-plot-note', declared: 'color: rgba(255, 255, 255, 0.55)', fg: 'rgba(255, 255, 255, 0.55)', bg: DARK_85 },
    { selector: '.radial-plot-scale', declared: 'color: rgba(255, 255, 255, 0.7)', fg: 'rgba(255, 255, 255, 0.7)', bg: DARK_85 },
    { selector: '.phase-legend', declared: `background: ${DARK_85}`, fg: '#ffffff', bg: DARK_85 },
    // Task 12: the "non-relativistic" dashed-curve key in the radial plot's
    // legend is plain text in this rule (no colour of its own), so it reads
    // at the same contrast as every other legend item.
    { selector: '.radial-plot-legend', declared: 'color: rgba(255, 255, 255, 0.85)', fg: 'rgba(255, 255, 255, 0.85)', bg: DARK_85 },
    // MUI's secondary text (helper lines, legends) on the controls card.
    { selector: '#controls', declared: `background-color: ${LIGHT_96}`, fg: 'rgba(0, 0, 0, 0.6)', bg: LIGHT_96 },
    { selector: '.side-panel .level-nav', declared: `background-color: ${LIGHT_96}`, fg: 'rgba(0, 0, 0, 0.87)', bg: LIGHT_96 },
    { selector: '.level-nav-header', declared: `background: ${LIGHT_96}`, fg: 'rgba(0, 0, 0, 0.72)', bg: LIGHT_96 },
    { selector: '.level-nav-breadcrumbs', declared: 'color: rgba(0, 0, 0, 0.87)', fg: 'rgba(0, 0, 0, 0.87)', bg: LIGHT_96 },
    // Opacity on body text (0.87 alpha): 0.75 × 0.87 = 0.6525.
    { selector: '.level-nav-valence-note', declared: 'opacity: 0.75', fg: 'rgba(0, 0, 0, 0.6525)', bg: LIGHT_96 },
    { selector: '.level-nav-shell-hint', declared: 'opacity: 0.7', fg: 'rgba(0, 0, 0, 0.609)', bg: LIGHT_96 },
    { selector: '.phone-sheet-tab[aria-selected="true"]', declared: 'color: #1565c0', fg: '#1565c0', bg: 'rgba(240, 240, 240, 0.97)' },
    // SpeciesControls (Task 11 fix round, I1): sits on the same light card as
    // the rest of LevelNav, so it needs the same dark-on-light treatment.
    { selector: '.species-method', declared: 'color: #1f4e9a', fg: '#1f4e9a', bg: LIGHT_96 },
    { selector: '.species-measured', declared: 'color: rgba(0, 0, 0, 0.62)', fg: 'rgba(0, 0, 0, 0.62)', bg: LIGHT_96 },
    { selector: '.species-compare', declared: 'color: rgba(0, 0, 0, 0.7)', fg: 'rgba(0, 0, 0, 0.7)', bg: LIGHT_96 },
    // Phase 4: the Relativity switch's "what changed" readout, on #controls's
    // light card (the phone's View tab is the same light sheet).
    { selector: '.relativity-what-changed', declared: 'color: rgba(0, 0, 0, 0.78)', fg: 'rgba(0, 0, 0, 0.78)', bg: LIGHT_96 },
    // Task 11 (ruling C6): MoDiagram sits in BondsPanel, on the same light
    // card as LevelNav, so its strokes and captions need dark-on-light too.
    { selector: '.mo-diagram', declared: 'color: rgba(0, 0, 0, 0.87)', fg: 'rgba(0, 0, 0, 0.87)', bg: LIGHT_96 },
    { selector: '.mo-box', declared: 'border-bottom: 2px solid rgba(0, 0, 0, 0.87)', fg: 'rgba(0, 0, 0, 0.87)', bg: LIGHT_96 },
    { selector: '.mo-break', declared: 'color: rgba(0, 0, 0, 0.6)', fg: 'rgba(0, 0, 0, 0.6)', bg: LIGHT_96 },
    { selector: '.mo-note', declared: 'color: rgba(0, 0, 0, 0.6)', fg: 'rgba(0, 0, 0, 0.6)', bg: LIGHT_96 },
    { selector: '.mo-footer', declared: 'color: rgba(0, 0, 0, 0.6)', fg: 'rgba(0, 0, 0, 0.6)', bg: LIGHT_96 },
];

describe('panel text meets WCAG AA over any backdrop', () => {
    it.each(PAIRS.map(p => [p.selector, p] as const))('%s', (selector, pair) => {
        expect(rule(selector)).toContain(pair.declared);
        expect(worstCaseContrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5);
    });

    it('the theme primary reads on the light cards, and white reads on it', () => {
        const primary = appTheme.palette.primary.main;
        expect(worstCaseContrast(primary, LIGHT_96)).toBeGreaterThanOrEqual(4.5);
        expect(worstCaseContrast('#ffffff', primary)).toBeGreaterThanOrEqual(4.5);
    });
});
