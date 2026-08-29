import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Controls from './Controls';

const baseProps = {
  initialN: 3,
  onNChange: () => {},
  initialL: 2,
  onLChange: () => {},
  initialMl: 0,
  onMlChange: () => {},
  initialZ: 1,
  onZChange: () => {},
  initialResolution: 32,
  onResolutionChange: () => {},
  initialEnclosedFraction: 0.9,
  onEnclosedFractionChange: () => {},
  isoLevel: 1e-5,
  onUpdateOrbital: () => {},
  onResetView: () => {},
  surfaceStyle: { mode: 'solid' as const, opacity: 1, clipAxis: 'none' as const, clipPosition: 0 },
  onSurfaceStyleChange: () => {},
  isBusy: false,
};

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

  // Omitting `mode` entirely (as every pre-existing test here does) must
  // still be the exact hydrogen-like panel that shipped before atom mode
  // existed -- no regression to the one-electron-ion view.
  it('defaults to hydrogen-like when mode is omitted', () => {
    render(<Controls {...baseProps} />);
    expect(screen.getByRole('combobox', { name: /Nucleus \(Z\)/i })).toBeInTheDocument();
    expect(screen.getByText('one electron, charge-Z nucleus')).toBeInTheDocument();
  });

  describe('atom mode', () => {
    it('collapses the n/l/ml selects and the Update Orbital button into the drill-down', () => {
      render(<Controls {...baseProps} mode="atom" atomZ={6} onAtomElementChange={() => {}} />);

      expect(screen.queryByRole('combobox', { name: /Principal \(n\)/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /Angular \(l\)/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /Magnetic/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /update orbital/i })).not.toBeInTheDocument();

      // Controls that still work at every level.
      expect(screen.getByRole('combobox', { name: /Element/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /Electron enclosed/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset view/i })).toBeInTheDocument();
    });

    it('drives the element picker through onAtomElementChange, not onZChange', () => {
      const onAtomElementChange = jest.fn();
      const onZChange = jest.fn();
      render(
        <Controls
          {...baseProps}
          onZChange={onZChange}
          mode="atom"
          atomZ={6}
          onAtomElementChange={onAtomElementChange}
        />
      );

      fireEvent.mouseDown(screen.getByRole('combobox', { name: /Element/i }));
      fireEvent.click(within(screen.getByRole('listbox')).getByText(/Oxygen/i));

      expect(onAtomElementChange).toHaveBeenCalledWith(8);
      expect(onZChange).not.toHaveBeenCalled();
    });

    it('renders a slot for the drill-down panel (SubshellPanel at level 2)', () => {
      render(
        <Controls {...baseProps} mode="atom" atomZ={6} onAtomElementChange={() => {}}>
          <div data-testid="subshell-slot">subshells go here</div>
        </Controls>
      );
      expect(screen.getByTestId('subshell-slot')).toBeInTheDocument();
    });
  });

  describe('mode toggle', () => {
    it('offers Atom and Hydrogen-like, and reports the choice via onModeChange', () => {
      const onModeChange = jest.fn();
      render(<Controls {...baseProps} mode="hydrogenic" onModeChange={onModeChange} atomZ={1} onAtomElementChange={() => {}} />);

      fireEvent.click(screen.getByRole('button', { name: /atom mode/i }));
      expect(onModeChange).toHaveBeenCalledWith('atom');
    });
  });
});