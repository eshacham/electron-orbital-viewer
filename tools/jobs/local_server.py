"""The job API on this Mac (spec §12): 127.0.0.1:8787, no auth, the same
handlers the api Lambda runs. The Vite dev server proxies /api here.

    cd tools && ../tools/molecules/.venv/bin/python -m jobs.local_server
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

from jobs.handlers import Api
from jobs.runner import LocalRunner
from jobs.store import FileStore

REPO = Path(__file__).resolve().parents[2]
STATE_ROOT = REPO / 'tools' / 'jobs' / '.state'
OUT_ROOT = REPO / 'tools' / 'molecules' / 'out'
MAX_BODY = 131072


def make_server(api, host='127.0.0.1', port=8787):
    class Handler(BaseHTTPRequestHandler):
        def _answer(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _dispatch(self, method):
            url = urlparse(self.path)
            try:
                # Negative is read as 0: rfile.read(-1) would wait for EOF on a kept-alive connection.
                length = max(0, int(self.headers.get('Content-Length') or 0))
            except ValueError:
                return self._answer(400, {'error': {'code': 'invalid-request', 'message': 'bad Content-Length'}})
            if length > MAX_BODY:
                return self._answer(413, {'error': {'code': 'body-too-large', 'message': f'over {MAX_BODY} bytes'}})
            body = self.rfile.read(length) if length else None
            self._answer(*api.handle(method, url.path, dict(parse_qsl(url.query)), body))

        def do_GET(self):
            self._dispatch('GET')

        def do_POST(self):
            self._dispatch('POST')

        def log_message(self, fmt, *args):
            sys.stderr.write(f'jobs {self.command} {self.path} {fmt % args}\n')

    return ThreadingHTTPServer((host, port), Handler)


def main():
    store = FileStore(STATE_ROOT)
    api = Api(store, LocalRunner(store, OUT_ROOT, STATE_ROOT), backend='local')
    server = make_server(api)
    print(f'jobs API on http://127.0.0.1:{server.server_address[1]} (state {STATE_ROOT}, results {OUT_ROOT}/jobs)')
    server.serve_forever()


if __name__ == '__main__':
    main()
