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
  verbose: true,
  cache: true,
  maxWorkers: '50%', // Use up to half of CPU cores
  // Recycle a worker once it idles above 1 GB: the SCF suites leave large
  // memoised solutions behind, and three full runs have lost a worker to
  // SIGSEGV mid-suite (each test passed alone and on rerun).
  workerIdleMemoryLimit: '1GB'
};

export default config;
