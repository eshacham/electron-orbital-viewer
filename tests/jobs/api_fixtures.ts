import { readFileSync } from 'fs';
import path from 'path';
import type { CostsResponse, JobListResponse, JobView, PreviewResponse } from '../../src/jobs/api_types';

export type PreviewFixtureName = 'preview_ok' | 'preview_aws' | 'preview_known' | 'preview_refused' | 'preview_capped' | 'preview_spot_unavailable';
export type JobFixtureName = 'submit_created' | 'submit_known' | 'get_running' | 'get_done' | 'get_failed'
    | 'submit_aws' | 'get_done_aws' | 'get_absorbed_aws' | 'get_legacy_aws' | 'get_retried_aws';
export type FixtureName = PreviewFixtureName | JobFixtureName | 'error_unknown_compound' | 'error_quote_changed'
    | 'list_done' | 'list_all' | 'costs';

/** The API's own responses (6B-1's, with 6C's quotes), recorded by tests/jobs/make_api_fixtures.py. */
export function fixture(name: FixtureName): { status: number; body: unknown } {
    return JSON.parse(readFileSync(path.resolve(__dirname, 'fixtures/api', `${name}.json`), 'utf8'));
}
export const previewFixture = (name: PreviewFixtureName) => fixture(name).body as PreviewResponse;
export const jobFixture = (name: JobFixtureName) => fixture(name).body as JobView;
export const listFixture = (name: 'list_done' | 'list_all') => fixture(name).body as JobListResponse;
export const costsFixture = () => fixture('costs').body as CostsResponse;

/** A Response as the client reads it: status, ok, and the body as text. */
export function textResponse(status: number, text: string): Response {
    return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response;
}
export const jsonResponse = (status: number, body: unknown): Response => textResponse(status, JSON.stringify(body));
