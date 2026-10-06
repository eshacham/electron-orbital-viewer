import { readFileSync, readdirSync } from 'fs';
import path from 'path';

/** The fields 6B-2 reads, as 6B-1 Task 5/6 define them. The JSON is the server's own output (make_api_fixtures.py). */
const DIR = path.resolve(__dirname, 'fixtures/api');
const read = (name: string) => JSON.parse(readFileSync(path.join(DIR, `${name}.json`), 'utf8')) as { status: number; body: Record<string, unknown> };

const JOB_VIEW_FIELDS = ['key', 'status', 'attempt', 'recipe', 'job', 'name', 'formula', 'electronCount', 'basisFunctions',
    'geometrySource', 'sizing', 'month', 'submittedAt', 'startedAt', 'endedAt', 'heartbeatAt', 'stage', 'latestEnergyHartree',
    'logTail', 'actual', 'error', 'backend', 'peakMemoryGB', 'reservedUsd', 'actualUsd', 'resultUrl'];
// D1: tools/jobs/sizing.py:134 adds `estimateFor: 'fargate'` to decide()'s
// return -- real for both decision.sizing and the record's own `sizing`
// (6B-1 ships it, it is not optional).
const SIZING_FIELDS = ['version', 'estimateFor', 'size', 'vcpu', 'memoryGB', 'capacity', 'attempts', 'basisFunctions',
    'predictedSeconds', 'predictedMemoryGB', 'timeoutSeconds', 'predictedCostMicros'];
const METER_FIELDS = ['month', 'capUsd', 'spentUsd', 'reservedUsd', 'remainingUsd'];

describe('6B-1 responses, as its handlers write them', () => {
    it('records all thirteen', () => {
        expect(readdirSync(DIR).filter(f => f.endsWith('.json'))).toHaveLength(13);
    });

    it('a preview carries what was resolved, the decision, the meter and any existing job', () => {
        const { status, body } = read('preview_ok');
        expect(status).toBe(200);
        expect(Object.keys(body).sort()).toEqual(['atoms', 'basisFunctions', 'charge', 'decision', 'electronCount', 'existing',
            'formula', 'generationEnabled', 'geometrySource', 'job', 'key', 'meter', 'multiplicity', 'name'].sort());
        const decision = body.decision as { ok: boolean; sizing: Record<string, unknown>; reservedUsd: number };
        expect(decision.ok).toBe(true);
        expect(Object.keys(decision.sizing).sort()).toEqual([...SIZING_FIELDS].sort());
        expect(Object.keys(body.meter as object).sort()).toEqual([...METER_FIELDS].sort());
        expect(body.geometrySource).toEqual({ kind: 'pubchem', cid: 962, title: 'Water', query: 'water', retrievedAt: '2026-10-10' });
        expect(read('preview_known').body.existing).toEqual(expect.objectContaining({ status: 'RUNNING' }));
        expect((read('preview_aws').body.decision as { sizing: { capacity: string } }).sizing.capacity).toBe('spot');
    });

    it('a refused decision still carries the resolved structure', () => {
        const { status, body } = read('preview_refused');
        expect(status).toBe(200);
        expect(body.decision).toEqual({ ok: false, error: { code: 'budget', message: expect.stringMatching(/^Monthly budget reached/) } });
        expect(body.atoms as unknown[]).toHaveLength(3);
    });

    it('every job view has the public fields and none of the internal ones', () => {
        for (const name of ['submit_created', 'get_running', 'get_done', 'get_failed']) {
            const view = read(name).body;
            expect(Object.keys(view)).toEqual(expect.arrayContaining(JOB_VIEW_FIELDS));
            for (const hidden of ['settled', 'runnerJobId', 'reservedMicros', 'actualMicros']) expect(view).not.toHaveProperty(hidden);
        }
        expect(read('submit_created').body.peakMemoryGB).toBeNull();
        expect(read('get_running').body.peakMemoryGB).toBe(0.41);
        expect(read('get_running').body.actualUsd).toBeNull();
        expect(read('get_done').body.actual).toEqual({ wallSeconds: 70.2, peakMemoryGB: 0.52, threads: 8 });
        expect(read('get_done').body.actualUsd).toBe(0);
        expect(read('get_failed').body.error).toEqual({ code: 'scf-not-converged', message: expect.any(String) });
    });

    it('lists, costs and errors', () => {
        expect(Object.keys(read('list_done').body).sort()).toEqual(['jobs', 'month']);
        expect(read('list_all').body.jobs as unknown[]).toHaveLength(2);
        expect(Object.keys(read('costs').body)).toEqual(expect.arrayContaining([...METER_FIELDS, 'projectionUsd', 'daily', 'billing', 'pricesRetrieved']));
        expect(read('error_unknown_compound')).toEqual({ status: 422, body: { error: { code: 'unknown-compound', message: 'PubChem does not know "unobtainium"' } } });
        expect([read('submit_created').status, read('submit_known').status]).toEqual([201, 200]);
    });
});
