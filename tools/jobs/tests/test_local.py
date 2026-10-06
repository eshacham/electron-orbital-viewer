import json
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import pytest

from jobs.canonical import canonical_job, job_key
from jobs.handlers import Api
from jobs.local_server import make_server
from jobs.model import new_record
from jobs.runner import LocalRunner, NullRunner
from jobs.store import FileStore

WATER_XYZ = '3\nwater\nO 0 0 0.11779\nH 0 0.75545 -0.47116\nH 0 -0.75545 -0.47116\n'
NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
DECISION = {'version': 0, 'size': 'S', 'vcpu': 2, 'memoryGB': 8, 'capacity': 'local', 'attempts': 1,
            'basisFunctions': 10, 'predictedSeconds': 5.0, 'predictedMemoryGB': 0.5, 'timeoutSeconds': 600,
            'reservationMicros': 0, 'predictedCostMicros': 0}


def test_server_round_trip(tmp_path):
    api = Api(FileStore(tmp_path), NullRunner(), backend='local')
    server = make_server(api, port=0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    try:
        req = urllib.request.Request(f'{base}/api/v1/jobs', method='POST', headers={'Content-Type': 'application/json'},
                                     data=json.dumps({'recipe': 'single', 'molecule': {'xyz': WATER_XYZ}}).encode())
        with urllib.request.urlopen(req) as r:
            assert r.status == 201 and json.loads(r.read())['status'] == 'QUEUED'
        with urllib.request.urlopen(f'{base}/api/v1/costs?month=2026-10') as r:
            assert 'spentUsd' in json.loads(r.read())
        # D9: bare try/except HTTPError can pass vacuously if nothing is
        # raised, so assert on pytest.raises itself, not just inside the block.
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(f'{base}/api/v1/jobs/' + '0' * 64)
        assert e.value.code == 404 and json.loads(e.value.read())['error']['code'] == 'not-found'
        big = urllib.request.Request(f'{base}/api/v1/jobs', method='POST', data=b'x' * 131073)
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(big)
        assert e.value.code == 413
    finally:
        server.shutdown()


def test_crashed_worker_is_failed_and_settled(tmp_path):
    store = FileStore(tmp_path / 'state')
    job = canonical_job('single', [[1, 0, 0, 0], [1, 0, 0, 0.74]], 0, 1)
    key = job_key(job)
    store.create_job(new_record(key=key, job=job, decision={**DECISION, 'reservationMicros': 5}, name='H2',
                                formula='H2', electron_count=2, geometry_source={'kind': 'xyz'}, backend='local', now=NOW))
    # A "worker" that dies at once, as a segfault or a kill would.
    runner = LocalRunner(store, tmp_path / 'out', tmp_path / 'state', python=sys.executable,
                         worker_args=('-c', 'import sys; sys.exit(9)'))
    runner.submit(store.get_job(key))
    for _ in range(100):
        rec = store.get_job(key)
        # D8: FAILED is written and settlement is a second, separate locked
        # write, so polling on status alone can observe FAILED-but-not-yet-settled.
        if rec['status'] == 'FAILED' and rec['settled']:
            break
        time.sleep(0.05)
    rec = store.get_job(key)
    assert rec['status'] == 'FAILED' and rec['error']['code'] == 'worker-crashed' and '9' in rec['error']['message']
    assert rec['settled'] and store.meter(rec['month'])['reserved'] == 0
