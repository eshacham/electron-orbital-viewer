import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './orbitalSlice';

export const store = configureStore({
  reducer: {
    orbital: orbitalReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;