import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OrbitalParams, SurfaceStyle, defaultSurfaceStyle } from '../types/orbital';

interface OrbitalState {
  currentParams: OrbitalParams | null;
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
    }
  }
});

export const {
  startOrbitalCalculation,
  finishOrbitalCalculation,
  failOrbitalCalculation,
  dismissOrbitalError,
  resetView,
  setSurfaceStyle
} = orbitalSlice.actions;
export default orbitalSlice.reducer;
