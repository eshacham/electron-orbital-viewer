import React from 'react';
import { render } from '@testing-library/react';
import { BRAND, type Brand } from '../../src/design/brands';
import Wordmark from '../../src/design/Wordmark';
import BrandMark from '../../src/design/BrandMark';

describe('Wordmark and BrandMark', () => {
    it('renders the two-tone name, the second part in the accent with a solid fallback', () => {
        const { container } = render(<Wordmark brand={BRAND} mode="dark" />);
        expect(container.textContent).toBe('QuantumLab');
        const second = container.querySelector('.ql-wordmark-second') as HTMLElement;
        expect(second.textContent).toBe('Lab');
        expect(second.className).toContain('gradient');
        expect(second.style.getPropertyValue('--ql-brand-solid')).toBe('#8A6CFF');
    });

    // Owner R25-B3: the one brand's accent is a gradient in both themes; a solid accent (was AtomVista's) is a Brand's
    // other shape, kept by Wordmark, so it is checked on a brand made up here.
    it('keeps a solid accent solid', () => {
        const solid: Brand = { name: 'TestLab', parts: ['Test', 'Lab'], accent: { dark: '#5AA9FF', light: '#1559D6' } };
        const { container } = render(<Wordmark brand={solid} mode="light" />);
        const second = container.querySelector('.ql-wordmark-second') as HTMLElement;
        expect(second.className).not.toContain('gradient');
        expect(second.style.getPropertyValue('--ql-brand-solid')).toBe('#1559D6');
    });

    it('draws the mark as decoration beside the name', () => {
        const { container } = render(<BrandMark size={28} />);
        const svg = container.querySelector('svg.ql-brand-mark')!;
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect(svg.querySelectorAll('ellipse')).toHaveLength(3);
    });
});
