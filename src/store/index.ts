// filepath: c:\Users\shach\dev\atom\electron-orbital-viewer\src\store\store.ts
import { configureStore } from '@reduxjs/toolkit';
import loadingReducer from './loadingSlice';

export const store = configureStore({
  reducer: {
    loading: loadingReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;