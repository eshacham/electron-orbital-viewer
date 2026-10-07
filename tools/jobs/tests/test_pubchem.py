import json
from pathlib import Path
from urllib.parse import quote

import pytest

from jobs.errors import JobRefused
from jobs.pubchem import BASE, normalise_query, parse_sdf, resolve

F = Path(__file__).parent / 'fixtures' / 'pubchem'
AMMONIUM = json.loads((F / 'name_ammonium.json').read_text())['IdentifierList']['CID'][0]


def fake_fetch(responses):
    calls = []

    def fetch(url, data=None):
        calls.append((url, data))
        if url not in responses:
            return 404, b'{"Fault": {"Code": "PUGREST.NotFound"}}'
        body = responses[url]
        return 200, body if isinstance(body, bytes) else (F / body).read_bytes()
    fetch.calls = calls
    return fetch


def standard_responses():
    return {
        f'{BASE}/compound/name/water/cids/JSON': 'name_water.json',
        f'{BASE}/compound/cid/962/record/SDF?record_type=3d': 'cid_962_3d.sdf',
        f'{BASE}/compound/cid/962/property/Title/JSON': 'cid_962_title.json',
        f'{BASE}/compound/name/caffeine/cids/JSON': 'name_caffeine.json',
        f'{BASE}/compound/smiles/cids/JSON': 'smiles_caffeine.json',
        f'{BASE}/compound/cid/2519/record/SDF?record_type=3d': 'cid_2519_3d.sdf',
        f'{BASE}/compound/cid/2519/property/Title/JSON': 'cid_2519_title.json',
        f'{BASE}/compound/name/{quote("sodium chloride")}/cids/JSON': b'{"IdentifierList": {"CID": [5234]}}',
        f'{BASE}/compound/name/ammonium/cids/JSON': 'name_ammonium.json',
        f'{BASE}/compound/cid/{AMMONIUM}/record/SDF?record_type=3d': f'cid_{AMMONIUM}_3d.sdf',
        f'{BASE}/compound/cid/{AMMONIUM}/property/Title/JSON': f'cid_{AMMONIUM}_title.json',
    }


def test_water_by_name():
    got = resolve('name', '  Water ', fake_fetch(standard_responses()), today=lambda: '2026-10-05')
    assert got['cid'] == 962 and got['title'].lower() == 'water' and got['charge'] == 0
    assert got['retrievedAt'] == '2026-10-05'
    assert sorted(a[0] for a in got['atoms']) == [1, 1, 8]


