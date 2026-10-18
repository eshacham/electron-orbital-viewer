import React, { useEffect, useRef } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  SelectChangeEvent,
  ToggleButton,
  ToggleButtonGroup,
  FormLabel, // To label the ToggleButtonGroup
  FormHelperText,
  LinearProgress,
  Slider,
  Typography,
} from '@mui/material';
import { OrbitalParams, RenderMode, ClipAxis, SurfaceStyle } from '@/types/orbital';
import { basicOrbitalParams, ENCLOSED_FRACTIONS } from '../orbital_presets';
import { ELEMENTS, elementLabel } from '../elements';
import { ViewMode, ViewLevel } from '../store/atomSlice';
import { CombinationSelection, NO_COMBINATION } from '../combinations';
import { RelativityMode, shortMethodLabel } from '../atom/relativity';
import type { ValenceSContraction } from '../atom/relativistic_comparison';

interface ControlsProps {
  /**
   * Atom (default) drives the SCF for a neutral element and collapses n/l/ml
   * into the LevelNav/SubshellPanel drill-down; 'hydrogenic' is Basic
   * Orbitals, the exact one-electron reference at Z = 1. Optional (defaulting
   * to 'hydrogenic') purely so every pre-existing render of this component --
   * which predates atom mode and never passes it -- keeps behaving as it did.
   * The stored value stays 'hydrogenic': it names the *model* (a hydrogenic
   * one-electron system), which the rename did not change, and it is
   * persisted in no fewer than three places.
   */
  mode?: ViewMode;
  /** Which drill-down level is current, only so the enclosed-fraction helper text can stay honest (see below); irrelevant in Basic Orbitals mode. */
  atomLevel?: ViewLevel;
  /** The element driving the SCF in atom mode. Basic Orbitals mode has no element control of its own any more (Addendum 2's mode rename) -- it is fixed at BASIC_ORBITALS_Z. */
  atomZ?: number;
  onAtomElementChange?: (Z: number) => void;
  /**
   * Whether to show atom mode's element dropdown here. False once the
   * periodic-table panel is on screen and owns element selection (Addendum
   * 3) -- the dropdown is the narrow-screen fallback, since a periodic
   * table does not survive a phone width. Defaults to true so every
   * pre-existing render of this component keeps its picker.
   */
  showElementPicker?: boolean;
  /** Slot for SubshellPanel at level 2; empty otherwise. Keeps this component ignorant of atomSlice/SubshellPanel specifics. */
  children?: React.ReactNode;

  /**
   * Basic Orbitals' n/l/mₗ (Redux state, `state.orbital.basicSelection`):
   * read here only by the inspector's enclosed-fraction select, which still
   * draws through `onUpdateOrbital` for the *current* selection (ruling
   * T20b-enclosed) -- the selection itself is chosen in `BasicExplore` now
   * (Phase 6G-2 Task 6, ruling P3), not here.
   */
  initialN: number;
  initialL: number;
  initialMl: number;
  /**
   * Basic Orbitals' hybrid / electric-field choice (spec §5 Phase 1):
   * read here only to gate `handleEnclosedFraction` below (a combination
   * redraws on the fraction by itself, in App) -- `BasicExplore` renders
   * `CombinationControls` itself now.
   */
  combination?: CombinationSelection;
  initialEnclosedFraction: number;
  onEnclosedFractionChange: (value: number) => void;
  /** The density contour the last render actually used, or null before one. */
  isoLevel: number | null;
  onUpdateOrbital: (params: OrbitalParams) => void;
  surfaceStyle: SurfaceStyle;
  onSurfaceStyleChange: (change: Partial<SurfaceStyle>) => void;
  /**
   * Ruling R20a fix 1: an opacity-slider tick while dragging. When given,
   * the drag goes here and only the release (onChangeCommitted) reaches
   * onSurfaceStyleChange; without it every tick does, as before.
   */
  onOpacityPreview?: (opacity: number) => void;
  /** The Atom Display section offers Glow / Solid / Wireframe itself (ruling R1). */
  hideSurfaceStyle?: boolean;
  /**
   * Which half of the panel to draw (ruling R20b): 'selection' is what is
   * drawn -- in atom mode the Relativity switch and element picker; 'view'
   * is how it is shown -- the enclosed fraction, the children, Surface,
   * Opacity, Cut away and the busy bar. 'all' (the default) is both, in
   * today's order. Basic Orbitals' own selection (n/l/mₗ, the combination,
   * the Z = 1 note, the chips that replaced Update Orbital) moved to
   * `BasicExplore` entirely (Phase 6G-2 Task 6, ruling P3) -- 'selection' in
   * Basic Orbitals mode renders nothing now.
   */
  part?: 'all' | 'selection' | 'view';

