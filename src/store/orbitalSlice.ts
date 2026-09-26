import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OrbitalParams, SurfaceStyle, defaultSurfaceStyle } from '../types/orbital';
import { FieldRenderRequest } from '../field_source';
import { setMode } from './atomSlice';

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
  /** Bumped to ask the viewer to re-frame the camera. */
  viewResetNonce: number;
  /** View-only: none of this re-runs the calculation. */
  surfaceStyle: SurfaceStyle;
  /** The contour the last render settled on, derived from the enclosed fraction. */
  isoLevel: number | null;
}

const initialState: OrbitalState = {
  currentParams: null,
  currentField: null,
  isLoading: false,
  error: null,
  viewResetNonce: 0,
  surfaceStyle: { ...defaultSurfaceStyle },
  isoLevel: null
};

const orbitalSlice = createSlice({
  name: 'orbital',
  initialState,
  reducers: {
    startOrbitalCalculation: (state, action: PayloadAction<OrbitalParams>) => {
      state.isLoading = true;
      state.error = null;
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
    },
    dismissOrbitalError: (state) => {
      state.error = null;
    },
    resetView: (state) => {
      state.viewResetNonce += 1;
    },
    setSurfaceStyle: (state, action: PayloadAction<Partial<SurfaceStyle>>) => {
      state.surfaceStyle = { ...state.surfaceStyle, ...action.payload };
    },
    startFieldCalculation: (state, action: PayloadAction<FieldRenderRequest>) => {
      state.isLoading = true;
      state.error = null;
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
      state.isoLevel = null;
    }
  },
  // Combinations belong to Basic Orbitals. Leaving for atom mode drops the
  // request, so no effect can redraw a hybrid over an atom, and the viewer
  // stops the worker still computing one (OrbitalViewer); coming back
  // re-requests it from App's own selection.
  extraReducers: builder => {
    builder.addCase(setMode, (state, action) => {
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
  clearPicture
} = orbitalSlice.actions;
export default orbitalSlice.reducer;
