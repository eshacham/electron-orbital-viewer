import { createAsyncThunk } from '@reduxjs/toolkit';
import { setLoading } from './loadingSlice';
import { setOrbitalParams } from './orbitalSlice';
import { OrbitalParams } from '../components/OrbitalViewer';

export const updateOrbitalParameters = createAsyncThunk(
  'orbital/updateParameters',
  async (params: OrbitalParams, { dispatch }) => {
    dispatch(setLoading(true));
    dispatch(setOrbitalParams(params));
    return params;
  }
);

export const orbitalRendered = createAsyncThunk(
  'orbital/rendered',
  async (_, { dispatch }) => {
    dispatch(setLoading(false));
  }
);