  isBusy: boolean;
  /** Sheet is showing. Only meaningful on narrow screens. */
  open?: boolean;
  /** Phone-width layout. */
  compact?: boolean;

  /**
   * The Relativity switch (spec §5 Phase 4). The Atom screen now renders
   * `RelativityControl` itself, in Explore › Configuration (spec §9.1) and
   * the phone's Explore tab (§9.8), and passes none of these. The
   * *effective* mode -- the user's choice, or the element's default -- so
   * the switch shows what is being solved for. Atom mode only; omitted, the
   * panel is exactly as it was.
   */
  relativity?: RelativityMode;
  /** `relativity` is this element's default (scalar from Cs, off below), whoever chose it -- a choice carried over from another element can be. */
  relativityIsDefault?: boolean;
  onRelativityChange?: (mode: RelativityMode) => void;
  /** What the picture on screen says about relativity, for the readout under the switch; null with no picture. */
  relativityReadout?: RelativityReadout | null;
  /**
   * When set, the enclosed fraction does not apply to what is drawn, and this
   * says why: Bonds mode draws a molecule's density at a fixed ρ (ruling
   * T7-a), so the select is disabled rather than left offering a choice that
   * changes nothing.
   */
  fractionNote?: string;
  /**
   * Replaces the helper text under the enclosed fraction *without* disabling
   * it (ruling D22): Molecules mode still draws its density and orbitals at
   * a fraction, and says which contour that produced -- ρ in e/a₀³ for a
   * density, which the |ψ|² wording would misname.
   */
  isoNote?: string;
}

/**
 * The drawn profile's side of the readout (ruling C9): everything here
 * describes the picture on screen, which during a re-solve is still the old
 * mode's, never the switch's.
 */
export interface RelativityReadout {
  /** The mode the drawn profile was solved in. */
  pictureMode: RelativityMode;
  /** Its valence-s contraction against the same species' non-relativistic solve, when there is one. */
  change: ValenceSContraction | null;
  /** Why a relativistic picture has nothing to compare against (the worker's own words), or null. */
  comparisonUnavailable: string | null;
}

const ISO_MIN = 0.000000001;
const ISO_MAX = 0.001;

/** The cut-depth slider's landmarks: the edge, the nucleus, the far edge. */
const CUT_DEPTH_MARKS = [
  { value: 0, label: 'none' },
  { value: 50, label: 'centre' },
  { value: 100, label: 'all' },
];
/** The whole-atom view's slider stops short of both edges, where the slice vanishes. */
const SLICE_DEPTH_MARKS = [
  { value: 5, label: 'edge' },
  { value: 50, label: 'centre' },
  { value: 95, label: 'edge' },
];

/** What a cut at this clipPosition leaves, in words, for the slider's label. */
export function cutDepthLabel(clipPosition: number): string {
  const depth = Math.round((1 - clipPosition) * 50);
  if (depth <= 0) return 'nothing removed';
  if (depth >= 100) return 'everything removed';
  if (depth === 50) return '50% — through the nucleus';
  return `${depth}% — ${depth < 50 ? 'short of' : 'past'} the nucleus`;
}

/** What each mode is, in one line; "Default for this element" when it is that element's default (spec §3.1). */
export function relativityHelp(mode: RelativityMode, isDefault: boolean): string {
  const base = {
    off: 'Schrödinger equation — no relativistic effects.',
    scalar: 'Scalar-relativistic (Koelling–Harmon): mass-velocity and Darwin terms, no spin–orbit.',
    spinOrbit: 'Dirac equation: each l > 0 subshell splits into j = l − ½ and j = l + ½.',
  }[mode];
  return isDefault ? `${base} Default for this element.` : base;
}

/**
 * A percentage that never rounds a real change to nothing: hydrogen's 1s
 * moves by about a thousandth of a percent, and "0.00 %" would read as no
 * change at all.
 */
function formatPercent(size: number): string {
  if (size >= 1) return size.toFixed(1);
  if (size >= 0.01) return size.toFixed(2);
  if (size >= 1e-4) return size.toPrecision(2);
  return size === 0 ? '0' : 'less than 0.0001';
}

