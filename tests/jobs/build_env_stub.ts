import type { BuildEnv } from '../../src/jobs/build_env';

/**
 * Jest's stand-in for src/jobs/build_env.ts (jest.config.ts maps it here).
 * Mutable: a test sets what it needs; resetBuildEnv() restores a production
 * build with no API and no sign-in, the safest default for every other test.
 */
export const BUILD_ENV: BuildEnv = { dev: false, jobsApiUrl: null, cognito: null };

export function resetBuildEnv(): void {
    Object.assign(BUILD_ENV, { dev: false, jobsApiUrl: null, cognito: null });
}
