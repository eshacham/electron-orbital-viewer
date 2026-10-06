import {
    formatUsd, money, microsToUsd, formatDuration, formatGB, formatEnergy, methodOf, predictionNote, capacityLabel,
    currentMonth, elapsedSeconds, shortKey,
} from '../../src/jobs/format';
import { isActive } from '../../src/jobs/api_types';
import { tierOf } from '../../src/molecules/types';
import { jobFixture } from './api_fixtures';

describe('money', () => {
    it('shows cents from a cent up, and four significant figures below', () => {
        expect(formatUsd(8.8)).toBe('$8.80');
        expect(formatUsd(0.01)).toBe('$0.01');
        expect(formatUsd(0.0298)).toBe('$0.03');
        expect(formatUsd(0.00298)).toBe('$0.002980');
        expect(formatUsd(0.000001)).toBe('$0.000001000');
        expect(formatUsd(0)).toBe('$0.00');
        // M1: just under a cent rounds to a cent at four figures, and is then shown as cents.
        expect(formatUsd(0.0099999)).toBe('$0.01');
        expect(formatUsd(0.009999)).toBe('$0.009999');
    });
    it('always says what the figure is', () => {
        expect(money('spent', 0.1)).toBe('spent $0.10');
        expect(money('reserved', 0.00298)).toBe('reserved $0.002980');
        expect(money('projected', 1.5)).toBe('projected $1.50');
        expect(microsToUsd(29_800)).toBeCloseTo(0.0298, 12);
    });
});

describe('times and sizes', () => {
    it('reads like a clock, not like a float', () => {
        expect(formatDuration(0)).toBe('0 s');
        expect(formatDuration(42)).toBe('42 s');
        expect(formatDuration(70.2)).toBe('1 min 10 s');
        expect(formatDuration(3725)).toBe('1 h 02 min');
        expect(formatGB(0.5)).toBe('0.50 GB');
        expect(formatGB(64)).toBe('64.0 GB');
    });
    it('measures elapsed time from the start, from submission while waiting, and stops at the end', () => {
        const running = jobFixture('get_running');                       // started 12:00:05
        expect(elapsedSeconds(running, Date.parse('2026-10-10T12:01:05Z'))).toBe(60);
        expect(elapsedSeconds({ ...running, startedAt: null }, Date.parse('2026-10-10T12:00:30Z'))).toBe(30);
        expect(elapsedSeconds(jobFixture('get_done'), Date.parse('2026-10-11T00:00:00Z'))).toBe(70);
    });
    it('months are UTC', () => {
        expect(currentMonth(new Date('2026-10-31T23:30:00-05:00'))).toBe('2026-11');
    });
});

describe('every number states its method', () => {
    it('labels an energy with the method that produced it', () => {
        const single = jobFixture('get_running').job;
        expect(formatEnergy(-76.4612, methodOf(single, 'SCF (DIIS)'))).toBe('−76.461200 Ha (B3LYP/def2-TZVPD)');
        const optimise = jobFixture('get_failed').job;
        expect(methodOf(optimise, 'optimisation step 4')).toBe('B3LYP/def2-SVP');
        expect(methodOf(optimise, 'SCF (DIIS)')).toBe('B3LYP/def2-TZVPD');
        expect(methodOf(optimise)).toBe('B3LYP/def2-TZVPD');
        expect(predictionNote(1)).toBe('sizing v1 prediction');
    });
});

describe('jobs and tiers', () => {
    it('names capacities as the owner thinks of them', () => {
        expect((['spot', 'on-demand', 'local'] as const).map(capacityLabel)).toEqual(['Spot', 'on-demand', 'This Mac']);
    });
    it('knows which statuses are still live', () => {
        expect(['QUEUED', 'STARTING', 'RUNNING', 'DONE', 'FAILED'].map(s => isActive(s as never))).toEqual([true, true, true, false, false]);
    });
    it('shortens a key for display', () => {
        expect(shortKey('e2698ba0c292e5dcd20c9784005299a4371340b60074c863ce086df7c2097caa')).toBe('e2698ba0c2…');
    });
    it('treats a file without a tier as validated (v1/v2 predate it)', () => {
        expect(tierOf({})).toBe('validated');
        expect(tierOf({ tier: 'computed' })).toBe('computed');
    });
});
