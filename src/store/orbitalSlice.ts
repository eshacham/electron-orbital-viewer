import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OrbitalParams, SurfaceStyle, defaultSurfaceStyle } from '../types/orbital';
import { FieldRenderRequest } from '../field_source';
import { setMode } from './atomSlice';
import { BASIC_ORBITALS_Z, DEFAULT_ENCLOSED_FRACTION } from '../orbital_presets';
import { CombinationSelection, NO_COMBINATION } from '../combinations';
import { CameraAngles, isCanonicalAngles } from '../camera_angles';
import type { RootState } from './index';

export interface BasicSelection { n: number; l: number; ml: number; }
export const DEFAULT_BASIC_SELECTION: BasicSelection = { n: 3, l: 2, ml: 0 };

interface OrbitalState {
  currentParams: OrbitalParams | null;
  /**
   * A Basic Orbitals combination (hybrids, a field) to draw instead of
   * `currentParams`. At most one of the two is set: whichever was asked for
   * last is what is on screen.
   */
  currentField: FieldRenderRequest | null;
  isLoading: boolean;
  error: string | null;
  /**
   * The last render failed. Outlives `error`, which the user can dismiss, so
   * the same request can still be sent again after the message is gone.
   */
  renderFailed: boolean;
  /** Bumped to ask the viewer to re-frame the camera. */
  viewResetNonce: number;
  /** View-only: none of this re-runs the calculation. */
  surfaceStyle: SurfaceStyle;
  /** The contour the last render settled on, derived from the enclosed fraction. */
  isoLevel: number | null;
  /** Basic Orbitals' panel choice. In the store, not App, because a shared link restores it. */
  basicSelection: BasicSelection;
  /** The contour's enclosed share, for both modes. */
  enclosedFraction: number;
  /** Phase 1's combination picker. */
  combination: CombinationSelection;
  /** Bumped to ask App for a Basic Orbitals render once every pending dispatch has landed. */
  basicRenderNonce: number;
  /** The camera's direction, off the canonical view. Null at the canonical view, so an untouched view's link carries no cam key. */
  cameraAngles: CameraAngles | null;
  /** Bumped to ask the viewer to turn the camera to `cameraAngles` (a restored link). */
  cameraRestoreNonce: number;
}

const initialState: OrbitalState = {
  currentParams: null,
  currentField: null,
  isLoading: false,
  error: null,
  renderFailed: false,
  viewResetNonce: 0,
  surfaceStyle: { ...defaultSurfaceStyle },
  isoLevel: null,
  basicSelection: { ...DEFAULT_BASIC_SELECTION },
  enclosedFraction: DEFAULT_ENCLOSED_FRACTION,
  combination: NO_COMBINATION,
  basicRenderNonce: 0,
  cameraAngles: null,
  cameraRestoreNonce: 0
};

