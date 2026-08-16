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
}

const initialState: OrbitalState = {
  currentParams: null,
  isLoading: false,
  error: null,
  viewResetNonce: 0,
  surfaceStyle: { ...defaultSurfaceStyle }
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
    finishOrbitalCalculation: (state) => {
      state.isLoading = false;
      state.error = null;
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