/**
 * Enough decimal places for the two radii to differ where they really do:
 * carbon's 2s moves by 5·10⁻⁴ a₀, which at two places printed as
 * "1.58 → 1.58" beside "contracts by 0.03 %". Two places at least, six at
 * most (hydrogen's 1s moves by a few 10⁻⁵ a₀).
 */
function radiusDecimals(difference: number): number {
  if (!(difference > 0)) return 2;
  return Math.min(6, Math.max(2, Math.ceil(-Math.log10(difference))));
}

/**
 * The valence-s contraction, with the comparison it is measured against
 * named. Two things a reader could otherwise assume wrongly are said
 * outright (Task 8): the shell is the outermost *occupied* s, which for an
 * excited species is not the neutral's valence (Au 6s → 6p reports 5s), and
 * the value is an LDA one -- ⟨r⟩ of LDA orbitals, smaller than the
 * Dirac–Fock contractions textbooks quote (gold's 6s: 14 % here) -- so the
 * method goes in the same sentence as the number (spec §3.1).
 */
export function whatChangedText(change: ValenceSContraction, mode: RelativityMode): string {
  const parts = whatChangedParts(change, mode);
  return parts.before + parts.radii + parts.after;
}

/**
 * The same sentence in three pieces, so the readout can keep the radii
 * together: in a 300 px panel "3.31 →" and "2.85 a₀" otherwise land on
 * different lines (fix round 1, M1). ⟨r⟩ is named as the mean radius for a
 * reader who does not know the symbol.
 */
export interface WhatChangedParts { before: string; radii: string; after: string }

export function whatChangedParts(change: ValenceSContraction, mode: RelativityMode): WhatChangedParts {
  const size = Math.abs(change.contractionPercent);
  const verb = change.contractionPercent >= 0 ? 'contracts' : 'expands';
  const nonRelativistic = change.nonRelativisticMeanRadius;
  const relativistic = change.relativisticMeanRadius;
  const digits = radiusDecimals(Math.abs(nonRelativistic - relativistic));
  const method = shortMethodLabel(mode);
  return {
    before: `What changed: ${change.label} ${verb} by ${formatPercent(size)} % (mean radius `,
    radii: `⟨r⟩ ${nonRelativistic.toFixed(digits)} → ${relativistic.toFixed(digits)} a₀`,
    // A non-breaking space: a lone "s)." at the start of a line reads as a typo.
    after: `; the outermost occupied\u00a0s). ${method[0].toUpperCase()}${method.slice(1)} `
      + 'against the same species\' non-relativistic LDA.',
  };
}

/** How the readout names a picture's mode: "still scalar-relativistic". */
const PICTURE_MODE_WORDS: Record<RelativityMode, string> = {
  off: 'non-relativistic',
  scalar: 'scalar-relativistic',
  spinOrbit: 'the Dirac (spin–orbit) one',
};
const SOLVING_WORDS: Record<RelativityMode, string> = {
  off: 'the non-relativistic picture',
  scalar: 'the scalar-relativistic picture',
  spinOrbit: 'the picture with spin–orbit',
};

/**
 * The readout's text, or null for nothing to say. Ruling C9: it speaks for
 * the picture on screen. While the switch and the picture disagree a new
 * mode is solving, and the old picture's contraction must not sit under a
 * switch that names another method -- so it says what is coming and what is
 * still drawn instead. A non-relativistic picture is its own baseline, so
 * it has nothing to report; a relativistic one without a baseline (Pr–Eu
 * 6s → 4f: LDA does not bind the 4f without relativity) says why.
 */
export function relativityReadoutText(switchMode: RelativityMode, readout: RelativityReadout | null): string | null {
  const content = relativityReadoutContent(switchMode, readout);
  return content === null || typeof content === 'string' ? content : content.before + content.radii + content.after;
}

/** relativityReadoutText's decision, with a contraction left in pieces for the readout to lay out. */
function relativityReadoutContent(switchMode: RelativityMode, readout: RelativityReadout | null): string | WhatChangedParts | null {
  if (!readout) return null;
  if (readout.pictureMode !== switchMode) {
    return `Solving ${SOLVING_WORDS[switchMode]}… the picture on screen is still ${PICTURE_MODE_WORDS[readout.pictureMode]}.`;
  }
  if (readout.pictureMode === 'off') return null;
  if (readout.change) return whatChangedParts(readout.change, readout.pictureMode);
  return readout.comparisonUnavailable;
}

