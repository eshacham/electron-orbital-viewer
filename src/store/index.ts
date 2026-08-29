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
  // Two paths carry them: `atom/solveSucceeded`'s payload (the whole
  // SerialisedAtomProfile -- total, shells[].curve, subshells[].curve/R,
  // shellPeaks, all under `atom.profile` once in state), and
  // `orbital/startOrbitalCalculation`'s payload when atom mode's level 3
  // hands the marching-cubes pipeline a subshell's numerical R(r) instead
  // of the analytic radial factor (`OrbitalParams.radialSamples.R`, landing
  // in state under `orbital.currentParams.radialSamples`). Both the actions
  // and the resulting state paths are told to the check as intentional
  // exceptions rather than "fixed" into something slower.
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['atom/solveSucceeded', 'orbital/startOrbitalCalculation'],
        ignoredPaths: [/^atom\.profile/, /^orbital\.currentParams\.radialSamples/],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;