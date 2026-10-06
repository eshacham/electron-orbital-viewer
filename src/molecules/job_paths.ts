/**
 * Where computed molecules live (spec §5.3): /molecules/jobs/<key>/, beside
 * the versioned library rather than inside it, since a job's result is not
 * part of any published data version. The key is the lowercase hex SHA-256
 * of the canonical job (spec §5.2): 64 hex characters. Library ids are
 * ^[a-z0-9]+$ with no length cap (D21), so the pattern alone would admit a
 * 64-hex library id; none exists -- they are short names like h2o -- so the
 * id alone says which it is.
 */
export const JOBS_BASE_URL = '/molecules/jobs';
const JOB_KEY = /^[0-9a-f]{64}$/;

export function isJobKey(id: string | null | undefined): id is string {
    return typeof id === 'string' && JOB_KEY.test(id);
}

export const jobBaseUrl = (key: string): string => `${JOBS_BASE_URL}/${key}`;
export const jobFileUrl = (key: string, name: string): string => `${jobBaseUrl(key)}/${name}`;

/** The files a finished job leaves beside Phase 6's (spec §5.3), in the order the provenance panel lists them. */
export function computedResultFiles(recipe: 'single' | 'optimise'): string[] {
    return ['input.py', 'output.log', 'geometry.xyz', 'job.json', ...(recipe === 'optimise' ? ['trajectory.xyz'] : [])];
}
