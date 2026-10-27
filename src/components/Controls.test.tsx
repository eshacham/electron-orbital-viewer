import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import Controls, { cutDepthLabel } from './Controls';
// Fix round 1: the relativity text lives in atom_text (shared text helpers live in modules, not components).
import { relativityHelp, whatChangedText, relativityReadoutText, relativityReadoutNode } from '../atom/atom_text';
import { basicOrbitalParams } from '../orbital_presets';
import BasicExplore from '../basic_ui/BasicExplore';
import { useDrawOnSelection } from '../basic_ui/useDrawOnSelection';
import { NO_COMBINATION } from '../combinations';
import type { BasicSelection } from '../store/orbitalSlice';

// Ruling P3: chips draw on selection; Update Orbital is gone. Basic Orbitals' n/l/mₗ,
// its Z = 1 note and Update Orbital moved to BasicExplore (Phase 6G-2 Task 6) --
// `baseProps` below no longer needs onNChange/onLChange/onMlChange/onUpdateOrbital's
// selection-side callers, only the view-half props Controls itself still reads.
const baseProps = {
  initialN: 3,
  initialL: 2,
  initialMl: 0,
  initialEnclosedFraction: 0.9,
  onEnclosedFractionChange: () => {},
  isoLevel: 1e-5,
  onUpdateOrbital: () => {},
  // Reset View moved to the viewport toolbar (spec §8.5).
  surfaceStyle: { opacity: 1, clipAxis: 'none' as const, clipPosition: 0 },
  onSurfaceStyleChange: () => {},
  isBusy: false,
};

// R25-finish: jsdom's computed style ignores selector specificity (the last matching rule wins), so whether KEEP_CASE
// beat MUI's uppercase depended on which test first inserted MUI's base ToggleButton style -- the case test failed run
// alone, and again once the finish control (a KEEP_CASE group) rendered earlier in this file. Insert MUI's base style
// first, as a browser's specificity would rank it, so the case test (Relativity control) reads the browser's answer in any order.
beforeAll(() => {
  render(
    <ToggleButtonGroup exclusive size="small" fullWidth value="a">
      <ToggleButton value="a">a</ToggleButton><ToggleButton value="b">b</ToggleButton><ToggleButton value="c">c</ToggleButton>
    </ToggleButtonGroup>,
  ).unmount();
});

