"""
The orbital list meta.json carries: every occupied orbital and the first few
virtuals, labelled in the molecule's full point group where one is supported
(point_group.py), degenerate sets kept whole, HOMO / LUMO / SOMO on every
member of the relevant set.

Phase 6D (spec §4): every virtual also carries its valence character -- the
fraction of it inside the span of the intrinsic atomic orbitals (IAOs onto
MINAO, pyscf.lo.iao) -- and its class, 'valence' at VALENCE_THRESHOLD or above,
else 'diffuse'. With def2-TZVPD's diffuse functions the lowest virtuals of
water, ammonia and methane are only partly valence (measured 55, 50 and 36 %):
their shape depends on the basis, and they are not the σ* orbitals textbooks
draw. Clean valence virtuals measure 77-99 %, hence 0.75 (the spec's 0.5 would
call water's LUMO valence; the margins are PH3's 3e at 76.8 % and SiH4's 3t2
at 67.7 %, preflight D9). Where the LUMO is diffuse, the role LVMO marks the
lowest valence virtual: a shipped canonical one if any is valence (CO2's 2πu,
97 %); otherwise the lowest valence virtual orbital (VVO) -- the Fock operator
diagonalised in the virtual part of the IAO span -- appended as one more row
(a whole set if it is degenerate: silane's t2), kind 'valence-virtual', its
own coefficients in the table, its energy an expectation value (water's σ*
+5.0 eV). Seven library molecules get one (Ruling D4: H2O, NH3, CH4, C2H6,
SiH4, CH3OH, ethanol). It is not an orbital of this calculation, so the row
says so itself -- `constructed`, `energyApproximate` and CONSTRUCTED_NOTE --
for every reader of meta.json and basis.json, not only the viewer.
"""
from dataclasses import dataclass

import numpy as np

from point_group import irrep_of, label_orbitals, number_labels

DEGENERACY_TOL = 1e-4
VALENCE_THRESHOLD = 0.75
CONSTRUCTED_NOTE = ('constructed from the valence part of the virtual space — not an orbital of this calculation; '
                    'energy approximate (≈)')
orbital_labels = number_labels      # Phase 6's name for the per-irrep numbering, kept for its callers


@dataclass
class OrbitalTable:
    rows: list
    symmetry: dict
    coefficients: np.ndarray       # (nao, len(rows)): column k is rows[k]'s orbital


def degeneracy_groups(energies, tol=DEGENERACY_TOL):
    groups, current = [], 0
    for i, e in enumerate(energies):
        if i and abs(e - energies[i - 1]) >= tol:
            current += 1
        groups.append(current)
    return groups


def _valence_space(mol, mf):
    """The orthonormalised IAOs (AO coefficients) and the AO overlap."""
    from pyscf import lo
    s = mol.intor_symmetric('int1e_ovlp')
    occupied = np.asarray(mf.mo_coeff)[:, np.asarray(mf.mo_occ) > 0]
    return lo.orth.vec_lowdin(lo.iao.iao(mol, occupied), s), s


def _characters(coeff, c_iao, s):
    return ((np.asarray(coeff).T @ s @ c_iao) ** 2).sum(axis=1)


def valence_character_of(mol, mf, coeff):
    """Each column of `coeff`'s norm inside the orthonormalised IAO span (0-1 for a normalised orbital)."""
    return _characters(coeff, *_valence_space(mol, mf))


def valence_characters(mol, mf):
    """Each MO's valence character: 1 for occupied orbitals (the IAOs span them exactly), 0-1 for a virtual."""
    return valence_character_of(mol, mf, mf.mo_coeff)


def _valence_virtuals(mf, c_iao, s):
    """The virtual part of the IAO span -- n_IAO - n_occupied orbitals, the singular values of the
    virtual-IAO overlap 1 for it and 0 beyond -- with the Fock operator diagonalised in it. Energies
    ascending (expectation values), AO coefficients, and each orbital's valence character from those
    singular values: VVO k = Σⱼ y_jk uⱼ, so its norm inside the IAO span is Σⱼ (y_jk σⱼ)²."""
    virtual = np.asarray(mf.mo_occ) == 0
    c_virtual = np.asarray(mf.mo_coeff)[:, virtual]
    u, singular, _ = np.linalg.svd(c_virtual.T @ s @ c_iao, full_matrices=False)
    keep = singular > 0.5
    w = u[:, keep]
    energies, y = np.linalg.eigh(w.T @ np.diag(np.asarray(mf.mo_energy)[virtual]) @ w)
    character = ((y * singular[keep][:, None]) ** 2).sum(axis=0)
    return energies, c_virtual @ (w @ y), character


def valence_virtuals(mol, mf):
    """The valence virtual orbitals: energies ascending (expectation values) and AO coefficients."""
    energies, coeff, _ = _valence_virtuals(mf, *_valence_space(mol, mf))
    return energies, coeff


