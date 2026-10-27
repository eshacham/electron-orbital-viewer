import React from 'react';
import { render, screen } from '@testing-library/react';
import { OrbitalLabel } from '../../src/format/OrbitalLabel';

describe('OrbitalLabel', () => {
    it("renders 3d with a z² subscript, and an aria-label without the underscore", () => {
        render(<OrbitalLabel n={3} l={2} ml={0} />);
        const el = screen.getByLabelText('3dz²');
        expect(el.textContent).toBe('3dz²');
        expect(el.querySelector('sub')?.textContent).toBe('z²');
    });

    it("renders 2p with an x subscript", () => {
        render(<OrbitalLabel n={2} l={1} ml={1} />);
        const el = screen.getByLabelText('2px');
        expect(el.textContent).toBe('2px');
        expect(el.querySelector('sub')?.textContent).toBe('x');
    });

    it('renders the mₗ fallback past f with no subscript element', () => {
        render(<OrbitalLabel n={7} l={4} ml={2} />);
        const el = screen.getByLabelText('7g (mₗ = +2)');
        expect(el.textContent).toBe('7g (mₗ = +2)');
        expect(el.querySelector('sub')).toBeNull();
    });
});
