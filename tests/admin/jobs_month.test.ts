import {
    bandScale, billingGap, chargedTotal, chipCounts, cumulativeSeries, daysIn, groupOf, markTone, matchesChip,
    matchesSearch, monotoneSegments, monthLabel, niceCeil, OFF_PREDICTION_RATIO, predictionCheck, segmentsToPath,
} from '../../src/admin/jobs_month';
import type { CostsResponse, JobView } from '../../src/jobs/api_types';
import { costsFixture, jobFixture } from '../jobs/api_fixtures';

const done = jobFixture('get_done');                 // Water, 70 s against 16.3 s predicted: far over
const failed = jobFixture('get_failed');
const running = jobFixture('get_running');            // started 12:00:05, predicted 16.3 s
const onTime: JobView = { ...jobFixture('get_done_aws') }; // 15.04 s of 16.3 s, 0.326 of 0.47 GB
const retried = jobFixture('get_retried_aws');        // two attempts, 20 s of 19.6 s
const legacy = jobFixture('get_legacy_aws');
const queued: JobView = { ...running, status: 'QUEUED', startedAt: null, peakMemoryGB: null };
const START = Date.parse('2026-10-10T12:00:05Z');

describe('a job against its prediction', () => {
    it('is off prediction when its run time or peak memory is more than 25 % over', () => {
        expect(OFF_PREDICTION_RATIO).toBe(1.25);
        expect(predictionCheck(done, 0)).toMatchObject({ timeOver: true, memoryOver: false, off: true });
        expect(predictionCheck(onTime, 0)).toMatchObject({ timeOver: false, memoryOver: false, off: false });
        const memoryOnly: JobView = { ...onTime, actual: { ...onTime.actual!, peakMemoryGB: 0.47 * 1.3 } };
        expect(predictionCheck(memoryOnly, 0)).toMatchObject({ timeOver: false, memoryOver: true, off: true });
        // Exactly 25 % over is still within the threshold.
        const atEdge: JobView = { ...onTime, actual: { ...onTime.actual!, wallSeconds: 16.3 * 1.25 } };
        expect(predictionCheck(atEdge, 0).off).toBe(false);
    });
    it('reads a running job by its time so far and its last heartbeat memory', () => {
        const early = predictionCheck(running, START + 10_000);
        expect(early.time).toBeCloseTo(10 / 16.3, 3);
        expect(early.off).toBe(false);
        expect(predictionCheck(running, START + 30_000).timeOver).toBe(true);
        expect(predictionCheck(queued, START + 30_000)).toMatchObject({ time: null, memory: null, off: false });
    });
    it('groups queued, starting and running together; failed and done apart', () => {
        expect([queued, running, { ...running, status: 'STARTING' } as JobView, failed, done].map(groupOf))
            .toEqual(['running', 'running', 'running', 'failed', 'done']);
    });
    it('colours a mark by what happened: failed, running, off prediction or retried, else done', () => {
        expect(markTone(failed, 0)).toBe('danger');
        expect(markTone(running, START + 1000)).toBe('accent');
        expect(markTone(done, 0)).toBe('warning');
        expect(markTone(retried, 0)).toBe('warning');
        expect(markTone(onTime, 0)).toBe('success');
    });
});

describe('the filter chips', () => {
    const jobs = [done, failed, running, onTime, retried, queued];
    it('count each chip, with Running holding the queued too', () => {
        expect(chipCounts(jobs, START + 1000)).toEqual({ all: 6, running: 2, failed: 1, done: 3, off: 1 });
        expect(jobs.filter(job => matchesChip(job, 'done', 0))).toEqual([done, onTime, retried]);
        expect(jobs.filter(job => matchesChip(job, 'off', START + 1000))).toEqual([done]);
    });
    it('search by molecule name or formula, case-blind, subscripts or not', () => {
        const caffeine: JobView = { ...onTime, name: 'Caffeine', formula: 'C8H10N4O2' };
        expect(matchesSearch(caffeine, '')).toBe(true);
        expect(matchesSearch(caffeine, 'caff')).toBe(true);
        expect(matchesSearch(caffeine, 'c8h10')).toBe(true);
        expect(matchesSearch(caffeine, 'C₈H₁₀')).toBe(true);
        expect(matchesSearch(caffeine, 'water')).toBe(false);
    });
});

