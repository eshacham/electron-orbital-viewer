import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './orbitalSlice';
import atomReducer from './atomSlice';

export const store = configureStore({
  reducer: {
    orbital: orbitalReducer,
    atom: atomReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;