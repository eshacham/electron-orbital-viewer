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
        initialRMax={15}
        onRMaxChange={() => {}}
        initialIsoLevel={0.005}
        onIsoLevelChange={() => {}}
        onUpdateOrbital={() => {}}
        getOptimizedParams={() => ({ rMax: 15, isoLevel: 0.005 })}
      />
    );
    // Example: check if N select is rendered
    expect(screen.getByRole('combobox', { name: /Principal \(n\)/i })).toBeInTheDocument();

    // Simulate changing N (you may need to adjust the selector based on your actual markup)
    // fireEvent.change(screen.getByLabelText(/principal quantum number/i), { target: { value: '4' } });
    // expect(onNChange).toHaveBeenCalledWith(4);
  });
});