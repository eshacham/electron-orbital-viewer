"""Local conveniences (run from tools/):

    python -m jobs.cli enqueue --name water              # queue without running (container smoke test)
    python -m jobs.cli submit --name benzene --wait      # run to completion in the foreground
    python -m jobs.cli submit --xyz no2.xyz --multiplicity 2 --wait
    python -m jobs.cli submit --name water --retry --wait # run a FAILED job again (a new attempt)
    python -m jobs.cli generation off|on                 # the local kill switch
"""
import argparse
import json
import sys
import traceback
from pathlib import Path

from jobs.handlers import Api
from jobs.local_server import OUT_ROOT, STATE_ROOT
from jobs.model import iso, utc_now
from jobs.runner import NullRunner
from jobs.store import FileStore
from jobs.worker import run_job
from jobs.sink import LocalSink


def _body(args):
    if args.xyz:
        molecule = {'xyz': Path(args.xyz).read_text()}
    else:
        molecule = {'name': args.name} if args.name else {'smiles': args.smiles}
    body = {'recipe': args.recipe, 'molecule': molecule}
    # Only when given: the API's own defaults (PubChem's formal charge, the
    # lowest multiplicity the electron count allows) apply otherwise.
    for field in ('charge', 'multiplicity'):
        if getattr(args, field) is not None:
            body[field] = getattr(args, field)
    return body


def _approve_local(api, body):
    """The submit body with the This Mac quote approved (Phase 6C): a local
    run is free, so the CLI takes the preview's one $0 option itself. A
    preview that refuses the job is answered as the API answers it."""
    status, preview = api.handle('POST', '/api/v1/jobs/preview', {}, json.dumps(body).encode())
    if status != 200 or not preview['decision']['ok']:
        return None, (status if status != 200 else 422, preview if status != 200 else {'error': preview['decision']['error']})
    local = preview['decision']['quote']['options'][0]
    return {**body, 'option': local['option'], 'quoteId': local['quoteId']}, None


def _fail_and_settle(store, key, attempt, code, message):
    # Guarded: a record the worker already finished (or a later attempt
    # owns) is never overwritten; settling is idempotent either way.
    store.update_job(key, {'status': 'FAILED', 'endedAt': iso(utc_now()), 'stage': None,
                           'error': {'code': code, 'message': message}},
                     expect_status={'QUEUED', 'STARTING', 'RUNNING'}, attempt=attempt)
    store.settle(key, 0)


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m jobs.cli')
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('enqueue', 'submit'):
        p = sub.add_parser(name)
        g = p.add_mutually_exclusive_group(required=True)
        g.add_argument('--name')
        g.add_argument('--smiles')
        g.add_argument('--xyz')
        p.add_argument('--recipe', default='single', choices=('single', 'optimise'))
        p.add_argument('--charge', type=int, default=None)
        p.add_argument('--multiplicity', type=int, default=None)
        p.add_argument('--retry', action='store_true', help='queue a FAILED job again, as a new attempt')
        if name == 'submit':
            p.add_argument('--wait', action='store_true', required=True)
    gen = sub.add_parser('generation')
    gen.add_argument('state', choices=('on', 'off'))
    args = parser.parse_args(argv)

    store = FileStore(STATE_ROOT)
    if args.command == 'generation':
        store.set_generation_enabled(args.state == 'on')
        print(f'generation {args.state}')
        return 0
    api = Api(store, NullRunner(), backend='local')
    body, refused = _approve_local(api, _body(args))
    if refused:
        status, view = refused
    else:
        status, view = api.handle('POST', '/api/v1/jobs', {}, json.dumps({**body, 'retry': args.retry}).encode())
    if status >= 400:
        print(json.dumps(view), file=sys.stderr)
        return 1
    key = view['key']
    print(key)
    if args.command == 'submit' and view['status'] in ('QUEUED', 'STARTING'):
        # The record's own attempt (I4): a retried job is attempt 2 or later,
        # and the store refuses a claim older than the record.
        attempt = store.get_job(key)['attempt']
        try:
            result = run_job(key, store, LocalSink(OUT_ROOT), attempt=attempt)
        except Exception as e:
            # Something the worker's own safety net does not cover (it raised
            # before its try, e.g. in render_input): the job must still end
            # FAILED and settled, not sit RUNNING with its reservation held.
            message = (traceback.format_exception_only(e)[-1].strip().splitlines() or [type(e).__name__])[-1][:300]
            _fail_and_settle(store, key, attempt, 'worker-error', message)
            print(f'FAILED worker-error: {message}', file=sys.stderr)
            return 1
        except BaseException as e:
            # Ctrl-C (I1): the same, and then the interrupt goes on.
            _fail_and_settle(store, key, attempt, 'worker-crashed',
                             f'the run was interrupted ({type(e).__name__}) before this job finished')
            raise
        store.settle(key, 0)
        print(result)
        return 0 if result in ('DONE', 'duplicate') else 1
    print(view['status'])
    if args.command == 'submit' and view['status'] == 'FAILED':
        error = view.get('error') or {}
        print(f"FAILED {error.get('code')}: {error.get('message')}", file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
