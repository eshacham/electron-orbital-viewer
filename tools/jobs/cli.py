"""Local conveniences (run from tools/):

    python -m jobs.cli enqueue --name water              # queue without running (container smoke test)
    python -m jobs.cli submit --name benzene --wait      # run to completion in the foreground
    python -m jobs.cli generation off|on                 # the local kill switch
"""
import argparse
import json
import sys
from pathlib import Path

from jobs.handlers import Api
from jobs.local_server import OUT_ROOT, STATE_ROOT
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
    print(view['key'])
    if args.command == 'submit' and view['status'] in ('QUEUED', 'STARTING'):
        result = run_job(view['key'], store, LocalSink(OUT_ROOT))
        store.settle(view['key'], 0)
        print(result)
        return 0 if result in ('DONE', 'duplicate') else 1
    print(view['status'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
