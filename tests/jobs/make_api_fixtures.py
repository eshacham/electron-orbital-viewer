"""Records the job API's real responses as JSON for the client tests (6B-1's API, 6C's quotes).

    tools/molecules/.venv/bin/python tests/jobs/make_api_fixtures.py      (from the repo root)

The responses come from tools/jobs/handlers.Api itself, over a throwaway
FileStore and a stand-in PubChem, so the client is tested against the shapes
the server really writes, not a hand copy of them. Rerun whenever
handlers.py or model.py changes shape, and commit the JSON.
"""
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(REPO / 'tools'), str(REPO / 'tools' / 'molecules')]

from jobs.canonical import canonical_job  # noqa: E402
from jobs.errors import JobRefused  # noqa: E402
from jobs.handlers import Api  # noqa: E402
from jobs.model import new_record  # noqa: E402
from jobs.runner import NullRunner  # noqa: E402
from jobs.store import FileStore  # noqa: E402

OUT = REPO / 'tests' / 'jobs' / 'fixtures' / 'api'
NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
WATER = [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]
WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'


def chain_xyz(n):
    """n carbons 1.5 Å apart: N grows like C60's (60 of them) without PubChem."""
    return f'{n}\ncarbon chain\n' + ''.join(f'C 0 0 {1.5 * i:.1f}\n' for i in range(n))


def resolve(kind, text, *args, **kwargs):
    if text.strip().lower() == 'water':
        return {'cid': 962, 'title': 'Water', 'charge': 0, 'retrievedAt': '2026-10-10', 'atoms': WATER}
    raise JobRefused('unknown-compound', f'PubChem does not know "{text}"')


def call(api, method, path, body=None, query=None):
    raw = json.dumps(body).encode() if body is not None else None
    return api.handle(method, path, query or {}, raw)


def approve(api, body, option=None):
    """Phase 6C: the submit body with an option of the preview's quote approved (the recommended one by default)."""
    status, preview = call(api, 'POST', '/api/v1/jobs/preview', {k: v for k, v in body.items() if k != 'retry'})
    quote = preview['decision']['quote']
    chosen = next(o for o in quote['options'] if o['option'] == (option or quote['recommended']))
    return {**body, 'option': chosen['option'], 'quoteId': chosen['quoteId']}


