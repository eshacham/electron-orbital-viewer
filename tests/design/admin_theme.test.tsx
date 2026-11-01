import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../../src/store/jobsSlice';
import AdminApp from '../../src/admin/AdminApp';

describe('/admin.html reads the theme (spec §6.3, §9.7)', () => {
    it('offers the same theme switch as the viewer', () => {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        render(<Provider store={store}><AdminApp /></Provider>);
        expect(screen.getByRole('button', { name: /^Theme: / })).toBeInTheDocument();
    });

    // Brass Instrument Task 2 (name and assertion tightened in Task 4): the admin wordmark is the shared one -- the
    // `.ql-wordmark` class is what design.css sets in serif, and the admin entry loads design.css -- in one colour
    // from CSS: no inline style, no gradient.
    it('shows the shared wordmark (the class design.css sets in serif), unstyled inline, and the entry loads design.css', () => {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        const { container } = render(<Provider store={store}><AdminApp /></Provider>);
        const wordmark = container.querySelector('.admin-brand .ql-wordmark') as HTMLElement;
        expect(wordmark.textContent).toBe('QuantumLab');
        expect(wordmark.className).toBe('ql-wordmark');
        expect(wordmark.innerHTML).not.toMatch(/gradient|style=/);
        expect(wordmark.hasAttribute('style')).toBe(false);
        const entry = readFileSync(resolve(__dirname, '../../src/admin/main.tsx'), 'utf8');
        expect(entry).toContain("import '../design/design.css';");
        const design = readFileSync(resolve(__dirname, '../../src/design/design.css'), 'utf8');
        expect(/\.ql-wordmark\s*\{[^}]*font-family:\s*var\(--ql-font-serif\)/.test(design)).toBe(true);
    });
});
