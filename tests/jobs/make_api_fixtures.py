"""Records the 6B-1 job API's real responses as JSON for the 6B-2 client tests.

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

from jobs.errors import JobRefused  # noqa: E402
from jobs.handlers import Api  # noqa: E402
from jobs.runner import NullRunner  # noqa: E402
from jobs.store import FileStore  # noqa: E402

OUT = REPO / 'tests' / 'jobs' / 'fixtures' / 'api'
NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
WATER = [[8, 0.0, 0.0, 0.11779], [1, 0.0, 0.75545, -0.47116], [1, 0.0, -0.75545, -0.47116]]
WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'


def resolve(kind, text, *args, **kwargs):
    if text.strip().lower() == 'water':
        return {'cid': 962, 'title': 'Water', 'charge': 0, 'retrievedAt': '2026-10-10', 'atoms': WATER}
    raise JobRefused('unknown-compound', f'PubChem does not know "{text}"')


def call(api, method, path, body=None, query=None):
    raw = json.dumps(body).encode() if body is not None else None
    return api.handle(method, path, query or {}, raw)


def record_all(root: Path) -> dict:
    out = {}
    api = Api(FileStore(root / 'local'), NullRunner(), resolve=resolve, now=lambda: NOW, backend='local')
    water = {'recipe': 'single', 'molecule': {'name': 'water'}}
    out['preview_ok'] = call(api, 'POST', '/api/v1/jobs/preview', water)
    out['error_unknown_compound'] = call(api, 'POST', '/api/v1/jobs/preview',
                                         {'recipe': 'single', 'molecule': {'name': 'unobtainium'}})
    out['submit_created'] = call(api, 'POST', '/api/v1/jobs', water)
    key = out['submit_created'][1]['key']
    api.store.update_job(key, {'status': 'RUNNING', 'startedAt': '2026-10-10T12:00:05Z',
                               'heartbeatAt': '2026-10-10T12:00:35Z', 'stage': 'SCF (DIIS)',
                               'latestEnergyHartree': -76.4612, 'peakMemoryGB': 0.41,
                               'logTail': ['cycle= 7 E= -76.4611982', 'cycle= 8 E= -76.4612007']})
    out['get_running'] = call(api, 'GET', f'/api/v1/jobs/{key}')
    out['submit_known'] = call(api, 'POST', '/api/v1/jobs', water)
    out['preview_known'] = call(api, 'POST', '/api/v1/jobs/preview', water)
    api.store.update_job(key, {'status': 'DONE', 'endedAt': '2026-10-10T12:01:15Z', 'stage': None,
                               'actual': {'wallSeconds': 70.2, 'peakMemoryGB': 0.52, 'threads': 8}})
    api.store.settle(key, 0)
    out['get_done'] = call(api, 'GET', f'/api/v1/jobs/{key}')
    out['list_done'] = call(api, 'GET', '/api/v1/jobs', query={'month': '2026-10', 'status': 'DONE'})

    optimise = {'recipe': 'optimise', 'molecule': {'xyz': WATER_XYZ}}
    failed_key = call(api, 'POST', '/api/v1/jobs', optimise)[1]['key']
    api.store.update_job(failed_key, {'status': 'FAILED', 'endedAt': '2026-10-10T12:03:00Z', 'stage': None,
                                      'error': {'code': 'scf-not-converged',
                                                'message': 'SCF did not converge (DIIS, level shift 0.3 Ha, second-order)'}})
    api.store.settle(failed_key, 0)
    out['get_failed'] = call(api, 'GET', f'/api/v1/jobs/{failed_key}')
    out['list_all'] = call(api, 'GET', '/api/v1/jobs', query={'month': '2026-10'})
    out['costs'] = call(api, 'GET', '/api/v1/costs', query={'month': '2026-10'})

    # AWS prices: Spot, a real reservation. With a cap of one micro-dollar the
    # reservation cannot fit, so the preview answers 200 with everything it
    # resolved and decision.ok false -- the refusal the UI must still draw.
    out['preview_aws'] = call(Api(FileStore(root / 'aws'), NullRunner(), resolve=resolve, now=lambda: NOW, backend='aws'),
                              'POST', '/api/v1/jobs/preview', water)
    out['preview_refused'] = call(Api(FileStore(root / 'capped', cap_micros=1), NullRunner(), resolve=resolve,
                                      now=lambda: NOW, backend='aws'), 'POST', '/api/v1/jobs/preview', water)
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
