"""
The orbital list meta.json carries: every occupied orbital and the first few
virtuals, labelled by irrep in the calculation's abelian subgroup (PySCF only
labels those), with degenerate sets kept together and HOMO / LUMO / SOMO on
every member of the relevant set.
"""
import numpy as np

DEGENERACY_TOL = 1e-4


def orbital_labels(irreps):
    counts, labels = {}, []
    for irrep in irreps:
        name = irrep.lower()
        # A degenerate pair's components (E1ux, E1uy) share one label; they
        # are counted separately so either may come first in energy order.
        if name.startswith('e') and name[-1] in 'xy':
            key, component = name[:-1], name[-1]
        else:
            key, component = name, ''
        counts[(key, component)] = counts.get((key, component), 0) + 1
        labels.append(f'{counts[(key, component)]}{key}')
    return labels


def degeneracy_groups(energies, tol=DEGENERACY_TOL):
    groups, current = [], 0
    for i, e in enumerate(energies):
        if i and abs(e - energies[i - 1]) >= tol:
            current += 1
        groups.append(current)
    return groups


def orbital_table(mol, mf, extra_virtuals=5):
    energies = np.asarray(mf.mo_energy, dtype=float)
    occ = np.asarray(mf.mo_occ, dtype=float)
    if mol.symmetry:
        from pyscf import symm
        labels = orbital_labels(list(symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, mf.mo_coeff)))
    else:
        labels = [f'ψ{i + 1}' for i in range(len(energies))]
    groups = degeneracy_groups(list(energies))
    occupied = [i for i in range(len(occ)) if occ[i] > 0]
    virtual = [i for i in range(len(occ)) if occ[i] == 0]
    keep_virtual = virtual[:extra_virtuals]
    while keep_virtual and len(keep_virtual) < len(virtual) and groups[virtual[len(keep_virtual)]] == groups[keep_virtual[-1]]:
        keep_virtual.append(virtual[len(keep_virtual)])
    doubly = [i for i in occupied if occ[i] > 1.5]
    homo_group = groups[max(doubly, key=lambda i: energies[i])] if doubly else None
    lumo_group = groups[min(virtual, key=lambda i: energies[i])] if virtual else None
    rows = []
    for i in occupied + keep_virtual:
        row = {'index': int(i), 'label': labels[i], 'energyHartree': float(energies[i]), 'occupation': float(occ[i])}
        if 0.5 < occ[i] < 1.5:
            row['role'] = 'SOMO'
        elif occ[i] > 1.5 and groups[i] == homo_group:
            row['role'] = 'HOMO'
        elif occ[i] == 0 and groups[i] == lumo_group:
            row['role'] = 'LUMO'
        rows.append(row)
    # D1 (preflight controller correction): Task 6 writes basis.json from
    # these rows, addressed by position (the `gaussianMO` recipe names an
    # orbital by its index into basis.json's `orbitals` array, not by PySCF's
    # MO index). That is only valid because, for RKS/ROKS under aufbau
    # occupation, "occupied" and "the leading virtuals" are two contiguous
    # runs starting at 0 — so a row's position in this list equals its
    # PySCF index. Pin that precondition here, where it would otherwise
    # silently rot if a future change (e.g. reordering virtuals by label)
    # broke it.
    assert [r['index'] for r in rows] == list(range(len(rows)))
    return rows
