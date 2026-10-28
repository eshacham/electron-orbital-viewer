import React from 'react';
import { render, screen } from '@testing-library/react';
import { OrbitalLabel } from '../../src/format/OrbitalLabel';

// Final review (unverified item, checked): no aria-label on a role-less span (ARIA 1.2 prohibits it). The typeset
// visual is aria-hidden, and a visually hidden plain copy is read -- so each test reads the name a heading computes.
const heading = () => screen.getByRole('heading', { level: 2 });

describe('OrbitalLabel', () => {
    it("renders 3d with a z² subscript, read without the underscore", () => {
        render(<h2><OrbitalLabel n={3} l={2} ml={0} /></h2>);
        expect(heading()).toHaveAccessibleName('3dz²');
        expect(heading().querySelector('[aria-label]')).toBeNull();
        const visual = heading().querySelector('[aria-hidden="true"]')!;
        expect(visual.textContent).toBe('3dz²');
        expect(visual.querySelector('sub')?.textContent).toBe('z²');
    });

    it("renders 2p with an x subscript", () => {
        render(<h2><OrbitalLabel n={2} l={1} ml={1} /></h2>);
        expect(heading()).toHaveAccessibleName('2px');
        expect(heading().querySelector('[aria-hidden="true"] sub')?.textContent).toBe('x');
    });

    it('renders the mₗ fallback past f as plain text, with no subscript and no copy', () => {
        render(<h2><OrbitalLabel n={7} l={4} ml={2} /></h2>);
        expect(heading()).toHaveAccessibleName('7g (mₗ = +2)');
        expect(heading().textContent).toBe('7g (mₗ = +2)');
        expect(heading().querySelector('sub')).toBeNull();
    });
});