const orbitalSlice = createSlice({
  name: 'orbital',
  initialState,
  reducers: {
    startOrbitalCalculation: (state, action: PayloadAction<OrbitalParams>) => {
      state.isLoading = true;
      state.error = null;
      state.renderFailed = false;
      state.currentParams = action.payload;
      state.currentField = null;
    },
    finishOrbitalCalculation: (state, action: PayloadAction<{ isoLevel: number }>) => {
      state.isLoading = false;
      state.error = null;
      state.isoLevel = action.payload.isoLevel;
    },
    failOrbitalCalculation: (state, action: PayloadAction<string>) => {
      state.isLoading = false;
      state.error = action.payload;
      state.renderFailed = true;
    },
    dismissOrbitalError: (state) => {
      state.error = null;
    },
    resetView: (state) => {
      state.viewResetNonce += 1;
      // Reset View (and picking an element, which dispatches this too)
      // swings the camera back to the canonical direction -- the store must
      // say so, or it goes on reporting a stale angle for a screen that has
      // already gone back to canonical.
      state.cameraAngles = null;
    },
    setSurfaceStyle: (state, action: PayloadAction<Partial<SurfaceStyle>>) => {
      state.surfaceStyle = { ...state.surfaceStyle, ...action.payload };
    },
    startFieldCalculation: (state, action: PayloadAction<FieldRenderRequest>) => {
      state.isLoading = true;
      state.error = null;
      state.renderFailed = false;
      state.currentField = action.payload;
      state.currentParams = null;
    },
    /**
     * A combination that cannot be drawn (selectionProblem): ask for nothing,
     * so the viewer takes the last picture down rather than leave it under
     * the new selection's title (spec §3.5). The reason is shown by the picker.
     */
    clearPicture: (state) => {
      state.currentField = null;
      state.currentParams = null;
      state.isLoading = false;
      state.error = null;
      state.renderFailed = false;
      state.isoLevel = null;
    },
    setBasicSelection: (state, action: PayloadAction<Partial<BasicSelection>>) => {
      state.basicSelection = { ...state.basicSelection, ...action.payload };
    },
    setEnclosedFraction: (state, action: PayloadAction<number>) => {
      state.enclosedFraction = action.payload;
    },
    setCombination: (state, action: PayloadAction<CombinationSelection>) => {
      state.combination = action.payload;
    },
    requestBasicRender: (state) => {
      state.basicRenderNonce += 1;
    },
    // The viewer reports the camera once it settles. Stored as null at the
    // canonical view, so an untouched view's link carries no cam key.
    cameraMoved: (state, action: PayloadAction<CameraAngles>) => {
      const next = isCanonicalAngles(action.payload) ? null : action.payload;
      const current = state.cameraAngles;
      const same = next === null
        ? current === null
        : current !== null && current.azimuth === next.azimuth && current.elevation === next.elevation;
      if (!same) state.cameraAngles = next;
    },
    // A restored link: the nonce is what the viewer watches.
    restoreCamera: (state, action: PayloadAction<CameraAngles | null>) => {
      state.cameraAngles = action.payload && !isCanonicalAngles(action.payload) ? action.payload : null;
      state.cameraRestoreNonce += 1;
    },
  },
  // Combinations belong to Basic Orbitals. Leaving for atom mode drops the
  // request, so no effect can redraw a hybrid over an atom, and the viewer
  // stops the worker still computing one (OrbitalViewer); coming back bumps
  // basicRenderNonce, so App re-renders whatever the store's own selection
  // and combination currently hold -- the selection now lives here, not in
  // App's local state, so there is nothing left for App to "re-request" from.
  extraReducers: builder => {
    builder.addCase(setMode, (state, action) => {
      if (action.payload === 'hydrogenic') state.basicRenderNonce += 1;
      if (action.payload !== 'atom' || !state.currentField) return;
      state.currentField = null;
      state.isLoading = false;
    });
  }
});

export const {
  startOrbitalCalculation,
  finishOrbitalCalculation,
  failOrbitalCalculation,
  dismissOrbitalError,
  resetView,
  setSurfaceStyle,
  startFieldCalculation,
  clearPicture,
  setBasicSelection,
  setEnclosedFraction,
  setCombination,
  requestBasicRender,
  cameraMoved,
  restoreCamera
} = orbitalSlice.actions;

/**
 * The Basic Orbitals orbital a link or a caption should name: the one drawn,
 * which can differ from the panel until Update Orbital is pressed. An orbital
 * with a numerical radial factor, or another Z, is atom mode's level 3 and
 * does not count.
 */
export function selectShownBasicOrbital(state: RootState): BasicSelection {
  const drawn = state.orbital.currentParams;
  if (drawn && !drawn.radialSamples && drawn.Z === BASIC_ORBITALS_Z) {
    return { n: drawn.n, l: drawn.l, ml: drawn.ml };
  }
  return state.orbital.basicSelection;
}

export default orbitalSlice.reducer;
