import React from 'react';
import { render } from '@testing-library/react';
import { BRAND } from '../../src/design/brands';
import Wordmark from '../../src/design/Wordmark';
import BrandMark from '../../src/design/BrandMark';

describe('Wordmark and BrandMark', () => {
    // Brass Instrument Ruling P1: one colour, serif, from CSS (accent-text); no gradient, no inline colour, no brand hex.
    it('renders the name as two spans with no gradient and no inline colour', () => {
        const { container } = render(<Wordmark brand={BRAND} />);
        expect(container.textContent).toBe('QuantumLab');
        const second = container.querySelector('.ql-wordmark-second') as HTMLElement;
        expect(second.textContent).toBe('Lab');
        expect(second.className).not.toContain('gradient');
        expect(container.innerHTML).not.toMatch(/gradient|#[0-9a-fA-F]{6}|style=/);
    });

    it('draws the mark as decoration beside the name', () => {
        const { container } = render(<BrandMark size={28} />);
        const svg = container.querySelector('svg.ql-brand-mark')!;
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect(svg.querySelectorAll('ellipse')).toHaveLength(3);
    });
});
