"""Local conveniences (run from tools/):

    python -m jobs.cli enqueue --name water              # queue without running (container smoke test)
    python -m jobs.cli submit --name benzene --wait      # run to completion in the foreground
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
    return json.dumps({'recipe': args.recipe, 'molecule': molecule}).encode()


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
    status, view = Api(store, NullRunner(), backend='local').handle('POST', '/api/v1/jobs', {}, _body(args))
    if status >= 400:
        print(json.dumps(view), file=sys.stderr)
        return 1
    key = view['key']
    print(key)
    if args.command == 'submit' and view['status'] in ('QUEUED', 'STARTING'):
        try:
            result = run_job(key, store, LocalSink(OUT_ROOT))
        except Exception as e:
            # Something the worker's own safety net does not cover (it raised
            # before its try, e.g. in render_input): the job must still end
            # FAILED and settled, not sit RUNNING with its reservation held.
            message = (traceback.format_exception_only(e)[-1].strip().splitlines() or [type(e).__name__])[-1][:300]
            store.update_job(key, {'status': 'FAILED', 'endedAt': iso(utc_now()), 'stage': None,
                                   'error': {'code': 'worker-error', 'message': message}},
                             expect_status={'QUEUED', 'STARTING', 'RUNNING'})
            store.settle(key, 0)
            print(f'FAILED worker-error: {message}', file=sys.stderr)
            return 1
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
