import { readFileSync, readdirSync } from 'fs';
import path from 'path';

/** The fields 6B-2 reads, as 6B-1 Task 5/6 define them. The JSON is the server's own output (make_api_fixtures.py). */
const DIR = path.resolve(__dirname, 'fixtures/api');
const read = (name: string) => JSON.parse(readFileSync(path.join(DIR, `${name}.json`), 'utf8')) as { status: number; body: Record<string, unknown> };

const JOB_VIEW_FIELDS = ['key', 'status', 'attempt', 'recipe', 'job', 'name', 'formula', 'electronCount', 'basisFunctions',
    'geometrySource', 'sizing', 'month', 'submittedAt', 'startedAt', 'endedAt', 'heartbeatAt', 'stage', 'latestEnergyHartree',
    'logTail', 'actual', 'error', 'backend', 'peakMemoryGB', 'reservedUsd', 'actualUsd', 'resultUrl', 'approvedQuote', 'charged',
    'ledger'];
// Phase 6C: a priced option, as tools/jobs/quotes.public_option writes it (plus the preview's cap check).
const OPTION_FIELDS = ['option', 'capacity', 'available', 'unavailableReason', 'quoteId', 'size', 'vcpu', 'memoryGB', 'attempts',
    'timeoutSeconds', 'predictedSeconds', 'sizingVersion', 'pricesVersion', 'resultBytes', 'resultBytesMax', 'retentionMonths',
    'downloads', 'estimateUsd', 'maximumUsd', 'lines', 'interruption', 'sizing', 'approvable', 'blockedReason', 'issuedAt'];
// D1: tools/jobs/sizing.py:134 adds `estimateFor: 'fargate'` to decide()'s
// return -- real for both decision.sizing and the record's own `sizing`
// (6B-1 ships it, it is not optional).
const SIZING_FIELDS = ['version', 'estimateFor', 'size', 'vcpu', 'memoryGB', 'capacity', 'attempts', 'basisFunctions',
    'predictedSeconds', 'predictedMemoryGB', 'timeoutSeconds', 'predictedCostMicros'];
const METER_FIELDS = ['month', 'capUsd', 'spentUsd', 'reservedUsd', 'remainingUsd'];