/** The readout's content, with a contraction's radii held on one line. */
const ReadoutContent: React.FC<{ content: string | WhatChangedParts | null }> = ({ content }) => {
  if (content === null || typeof content === 'string') return <>{content}</>;
  return (
    <>
      {content.before}
      <span className="relativity-radii" style={{ whiteSpace: 'nowrap' }}>{content.radii}</span>
      {content.after}
    </>
  );
};

/** Phase 1's CombinationControls: MUI upper-cases button text, which "With spin–orbit" does not survive. */
const KEEP_CASE = { '& .MuiToggleButton-root': { textTransform: 'none' } } as const;

export interface RelativityControlProps {
  relativity: RelativityMode;
  relativityIsDefault: boolean;
  onRelativityChange(mode: RelativityMode): void;
  relativityReadout: RelativityReadout | null;
}

/** The Relativity switch (spec §5 Phase 4) -- Explore › Configuration in the Atom screen (spec §9.1); today's markup. */
export const RelativityControl: React.FC<RelativityControlProps> = ({ relativity, relativityIsDefault, onRelativityChange, relativityReadout }) => (
  <FormControl component="fieldset" margin="normal" fullWidth className="relativity-controls">
    <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Relativity</FormLabel>
    <ToggleButtonGroup
      value={relativity}
      exclusive
      onChange={(event: React.MouseEvent<HTMLElement>, value: RelativityMode | null) => {
        // An exclusive toggle reports a click on the selected button
        // as null: that is choosing the shown mode again, which the
        // store reads as following the default when it is the
        // element's default (final review I3), so pass it on.
        onRelativityChange(value ?? relativity);
      }}
      aria-label="relativity treatment"
      size="small"
      fullWidth
      sx={KEEP_CASE}
    >
      <ToggleButton value="off" aria-label="relativity off">Off</ToggleButton>
      <ToggleButton value="scalar" aria-label="scalar relativistic">Scalar</ToggleButton>
      <ToggleButton value="spinOrbit" aria-label="with spin–orbit">With spin–orbit</ToggleButton>
    </ToggleButtonGroup>
    <FormHelperText className="relativity-help" sx={{ mx: 0 }}>
      {relativityHelp(relativity, relativityIsDefault)}
    </FormHelperText>
    <Typography variant="body2" component="div" role="status" className="relativity-what-changed"
      sx={{ mt: 0.75, fontSize: '0.75rem', lineHeight: 1.35 }}>
      <ReadoutContent content={relativityReadoutContent(relativity, relativityReadout)} />
    </Typography>
  </FormControl>
);

