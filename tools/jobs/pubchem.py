"""Name or SMILES → PubChem CID → its computed 3D conformer (spec §5.1).

PubChem's 3D conformers are MMFF94-optimised and exist for most small
compounds, not for salts or very large or flexible ones; those are refused
with a suggestion to paste an XYZ. Stdlib only: this runs in the api Lambda.
"""
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import quote, urlencode

from jobs.elements import atomic_number
from jobs.errors import JobRefused

BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'
TIMEOUT_SECONDS = 10
Fetch = Callable[[str, 'bytes | None'], 'tuple[int, bytes]']


def urllib_fetch(url, data=None):
    request = urllib.request.Request(url, data=data, headers={'User-Agent': 'electron-orbital-viewer/6B'})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def normalise_query(kind: str, text: str) -> str:
    text = text.strip()
    return f'name:{" ".join(text.lower().split())}' if kind == 'name' else f'smiles:{text}'


def _get(fetch, url, data=None):
    try:
        status, body = fetch(url, data)
    except OSError as e:
        raise JobRefused('pubchem-unavailable', f'PubChem did not answer ({e}); try again, or paste an XYZ', 503)
    if status >= 500 or status in (429, 503):
        raise JobRefused('pubchem-unavailable', f'PubChem is unavailable (HTTP {status}); try again, or paste an XYZ', 503)
    return status, body


def parse_sdf(text: str):
    lines = text.splitlines()
    count = int(lines[3][0:3])
    atoms = []
    for line in lines[4:4 + count]:
        x, y, z = float(line[0:10]), float(line[10:20]), float(line[20:30])
        atoms.append([atomic_number(line[31:34].strip()), x, y, z])
    charge = 0
    for line in lines[4 + count:]:
        if line.startswith('M  CHG'):
            fields = line.split()[3:]
            charge += sum(int(fields[i + 1]) for i in range(0, len(fields), 2))
        if line.startswith('M  END'):
            break
    return atoms, charge


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def resolve(kind: str, text: str, fetch: Fetch = urllib_fetch, today: Callable[[], str] = _today) -> dict:
    text = text.strip()
    if kind == 'name':
        # PubChem's name lookup is case-insensitive; lower-casing here keeps
        # the URL consistent with normalise_query's cache key (D3).
        status, body = _get(fetch, f'{BASE}/compound/name/{quote(" ".join(text.lower().split()))}/cids/JSON')
    else:
        status, body = _get(fetch, f'{BASE}/compound/smiles/cids/JSON', urlencode({'smiles': text}).encode())
    cids = json.loads(body).get('IdentifierList', {}).get('CID', []) if status == 200 else []
    if not cids or cids[0] == 0:
        raise JobRefused('unknown-compound', f'PubChem does not know "{text}"')
    cid = int(cids[0])
    status, body = _get(fetch, f'{BASE}/compound/cid/{cid}/record/SDF?record_type=3d')
    if status != 200:
        raise JobRefused('no-3d-structure', f'PubChem has no 3D structure for CID {cid}; paste an XYZ instead')
    atoms, charge = parse_sdf(body.decode())
    status, body = _get(fetch, f'{BASE}/compound/cid/{cid}/property/Title/JSON')
    title = json.loads(body)['PropertyTable']['Properties'][0]['Title'] if status == 200 else text
    return {'cid': cid, 'title': title, 'atoms': atoms, 'charge': charge, 'retrievedAt': today()}
