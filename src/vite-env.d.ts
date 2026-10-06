/// <reference types="vite/client" />

declare module '*.worker?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

interface ImportMetaEnv {
  /** The deployed jobs API's execute-api URL (Phase 6B-3 sets it at build). */
  readonly VITE_JOBS_API_URL?: string;
  readonly VITE_COGNITO_AUTHORITY?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  /** The managed-login domain, e.g. https://<prefix>.auth.us-east-1.amazoncognito.com (used for sign-out). */
  readonly VITE_COGNITO_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}