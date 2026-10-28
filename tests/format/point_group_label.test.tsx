import React from 'react';
import { render, screen } from '@testing-library/react';
import { PointGroupLabel } from '../../src/format/PointGroupLabel';

// Ruling T3-pg: every point group the shipped molecule library actually uses (from
// W/task-3-review.md's scan of tools/molecules/out/v3/*/meta.json), not just the brief's four
// typedPointGroup examples — Unicode has no subscript "d", so Td and D3d need a real <sub>.
describe('PointGroupLabel', () => {
    it.each([
        ['C2v', 'C', '2v'],
        ['C3v', 'C', '3v'],
        ['Cs', 'C', 's'],
        ['Coov', 'C', '∞v'],
        ['D2h', 'D', '2h'],
        ['D3d', 'D', '3d'],
        ['D3h', 'D', '3h'],
        ['D6h', 'D', '6h'],
        ['Dooh', 'D', '∞h'],
        ['Oh', 'O', 'h'],
        ['Td', 'T', 'd'],
    ])('renders %s as %s with <sub>%s</sub>', (pg, main, sub) => {
        const normalized = `${main}${sub}`;
        // Final review (unverified item, checked): no aria-label on the role-less span; the visual is aria-hidden and a
        // visually hidden plain copy is read, so the name a heading computes is the plain written form.
        render(<h2><PointGroupLabel pg={pg} /></h2>);
        expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleName(normalized);
        const el = screen.getByRole('heading', { level: 2 }).querySelector('[aria-hidden="true"]')!;
        expect(el.textContent).toBe(normalized);
        expect(el.querySelector('sub')?.textContent).toBe(sub);
        // the leading letter itself must sit outside the <sub>, not just be part of its text
        expect(el.querySelector('sub')?.previousSibling?.textContent).toBe(main);
    });
});