describe('Controls', () => {
  // Ruling P3: chips draw on selection; Update Orbital is gone. Basic Orbitals' n/l/mₗ
  // selects moved to BasicExplore, so a bare Controls render has nothing of theirs left
  // to assert on here -- the Electron enclosed select (view half, 'all' by default) is
  // the nearest "is this really a panel" smoke test that still applies.
  it('renders with initial values', () => {
    render(
      <Controls
        initialN={3}
        initialL={2}
        initialMl={0}
        initialEnclosedFraction={0.9}
        onEnclosedFractionChange={() => {}}
        isoLevel={1e-5}
        onUpdateOrbital={() => {}}
        // Reset View moved to the viewport toolbar (spec §8.5).
        surfaceStyle={{ opacity: 1, clipAxis: 'none', clipPosition: 0 }}
        onSurfaceStyleChange={() => {}}
        isBusy={false}
      />
    );
    expect(screen.getByRole('combobox', { name: /Electron enclosed/i })).toBeInTheDocument();
  });

  // Omitting `mode` entirely (as every pre-existing test here does) must still be the
  // Basic Orbitals panel's view half -- Surface, Opacity, Cut away -- not atom mode's.
  // Fix round 1 of Task 20a (R20a-4): with onOpacityPreview, a drag's ticks go there and only the
  // release reaches onSurfaceStyleChange (which commits the opacity the thumbnails follow).
  it('sends opacity drag ticks to onOpacityPreview and commits only on release', () => {
    const onOpacityPreview = jest.fn();
    const onSurfaceStyleChange = jest.fn();
    render(<Controls {...baseProps} onOpacityPreview={onOpacityPreview} onSurfaceStyleChange={onSurfaceStyleChange} />);
    const thumb = screen.getByRole('slider', { name: 'surface opacity' });
    const root = thumb.closest('.MuiSlider-root') as HTMLElement;
    root.getBoundingClientRect = () => ({ left: 0, width: 100, right: 100, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.mouseDown(root, { clientX: 50, clientY: 5, buttons: 1 });
    fireEvent.mouseMove(document, { clientX: 30, clientY: 5, buttons: 1 });
    expect(onOpacityPreview).toHaveBeenCalled();
    expect(onSurfaceStyleChange).not.toHaveBeenCalled();
    fireEvent.mouseUp(document, { clientX: 30, clientY: 5 });
    expect(onSurfaceStyleChange).toHaveBeenCalledTimes(1);
    expect(onSurfaceStyleChange.mock.calls[0][0]).toEqual({ opacity: expect.any(Number) });
  });

  it('without onOpacityPreview, sends every opacity change to onSurfaceStyleChange as before', () => {
    const onSurfaceStyleChange = jest.fn();
    render(<Controls {...baseProps} onSurfaceStyleChange={onSurfaceStyleChange} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'surface opacity' }), { key: 'ArrowLeft' });
    expect(onSurfaceStyleChange).toHaveBeenCalledWith({ opacity: 0.95 });
  });

  // Ruling P3: chips draw on selection; Update Orbital is gone. "Basic Orbitals" used
  // to mean the n/l/mL selects plus the Element select's absence; the selects are gone
  // from Controls now (BasicExplore owns them), so the Element select's absence is what is left to tell it apart from atom mode here.
  it('defaults to Basic Orbitals when mode is omitted: no Element select, unlike atom mode', () => {
    render(<Controls {...baseProps} />);
    expect(screen.queryByRole('combobox', { name: /Element/i })).not.toBeInTheDocument();
    // Owner R25-B1: was "and Surface (Solid | Wireframe) is there" -- that control is gone; the opacity slider stands in.
    expect(screen.getByRole('slider', { name: 'surface opacity' })).toBeInTheDocument();
  });

  // Owner R25-B1 removed Wireframe everywhere (no Solid | Wireframe in any mode -- still pinned here). Ruling
  // R25-finish (controller) replaces "offers no Surface style in any mode": the Glow | Solid finish -- the viewer's
  // own, global, never in a link -- is offered in the view settings of every mode, by the one shared control
  // (DisplayControls' SurfaceStyleControl, rendered by Controls itself), wherever the surface is a mesh.
  it('offers the one Glow | Solid finish control in every mode, never Wireframe (ruling R25-finish)', () => {
    for (const props of [
      { mode: 'hydrogenic' as const },
      { mode: 'bonds' as const },
      { mode: 'molecule' as const },
      { mode: 'atom' as const, atomLevel: 'orbital' as const, atomZ: 6, onAtomElementChange: () => {} },
    ]) {
      const { container, unmount } = render(<Controls {...baseProps} {...props} />);
      const groups = screen.getAllByRole('group', { name: 'surface style' });
      expect([props.mode, groups.length]).toEqual([props.mode, 1]);
      expect(groups[0]).toHaveTextContent(/^GlowSolid$/);
      expect(container.querySelectorAll('.surface-style-controls')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /wireframe/i })).toBeNull();
      expect(screen.queryByText('Wireframe')).toBeNull();
      // It sits with the other surface settings, just before Opacity.
      expect(groups[0].compareDocumentPosition(screen.getByRole('slider', { name: 'surface opacity' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      unmount();
    }
    // The selection half (Explore) never carries it.
    render(<Controls {...baseProps} mode="hydrogenic" part="selection" />);
    expect(screen.queryByRole('group', { name: 'surface style' })).toBeNull();
  });

  // Ruling R25-finish with T13-I3: while Molecules draws no surface the finish acts on nothing -- disabled, saying why,
  // like Opacity and Cut away.
  it('disables the finish while no surface is drawn, saying why (R25-finish, T13-I3)', () => {
    render(<Controls {...baseProps} mode="molecule" noSurface />);
    expect(screen.getByRole('button', { name: 'glow surface' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'solid surface' })).toBeDisabled();
    expect(screen.getByText('No surface is drawn to style.')).toBeInTheDocument();
  });

  // Addendum 2's mode rename: atom mode covers every real element now, so
  // Basic Orbitals has no element control of its own and is fixed at Z = 1.
  // Ruling P3: chips draw on selection; Update Orbital is gone. The one-electron,
  // Z = 1 framing and the "renders at Z = 1 whatever n/l/mL are chosen" behaviour
  // moved to BasicExplore (tests/basic_ui/basic_explore.test.tsx), which owns the
  // whole selection now -- Controls has no nucleus (Z) picker to assert on either way.
  describe('Basic Orbitals mode', () => {
    it('has no nucleus (Z) picker', () => {
      render(<Controls {...baseProps} />);
      expect(screen.queryByRole('combobox', { name: /Nucleus/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /Element/i })).not.toBeInTheDocument();
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
      // Reset View moved to the viewport toolbar (spec §8.5): no longer here to assert on.
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
    // Owner R25-B1: Surface (Solid | Wireframe) is gone in every mode; "Off" is what is left of this row's matrix.
    it('Basic Orbitals mode (always a marching-cubes mesh): shows "Off"', () => {
      render(<Controls {...baseProps} mode="hydrogenic" />);
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

    // Owner R25-B1: Surface (Solid | Wireframe) is gone; Atoms' Glow | Solid finish is DisplayControls' (its own test).
    it('atom mode at the orbital level (level 3, a real marching-cubes mesh): shows "Off" again', () => {
      render(<Controls {...baseProps} mode="atom" atomLevel="orbital" atomZ={6} onAtomElementChange={() => {}} />);
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

  // The Mode toggle left Controls for the rail (spec §8.2); tests/shell/rail.test.tsx pins the names and the dispatch.
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

  // Task 5: Orbitals' cut helper moved to Info (basicInfo); the other modes keep theirs until their own tasks move it.
  it('says which side a cut removes', () => {
    render(<Controls {...baseProps} mode="bonds" surfaceStyle={{ ...baseProps.surfaceStyle, clipAxis: 'y', clipPosition: 0 }} />);
    expect(screen.getByText(/\+y side/)).toBeInTheDocument();
  });

  // Task 5: in Orbitals the Electron enclosed and Cut away helpers are Info's now -- the iso value with its unit and
  // the side a cut removes (tests/info/basic_info.test.ts) -- and the panel keeps the select and toggle labels.
  it('in Orbitals, keeps the enclosed and cut controls with no helper text under them, and an (i) beside Enclosed', () => {
    const { container } = render(<Controls {...baseProps} mode="hydrogenic" surfaceStyle={{ ...baseProps.surfaceStyle, clipAxis: 'y', clipPosition: 0 }} />);
    expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'cut-away axis' })).toBeInTheDocument();
    expect(screen.queryByText(/\+y side/)).toBeNull();
    expect(screen.queryByText(/\|ψ\|² = /)).toBeNull();
    expect(container.querySelectorAll('.MuiFormHelperText-root')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'About Enclosed fraction' })).toHaveClass('info-button');
  });

  // Task 6: in Atoms too -- the fraction's contour (density or |ψ|², with the iso value's unit) and what a cut removes
  // are Info's (tests/info/atom_info.test.ts), at every drill level.
  it.each(['atom', 'shell', 'orbital'] as const)('in Atoms at the %s level, keeps the enclosed and cut controls with no helper text under them', atomLevel => {
    const { container } = render(<Controls {...baseProps} mode="atom" atomLevel={atomLevel} atomZ={6} showElementPicker={false}
      isoLevel={1.2e-3} surfaceStyle={{ ...baseProps.surfaceStyle, clipAxis: 'y', clipPosition: 0 }} />);
    expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toBeInTheDocument();
    expect(screen.queryByText(/\+y side|contour enclosing|\|ψ\|² = /)).toBeNull();
    expect(container.querySelectorAll('.MuiFormHelperText-root')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'About Enclosed fraction' })).toBeInTheDocument();
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

// Ruling P3: chips draw on selection; Update Orbital is gone. CombinationControls
// moved into BasicExplore with the rest of Basic Orbitals' selection (Phase 6G-2
// Task 6) -- Controls itself renders it in neither mode now. Its "sits with the
// chips", "disables while drawn" and "reports the choice" coverage moved to
// tests/basic_ui/basic_explore.test.tsx.
describe('Combination picker', () => {
  it('is never in Controls -- BasicExplore renders it now, in neither atom nor Basic Orbitals mode', () => {
    const { unmount } = render(<Controls {...baseProps} />);
    expect(screen.queryByRole('combobox', { name: /combination/i })).not.toBeInTheDocument();
    unmount();
    render(<Controls {...baseProps} mode="atom" atomLevel="atom" />);
    expect(screen.queryByRole('combobox', { name: /combination/i })).not.toBeInTheDocument();
  });
});

describe('Relativity control', () => {
  const gold = { n: 6, label: '6s', nonRelativisticMeanRadius: 3.21, relativisticMeanRadius: 2.66, contractionPercent: 17.13 };
  const scalarGold = { pictureMode: 'scalar' as const, change: gold, comparisonUnavailable: null };

  // Preflight D5: the fieldset (legend "Relativity") and the toggle group
  // are both groups, so the group is queried by its own, distinct name.
  it('offers Off / Scalar / With spin–orbit in atom mode and reports the choice', () => {
    const onRelativityChange = jest.fn();
    render(<Controls {...baseProps} mode="atom" atomLevel="atom" relativity="scalar"
      onRelativityChange={onRelativityChange} />);
    const group = screen.getByRole('group', { name: 'relativity treatment' });
    expect(within(group).getByRole('button', { name: /relativity off/i })).toHaveTextContent('Off');
    expect(within(group).getByRole('button', { name: /scalar relativistic/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: /with spin–orbit/i }));
    expect(onRelativityChange).toHaveBeenCalledWith('spinOrbit');
    // Task 6: what each mode is (relativityHelp) is said in Info (atomInfo); an (i) beside the switch explains the term.
    expect(screen.queryByText(/Koelling–Harmon/)).toBeNull();
    expect(screen.getByRole('button', { name: 'About Relativity' })).toBeInTheDocument();
  });

  // Final review I3: clicking the mode already shown is choosing it again
  // (an exclusive toggle reports that as null) -- passed on, so the store
  // can treat choosing the element's default as following the default.
  it('reports a click on the mode already selected as choosing it again', () => {
    const onRelativityChange = jest.fn();
    render(<Controls {...baseProps} mode="atom" atomLevel="atom" relativity="scalar" onRelativityChange={onRelativityChange} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'relativity treatment' })).getByRole('button', { name: /scalar relativistic/i }));
    expect(onRelativityChange).toHaveBeenCalledWith('scalar');
  });

  // Ruling C15 / Phase 1's CombinationControls: MUI upper-cases button text
  // unless told not to, which turns "With spin–orbit" into a shout.
  it('keeps the labels\' own case', () => {
    render(<Controls {...baseProps} mode="atom" atomLevel="atom" relativity="off" onRelativityChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'relativity treatment' });
    expect(getComputedStyle(within(group).getByRole('button', { name: /with spin–orbit/i })).textTransform).toBe('none');
  });

  it('is absent in Basic Orbitals mode', () => {
    render(<Controls {...baseProps} relativity="scalar" onRelativityChange={() => {}} />);
    expect(screen.queryByRole('group', { name: 'relativity treatment' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Relativity' })).toBeNull();
  });

  // Task 6: the readout (what changed in the drawn picture) is said in Info (atomInfo) -- nothing under the switch.
  it('has no readout under the switch', () => {
    render(<Controls {...baseProps} mode="atom" atomLevel="atom" relativity="scalar" onRelativityChange={() => {}} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.relativity-help')).toBeNull();
  });

  // Fix round 1, M1: the readout wrapped mid-number ("3.31 →" / "2.85 a₀")
  // in a 300 px panel, and "⟨r⟩" alone is a symbol many readers will not know.
  // Task 6: Info shows it (relativityReadoutNode), still with the radii on one line.
  it('names the mean radius and keeps its two values on one line', () => {
    const { container } = render(<p>{relativityReadoutNode('scalar', scalarGold)}</p>);
    expect(container).toHaveTextContent(/6s contracts by 17\.1 %/);
    expect(container).toHaveTextContent(/Scalar-relativistic LDA \(MacDonald–Vosko exchange\)/);
    expect(container).toHaveTextContent(/mean radius ⟨r⟩ 3\.21 → 2\.66 a₀/);
    const radii = container.querySelector('.relativity-radii') as HTMLElement;
    expect(radii).toHaveTextContent(/^⟨r⟩ 3\.21 → 2\.66 a₀$/);
    expect(radii.style.whiteSpace).toBe('nowrap');
    expect(container.textContent).toBe(whatChangedText(gold, 'scalar'));
    // Nothing to report: nothing at all.
    expect(relativityReadoutNode('off', null)).toBeNull();
  });

  it('words the helper and readout honestly at the edges', () => {
    expect(relativityHelp('off', false)).toMatch(/Schrödinger/);
    expect(relativityHelp('spinOrbit', false)).not.toMatch(/default/i);
    expect(whatChangedText({ ...gold, contractionPercent: 0.034 }, 'scalar')).toMatch(/contracts by 0\.03 %/);
    expect(whatChangedText({ ...gold, contractionPercent: -0.5 }, 'scalar')).toMatch(/expands by 0\.50 %/);
    // Hydrogen's 1s barely moves; "0.00 %" would read as no change at all.
    expect(whatChangedText({ ...gold, contractionPercent: 0.0013 }, 'scalar')).toMatch(/contracts by 0\.0013 %/);
    expect(whatChangedText(gold, 'scalar')).toMatch(/non-relativistic LDA/);
  });

  // Found live: carbon's 2s read "⟨r⟩ 1.58 → 1.58 a₀" beside "contracts by
  // 0.03 %" -- two equal numbers that contradict the percentage.
  it('prints the radii to enough places that a small change is visible', () => {
    const carbon = { n: 2, label: '2s', nonRelativisticMeanRadius: 1.58123, relativisticMeanRadius: 1.58071, contractionPercent: 0.033 };
    expect(whatChangedText(carbon, 'scalar')).toMatch(/⟨r⟩ 1\.5812 → 1\.5807 a₀/);
    expect(whatChangedText(gold, 'scalar')).toMatch(/⟨r⟩ 3\.21 → 2\.66 a₀/);
  });

  // Task 8 carry: the reported s is the outermost *occupied* one (Au 6s → 6p
  // reports 5s), and an LDA value -- the text must say both.
  it('names the shell as the outermost occupied s, and the value as LDA', () => {
    const text = whatChangedText({ ...gold, n: 5, label: '5s', contractionPercent: 4.2 }, 'scalar');
    expect(text).toMatch(/^What changed: 5s contracts/);
    // Non-breaking, so the "s" is never left alone at the start of a line (found live).
    expect(text).toMatch(/outermost occupied\u00a0s\)/);
    expect(text).toMatch(/LDA/);
    expect(whatChangedText({ ...gold, label: '6s½' }, 'spinOrbit')).toMatch(/Dirac LDA \(MacDonald–Vosko exchange\)/);
  });

  // Ruling C9: the readout speaks for the picture on screen, not the switch.
  describe('relativityReadoutText', () => {
    it('reports the drawn profile\'s change when the switch agrees with it', () => {
      expect(relativityReadoutText('scalar', scalarGold)).toBe(whatChangedText(gold, 'scalar'));
    });

    it('says a new mode is solving, and what the picture still is, while they disagree', () => {
      const text = relativityReadoutText('spinOrbit', scalarGold)!;
      expect(text).toMatch(/Solving/);
      expect(text).toMatch(/still scalar-relativistic/);
      expect(text).not.toMatch(/contracts/);
      expect(relativityReadoutText('scalar', { pictureMode: 'off', change: null, comparisonUnavailable: null })).toMatch(/still non-relativistic/);
    });

    it('has nothing to say about a non-relativistic picture, or before there is one', () => {
      expect(relativityReadoutText('off', { pictureMode: 'off', change: null, comparisonUnavailable: null })).toBeNull();
      expect(relativityReadoutText('scalar', null)).toBeNull();
    });

    // Task 8 carry: Pr–Eu 6s → 4f have no non-relativistic answer to compare against.
    it('says why there is no comparison where the readout would be', () => {
      const why = 'No non-relativistic comparison: LDA does not bind the 4f without relativity.';
      expect(relativityReadoutText('scalar', { pictureMode: 'scalar', change: null, comparisonUnavailable: why })).toBe(why);
    });
  });
});

// Phase 5: Bonds is the third mode. It has no n/l/mₗ, no element and
// nothing to "update", and when a density is drawn at a fixed ρ the
// enclosed fraction does not apply -- the select says so rather than
// offer a choice that changes nothing.
describe('Controls: Bonds mode', () => {
  // The Mode toggle left Controls for the rail (spec §8.2); tests/shell/rail.test.tsx pins the names and the dispatch.

  it('has no n/l/mL, no element, no Update Orbital, and says why the fraction is fixed', () => {
    render(<Controls {...baseProps} mode="bonds" fractionNote="the density is drawn at a fixed ρ" />);
    expect(screen.queryByLabelText('Principal (n)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update Orbital' })).toBeNull();
    expect(screen.queryByText(/One electron, Z = 1/)).toBeNull();
    expect(screen.queryByRole('combobox', { name: /combination/i })).toBeNull();
    expect(screen.getByText('the density is drawn at a fixed ρ')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the enclosed fraction for an orbital, where it does apply', () => {
    render(<Controls {...baseProps} mode="bonds" />);
    expect(screen.getByRole('combobox', { name: /electron enclosed/i })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('|ψ|² = 1.00e-5')).toBeInTheDocument();
  });
});

// Phase 6: Molecules is the fourth mode. Like Bonds it has no Basic
// Orbitals controls; it does take children (the structure and dipole
// switches), and its density keeps the fraction, with the helper stating
// the ρ that fraction produced (ruling D22's isoNote, which never disables).
describe('Controls: Molecules mode', () => {
  // The Mode toggle left Controls for the rail (spec §8.2); tests/shell/rail.test.tsx pins the names and the dispatch.

  it('has no Basic Orbitals controls, shows its children, and states ρ without disabling the fraction', () => {
    render(
      <Controls {...baseProps} mode="molecule" isoNote="ρ = 2.34e-3 e/a₀³">
        <span>structure switches</span>
      </Controls>
    );
    expect(screen.queryByLabelText('Principal (n)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update Orbital' })).toBeNull();
    expect(screen.queryByText(/One electron, Z = 1/)).toBeNull();
    expect(screen.getByText('structure switches')).toBeInTheDocument();
    expect(screen.getByText('ρ = 2.34e-3 e/a₀³')).toBeInTheDocument();
    expect(screen.queryByText(/\|ψ\|² =/)).toBeNull();
    expect(screen.getByRole('combobox', { name: /electron enclosed/i })).not.toHaveAttribute('aria-disabled');
  });

  it('lets fractionNote win over isoNote, and disable the select', () => {
    render(<Controls {...baseProps} mode="molecule" fractionNote="fixed" isoNote="ρ = 1e-3" />);
    expect(screen.getByText('fixed')).toBeInTheDocument();
    expect(screen.queryByText('ρ = 1e-3')).toBeNull();
    expect(screen.getByRole('combobox', { name: /electron enclosed/i })).toHaveAttribute('aria-disabled', 'true');
  });
});

// Ruling R20b (owner decision): Basic Orbitals' choice of orbital stays in Explore and its view
// settings go to the inspector, as Bonds' and Molecules' do -- one component split by `part`.
describe('Controls: part', () => {
  // Ruling P3: chips draw on selection; Update Orbital is gone. Basic Orbitals' whole
  // selection (n/l/mₗ, the combination, the Z = 1 note, the chips that replaced Update
  // Orbital) moved to BasicExplore (Phase 6G-2 Task 6) -- Controls' own 'selection' part
  // renders nothing for Basic Orbitals now; that coverage moved to
  // tests/basic_ui/basic_explore.test.tsx.
  it("'selection' in Basic Orbitals renders nothing -- its selection lives in BasicExplore now", () => {
    render(<Controls {...baseProps} part="selection" />);
    expect(screen.queryByRole('combobox', { name: /Principal \(n\)/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /combination/i })).toBeNull();
    expect(screen.queryByText(/one electron, Z = 1/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update Orbital' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /electron enclosed/i })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'surface opacity' })).toBeNull();
  });

  // Owner R25-B1: Surface (Solid | Wireframe) left this order -- the control is gone.
  it("'view' holds the enclosed fraction, Opacity and Cut away, in Bonds' order -- no selection", () => {
    const { container } = render(
      <Controls {...baseProps} part="view" mode="atom" atomLevel="orbital"
        surfaceStyle={{ opacity: 1, clipAxis: 'x', clipPosition: 0 }} />
    );
    expect(screen.queryByRole('combobox', { name: /Principal \(n\)/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /combination/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update Orbital' })).toBeNull();
    expect(screen.queryByText(/one electron, Z = 1/i)).toBeNull();
    const order = [
      screen.getByRole('combobox', { name: /electron enclosed/i }),
      screen.getByRole('slider', { name: 'surface opacity' }),
      screen.getByRole('group', { name: 'cut-away axis' }),
      screen.getByRole('slider', { name: /Depth/ }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(container.querySelector('.controls-view')).not.toBeNull();
  });

  // Preflight D30 / ruling P3: with the selection half gone entirely in Basic Orbitals,
  // the *view* half has to carry #controls there instead -- the insets and other tests
  // read it, and there must be exactly one `#controls` on the page.
  it('carries #controls on the view half in Basic Orbitals mode (its own selection half renders nothing)', () => {
    const { container } = render(<Controls {...baseProps} part="view" mode="hydrogenic" />);
    expect(container.querySelector('#controls')).not.toBeNull();
  });

  it('still has no id on the view half in the other modes (the selection half carries it there)', () => {
    for (const mode of ['atom', 'bonds', 'molecule'] as const) {
      const { container, unmount } = render(<Controls {...baseProps} part="view" mode={mode} atomLevel="orbital" />);
      expect(container.querySelector('#controls')).toBeNull();
      unmount();
    }
  });

  it('a bare part="selection" render (any non-Basic mode) still carries #controls, as always', () => {
    const { container } = render(<Controls {...baseProps} part="selection" mode="atom" atomLevel="atom" />);
    expect(container.querySelector('#controls')).not.toBeNull();
  });

  it('sends the same calls from the view part as the whole panel does', () => {
    const onSurfaceStyleChange = jest.fn();
    const onEnclosedFractionChange = jest.fn();
    render(<Controls {...baseProps} part="view" onSurfaceStyleChange={onSurfaceStyleChange} onEnclosedFractionChange={onEnclosedFractionChange} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'surface opacity' }), { key: 'ArrowLeft' });
    expect(onSurfaceStyleChange).toHaveBeenCalledWith({ opacity: 0.95 });
    // Owner R25-B1: the Wireframe button is gone; the cut-away axis is the other style call the view part sends.
    fireEvent.click(screen.getByRole('button', { name: 'cut along x' }));
    expect(onSurfaceStyleChange).toHaveBeenCalledWith({ clipAxis: 'x' });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /electron enclosed/i }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('75%'));
    expect(onEnclosedFractionChange).toHaveBeenCalledWith(0.75);
  });

  // Ruling T20b-enclosed: the enclosed fraction sits in the inspector, so in Basic
  // Orbitals a committed choice applies at once -- the same update a chip's own
  // debounced draw sends (useDrawOnSelection, App.tsx) for the current selection.
  it('in Basic Orbitals, a committed enclosed fraction redraws the current selection at once', () => {
    const onUpdateOrbital = jest.fn();
    const onEnclosedFractionChange = jest.fn();
    render(<Controls {...baseProps} part="view" initialN={3} initialL={2} initialMl={-1}
      onUpdateOrbital={onUpdateOrbital} onEnclosedFractionChange={onEnclosedFractionChange} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /electron enclosed/i }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('75%'));
    expect(onEnclosedFractionChange).toHaveBeenCalledWith(0.75);
    expect(onUpdateOrbital).toHaveBeenCalledTimes(1);
    expect(onUpdateOrbital).toHaveBeenCalledWith(basicOrbitalParams(3, 2, -1, 0.75));
  });

  it('sends no orbital update for the enclosed fraction while a combination is drawn, or in the other modes', () => {
    const onUpdateOrbital = jest.fn();
    const choose = () => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: /electron enclosed/i }));
      fireEvent.click(within(screen.getByRole('listbox')).getByText('75%'));
    };
    const { unmount } = render(<Controls {...baseProps} part="view" onUpdateOrbital={onUpdateOrbital}
      combination={{ kind: 'hybrid', hybrid: 'sp3', member: 'all' }} />);
    choose();
    unmount();
    for (const mode of ['atom', 'bonds', 'molecule'] as const) {
      const view = render(<Controls {...baseProps} mode={mode} atomLevel="orbital" onUpdateOrbital={onUpdateOrbital} />);
      choose();
      view.unmount();
    }
    expect(onUpdateOrbital).not.toHaveBeenCalled();
  });

  // Review Focus 1: three chip clicks within 150 ms (n, then l, then mₗ) draw once,
  // for the final selection -- through BasicExplore's own chips and useDrawOnSelection's
  // debounce, exactly as a real App render wires them (App.tsx, beside the nonce effect).
  describe('Review Focus 1: three quick chip changes', () => {
    function BasicDrawHarness({ draw }: { draw: (s: BasicSelection) => void }) {
      const [selection, setSelection] = React.useState<BasicSelection>({ n: 3, l: 2, ml: 0 });
      useDrawOnSelection(selection, true, draw);
      return (
        <BasicExplore
          selection={selection}
          onChange={change => setSelection(s => ({ ...s, ...change }))}
          combination={NO_COMBINATION}
          onCombinationChange={() => {}}
        />
      );
    }

    it('draws once, for the last of three quick chip changes (Review Focus 1)', () => {
      jest.useFakeTimers();
      try {
        const draw = jest.fn();
        render(<BasicDrawHarness draw={draw} />);
        fireEvent.click(screen.getByRole('button', { name: 'n = 4' }));
        fireEvent.click(screen.getByRole('button', { name: '4p subshell' }));
        fireEvent.click(screen.getByRole('button', { name: '4px orbital' })); // Task 5: the chip's name has a real subscript
        expect(draw).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(150); });
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith({ n: 4, l: 1, ml: 1 });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
