// c:\Users\shach\dev\atom\electron-orbital-viewer\jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  // import.meta does not parse under ts-jest: the one module that reads
  // import.meta.env (src/jobs/build_env.ts) is replaced by a mutable
  // stand-in, which a test sets and resetBuildEnv() restores.
  moduleNameMapper: {
    '^.+/build_env$': '<rootDir>/tests/jobs/build_env_stub.ts',
  },
  // The two exhaustive SCF sweeps (Phase 3's excitation_sweep_<k> and
  // Phase 4's relativistic_heavy_sweep_<k> shards) are hours of work and run
  // only with ATOM_SLOW_TESTS=1. Gating each test with it.skip was not
  // enough: jest still compiled every shard and set up a suite for it,
  // seconds of a ~60 s default run for nothing (ruling T7-e). They are left
  // out of the default run instead; the shard files stay, since they are
  // what lets one slow invocation run shards side by side.
  testPathIgnorePatterns: [
    '/node_modules/',
    ...(process.env.ATOM_SLOW_TESTS === '1' ? [] : ['/tests/atom/relativistic_heavy_sweep', '/tests/atom/excitation_sweep']),
  ],
  verbose: true,
  cache: true,
  maxWorkers: '50%', // Use up to half of CPU cores
  // Recycle a worker once it idles above 1 GB: the SCF suites leave large
  // memoised solutions behind, and three full runs have lost a worker to
  // SIGSEGV mid-suite (each test passed alone and on rerun).
  workerIdleMemoryLimit: '1GB'
};

export default config;
