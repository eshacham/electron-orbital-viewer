// filepath: c:\Users\shach\dev\atom\electron-orbital-viewer\src\store\store.ts
import { configureStore } from '@reduxjs/toolkit';
import loadingReducer from './loadingSlice';
import orbitalReducer from './orbitalSlice';

export const store = configureStore({
  reducer: {
    loading: loadingReducer,
    orbital: orbitalReducer
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;