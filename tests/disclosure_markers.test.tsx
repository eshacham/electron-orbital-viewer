// Final fix wave, finish fix 1: every <details> in the app wears the Info "How this was computed" disclosure -- no browser
// marker (it is a glyph the app does not draw), and a trailing ExpandMore that turns over when open.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react';
import MoleculePropertiesCard from '../src/molecule_ui/MoleculePropertiesCard';
import { waterMeta } from './molecules/fixtures';

const SRC = path.resolve(__dirname, '../src');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');

describe('disclosures: no default marker, a trailing chevron', () => {
    it('hides the browser marker on every <details> summary, in the global stylesheet', () => {
        expect(css).toMatch(/details\s*>\s*summary\s*\{[^}]*list-style:\s*none/);
        expect(css).toMatch(/details\s*>\s*summary::-webkit-details-marker\s*\{\s*display:\s*none/);
    });

    it('turns the chevron over when open, over the hover motion token (zero under reduced motion)', () => {
        expect(css).toMatch(/\.disclosure-chevron\s*\{[^}]*transition:\s*transform var\(--ql-motion-hover\)/);
        expect(css).toMatch(/details\[open\]\s*>\s*summary\s+\.disclosure-chevron\s*\{[^}]*rotate\(180deg\)/);
    });

    it('gives every <summary> in src a DisclosureChevron (so a new disclosure cannot ship a bare, markerless summary)', () => {
        const offenders: string[] = [];
        let found = 0;
        for (const file of walk(SRC).filter(f => /\.tsx$/.test(f) && !/\.test\./.test(f))) {
            const source = fs.readFileSync(file, 'utf8');
            for (const match of source.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)) {
                found += 1;
                if (!/<DisclosureChevron\b|<ExpandMore\b/.test(match[1])) offenders.push(`${path.relative(SRC, file)}: ${match[1].trim().slice(0, 40)}`);
            }
        }
        expect(found).toBeGreaterThanOrEqual(5);
        expect(offenders).toEqual([]);
    });

    it('draws Molecules\' Structure disclosure with an aria-hidden chevron after its count', () => {
        const { container } = render(<MoleculePropertiesCard meta={waterMeta()} />);
        const summary = container.querySelector('details.molecule-structure > summary') as HTMLElement;
        const icon = summary.querySelector('svg.disclosure-chevron') as SVGElement;
        expect(icon).not.toBeNull();
        expect(icon).toHaveAttribute('aria-hidden', 'true');
        expect(summary.lastElementChild).toBe(icon);
        // The accessible text is unchanged: the icon adds nothing to it.
        expect(summary).toHaveTextContent(/^Structure2 bonds · 1 angle$/);
    });
});
