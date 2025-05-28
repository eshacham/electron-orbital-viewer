import { createAsyncThunk } from '@reduxjs/toolkit';
import { AppDispatch } from './index';
// import { setLoading } from './loadingSlice';
import { OrbitalParams } from '../components/OrbitalViewer';

export const updateOrbitalParameters = createAsyncThunk<
  OrbitalParams,
  OrbitalParams,
  { dispatch: AppDispatch }
>(
  'orbital/updateParameters',
  async (params) => {
    return params;
  }
);

export const orbitalRendered = createAsyncThunk(
  'orbital/rendered',
  async () => {
    return;
  }
);