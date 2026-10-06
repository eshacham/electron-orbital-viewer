/**
 * Every build-time setting the jobs interface reads, in one module. Vite
 * replaces import.meta.env at build; Jest cannot parse import.meta at all,
 * so jest.config.ts maps this module to tests/jobs/build_env_stub.ts.
 */
export interface CognitoSettings { authority: string; clientId: string; domain: string }

export interface BuildEnv {
    /** The Vite dev server (npm run dev), where the owner may run jobs on this Mac. */
    dev: boolean;
    /** The deployed API's execute-api URL (Phase 6B-3 sets it at build); null when unset. */
    jobsApiUrl: string | null;
    /** null until all three VITE_COGNITO_* values are set: sign-in then says "not configured". */
    cognito: CognitoSettings | null;
}

const env = import.meta.env;
const authority = env.VITE_COGNITO_AUTHORITY;
const clientId = env.VITE_COGNITO_CLIENT_ID;
const domain = env.VITE_COGNITO_DOMAIN;

export const BUILD_ENV: BuildEnv = {
    dev: env.DEV,
    jobsApiUrl: env.VITE_JOBS_API_URL ? env.VITE_JOBS_API_URL.replace(/\/+$/, '') : null,
    cognito: authority && clientId && domain ? { authority, clientId, domain: domain.replace(/\/+$/, '') } : null,
};