const Controls: React.FC<ControlsProps> = ({
  mode = 'hydrogenic',
  atomLevel,
  atomZ,
  onAtomElementChange,
  showElementPicker = true,
  children,
  initialN,
  initialL,
  initialMl,
  combination = NO_COMBINATION,
  initialEnclosedFraction, onEnclosedFractionChange,
  isoLevel,
  onUpdateOrbital,
  surfaceStyle,
  onSurfaceStyleChange,
  onOpacityPreview,
  hideSurfaceStyle = false,
  part = 'all',
  isBusy,
  open = true,
  compact = false,
  relativity,
  relativityIsDefault = false,
  onRelativityChange,
  relativityReadout = null,
  fractionNote,
  isoNote,
}) => {
  const isAtomMode = mode === 'atom';
  // Basic Orbitals' chosen fraction still redraws through this component
  // (handleEnclosedFraction below); its selection itself (n/l/mₗ,
  // combinations, the chips that replaced Update Orbital, the Z = 1 note)
  // belongs to `BasicExplore` now (Phase 6G-2 Task 6, ruling P3).
  const isBasicMode = mode === 'hydrogenic';
  const showSelection = part !== 'view';
  const showView = part !== 'selection';
  // Bug fix (task 22, bug 6): levels 1-2 in atom mode render a spherical
  // shell view straight from the shader (orbital_visualizer.ts's
  // updateAtomViewInScene / shell_view.ts) rather than a marching-cubes
  // mesh -- there is no separate solid-vs-wireframe surface to switch
  // between (Surface), and no meaningful "uncut" state (Cut away's Off
  // option: a shell view's cut face is its *only* visible content, see
  // shellViewClipAxis's doc comment in orbital_visualizer.ts). Both matter
  // again once level 3 hands the render back to the same marching-cubes
  // pipeline Basic Orbitals always uses -- so the condition is level, not
  // mode. (Resolution used to be gated here too; there is no such control
  // any more -- see ORBITAL_RESOLUTION.)
  const isMeshLevel = !isAtomMode || atomLevel === 'orbital';
  // The whole-atom view draws only its slice: no lobes, no surface.
  const isSliceOnlyView = isAtomMode && atomLevel === 'atom';
  // A combination (hybrid set or field) replaces the single n/l/mₗ orbital
  // entirely -- the selects stay visible but frozen, so the way back to a
  // single orbital is obvious rather than a control that vanished.
  const combinationActive = combination.kind !== 'none';

  // On a phone #controls is one horizontally scrolling strip, and it keeps
  // whatever scroll position it was left at. Drilling into a shell inserts
  // the subshell panel at the head of that strip (style.css gives it
  // `order: -1` -- at level 2 it is what you came for), but the strip is
  // still scrolled to wherever picking the element left it, so the panel
  // arrives off the left edge and looks like nothing happened. Bring it
  // into view when it appears. Desktop stacks vertically and never scrolls
  // sideways, so this is a no-op there.
  const stripRef = useRef<HTMLDivElement>(null);
  const hasDrillDownPanel = isAtomMode && Boolean(children);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !compact || !open || !hasDrillDownPanel) return;
    const panel = strip.querySelector<HTMLElement>('.subshell-panel');
    if (!panel) return;
    strip.scrollTo({ left: panel.offsetLeft - strip.offsetLeft, behavior: 'smooth' });
  }, [hasDrillDownPanel, compact, open]);

  // Ruling T20b-enclosed: in Basic Orbitals the fraction sits in the
  // inspector, so a chosen fraction applies at once -- the same update the
  // chips' own debounced draw sends (useDrawOnSelection, App.tsx), for the
  // selection BasicExplore currently has chosen. A drawn combination
  // redraws on the fraction by itself (App).
  const handleEnclosedFraction = (fraction: number) => {
    onEnclosedFractionChange(fraction);
    if (isBasicMode && !combinationActive) onUpdateOrbital(basicOrbitalParams(initialN, initialL, initialMl, fraction));
  };

  return (
    <Box
      // One #controls on the page (tests and insets read it): the view half is .controls-view.
      // Everywhere but Basic Orbitals, the selection half (still rendered by
      // App's renderControls('selection')) carries it, as always. Basic
      // Orbitals' own selection half no longer renders at all -- BasicExplore
      // owns it entirely now (Phase 6G-2 Task 6, preflight D30) -- so its
      // view half has to carry the id instead, or nothing on the page would.
      id={part === 'view' && mode !== 'hydrogenic' ? undefined : 'controls'}
      ref={stripRef}
      className={[part === 'view' ? 'controls-view' : '', compact ? 'compact' : '', open ? 'open' : 'closed'].filter(Boolean).join(' ')}
      sx={{
        p: 2,
        position: 'relative',
      }}
    >
      {/* The Mode toggle moved to the rail and the phone's mode menu (spec §8.2). */}

      {/* Relativity (spec §5 Phase 4), next to Mode: both choose the model
          rather than the view. The group is named "relativity treatment",
          not "relativity", so it and its fieldset (legend "Relativity")
          are two distinct groups to a screen reader and to a role query.
          The readout under it is a polite live region, mounted whenever
          the switch is, so a new contraction is announced when it lands
          (a region inserted together with its text often is not). */}
      {showSelection && isAtomMode && onRelativityChange && relativity && (
        <RelativityControl relativity={relativity} relativityIsDefault={relativityIsDefault}
          onRelativityChange={onRelativityChange} relativityReadout={relativityReadout} />
      )}

      {/* Basic Orbitals' whole selection -- the orbital-name heading, the
          n/l/mₗ chips, the Combination picker and the Z = 1 note -- moved to
          `BasicExplore` (Phase 6G-2 Task 6, ruling P3): Explore draws it, not
          this component's 'selection' half, which renders nothing here now. */}

      {/* A raw density threshold is not comparable between orbitals; the share
          of the electron enclosed is. The density that achieves it is derived
          per orbital and reported back below. */}
      {showView && (
        <FormControl fullWidth margin="normal" size="small">
          <InputLabel id="enclosed-select-label">Electron enclosed</InputLabel>
          <Select
            labelId="enclosed-select-label"
            id="enclosed-select"
            value={initialEnclosedFraction.toString()}
            label="Electron enclosed"
            onChange={(e: SelectChangeEvent<string>) => handleEnclosedFraction(parseFloat(e.target.value))}
            disabled={Boolean(fractionNote)}
          >
            {ENCLOSED_FRACTIONS.map(fraction => (
              <MenuItem key={fraction} value={fraction.toString()}>
                {Math.round(fraction * 100)}%
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {/* Levels 1-2's contour encloses a share of the electron *count*,
                not a |ψ|² threshold -- there is no isosurface for a
                spherically symmetric shell view (see shell_view.ts), so the
                marching-cubes wording below would be a claim this view never
                makes. Level 3 in atom mode *does* go through marching cubes
                (a numerical R(r) override), so it keeps the usual wording. */}
            {fractionNote
              ? fractionNote
              : isoNote
              ? isoNote
              : isAtomMode && atomLevel !== 'orbital'
                ? 'contour enclosing this fraction of the electron density'
                : isoLevel === null
                  ? 'contour of constant |ψ|²'
                  : `|ψ|² = ${isoLevel.toExponential(2)}`}
          </FormHelperText>
        </FormControl>
      )}

      {showSelection && (isAtomMode ? (showElementPicker && (
        /* Atom mode: a real neutral element, SCF-solved -- the picker drives
           solveAtom via atomSlice.setElement. Suppressed when the
           periodic-table panel is showing, which is the same control in a
           form that also says what the element *is*. */
        <FormControl fullWidth margin="normal" size="small">
          <InputLabel id="atom-z-select-label">Element</InputLabel>
          <Select
            labelId="atom-z-select-label"
            id="atom-z-select"
            value={(atomZ ?? 1).toString()}
            label="Element"
            onChange={(e: SelectChangeEvent<string>) => onAtomElementChange?.(parseInt(e.target.value, 10))}
            MenuProps={{ slotProps: { paper: { sx: { maxHeight: 320 } } } }}
          >
            {ELEMENTS.map(element => (
              <MenuItem key={element.atomicNumber} value={element.atomicNumber.toString()}>
                {elementLabel(element.atomicNumber)}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>neutral atom, central-field SCF</FormHelperText>
        </FormControl>
      )) : null)}
      {/* Basic Orbitals' one-electron, Z = 1 note (spec §7) moved to
          `BasicExplore`'s tile caption (Phase 6G-2 Task 6) -- there is no
          element picker here for it to stand in for any more. */}

      {/* SubshellPanel at level 2; empty at every other level (see App.tsx).
          In Molecules mode, the structure and dipole switches. */}
      {showView && (isAtomMode || mode === 'molecule') && children}

      {showView && (
        <>
          {/* Surface, opacity and cut-away are view-only: they restyle the existing
              mesh, so none of them re-runs the calculation. Surface (solid vs
              wireframe) only has meaning for a marching-cubes mesh -- a shell
              view's cap is always shown, solid (bug fix, task 22 bug 6). */}
          {isMeshLevel && !hideSurfaceStyle && (
            <FormControl component="fieldset" margin="normal" fullWidth>
              <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Surface</FormLabel>
              <ToggleButtonGroup
                value={surfaceStyle.mode}
                exclusive
                onChange={(event: React.MouseEvent<HTMLElement>, newValue: RenderMode | null) => {
                  if (newValue !== null) {
                    onSurfaceStyleChange({ mode: newValue });
                  }
                }}
                aria-label="surface style"
                size="small"
                fullWidth
              >
                <ToggleButton value="solid" aria-label="solid surface">Solid</ToggleButton>
                <ToggleButton value="wireframe" aria-label="wireframe surface">Wireframe</ToggleButton>
              </ToggleButtonGroup>
            </FormControl>
          )}

          <FormControl component="fieldset" margin="normal" fullWidth>
            <FormLabel component="legend" sx={{ fontSize: '0.75rem' }}>
              Opacity: {Math.round(surfaceStyle.opacity * 100)}%
            </FormLabel>
            <Slider
              id="opacity-slider"
              aria-label="surface opacity"
              value={surfaceStyle.opacity}
              min={0.05}
              max={1}
              step={0.05}
              size="small"
              onChange={(event: Event, value: number | number[]) => {
                const opacity = Array.isArray(value) ? value[0] : value;
                if (onOpacityPreview) onOpacityPreview(opacity);
                else onSurfaceStyleChange({ opacity });
              }}
              onChangeCommitted={onOpacityPreview ? (event: React.SyntheticEvent | Event, value: number | number[]) =>
                onSurfaceStyleChange({ opacity: Array.isArray(value) ? value[0] : value }) : undefined}
            />
          </FormControl>

          {/* The cut: a plane across the chosen axis, removing the + side of
              it. Depth is how far in the plane has come, from the edge of what
              is drawn (nothing removed) through the nucleus (half) to the far
              edge (everything) -- the whole travel spans the drawn object (see
              clipExtent in orbital_visualizer.ts). Stored as clipPosition, the
              plane's offset as a fraction of that radius: +1 at depth 0, 0 at
              50 %, -1 at 100 %. */}
          <FormControl component="fieldset" margin="normal" fullWidth className="cut-controls">
            <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Cut away</FormLabel>
            <ToggleButtonGroup
              value={surfaceStyle.clipAxis}
              exclusive
              onChange={(event: React.MouseEvent<HTMLElement>, newValue: ClipAxis | null) => {
                if (newValue !== null) {
                  onSurfaceStyleChange({ clipAxis: newValue });
                }
              }}
              aria-label="cut-away axis"
              size="small"
              fullWidth
            >
              {/* A shell view has no separate surface to show when uncut -- its
                  cut face is the entire visible object (bug fix, task 22 bug 6;
                  see orbital_visualizer.ts's shellViewClipAxis) -- so "Off" is
                  only offered where it actually does something. */}
              {isMeshLevel && <ToggleButton value="none" aria-label="no cut">Off</ToggleButton>}
              <ToggleButton value="x" aria-label="cut along x">X</ToggleButton>
              <ToggleButton value="y" aria-label="cut along y">Y</ToggleButton>
              <ToggleButton value="z" aria-label="cut along z">Z</ToggleButton>
            </ToggleButtonGroup>
            <FormHelperText className="cut-help" sx={{ mx: 0 }}>
              {surfaceStyle.clipAxis === 'none'
                ? 'Pick an axis to slice the orbital open.'
                : isMeshLevel
                  ? `Removes the part on the +${surfaceStyle.clipAxis} side of a plane perpendicular to the ${surfaceStyle.clipAxis} axis.`
                  : `Slices off the +${surfaceStyle.clipAxis} side to show the shells inside. The atom is round, so X, Y and Z give the same rings, facing a different way.`}
            </FormHelperText>
            {surfaceStyle.clipAxis !== 'none' && (
              <>
                <FormLabel sx={{ mt: 1.5, fontSize: '0.75rem' }} id="cut-depth-label">
                  Depth: {cutDepthLabel(surfaceStyle.clipPosition)}
                </FormLabel>
                <Slider
                  id="clip-slider"
                  aria-labelledby="cut-depth-label"
                  value={Math.round((1 - surfaceStyle.clipPosition) * 50)}
                  // The whole atom is only its slice; at the very edge the slice
                  // is a point and the atom vanishes (see shellViewClipPosition).
                  min={isSliceOnlyView ? 5 : 0}
                  max={isSliceOnlyView ? 95 : 100}
                  step={1}
                  size="small"
                  marks={isSliceOnlyView ? SLICE_DEPTH_MARKS : CUT_DEPTH_MARKS}
                  // The label above already says the value, in words.
                  valueLabelDisplay="off"
                  // Room either side for the end marks' labels.
                  sx={{ mx: '18px', width: 'auto' }}
                  onChange={(event: Event, value: number | number[]) => {
                    const depth = Array.isArray(value) ? value[0] : value;
                    onSurfaceStyleChange({ clipPosition: 1 - depth / 50 });
                  }}
                />
              </>
            )}
          </FormControl>
        </>
      )}

      {/* Reset View moved to the viewport toolbar (spec §8.5); Update Orbital
          is gone (ruling P3) -- a chip change draws itself, debounced
          (useDrawOnSelection, App.tsx). */}

      {/* Progress bar: with the view settings, as in Bonds' and Molecules' inspector. */}
      {showView && (
        <Box sx={{ 
            width: '100%',
            mt: 2,
            height: 4
        }}>
            {isBusy && (
                <LinearProgress 
                    variant="indeterminate"
                    sx={{ 
                        borderRadius: 1
                    }} 
                />
            )}
        </Box>
      )}
    </Box>
  );
};

export default React.memo(Controls);