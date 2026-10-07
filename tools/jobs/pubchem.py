"""Name or SMILES → PubChem CID → its computed 3D conformer (spec §5.1).

PubChem's 3D conformers are MMFF94-optimised and exist for most small
compounds, not for salts or very large or flexible ones; those are refused
with a suggestion to paste an XYZ. Stdlib only: this runs in the api Lambda.
"""
import http.client
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import quote, urlencode

from jobs.elements import atomic_number
from jobs.errors import JobRefused

BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'
# Per call; a resolution makes at most three (name, SDF, title), and all of
# them must finish well inside the api Lambda's 29 s, or the owner gets API
# Gateway's bare 503 instead of this module's answer (final review M3).
TIMEOUT_SECONDS = 6
# 424 Failed Dependency, not 503: a PubChem outage is not this API failing,
# and the Api5xx alarm emails the owner for every 5xx (final review M3).
UNAVAILABLE = 424
Fetch = Callable[[str, 'bytes | None'], 'tuple[int, bytes]']
# What a body this phase cannot read raises on its way through json, the SDF
# reader or the dict lookups: an HTML error page sent with HTTP 200 by a
# proxy, a truncated read, a reshaped JSON answer. All mean PubChem did not
# give a usable answer this time, not that the request was wrong (I2).
UNREADABLE = (ValueError, KeyError, IndexError, TypeError, AttributeError, http.client.HTTPException)
UNREADABLE_MESSAGE = 'PubChem sent a response this phase cannot read; try again, or paste an XYZ'


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
        raise JobRefused('pubchem-unavailable', f'PubChem did not answer ({e}); try again, or paste an XYZ',
                         UNAVAILABLE)
    except http.client.HTTPException as e:      # IncompleteRead, BadStatusLine: the answer broke off
        raise JobRefused('pubchem-unavailable', f'{UNREADABLE_MESSAGE} ({type(e).__name__})', UNAVAILABLE)
    if status >= 500 or status in (429, 503):
        raise JobRefused('pubchem-unavailable', f'PubChem is unavailable (HTTP {status}); try again, or paste an XYZ',
                         UNAVAILABLE)
    return status, body


def parse_sdf(text: str):
    lines = text.splitlines()
    counts_line = lines[3]
    count = int(counts_line[0:3])
    atoms = []
    for line in lines[4:4 + count]:
        x, y, z = float(line[0:10]), float(line[10:20]), float(line[20:30])
        atoms.append([atomic_number(line[31:34].strip()), x, y, z])
    # V3000 moves the atom block into "M  V30" records this fixed-column
    # reader cannot see, which would otherwise silently return no atoms.
    if 'V3000' in counts_line or not atoms:
        raise JobRefused('no-3d-structure',
                          'PubChem returned a V3000 structure this phase cannot read; paste an XYZ instead')
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
    # JobRefused (unknown-compound, no-3d-structure, an out-of-range element
    # in the SDF) is not among UNREADABLE and passes through unchanged.
    try:
        return _resolve(kind, text, fetch, today)
    except UNREADABLE as e:
        raise JobRefused('pubchem-unavailable', f'{UNREADABLE_MESSAGE} ({type(e).__name__})', UNAVAILABLE)


def _resolve(kind, text, fetch, today):
    text = text.strip()
    if kind == 'name':
        # PubChem's name lookup is case-insensitive; lower-casing here keeps
        # the URL consistent with normalise_query's cache key (D3). safe=''
        # also escapes a literal "/" (e.g. "cis/trans …"), which quote's
        # default safe='/' would otherwise leave to split PubChem's path.
        status, body = _get(fetch, f'{BASE}/compound/name/{quote(" ".join(text.lower().split()), safe="")}/cids/JSON')
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
