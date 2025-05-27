import React from 'react';
import { render } from '@testing-library/react';
import OrbitalViewer, { OrbitalParams } from './OrbitalViewer';

jest.mock('three', () => ({}));
jest.mock('three/addons/controls/OrbitControls.js', () => ({}));
jest.mock('../orbital_visualizer', () => ({
  initVisualizer: jest.fn(),
  cleanupVisualizer: jest.fn(),
  updateOrbitalInScene: jest.fn(),
  handleResize: jest.fn(),
}));

describe('OrbitalViewer', () => {
  it('renders the canvas host div', () => {
    const params: OrbitalParams = {
      n: 1,
      l: 0,
      ml: 0,
      Z: 1,
      resolution: 32,
      rMax: 10,
      isoLevel: 0.01,
    };
    const { container } = render(
      <OrbitalViewer
        orbitalParams={params}
        isLoading={false}
        onOrbitalRendered={() => {}}
      />
    );
    expect(container.querySelector('#orbital-canvas-host')).toBeInTheDocument();
  });
});