def _sets(rows, tol=DEGENERACY_TOL):
    sets = []
    for row in rows:
        if sets and abs(row['energyHartree'] - sets[-1][-1]['energyHartree']) < tol:
            sets[-1].append(row)
        else:
            sets.append([row])
    return sets


def _mark_lvmo(mol, mf, rows, coefficients, space):
    virtual = [r for r in rows if r['occupation'] == 0]
    lumo = [r for r in virtual if r.get('role') == 'LUMO']
    if not lumo or all(r['class'] == 'valence' for r in lumo):
        return rows, coefficients
    for members in _sets(virtual):
        if all(r['class'] == 'valence' for r in members):
            for r in members:
                r['role'] = 'LVMO'
            return rows, coefficients
    energies, vvo, character = _valence_virtuals(mf, *space)
    if not len(energies):
        return rows, coefficients
    lowest = [k for k in range(len(energies)) if energies[k] - energies[0] < DEGENERACY_TOL]
    # Unnumbered: the per-irrep numbers count the calculation's own orbitals, which this is not.
    label = irrep_of(mol, mf, vvo[:, lowest])
    for k in lowest:
        rows.append({'index': len(rows), 'label': label, 'energyHartree': float(energies[k]), 'occupation': 0.0,
                     'role': 'LVMO', 'kind': 'valence-virtual', 'constructed': True, 'energyApproximate': True,
                     'note': CONSTRUCTED_NOTE, 'valenceCharacter': round(float(character[k]), 4),
                     'class': 'valence' if character[k] >= VALENCE_THRESHOLD else 'diffuse'})
    return rows, np.hstack([coefficients, vvo[:, lowest]])


def orbital_table(mol, mf, extra_virtuals=5):
    energies = np.asarray(mf.mo_energy, dtype=float)
    occ = np.asarray(mf.mo_occ, dtype=float)
    groups = degeneracy_groups(list(energies))
    occupied = [i for i in range(len(occ)) if occ[i] > 0]
    virtual = [i for i in range(len(occ)) if occ[i] == 0]
    # The cut never splits a degenerate set: label_orbitals labels a set by its characters, and a set cut
    # short carries no irrep's (Task 3 measured methane's, ammonia's, silane's and ethane's 2nd virtual set
    # cut by "5 virtuals" at def2-TZVPD, labelled '?'). Groups chain at DEGENERACY_TOL, looser than
    # point_group.SET_TOL, so a whole group is always a union of whole label sets.
    keep_virtual = virtual[:extra_virtuals]
    while keep_virtual and len(keep_virtual) < len(virtual) and groups[virtual[len(keep_virtual)]] == groups[keep_virtual[-1]]:
        keep_virtual.append(virtual[len(keep_virtual)])
    kept = occupied + keep_virtual
    # D1 (preflight controller correction): basis.json is written from these rows, addressed by position
    # (a 'gaussianMO' recipe names an orbital by its index into basis.json's `orbitals`). For RKS/ROKS under
    # aufbau occupation, occupied and the leading virtuals are two contiguous runs from 0, so a canonical
    # row's position equals its PySCF index; an appended valence virtual orbital takes the next position.
    # Pinned here, before any further work, with a real exception: the worker runs this at request time,
    # where `python -O` would drop an assert.
    if kept != list(range(len(kept))):
        raise ValueError('orbital_table rows are not addressable by position: position != PySCF index')
    labels, symmetry, notes = label_orbitals(mol, mf, kept)
    space = _valence_space(mol, mf) if keep_virtual else None
    character = _characters(np.asarray(mf.mo_coeff), *space) if keep_virtual else None
    doubly = [i for i in occupied if occ[i] > 1.5]
    homo_group = groups[max(doubly, key=lambda i: energies[i])] if doubly else None
    lumo_group = groups[min(virtual, key=lambda i: energies[i])] if virtual else None
    rows = []
    for i in kept:
        row = {'index': int(i), 'label': labels[i], 'energyHartree': float(energies[i]), 'occupation': float(occ[i])}
        if 0.5 < occ[i] < 1.5:
            row['role'] = 'SOMO'
        elif occ[i] > 1.5 and groups[i] == homo_group:
            row['role'] = 'HOMO'
        elif occ[i] == 0 and groups[i] == lumo_group:
            row['role'] = 'LUMO'
        if occ[i] == 0:
            row['valenceCharacter'] = round(float(character[i]), 4)
            row['class'] = 'valence' if character[i] >= VALENCE_THRESHOLD else 'diffuse'
        if i in notes:
            row['labelNote'] = notes[i]
        rows.append(row)
    coefficients = np.asarray(mf.mo_coeff)[:, kept]
    if keep_virtual:
        rows, coefficients = _mark_lvmo(mol, mf, rows, coefficients, space)
    return OrbitalTable(rows, symmetry, coefficients)
