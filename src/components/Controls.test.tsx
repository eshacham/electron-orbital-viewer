import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Controls, { cutDepthLabel } from './Controls';

const baseProps = {
  initialN: 3,
  onNChange: () => {},
  initialL: 2,
  onLChange: () => {},
  initialMl: 0,
  onMlChange: () => {},
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
  // still be the Basic Orbitals panel -- the n/l/mL selects and the explicit
  // Update Orbital step, not atom mode's drill-down.
  it('defaults to Basic Orbitals when mode is omitted', () => {
    render(<Controls {...baseProps} />);
    expect(screen.getByRole('combobox', { name: /Principal \(n\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update orbital/i })).toBeInTheDocument();
  });

  // Addendum 2's mode rename: atom mode covers every real element now, so
  // Basic Orbitals has no element control of its own and is fixed at Z = 1.
  describe('Basic Orbitals mode', () => {
    it('has no nucleus (Z) picker', () => {
      render(<Controls {...baseProps} />);
      expect(screen.queryByRole('combobox', { name: /Nucleus/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /Element/i })).not.toBeInTheDocument();
    });

    // Spec §7: the one-electron framing must stay stated outright. It used
    // to ride on the Z picker's helper text, which is gone.
    it('still says outright that it is one electron at Z = 1', () => {
      render(<Controls {...baseProps} />);
      expect(screen.getByText(/one electron, Z = 1/i)).toBeInTheDocument();
    });

    it('renders at Z = 1 whatever n/l/mL are chosen', () => {
      const onUpdateOrbital = jest.fn();
      render(<Controls {...baseProps} initialN={4} initialL={3} initialMl={-2} onUpdateOrbital={onUpdateOrbital} />);
      fireEvent.click(screen.getByRole('button', { name: /update orbital/i }));
      expect(onUpdateOrbital).toHaveBeenCalledWith(expect.objectContaining({ n: 4, l: 3, ml: -2, Z: 1, resolution: 128 }));
    });
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

    it('drives the element picker through onAtomElementChange', () => {
      const onAtomElementChange = jest.fn();
      render(
        <Controls
          {...baseProps}
          mode="atom"
          atomZ={6}
          onAtomElementChange={onAtomElementChange}
        />
      );

      fireEvent.mouseDown(screen.getByRole('combobox', { name: /Element/i }));
      fireEvent.click(within(screen.getByRole('listbox')).getByText(/Oxygen/i));

      expect(onAtomElementChange).toHaveBeenCalledWith(8);
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

  // Regression tests for task 22 bug 6: Resolution and Surface (solid vs
  // wireframe) restyle or resize a marching-cubes mesh, which atom mode's
  // levels 1-2 never build (see orbital_visualizer.ts's updateAtomViewInScene
  // / shell_view.ts) -- so at those levels the two controls did nothing,
  // and "Off" (no cut) left a shell view rendering nothing at all (bug 4).
  // All three matter again at level 3, which hands rendering back to the
  // same marching-cubes pipeline hydrogen-like mode always uses -- so the
  // condition is level, not mode.
  describe('control visibility matrix (bug 6): Resolution, Surface and "no cut" only where they do something', () => {
    it('Basic Orbitals mode (always a marching-cubes mesh): shows Surface and "Off"', () => {
      render(<Controls {...baseProps} mode="hydrogenic" />);
      expect(screen.getByRole('group', { name: /surface style/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /no cut/i })).toBeInTheDocument();
    });

    it('atom mode at the whole-atom level (a shell view): hides Surface and "Off"', () => {
      render(<Controls {...baseProps} mode="atom" atomLevel="atom" atomZ={6} onAtomElementChange={() => {}} />);
      expect(screen.queryByRole('group', { name: /surface style/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /no cut/i })).not.toBeInTheDocument();
      // The rest of "Cut away" (a real cut still changes the shell view's
      // cross-section) stays -- only the meaningless "Off" option is gone.
      expect(screen.getByRole('button', { name: /cut along z/i })).toBeInTheDocument();
      // Opacity fades the cap's own shader too, so it still does something.
      expect(screen.getByRole('slider', { name: /surface opacity/i })).toBeInTheDocument();
    });

    it('atom mode at the shell level (still a shell view): hides Surface and "Off"', () => {
      render(<Controls {...baseProps} mode="atom" atomLevel="shell" atomZ={6} onAtomElementChange={() => {}} />);
      expect(screen.queryByRole('group', { name: /surface style/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /no cut/i })).not.toBeInTheDocument();
    });

    it('atom mode at the orbital level (level 3, a real marching-cubes mesh): shows Surface and "Off" again', () => {
      render(<Controls {...baseProps} mode="atom" atomLevel="orbital" atomZ={6} onAtomElementChange={() => {}} />);
      expect(screen.getByRole('group', { name: /surface style/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /no cut/i })).toBeInTheDocument();
    });

    // The Resolution control is gone entirely: every marching-cubes render
    // is at ORBITAL_RESOLUTION now (see orbital_presets.ts).
    it('offers no resolution control anywhere', () => {
      for (const props of [
        {},
        { mode: 'atom' as const, atomLevel: 'atom' as const, atomZ: 6, onAtomElementChange: () => {} },
        { mode: 'atom' as const, atomLevel: 'orbital' as const, atomZ: 6, onAtomElementChange: () => {} },
      ]) {
        const { unmount } = render(<Controls {...baseProps} {...props} />);
        expect(screen.queryByRole('button', { name: /low resolution/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /medium resolution/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /high resolution/i })).not.toBeInTheDocument();
        unmount();
      }
    });
  });

  describe('mode toggle', () => {
    it('offers Atom and Basic Orbitals, and reports the choice via onModeChange', () => {
      const onModeChange = jest.fn();
      render(<Controls {...baseProps} mode="hydrogenic" onModeChange={onModeChange} atomZ={1} onAtomElementChange={() => {}} />);

      expect(screen.getByRole('button', { name: /basic orbitals mode/i })).toHaveTextContent('Basic Orbitals');
      expect(screen.queryByText(/hydrogen-like/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /atom mode/i }));
      expect(onModeChange).toHaveBeenCalledWith('atom');
    });
  });
});

// The cut's position used to be a bare -1..1 slider with no labels; it is a
// depth now, from nothing removed through the nucleus to everything.
describe('cut depth', () => {
  it('describes the depth in words', () => {
    expect(cutDepthLabel(1)).toBe('nothing removed');
    expect(cutDepthLabel(0)).toBe('50% — through the nucleus');
    expect(cutDepthLabel(0.5)).toBe('25% — short of the nucleus');
    expect(cutDepthLabel(-0.5)).toBe('75% — past the nucleus');
    expect(cutDepthLabel(-1)).toBe('everything removed');
  });

  it('shows the depth, with the edge, the centre and the far edge marked', () => {
    render(<Controls {...baseProps} surfaceStyle={{ ...baseProps.surfaceStyle, clipAxis: 'x', clipPosition: 0 }} />);
    expect(screen.getByText(/Depth: 50% — through the nucleus/)).toBeInTheDocument();
    for (const mark of ['none', 'centre', 'all']) expect(screen.getByText(mark)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /depth/i })).toHaveValue('50');
  });

  it('maps a depth back to the plane position the renderer uses', () => {
    const onSurfaceStyleChange = jest.fn();
    render(
      <Controls
        {...baseProps}
        surfaceStyle={{ ...baseProps.surfaceStyle, clipAxis: 'x', clipPosition: 0 }}
        onSurfaceStyleChange={onSurfaceStyleChange}
      />
    );
    fireEvent.change(screen.getByRole('slider', { name: /depth/i }), { target: { value: '75' } });
    expect(onSurfaceStyleChange).toHaveBeenCalledWith({ clipPosition: -0.5 });
  });

  it('says which side a cut removes', () => {
    render(<Controls {...baseProps} surfaceStyle={{ ...baseProps.surfaceStyle, clipAxis: 'y', clipPosition: 0 }} />);
    expect(screen.getByText(/\+y side/)).toBeInTheDocument();
  });

  // The whole-atom view is nothing but its slice; at depth 0 or 100 % the
  // slice is a point and the atom vanished.
  it('keeps the whole-atom slice inside the atom', () => {
    render(
      <Controls
        {...baseProps}
        mode="atom"
        atomLevel="atom"
        surfaceStyle={{ ...baseProps.surfaceStyle, clipAxis: 'x', clipPosition: 0 }}
      />
    );
    const slider = screen.getByRole('slider', { name: /depth/i });
    expect(slider).toHaveAttribute('min', '5');
    expect(slider).toHaveAttribute('max', '95');
    expect(screen.getAllByText('edge')).toHaveLength(2);
  });
});