describe('what a job was charged', () => {
    it("adds every quoted approval's charge, and takes a legacy record's actual cost", () => {
        expect(chargedTotal(retried)).toBeCloseTo(0.001508 + 0.003326, 9);
        expect(chargedTotal(onTime)).toBeCloseTo(0.002214, 9);
        expect(chargedTotal(legacy)).toBeCloseTo(0.000497, 9);
        expect(chargedTotal(running)).toBeNull();
    });
});

describe('the month band', () => {
    it('knows each month and names it', () => {
        expect([daysIn('2026-10'), daysIn('2026-02'), daysIn('2028-02')]).toEqual([31, 28, 29]);
        expect(monthLabel('2026-10')).toBe('October 2026');
    });
    it('adds the daily spend up to a cumulative point per day, from zero, through the given day', () => {
        const series = cumulativeSeries([{ date: '2026-10-02', usd: 0.1 }, { date: '2026-10-04', usd: 0.05 }], 5);
        expect(series.map(p => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(series.map(p => p.y)).toEqual([0, 0, 0.1, 0.1, expect.closeTo(0.15, 9), expect.closeTo(0.15, 9)]);
    });
    it('draws the cumulative line as a monotone cubic: through every point, never falling, never overshooting', () => {
        const points = cumulativeSeries([
            { date: '2026-10-06', usd: 0.105 }, { date: '2026-10-09', usd: 0.0025 }, { date: '2026-10-11', usd: 0.021 },
            { date: '2026-10-12', usd: 0.016 }, { date: '2026-10-14', usd: 0.071 }, { date: '2026-10-18', usd: 0.031 },
        ], 20);
        const segments = monotoneSegments(points);
        expect(segments).toHaveLength(points.length - 1);
        segments.forEach((s, i) => {
            expect(s.p0).toEqual(points[i]);
            expect(s.p1).toEqual(points[i + 1]);
            let last = -Infinity;
            for (let k = 0; k <= 20; k++) {
                const t = k / 20, u = 1 - t;
                const y = u * u * u * s.p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p1.y;
                expect(y).toBeGreaterThanOrEqual(last - 1e-12);
                expect(y).toBeGreaterThanOrEqual(s.p0.y - 1e-12);
                expect(y).toBeLessThanOrEqual(s.p1.y + 1e-12);
                last = y;
            }
        });
    });
    it('keeps a flat stretch flat, and writes the path in screen space', () => {
        const segments = monotoneSegments([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }]);
        expect(segments[0].c1.y).toBe(0);
        expect(segments[0].c2.y).toBe(0);
        expect(segmentsToPath(segments, x => x * 10, y => 100 - y * 100)).toMatch(/^M0,100 C3\.33,100 6\.67,100 10,100 C/);
        expect(monotoneSegments([{ x: 0, y: 0 }])).toEqual([]);
    });
    it('scales to the cap when the month comes near it, and otherwise to its own figures with the cap above', () => {
        expect(niceCeil(0.97)).toBe(1);
        expect(niceCeil(1.3)).toBe(2);
        expect(niceCeil(0.21)).toBe(0.25);
        expect(bandScale(8.8, 6)).toEqual({ top: 8.8, capInside: true });
        expect(bandScale(8.8, 0.81)).toEqual({ top: 1, capInside: false });
        expect(bandScale(8.8, 0)).toEqual({ top: 0.1, capInside: false });
    });
});

describe('AWS billed against the meter', () => {
    it('says nothing until the billing job has run', () => {
        expect(billingGap(costsFixture())).toBeNull();
    });
    it('sets the billed figure against the meter, and the gap between, either way', () => {
        const costs: CostsResponse = { ...costsFixture(), spentUsd: 0.325, billing: { usd: 0.62, through: '2026-10-18' } };
        expect(billingGap(costs)).toEqual({ billedUsd: 0.62, meterUsd: 0.325, gapUsd: expect.closeTo(0.295, 9), through: '2026-10-18' });
        expect(billingGap({ ...costs, billing: { usd: 0.2 } })!.gapUsd).toBeCloseTo(-0.125, 9);
        expect(billingGap({ ...costs, billing: { usd: 0.2 } })!.through).toBeNull();
    });
});
