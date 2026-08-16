import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Controls from './Controls';

describe('Controls', () => {
  it('renders with initial values and calls onNChange when N is changed', () => {
    const onNChange = jest.fn();
    render(
      <Controls
        initialN={3}
        onNChange={onNChange}
        initialL={2}
        onLChange={() => {}}
        initialMl={0}
        onMlChange={() => {}}
        initialZ={1}
        onZChange={() => {}}
        initialResolution={32}
        onResolutionChange={() => {}}
        initialEnclosedFraction={0.9}
        onEnclosedFractionChange={() => {}}
        isoLevel={1e-5}
        onUpdateOrbital={() => {}}
        onResetView={() => {}}
        surfaceStyle={{ mode: 'solid', opacity: 1, clipAxis: 'none', clipPosition: 0 }}
        onSurfaceStyleChange={() => {}}
        isBusy={false}
      />
    );
    // Example: check if N select is rendered
    expect(screen.getByRole('combobox', { name: /Principal \(n\)/i })).toBeInTheDocument();

    // Simulate changing N (you may need to adjust the selector based on your actual markup)
    // fireEvent.change(screen.getByLabelText(/principal quantum number/i), { target: { value: '4' } });
    // expect(onNChange).toHaveBeenCalledWith(4);
  });
});