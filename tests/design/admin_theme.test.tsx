import React from 'react';
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

    // Brass Instrument Task 2: the admin wordmark is the shared one, so it carries the serif class (design.css sets it).
    it('shows the serif wordmark, one colour and no gradient', () => {
        const store = configureStore({ reducer: { jobs: jobsReducer } });
        const { container } = render(<Provider store={store}><AdminApp /></Provider>);
        const wordmark = container.querySelector('.admin-brand .ql-wordmark') as HTMLElement;
        expect(wordmark.textContent).toBe('QuantumLab');
        expect(wordmark.innerHTML).not.toMatch(/gradient|style=/);
    });
});
