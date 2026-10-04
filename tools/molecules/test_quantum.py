from dataclasses import replace

from molecules import DIATOMICS, DOOH_TO_D2H
from quantum import REFERENCE_BASIS, build_mol, hydrogen_atom_energy, pinned_occupations, reference_energy

_BY_ID = {d.id: d for d in DIATOMICS}


def test_ccsd_t_equals_full_ci_for_two_electrons():
    """For two electrons CCSD is exact within the basis and (T) has no
    triples to add, so both of the generator's energy paths must agree --
    which checks the CCSD(T) path (frozen core, (T) added) against full CI
    without any recalled reference number."""
    h2 = _BY_ID['h2']
    full_ci = reference_energy(h2, 1.4)
    coupled = reference_energy(replace(h2, energy_method='ccsd(t)'), 1.4)
    assert abs(full_ci - coupled) < 1e-8
    assert -1.18 < full_ci < -1.16   # exact (Kołos & Wolniewicz) -1.1745; the basis gives up ~2 mHa


def test_the_hydrogen_atom_is_exact_up_to_the_basis():
    # One electron, so UHF is full CI; -1/2 Ha exactly in the complete-basis limit.
    assert abs(hydrogen_atom_energy() + 0.5) < 1e-3


def test_open_shells_are_pinned_in_whichever_group_pyscf_chose():
    o2 = _BY_ID['o2']
    mol = build_mol(o2, 2.28, REFERENCE_BASIS)
    pinned = pinned_occupations(o2, mol)
    names = {'Dooh': {k: k for k in DOOH_TO_D2H}, 'D2h': DOOH_TO_D2H}[mol.groupname]
    assert pinned[names['E1gx']] == (1, 0) and pinned[names['E1gy']] == (1, 0)
    c2 = _BY_ID['c2']
    assert pinned_occupations(c2, build_mol(c2, 2.35, REFERENCE_BASIS))[names['E1ux']] == 2   # restricted: a total
    assert pinned_occupations(_BY_ID['n2'], build_mol(_BY_ID['n2'], 2.07, REFERENCE_BASIS)) is None