describe('the API responses, as its handlers write them (6B-1, with 6C quotes)', () => {
    it('records all twenty-one', () => {
        expect(readdirSync(DIR).filter(f => f.endsWith('.json'))).toHaveLength(21);
    });

    it('a preview carries what was resolved, the quote, the meter and any existing job', () => {
        const { status, body } = read('preview_ok');
        expect(status).toBe(200);
        expect(Object.keys(body).sort()).toEqual(['atoms', 'basisFunctions', 'charge', 'decision', 'electronCount', 'existing',
            'formula', 'generationEnabled', 'geometrySource', 'job', 'key', 'meter', 'multiplicity', 'name'].sort());
        const decision = body.decision as { ok: boolean; quote: { options: Array<Record<string, unknown>>; recommended: string; reference: unknown[] } };
        expect(decision.ok).toBe(true);
        expect(decision.quote.recommended).toBe('local');
        expect(Object.keys(decision.quote.options[0]).sort()).toEqual([...OPTION_FIELDS].sort());
        expect(Object.keys(decision.quote.options[0].sizing as object).sort()).toEqual([...SIZING_FIELDS].sort());
        expect(decision.quote.reference).toHaveLength(2);
        expect(Object.keys(body.meter as object).sort()).toEqual([...METER_FIELDS].sort());
        expect(body.geometrySource).toEqual({ kind: 'pubchem', cid: 962, title: 'Water', query: 'water', retrievedAt: '2026-10-10' });
        expect(read('preview_known').body.existing).toEqual(expect.objectContaining({ status: 'RUNNING' }));
    });

    it('an AWS preview prices Spot and on-demand, each line by line with its own quote id', () => {
        const quote = (read('preview_aws').body.decision as { quote: { options: Array<{ option: string; quoteId: string; lines: Array<{ item: string }> }> } }).quote;
        expect(quote.options.map(o => o.option)).toEqual(['spot', 'on-demand']);
        expect(quote.options[0].lines.map(l => l.item)).toEqual(['compute', 'storage', 'delivery', 'platform']);
        expect(quote.options[0].quoteId).toMatch(/^[0-9a-f]{64}$/);
        expect(quote.options[0].quoteId).not.toBe(quote.options[1].quoteId);
        const unavailable = (read('preview_spot_unavailable').body.decision as { quote: { options: Array<Record<string, unknown>> } }).quote.options[0];
        expect(unavailable).toEqual({ option: 'spot', capacity: 'spot', available: false, unavailableReason: expect.stringMatching(/^Spot is offered only/),
            quoteId: null, approvable: false, blockedReason: null });
    });

    it('a refused decision still carries the resolved structure', () => {
        const { status, body } = read('preview_refused');
        expect(status).toBe(200);
        expect(body.decision).toEqual({ ok: false, error: { code: 'output-too-large', message: expect.stringMatching(/^this molecule's result files would exceed the app's file limit/) } });
        expect(body.atoms as unknown[]).toHaveLength(60);
    });

    it('every job view has the public fields and none of the internal ones', () => {
        for (const name of ['submit_created', 'get_running', 'get_done', 'get_failed', 'submit_aws', 'get_done_aws', 'get_absorbed_aws', 'get_legacy_aws', 'get_retried_aws']) {
            const view = read(name).body;
            expect(Object.keys(view)).toEqual(expect.arrayContaining(JOB_VIEW_FIELDS));
            for (const hidden of ['settled', 'runnerJobId', 'reservedMicros', 'actualMicros', 'quote', 'settlement']) expect(view).not.toHaveProperty(hidden);
        }
        expect(read('submit_created').body.peakMemoryGB).toBeNull();
        expect(read('get_running').body.peakMemoryGB).toBe(0.41);
        expect(read('get_running').body.actualUsd).toBeNull();
        expect(read('get_done').body.actual).toEqual({ wallSeconds: 70.2, peakMemoryGB: 0.52, threads: 8, resultBytes: 1450955, resultObjects: 13 });
        expect(read('get_done').body.actualUsd).toBe(0);
        expect(read('get_failed').body.error).toEqual({ code: 'scf-not-converged', message: expect.any(String) });
        expect(read('get_legacy_aws').body).toEqual(expect.objectContaining({ approvedQuote: null, charged: null, actualUsd: 0.000497 }));
        expect((read('get_absorbed_aws').body.charged as { absorbedUsd: number }).absorbedUsd).toBe(0.0025);
        // Fix round 1 (I2): one ledger entry per approval, the legacy record's with its cost alone.
        expect((read('get_retried_aws').body.ledger as Array<{ option: string }>).map(e => e.option)).toEqual(['spot', 'on-demand']);
        expect(read('get_legacy_aws').body.ledger).toEqual([expect.objectContaining({ quoteId: null, costUsd: 0.000497, chargedUsd: null })]);
    });

    it('lists, costs and errors', () => {
        expect(Object.keys(read('list_done').body).sort()).toEqual(['jobs', 'month']);
        expect(read('list_all').body.jobs as unknown[]).toHaveLength(2);
        expect(Object.keys(read('costs').body)).toEqual(expect.arrayContaining([...METER_FIELDS, 'projectionUsd', 'daily', 'billing', 'pricesRetrieved']));
        expect(read('error_unknown_compound')).toEqual({ status: 422, body: { error: { code: 'unknown-compound', message: 'PubChem does not know "unobtainium"' } } });
        expect(read('error_quote_changed')).toEqual({ status: 409, body: { error: { code: 'quote-changed', message: expect.stringMatching(/preview again/) } } });
        expect([read('submit_created').status, read('submit_known').status, read('submit_aws').status]).toEqual([201, 200, 201]);
    });
});
