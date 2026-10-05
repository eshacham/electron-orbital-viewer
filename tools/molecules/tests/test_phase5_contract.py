import json

from pyscf import gto, scf


def test_generate_exposes_basis_json():
    import generate
    mol = gto.M(atom='H 0 0 0; H 0 0 0.74', basis='sto-3g', verbose=0)
    mf = scf.RHF(mol).run()
    payload = generate.basis_json(mol, mf)
    assert isinstance(payload, dict) and payload
    json.dumps(payload)


def test_geometric_is_installed():
    import geometric  # noqa: F401  (geometry optimisation, Task 3)
