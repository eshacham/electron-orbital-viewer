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
});
