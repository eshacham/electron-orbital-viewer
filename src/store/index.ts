import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './orbitalSlice';
import atomReducer from './atomSlice';

export const store = configureStore({
  reducer: {
    orbital: orbitalReducer,
    atom: atomReducer
  },
  // Ruling R16: an atom profile's D(r)/R(r) curves are deliberately kept as
  // typed arrays all the way into the store -- converting them to plain
  // arrays for RTK's serializableCheck would triple their memory and throw
  // away the point of using Float32Array/Float64Array in the first place.
  // `atom/solveSucceeded` carries the whole profile in one payload
  // (SerialisedAtomProfile: total, shells[].curve, subshells[].curve/R,
  // shellPeaks), so both the action and every path under `atom.profile` in
  // the resulting state are told to the check as intentional exceptions
  // rather than "fixed" into something slower.
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['atom/solveSucceeded'],
        ignoredPaths: [/^atom\.profile/],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;