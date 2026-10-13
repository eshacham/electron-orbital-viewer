import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LAYOUT, TOKENS, tokensCss, cssVar } from '../../src/design/tokens';

describe('design tokens (spec §4)', () => {
    it('tokens.css is exactly what tools/design/gen_tokens.mjs makes of tokens.ts', () => {
        // If this fails: node tools/design/gen_tokens.mjs, then commit both files.
        const onDisk = readFileSync(resolve(__dirname, '../../src/design/tokens.css'), 'utf8');
        expect(onDisk).toBe(tokensCss());
    });

    it('defines the same roles in both themes', () => {
        expect(Object.keys(TOKENS.light).sort()).toEqual(Object.keys(TOKENS.dark).sort());
    });

    it('names every custom property --ql-<group>-<role>', () => {
        const names = [...tokensCss().matchAll(/^\s*(--[\w-]+):/gm)].map(m => m[1]);
        expect(names.length).toBeGreaterThan(80);
        for (const name of names) expect(name).toMatch(/^--ql-(color|shadow|size|radius|space|type|font|motion)-[a-z0-9-]+$/);
        expect(cssVar('color', 'text-1')).toBe('var(--ql-color-text-1)');
    });

    it('themes the first paint: dark is the default, light overrides it', () => {
        const css = tokensCss();
        expect(css).toContain(':root, :root[data-theme="dark"] {');
        expect(css).toContain(':root[data-theme="light"] {');
        expect(css.indexOf(':root[data-theme="light"]')).toBeGreaterThan(css.indexOf(':root, :root[data-theme="dark"]'));
        expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*--ql-motion-hover: 0ms/);
    });

    it('sizes the desktop grid as §7 does: 76 + 315 + 290 + 4 × 12 = 729', () => {
        expect(LAYOUT.rail + LAYOUT.explore + LAYOUT.inspector + 4 * LAYOUT.gutter).toBe(729);
        // §8.6: PLOT_WIDTH becomes 258 (290 − 2 × 16).
        expect(LAYOUT.plotWidth).toBe(LAYOUT.inspector - 2 * LAYOUT.panelPadding);
    });

    it('carries the spec values verbatim', () => {
        expect(TOKENS.dark['bg-app']).toBe('#020F1D');
        expect(TOKENS.dark['selected-edge']).toBe('#1FB6F5');
        expect(TOKENS.light['text-3']).toBe('#5B6880');
        expect(TOKENS.light['selected-edge']).toBe('#1662E0');
    });
});
