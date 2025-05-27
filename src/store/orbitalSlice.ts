import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OrbitalParams } from '../components/OrbitalViewer';

interface OrbitalState {
  currentParams: OrbitalParams | null;
}

const initialState: OrbitalState = {
  currentParams: null
};

const orbitalSlice = createSlice({
  name: 'orbital',
  initialState,
  reducers: {
    setOrbitalParams: (state, action: PayloadAction<OrbitalParams>) => {
      state.currentParams = action.payload;
    }
  }
});

export const { setOrbitalParams } = orbitalSlice.actions;
export default orbitalSlice.reducer;