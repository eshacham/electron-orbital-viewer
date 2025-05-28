import React from 'react';
import { render, screen } from '@testing-library/react'; // Add screen import
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './store/orbitalSlice';
import App from './App';

// Mock OrbitalViewer component
jest.mock('./components/OrbitalViewer', () => ({
    __esModule: true,
    default: () => <div data-testid="orbital-viewer">Orbital Viewer Mock</div>
}));

// Mock just what App directly uses
jest.mock('./orbital_visualizer', () => ({
    getOptimizedParameters: () => ({ rMax: 15, isoLevel: 0.005 })
}));

// Simple store setup
const createTestStore = () => configureStore({
    reducer: { orbital: orbitalReducer }
});

// Test wrapper
const renderWithProvider = (ui: React.ReactElement) => {
    const store = createTestStore();
    return {
        store,
        ...render(
            <Provider store={store}>{ui}</Provider>
        )
    };
};

describe('App', () => {

    it('renders main components', () => {
        renderWithProvider(<App />);
        
        // Check if container exists by id
        expect(screen.getByTestId('orbital-viewer')).toBeInTheDocument();
        
        // Check for controls by matching exact label text
        expect(screen.getByRole('combobox', { name: /Principal \(n\)/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Angular \(l\)/i })).toBeInTheDocument();
        expect(screen.getByRole('spinbutton', { name: /Atomic Number \(Z\)/i })).toBeInTheDocument();
    });
});