def record_all(root: Path) -> dict:
    out = {}
    api = Api(FileStore(root / 'local'), NullRunner(), resolve=resolve, now=lambda: NOW, backend='local')
    water = {'recipe': 'single', 'molecule': {'name': 'water'}}
    out['preview_ok'] = call(api, 'POST', '/api/v1/jobs/preview', water)
    out['error_unknown_compound'] = call(api, 'POST', '/api/v1/jobs/preview',
                                         {'recipe': 'single', 'molecule': {'name': 'unobtainium'}})
    out['submit_created'] = call(api, 'POST', '/api/v1/jobs', approve(api, water))
    key = out['submit_created'][1]['key']
    api.store.update_job(key, {'status': 'RUNNING', 'startedAt': '2026-10-10T12:00:05Z',
                               'heartbeatAt': '2026-10-10T12:00:35Z', 'stage': 'SCF (DIIS)',
                               'latestEnergyHartree': -76.4612, 'peakMemoryGB': 0.41,
                               'logTail': ['cycle= 7 E= -76.4611982', 'cycle= 8 E= -76.4612007']})
    out['get_running'] = call(api, 'GET', f'/api/v1/jobs/{key}')
    out['submit_known'] = call(api, 'POST', '/api/v1/jobs', approve(api, water))
    out['preview_known'] = call(api, 'POST', '/api/v1/jobs/preview', water)
    api.store.update_job(key, {'status': 'DONE', 'endedAt': '2026-10-10T12:01:15Z', 'stage': None,
                               'actual': {'wallSeconds': 70.2, 'peakMemoryGB': 0.52, 'threads': 8,
                                          'resultBytes': 1450955, 'resultObjects': 13}})
    api.store.settle(key, 0)
    out['get_done'] = call(api, 'GET', f'/api/v1/jobs/{key}')
    out['list_done'] = call(api, 'GET', '/api/v1/jobs', query={'month': '2026-10', 'status': 'DONE'})

    optimise = {'recipe': 'optimise', 'molecule': {'xyz': WATER_XYZ}}
    failed_key = call(api, 'POST', '/api/v1/jobs', approve(api, optimise))[1]['key']
    api.store.update_job(failed_key, {'status': 'FAILED', 'endedAt': '2026-10-10T12:03:00Z', 'stage': None,
                                      'error': {'code': 'scf-not-converged',
                                                'message': 'SCF did not converge (DIIS, level shift 0.3 Ha, second-order)'}})
    api.store.settle(failed_key, 0)
    out['get_failed'] = call(api, 'GET', f'/api/v1/jobs/{failed_key}')
    out['list_all'] = call(api, 'GET', '/api/v1/jobs', query={'month': '2026-10'})
    out['costs'] = call(api, 'GET', '/api/v1/costs', query={'month': '2026-10'})

    # AWS prices: Spot and on-demand, each with its line items, maximum and quote id.
    aws = Api(FileStore(root / 'aws'), NullRunner(), resolve=resolve, now=lambda: NOW, backend='aws')
    out['preview_aws'] = call(aws, 'POST', '/api/v1/jobs/preview', water)
    # A quote over what is left of the month's cap: shown, but no option can be approved (cap one micro-dollar).
    out['preview_capped'] = call(Api(FileStore(root / 'capped', cap_micros=1), NullRunner(), resolve=resolve,
                                     now=lambda: NOW, backend='aws'), 'POST', '/api/v1/jobs/preview', water)
    # A run predicted past the Spot limit (a 26-carbon chain, ~70 min on L): on-demand only.
    out['preview_spot_unavailable'] = call(aws, 'POST', '/api/v1/jobs/preview',
                                           {'recipe': 'single', 'molecule': {'xyz': chain_xyz(26)}})
    # Refused outright (a 60-carbon chain, C60's N: its result files cannot fit the 3 MB limit, fix round 1):
    # what it resolved is still drawn, with the reason.
    out['preview_refused'] = call(aws, 'POST', '/api/v1/jobs/preview',
                                  {'recipe': 'single', 'molecule': {'xyz': chain_xyz(60)}})
    approved = approve(aws, water)
    out['error_quote_changed'] = call(aws, 'POST', '/api/v1/jobs', {**approved, 'quoteId': '0' * 64})
    out['submit_aws'] = call(aws, 'POST', '/api/v1/jobs', approved)
    aws_key = out['submit_aws'][1]['key']
    aws.store.update_job(aws_key, {'status': 'DONE', 'startedAt': '2026-10-10T12:00:40Z',
                                   'endedAt': '2026-10-10T12:00:56Z', 'stage': None,
                                   'actual': {'wallSeconds': 15.04, 'peakMemoryGB': 0.326, 'threads': 2,
                                              'resultBytes': 1450955, 'resultObjects': 13}})
    aws.store.settle(aws_key, 497)                    # water's real Spot minute
    out['get_done_aws'] = call(aws, 'GET', f'/api/v1/jobs/{aws_key}')
    # On-demand, billed past its approved compute maximum: charged the maximum, the rest absorbed.
    absorbed_key = call(aws, 'POST', '/api/v1/jobs', approve(aws, optimise, 'on-demand'))[1]['key']
    aws.store.update_job(absorbed_key, {'status': 'DONE', 'startedAt': '2026-10-10T12:02:00Z',
                                        'endedAt': '2026-10-10T12:14:00Z', 'stage': None,
                                        'actual': {'wallSeconds': 700.0, 'peakMemoryGB': 0.35, 'threads': 2,
                                                   'resultBytes': 1475369, 'resultObjects': 15}})
    compute_max = aws.store.get_job(absorbed_key)['quote']['lines'][0]['maximumMicros']
    aws.store.settle(absorbed_key, compute_max + 2500)
    out['get_absorbed_aws'] = call(aws, 'GET', f'/api/v1/jobs/{absorbed_key}')
    # A retried job: attempt 1 (Spot) failed and was charged; attempt 2 (on-demand, a fresh approval) is DONE.
    # Its ledger keeps one entry per approval (fix round 1, review I2).
    ammonia = {'recipe': 'single', 'molecule': {'xyz': '4\nammonia\nN 0 0 0.1\nH 0 0.94 -0.27\nH 0.81 -0.47 -0.27\nH -0.81 -0.47 -0.27\n'}}
    retried_key = call(aws, 'POST', '/api/v1/jobs', approve(aws, ammonia))[1]['key']
    aws.store.update_job(retried_key, {'status': 'FAILED', 'endedAt': '2026-10-10T12:30:00Z', 'stage': None,
                                       'error': {'code': 'spot-interrupted', 'message': 'Your Spot Task was interrupted.'},
                                       'actual': {'wallSeconds': 40.0, 'peakMemoryGB': 0.3, 'threads': 2,
                                                  'resultBytes': 7000, 'resultObjects': 3}})
    aws.store.settle(retried_key, 1491)
    call(aws, 'POST', '/api/v1/jobs', approve(aws, {**ammonia, 'retry': True}, 'on-demand'))
    aws.store.update_job(retried_key, {'status': 'DONE', 'endedAt': '2026-10-10T12:40:00Z', 'stage': None,
                                       'actual': {'wallSeconds': 20.0, 'peakMemoryGB': 0.33, 'threads': 2,
                                                  'resultBytes': 1460000, 'resultObjects': 16}})
    aws.store.settle(retried_key, 1554)
    out['get_retried_aws'] = call(aws, 'GET', f'/api/v1/jobs/{retried_key}')
    # A record from before Phase 6C (as 6B-3 wrote it, no quote): legacy, shown by reservation and actual.
    legacy_job = canonical_job('single', WATER[:2] + [[1, 0.0, -0.8, -0.5]], 0, 1)
    legacy = new_record(key='c' * 64, job=legacy_job, decision={
        'version': 5, 'estimateFor': 'fargate', 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'spot',
        'attempts': 3, 'basisFunctions': 58, 'predictedSeconds': 15.5, 'predictedMemoryGB': 0.47,
        'timeoutSeconds': 600, 'predictedCostMicros': 129, 'reservationMicros': 17880}, name='Water', formula='H2O',
        electron_count=10, geometry_source={'kind': 'xyz'}, backend='aws', now=NOW)
    for field in ('quote', 'settlement'):
        del legacy[field]
    aws.store.create_job(legacy)
    aws.store.update_job('c' * 64, {'status': 'DONE', 'endedAt': '2026-10-10T12:20:00Z',
                                    'actual': {'wallSeconds': 15.0, 'peakMemoryGB': 0.33, 'threads': 2}})
    aws.store.settle('c' * 64, 497)
    out['get_legacy_aws'] = call(aws, 'GET', f'/api/v1/jobs/{"c" * 64}')
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        recorded = record_all(Path(tmp))
    for name, (status, body) in sorted(recorded.items()):
        (OUT / f'{name}.json').write_text(json.dumps({'status': status, 'body': body}, indent=1, ensure_ascii=False) + '\n')
        print(f'{name:24} {status}')


if __name__ == '__main__':
    main()
