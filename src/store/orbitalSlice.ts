import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OrbitalParams } from '../components/OrbitalViewer';

interface OrbitalState {
  currentParams: OrbitalParams | null;
  isLoading: boolean;
}

const initialState: OrbitalState = {
  currentParams: null,
  isLoading: false
};

const orbitalSlice = createSlice({
  name: 'orbital',
  initialState,
  reducers: {
    startOrbitalCalculation: (state, action: PayloadAction<OrbitalParams>) => {
      state.isLoading = true;
      state.currentParams = action.payload;
    },
    finishOrbitalCalculation: (state) => {
      state.isLoading = false;
    }
  }
});

export const { startOrbitalCalculation, finishOrbitalCalculation } = orbitalSlice.actions;
export default orbitalSlice.reducer;