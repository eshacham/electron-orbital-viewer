import { sortJobs, jobLinks, recentMonths, methodSummary } from '../../src/admin/jobs_table';
import type { JobView } from '../../src/jobs/api_types';
import { jobFixture } from '../jobs/api_fixtures';

const done = jobFixture('get_done');
const failed = jobFixture('get_failed');
const running: JobView = { ...jobFixture('get_running'), key: 'b'.repeat(64), name: 'Ethanol', formula: 'C2H6O', submittedAt: '2026-10-10T12:05:00Z' };
const JOBS = [done, failed, running];

describe('jobs table logic', () => {
    // The status/recipe/size selects gave way to the status chips and the molecule search (jobs_month.test.ts).
    it('sorts either way, with missing actuals last in both', () => {
        expect(sortJobs(JOBS, 'time', 'asc')[0]).toBe(done);
        expect(sortJobs(JOBS, 'time', 'desc')[0]).toBe(done);
        expect(sortJobs(JOBS, 'molecule', 'asc').map(j => j.name)).toEqual(['Ethanol', 'H2O', 'Water']);
        expect(sortJobs(JOBS, 'submittedAt', 'desc')[0]).toBe(running);
    });
    it('links a finished job to its result and its files, and a failed one to its attempt', () => {
        expect(jobLinks(done)[0]).toEqual({ label: 'open', href: `/#mode=molecule&job=${done.key}` });
        expect(jobLinks(done).map(link => link.label)).toEqual(['open', 'input.py', 'output.log', 'geometry.xyz', 'job.json', 'timings.json']);
        expect(jobLinks(failed)).toEqual([
            { label: 'attempt 1 input.py', href: `/molecules/jobs/${failed.key}/attempts/1/input.py` },
            { label: 'attempt 1 output.log', href: `/molecules/jobs/${failed.key}/attempts/1/output.log` },
        ]);
        expect(jobLinks(running)).toEqual([]);
        for (const code of ['submit-failed', 'submit-lost', 'no-capacity']) {
            expect(jobLinks({ ...failed, error: { code, message: 'no worker ran' } })).toEqual([]);
        }
    });
    it('links no attempt files for a worker Batch stopped before it could copy them out', () => {
        // Final review M7: reconcile's codes mean Batch ended the task (a
        // timeout, an OOM kill, a reclaim), and the worker writes attempts/<n>/
        // only once its run is over.
        const actual = { wallSeconds: 12, peakMemoryGB: 0.3, threads: 2 };
        for (const code of ['timed-out', 'out-of-memory', 'spot-interrupted', 'worker-lost', 'batch-lost', 'batch-failed', 'worker-crashed']) {
            expect(jobLinks({ ...failed, actual: null, error: { code, message: 'Batch ended it' } })).toEqual([]);
        }
        // A worker that reported the failure itself copied its files first,
        // whatever the code (its own MemoryError is out-of-memory too).
        for (const code of ['out-of-memory', 'scf-not-converged', 'worker-error']) {
            expect(jobLinks({ ...failed, actual, error: { code, message: 'the worker said so' } })).toHaveLength(2);
        }
        expect(jobLinks({ ...failed, actual: null, error: { code: 'optimisation-not-converged', message: 'm' } })).toHaveLength(2);
    });
    it('names the method, and lists the last months', () => {
        expect(methodSummary(failed)).toBe('B3LYP-D3(BJ)/def2-SVP → B3LYP-D3(BJ)/def2-TZVPD');
        expect(methodSummary(done)).toBe('B3LYP-D3(BJ)/def2-TZVPD');
        expect(recentMonths(new Date('2026-01-15T00:00:00Z'), 3)).toEqual(['2026-01', '2025-12', '2025-11']);
    });
});

// The <JobsTable> component tests moved to jobs_page.test.tsx: the wide table became one-line rows with inline
// details (Phase 6G-3), so its column-cell assertions now read the row and the row's details.

describe('jobs table money logic (Phase 6C)', () => {
    // The cost cell's assertions moved to jobs_page.test.tsx ("a row's details keep everything the old table showed").
    it('links no attempt files for a worker reconcile stopped for silence', () => {
        expect(jobLinks({ ...jobFixture('get_failed'), actual: null, error: { code: 'worker-silent', message: 'silent' } })).toEqual([]);
    });
    it('sorts cost by what was charged, or a legacy record by its actual cost', () => {
        const legacy = jobFixture('get_legacy_aws');
        const absorbed = jobFixture('get_absorbed_aws');
        expect(sortJobs([absorbed, legacy], 'cost', 'asc').map(j => j.key)).toEqual([legacy.key, absorbed.key]);
    });
});
