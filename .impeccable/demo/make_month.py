# SYNTHETIC demonstration month for designing the jobs page. Built from the recorded fixtures' shapes and the real
# job history an external reviewer described (theobromine, methane optimise, benzene's memory miss, spot retries,
# legacy records, AWS billed $0.62 vs metered $0.32). Not real data; never shipped.
import json, copy, hashlib
F = 'tests/jobs/fixtures/api/'
base_done = json.load(open(F + 'get_done_aws.json'))['body']
base_legacy = json.load(open(F + 'get_legacy_aws.json'))['body']
base_retried = json.load(open(F + 'get_retried_aws.json'))['body']
base_failed = json.load(open(F + 'get_failed.json'))['body']
base_running = json.load(open(F + 'get_running.json'))['body']

def key(s): return hashlib.sha256(s.encode()).hexdigest()

def job(base, name, formula, e, nbf, recipe, day, start_min, pred_s, wall_s, pred_mem, peak_mem, size, cap,
        maximum, charged, status='DONE', attempt=1, version=6, legacy=False, stage=None, error=None):
    j = copy.deepcopy(base)
    k = key(name + recipe)
    j.update(key=k, name=name, formula=formula, electronCount=e, basisFunctions=nbf, recipe=recipe, status=status,
             attempt=attempt, stage=stage, error=error, backend='aws', month='2026-10')
    j['job']['recipe'] = recipe
    sub = f'2026-10-{day:02d}T{9 + start_min // 60:02d}:{start_min % 60:02d}:00Z'
    j['submittedAt'] = sub
    j['startedAt'] = sub.replace(':00Z', ':40Z') if status != 'QUEUED' else None
    end_min = start_min + max(1, int(wall_s // 60))
    j['endedAt'] = None if status in ('RUNNING', 'QUEUED') else f'2026-10-{day:02d}T{9 + end_min // 60:02d}:{end_min % 60:02d}:{int(wall_s % 60):02d}Z'
    j['heartbeatAt'] = j['startedAt']
    s = j['sizing']; s.update(version=version, size=size, capacity=cap, predictedSeconds=pred_s, predictedMemoryGB=pred_mem,
                              basisFunctions=nbf, estimateFor='fargate')
    j['actual'] = None if status in ('RUNNING', 'QUEUED') else {'wallSeconds': wall_s, 'peakMemoryGB': peak_mem, 'threads': 2, 'resultBytes': 1_600_000, 'resultObjects': 13}
    j['peakMemoryGB'] = peak_mem
    j['resultUrl'] = f'/molecules/jobs/{k[:16]}/'
    if legacy:
        j['approvedQuote'] = None; j['charged'] = None
        j['reservedUsd'] = maximum; j['actualUsd'] = charged
        j['ledger'] = [{'quoteId': None, 'option': None, 'approvedMaximumUsd': None, 'costUsd': charged, 'chargedUsd': None,
                        'absorbedUsd': None, 'lines': None, 'month': '2026-10', 'at': j['endedAt']}]
    else:
        q = copy.deepcopy(base_done['approvedQuote'])
        scale = maximum / max(sum(l['maximumUsd'] for l in q['lines']), 1e-9)
        for l in q['lines']:
            l['maximumUsd'] = round(l['maximumUsd'] * scale, 6); l['estimateUsd'] = round(l['estimateUsd'] * scale, 6)
        q.update(option='on-demand' if cap == 'ondemand' else 'spot', maximumUsd=maximum, estimateUsd=round(maximum / 8, 6),
                 sizingVersion=version, approvedAt=sub)
        j['approvedQuote'] = q
        j['reservedUsd'] = maximum if status in ('RUNNING', 'QUEUED') else 0.0
        if status in ('RUNNING', 'QUEUED'):
            j['charged'] = None; j['actualUsd'] = None
        else:
            c = copy.deepcopy(base_done['charged']); c.update(costUsd=charged, chargedUsd=charged, absorbedUsd=0.0)
            tot = sum(l['chargedUsd'] for l in c['lines']) or 1
            for l in c['lines']:
                l['costUsd'] = l['chargedUsd'] = round(l['chargedUsd'] / tot * charged, 6)
            fix = round(charged - sum(l['chargedUsd'] for l in c['lines']), 6)  # the largest line absorbs rounding
            big = max(c['lines'], key=lambda l: l['chargedUsd']); big['costUsd'] = big['chargedUsd'] = round(big['chargedUsd'] + fix, 6)
            j['charged'] = c; j['actualUsd'] = charged
        led = copy.deepcopy(base_done['ledger'][0])
        led.update(approvedMaximumUsd=maximum, costUsd=charged or 0.0, chargedUsd=charged, month='2026-10', at=j['endedAt'])
        if led.get('lines') and charged:
            tot = sum(l['chargedUsd'] for l in led['lines']) or 1
            for l in led['lines']:
                l['costUsd'] = l['chargedUsd'] = round(l['chargedUsd'] / tot * charged, 6)
            fix = round(charged - sum(l['chargedUsd'] for l in led['lines']), 6)
            big = max(led['lines'], key=lambda l: l['chargedUsd']); big['costUsd'] = big['chargedUsd'] = round(big['chargedUsd'] + fix, 6)
        if attempt > 1:
            first = copy.deepcopy(led); first.update(costUsd=round(charged * 0.3, 6), chargedUsd=round(charged * 0.3, 6))
            led.update(costUsd=round(charged * 0.7, 6), chargedUsd=round(charged * 0.7, 6))
            j['ledger'] = [first, led]
        else:
            j['ledger'] = [] if status in ('RUNNING', 'QUEUED') else [led]
    return j

jobs = [
    job(base_legacy, 'Benzene', 'C6H6', 42, 360, 'single', 6, 10, 410, 1312, 0.70, 6.10, 'M', 'spot', 0.10, 0.061, legacy=True, version=3),
    job(base_legacy, 'Pyridine', 'C5H5N', 42, 345, 'single', 6, 50, 380, 905, 0.68, 4.30, 'M', 'spot', 0.10, 0.044, legacy=True, version=3),
    job(base_done, 'Methane', 'CH4', 10, 89, 'optimise', 9, 5, 95, 71, 0.31, 0.29, 'S', 'spot', 0.02, 0.002473, version=5),
    job(base_retried, 'Acetic acid', 'CH3COOH', 32, 272, 'single', 11, 15, 420, 515, 1.10, 1.42, 'S', 'spot', 0.35, 0.021, attempt=2, version=6),
    job(base_done, 'Urea', 'CH4N2O', 32, 260, 'single', 12, 30, 390, 352, 1.05, 0.98, 'S', 'spot', 0.33, 0.016, version=6),
    job(base_retried, 'Imidazole', 'C3H4N2', 36, 290, 'optimise', 14, 0, 1500, 1820, 1.30, 1.51, 'M', 'spot', 1.20, 0.071, attempt=2, version=6),
    job(base_done, 'Caffeine', 'C8H10N4O2', 102, 812, 'single', 15, 20, 860, 774, 1.85, 1.81, 'M', 'spot', 0.53, 0.039, version=7),
    job(base_done, 'Theobromine', 'C7H8N4O2', 94, 748, 'single', 16, 0, 809, 482, 1.82, 1.77, 'M', 'spot', 0.51, 0.04, version=7),
    job(base_failed, 'Ferrocene', 'C10H10Fe', 96, 640, 'single', 18, 40, 1200, 600, 2.4, 2.6, 'M', 'ondemand', 0.62, 0.031, status='FAILED', version=7,
        error={'code': 'scf-not-converged', 'message': 'SCF did not converge in 200 cycles (open shell, d-block).'}),
    job(base_running, 'Aspirin', 'C9H8O4', 94, 776, 'optimise', 19, 30, 2360, 0, 2.1, 1.2, 'M', 'spot', 1.44, None, status='RUNNING', version=7, stage='optimising: step 6'),
]
costs = {'month': '2026-10', 'capUsd': 8.8, 'spentUsd': 0.325, 'reservedUsd': 1.44, 'remainingUsd': 7.035, 'projectionUsd': 0.81,
         'daily': [{'date': f'2026-10-{d:02d}', 'usd': u} for d, u in [(6, 0.105), (9, 0.0025), (11, 0.021), (12, 0.016), (14, 0.071), (15, 0.039), (16, 0.04), (18, 0.031)]],
         'billing': {'usd': 0.62, 'through': '2026-10-18'}, 'pricesRetrieved': '2026-10-04'}
# A retried job's `charged` (and its lines) is the latest attempt, as in the recorded fixtures; actualUsd is the sum.
for j in jobs:
    if j['attempt'] > 1 and j['charged'] and len(j['ledger']) > 1:
        latest = j['ledger'][-1]['chargedUsd']; c = j['charged']
        tot = sum(l['chargedUsd'] for l in c['lines']) or 1
        for l in c['lines']:
            l['costUsd'] = l['chargedUsd'] = round(l['chargedUsd'] / tot * latest, 6)
        big = max(c['lines'], key=lambda l: l['chargedUsd'])
        big['costUsd'] = big['chargedUsd'] = round(big['chargedUsd'] + latest - sum(l['chargedUsd'] for l in c['lines']), 6)
        c['costUsd'] = c['chargedUsd'] = latest
        for led in j['ledger']:
            if led.get('lines'):
                t2 = sum(l['chargedUsd'] for l in led['lines']) or 1
                for l in led['lines']:
                    l['costUsd'] = l['chargedUsd'] = round(l['chargedUsd'] / t2 * led['chargedUsd'], 6)
                b2 = max(led['lines'], key=lambda l: l['chargedUsd'])
                b2['costUsd'] = b2['chargedUsd'] = round(b2['chargedUsd'] + led['chargedUsd'] - sum(l['chargedUsd'] for l in led['lines']), 6)
json.dump({'month': '2026-10', 'jobs': jobs}, open('.impeccable/demo/list.json', 'w'), indent=1)
json.dump(costs, open('.impeccable/demo/costs.json', 'w'), indent=1)
print(len(jobs), 'jobs written')
