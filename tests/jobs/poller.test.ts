import { JobPoller, PollerDeps, POLL_INTERVAL_MS, POLL_TIMEOUT_MS, PollTimeoutError } from '../../src/jobs/poller';
import type { JobStatus, JobView } from '../../src/jobs/api_types';
import { jobFixture } from './api_fixtures';

const KEY = jobFixture('get_running').key;
const view = (status: JobStatus): JobView => ({ ...jobFixture('get_running'), status });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

/** A clock, timers and a visibility flag the test drives by hand. */
function harness(hiddenAtStart = false) {
    let now = 0;
    let hidden = hiddenAtStart;
    let timers: Array<{ id: number; at: number; fn: () => void }> = [];
    let nextId = 1;
    const listeners = new Set<() => void>();
    const answers: Array<() => Promise<JobView>> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchJob = jest.fn((_key: string, _signal: AbortSignal) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const settle = () => { inFlight -= 1; };
        const answer = (answers.shift() ?? (async () => view('RUNNING')))();
        answer.then(settle, settle);
        return answer;
    });
    const deps: PollerDeps = {
        fetchJob,
        onUpdate: jest.fn(),
        onError: jest.fn(),
        isFatal: error => (error as { code?: string }).code === 'session-expired',
        now: () => now,
        setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
        clearTimer: id => { timers = timers.filter(t => t.id !== id); },
        hidden: () => hidden,
        onVisibilityChange: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    async function advance(ms: number) {
        const end = now + ms;
        for (;;) {
            await flush();
            const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            timers = timers.filter(t => t !== due);
            now = due.at;
            due.fn();
        }
        now = end;
        await flush();
    }
    const setHidden = (value: boolean) => { hidden = value; listeners.forEach(listener => listener()); };
    return {
        poller: new JobPoller(deps), deps, fetchJob, answers, advance, setHidden, listeners,
        maxInFlight: () => maxInFlight, timers: () => timers.length,
    };
}

describe('JobPoller', () => {
    it('one request per interval however many watch the same job', async () => {
        const h = harness();
        h.poller.watch(KEY); h.poller.watch(KEY); h.poller.watch(KEY);
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        await h.advance(POLL_INTERVAL_MS - 1);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        await h.advance(1);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });

    it('remounting does not refetch: ten unmount-and-remount cycles cost no extra request', async () => {
        const h = harness();
        const first = h.poller.watch(KEY);
        await h.advance(0);
        first();
        for (let i = 0; i < 10; i++) h.poller.watch(KEY)();
        h.poller.watch(KEY);
        await h.advance(1000);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        await h.advance(POLL_INTERVAL_MS - 1000);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });

    it('never has two requests in flight for one job', async () => {
        const h = harness();
        h.answers.push(() => new Promise(() => {}));               // a request that does not answer before its deadline
        h.poller.watch(KEY);
        await h.advance(POLL_TIMEOUT_MS - 1);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
    });

    it('stops when the job ends, and reports the final view', async () => {
        const h = harness();
        h.answers.push(async () => view('RUNNING'), async () => view('DONE'));
        h.poller.watch(KEY);
        await h.advance(0);
        await h.advance(POLL_INTERVAL_MS);
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
        expect((h.deps.onUpdate as jest.Mock).mock.calls.at(-1)[0].status).toBe('DONE');
    });

    it('stops on the last unmount, and stops listening for visibility', async () => {
        const h = harness();
        const release = h.poller.watch(KEY);
        await h.advance(0);
        release();
        release();                                                   // a second call is harmless
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        expect(h.listeners.size).toBe(0);
    });

    it('sends nothing while the tab is hidden, and catches up once when shown', async () => {
        const h = harness(true);
        h.poller.watch(KEY);
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(0);
        h.setHidden(false);
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        h.setHidden(true);
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        h.setHidden(false);
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });

    it('keeps polling through a passing failure, and stops on one retrying cannot cure', async () => {
        const h = harness();
        h.answers.push(async () => { throw { code: 'unreachable' }; }, async () => { throw { code: 'session-expired' }; });
        h.poller.watch(KEY);
        await h.advance(0);
        await h.advance(POLL_INTERVAL_MS);
        await h.advance(10 * POLL_INTERVAL_MS);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
        expect(h.deps.onError).toHaveBeenCalledTimes(2);
    });

    it('a retried job is followed again at once', async () => {
        const h = harness();
        h.answers.push(async () => view('FAILED'));
        h.poller.watch(KEY);
        await h.advance(0);
        h.poller.restart(KEY);
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });

    // Final review I4(b): the reviewer's probe. A request still out when the
    // last panel unmounts must still count when one remounts, or a slow
    // network (exactly when panels come and go) sends two at once.
    it('a request still out across an unmount and a remount is never joined by a second', async () => {
        const h = harness();
        let answer: (value: JobView) => void = () => undefined;
        h.answers.push(() => new Promise<JobView>(resolve => { answer = resolve; }));
        const release = h.poller.watch(KEY);
        await h.advance(0);
        release();
        await h.advance(6000);
        h.poller.watch(KEY);
        await h.advance(POLL_INTERVAL_MS);                           // 11 s in: past an interval, inside the deadline
        expect(h.fetchJob).toHaveBeenCalledTimes(1);
        expect(h.maxInFlight()).toBe(1);
        answer(view('RUNNING'));
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
        expect(h.maxInFlight()).toBe(1);
    });

    // Final review I4(a): a stalled request (a laptop waking, a phone changing
    // network) must not freeze the status for as long as the socket lives.
    it('gives up on a request after its deadline, says the status could not be refreshed, and asks again', async () => {
        const h = harness();
        h.answers.push(() => new Promise<JobView>(() => {}));
        h.poller.watch(KEY);
        await h.advance(0);
        const signal = h.fetchJob.mock.calls[0][1];
        await h.advance(POLL_TIMEOUT_MS - 1);
        expect(h.deps.onError).not.toHaveBeenCalled();
        await h.advance(1);
        expect(signal.aborted).toBe(true);
        expect(h.deps.onError).toHaveBeenCalledWith(KEY, expect.any(PollTimeoutError));
        await h.advance(0);
        expect(h.fetchJob).toHaveBeenCalledTimes(2);
    });

    it('forgets a job once nobody follows it and its interval has passed (M4)', async () => {
        const h = harness();
        h.answers.push(async () => view('DONE'));
        const release = h.poller.watch(KEY);
        await h.advance(0);
        release();
        await h.advance(POLL_INTERVAL_MS);
        h.poller.watch('f'.repeat(64))();
        const internals = h.poller as unknown as { lastSent: Map<string, number>; finished: Set<string> };
        expect(internals.lastSent.has(KEY)).toBe(false);
        expect(internals.finished.has(KEY)).toBe(false);
    });
});