def test_caffeine_by_smiles_posts_the_smiles():
    fetch = fake_fetch(standard_responses())
    got = resolve('smiles', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', fetch)
    assert got['cid'] == 2519 and len(got['atoms']) == 24
    url, data = fetch.calls[0]
    assert url.endswith('/compound/smiles/cids/JSON') and data.startswith(b'smiles=')


def test_formal_charge_comes_from_the_sdf():
    assert resolve('name', 'ammonium', fake_fetch(standard_responses()))['charge'] == 1


def test_unknown_name():
    with pytest.raises(JobRefused) as e:
        resolve('name', 'notacompoundxyz', fake_fetch(standard_responses()))
    assert e.value.code == 'unknown-compound' and e.value.status == 422


def test_smiles_not_in_pubchem_is_cid_zero():
    fetch = fake_fetch({f'{BASE}/compound/smiles/cids/JSON': b'{"IdentifierList": {"CID": [0]}}'})
    with pytest.raises(JobRefused) as e:
        resolve('smiles', 'C1=CC=CC=C1XX', fetch)
    assert e.value.code == 'unknown-compound'


def test_no_3d_structure():
    with pytest.raises(JobRefused) as e:
        resolve('name', 'sodium chloride', fake_fetch(standard_responses()))
    assert e.value.code == 'no-3d-structure' and 'paste an XYZ' in e.value.message


def test_network_failure_is_pubchem_unavailable():
    def down(url, data=None):
        raise OSError('timed out')
    with pytest.raises(JobRefused) as e:
        resolve('name', 'water', down)
    assert e.value.code == 'pubchem-unavailable' and e.value.status == 424


def test_server_error_is_pubchem_unavailable():
    with pytest.raises(JobRefused) as e:
        resolve('name', 'water', lambda url, data=None: (503, b'busy'))
    assert e.value.code == 'pubchem-unavailable'


def test_parse_sdf_water():
    atoms, charge = parse_sdf((F / 'cid_962_3d.sdf').read_text())
    assert atoms[0] == [8, 0.0, 0.0, 0.0] and charge == 0 and len(atoms) == 3


def test_name_with_slash_is_escaped_in_the_url():
    name = 'cis/trans-water'
    expected_url = f'{BASE}/compound/name/{quote(name.lower(), safe="")}/cids/JSON'
    responses = {
        expected_url: 'name_water.json',
        f'{BASE}/compound/cid/962/record/SDF?record_type=3d': 'cid_962_3d.sdf',
        f'{BASE}/compound/cid/962/property/Title/JSON': 'cid_962_title.json',
    }
    fetch = fake_fetch(responses)
    got = resolve('name', name, fetch)
    assert got['cid'] == 962
    url, _ = fetch.calls[0]
    assert url == expected_url and '%2F' in url and '/trans' not in url


def test_parse_sdf_v3000_is_refused():
    text = '\n  -OEChem-\n\n  0  0  0  0  0  0  0  0  0  0999 V3000\nM  END\n'
    with pytest.raises(JobRefused) as e:
        parse_sdf(text)
    assert e.value.code == 'no-3d-structure' and 'V3000' in e.value.message


def test_parse_sdf_zero_atoms_is_refused():
    text = '\n  -OEChem-\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n'
    with pytest.raises(JobRefused) as e:
        parse_sdf(text)
    assert e.value.code == 'no-3d-structure'


def test_normalise_query():
    assert normalise_query('name', '  Caffeine   Anhydrous ') == 'name:caffeine anhydrous'
    assert normalise_query('smiles', ' CCO ') == 'smiles:CCO'


# --- final-review fix wave (I2) --------------------------------------------------

def _answers_at(stage_url, body):
    """The standard water responses, except one URL that answers 200 with `body`."""
    responses = {**standard_responses(), stage_url: body}
    return fake_fetch(responses)


CIDS, SDF, TITLE = (f'{BASE}/compound/name/water/cids/JSON', f'{BASE}/compound/cid/962/record/SDF?record_type=3d',
                    f'{BASE}/compound/cid/962/property/Title/JSON')
HTML = b'<html><body>Service temporarily unavailable</body></html>'


@pytest.mark.parametrize('url, body', [(CIDS, HTML), (SDF, HTML), (TITLE, HTML), (CIDS, b'[]'), (SDF, b'[]'),
                                       (TITLE, b'[]'), (TITLE, b'{"PropertyTable": {"Properties": []}}'),
                                       (CIDS, b'\xff\xfe'), (SDF, b'\xff\xfe'), (TITLE, b'\xff\xfe')])
def test_an_unreadable_200_is_pubchem_unavailable(url, body):
    """A proxy's HTML error page (or any body this phase cannot parse) sent
    with HTTP 200 used to raise straight out of resolve, and the server
    dropped the connection instead of answering."""
    with pytest.raises(JobRefused) as e:
        resolve('name', 'water', _answers_at(url, body))
    assert e.value.code == 'pubchem-unavailable' and e.value.status == 424
    assert 'cannot read' in e.value.message


def test_a_truncated_response_is_pubchem_unavailable():
    import http.client

    def cut_off(url, data=None):
        raise http.client.IncompleteRead(b'{"Identif')
    with pytest.raises(JobRefused) as e:
        resolve('name', 'water', cut_off)
    assert e.value.code == 'pubchem-unavailable' and e.value.status == 424


def test_the_three_lookups_fit_inside_the_api_lambdas_timeout():
    # Final review M3: three calls at 10 s each could outlast the api
    # Lambda's 29 s, and the owner got API Gateway's bare 503 instead of
    # this module's answer. Name, SDF and title: three calls at most.
    from jobs import pubchem
    assert 3 * pubchem.TIMEOUT_SECONDS <= 20
