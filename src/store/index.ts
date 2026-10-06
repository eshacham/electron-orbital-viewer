import { configureStore } from '@reduxjs/toolkit';
import orbitalReducer from './orbitalSlice';
import atomReducer from './atomSlice';
import bondsReducer from './bondsSlice';
import moleculeReducer from './moleculeSlice';
import jobsReducer from './jobsSlice';

/**
 * Builds a store with production's middleware config. Exported (rather than
 * inlined below) so a test that needs a real store -- not one isolated
 * reducer -- gets the same serializableCheck exceptions the app runs under,
 * instead of a bare `configureStore` that prints ruling R16's console.error
 * on every `solveSucceeded`/`startOrbitalCalculation` it dispatches.
 */
/** Exported for tests that build their own store (e.g. with preloaded state). */
export const SERIALIZABLE_CHECK = {
  ignoredActions: ['atom/solveSucceeded', 'orbital/startOrbitalCalculation'],
  ignoredPaths: [/^atom\.profile/, /^orbital\.currentParams\.radialSamples/],
};

export function createAppStore() {
  return configureStore({
    reducer: {
      orbital: orbitalReducer,
      atom: atomReducer,
      bonds: bondsReducer,
      molecule: moleculeReducer,
      jobs: jobsReducer,
    },
    // Ruling R16: an atom profile's D(r)/R(r) curves are deliberately kept as
    // typed arrays all the way into the store -- converting them to plain
    // arrays for RTK's serializableCheck would triple their memory and throw
    // away the point of using Float32Array/Float64Array in the first place.
    // Two paths carry them: `atom/solveSucceeded`'s payload (the whole
    // SerialisedAtomProfile -- total, totalEmphasis, shells[].curve/emphasis,
    // subshells[].curve/R, shellPeaks, all under `atom.profile` once in
    // state), and
    // `orbital/startOrbitalCalculation`'s payload when atom mode's level 3
    // hands the marching-cubes pipeline a subshell's numerical R(r) instead
    // of the analytic radial factor (`OrbitalParams.radialSamples.R`, landing
    // in state under `orbital.currentParams.radialSamples`). Both the actions
    // and the resulting state paths are told to the check as intentional
    // exceptions rather than "fixed" into something slower.
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: SERIALIZABLE_CHECK }),
  });
}

export const store = createAppStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;