import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from './App';

// Mock the orbital_visualizer module
jest.mock('./orbital_visualizer', () => ({
  getOptimizedParameters: jest.fn(() => ({ rMax: 15, isoLevel: 0.005 })),
}));

// Mock the OrbitalViewer component
jest.mock('./components/OrbitalViewer', () => {
  return {
    __esModule: true,
    default: ({ onOrbitalRendered }: { onOrbitalRendered: () => void }) => {
      // Simulate the orbital being rendered
      setTimeout(onOrbitalRendered, 0);
      return <div data-testid="orbital-viewer">Orbital Viewer</div>;
    }
  };
});

describe('App', () => {
  it('triggers initial orbital render on mount', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    await act(async () => {
      render(<App />);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "App.tsx: Triggering initial orbital render."
    );
    consoleSpy.mockRestore();
  });

  it('renders controls with correct initial state values', () => {
    render(<App />);
    
    // For MUI Select components, check the text content
    expect(screen.getByLabelText(/Principal/i)).toHaveTextContent('3');
    expect(screen.getByLabelText(/Angular/i)).toHaveTextContent('2');
    
    // For number inputs, use getAttribute
    const zInput = screen.getByLabelText(/Atomic Number/i);
    expect(zInput).toHaveValue(1);
  });

  it('renders with theme provider', () => {
    render(<App />);
    const controls = screen.getByRole('group', { name: /Resolution/i });
    expect(controls).toBeInTheDocument();
  });
});