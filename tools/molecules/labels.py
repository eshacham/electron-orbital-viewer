"""σ/π labels, the orbitals worth shipping, and bond order."""
import re

import numpy as np
from pyscf import gto, symm

_D2H = {'Ag': ('σ', 'g'), 'B1u': ('σ', 'u'), 'B2u': ('π', 'u'), 'B3u': ('π', 'u'),
        'B2g': ('π', 'g'), 'B3g': ('π', 'g'), 'B1g': ('δ', 'g'), 'Au': ('δ', 'u')}
_C2V = {'A1': ('σ', ''), 'B1': ('π', ''), 'B2': ('π', ''), 'A2': ('δ', '')}
_LAMBDA = {'A': 'σ', 'E1': 'π', 'E2': 'δ', 'E3': 'φ'}
ANTIBONDING = {('σ', 'u'), ('π', 'g')}


def _minao_projector(mol):
    """Projector onto the minimal (MINAO) basis spanned in mol's AO basis,
    shared by select_orbitals (which orbital to keep) and label_orbitals
    (which orbital earns the next number)."""
    minao = gto.M(atom=[(mol.atom_symbol(i), mol.atom_coord(i)) for i in range(mol.natm)],
                  unit='Bohr', basis='minao', spin=mol.spin, verbose=0)
    s12 = gto.intor_cross('int1e_ovlp', mol, minao)
    return minao, s12 @ np.linalg.solve(minao.intor('int1e_ovlp'), s12.T)


def irrep_to_lambda(group, irrep):
    if group == 'D2h' and irrep in _D2H:
        return _D2H[irrep]
    if group == 'C2v' and irrep in _C2V:
        return _C2V[irrep]
    if group in ('Dooh', 'Coov'):
        match = re.fullmatch(r'(A1|A2|E\d+)([gu]?)([xy]?)', irrep)
        if match:
            kind = 'A' if match.group(1).startswith('A') else match.group(1)
            if kind in _LAMBDA and (group == 'Coov') == (match.group(2) == ''):
                return _LAMBDA[kind], match.group(2)
    raise ValueError(f'No σ/π/δ label for irrep {irrep!r} of group {group}')


def label_orbitals(mol, coeff, energy, kept, homonuclear):
    """nσg/nσu*/nπu/nπg*-style labels, numbered per irrep in energy order,
    counting only the orbitals in `kept` (select_orbitals's choice of which
    MOs are chemically meaningful); every other index gets None.

    Fix round 1 (I1): numbering used to run over every computed MO, filtered
    by its own MINAO-weight floor independent of select_orbitals. def2-TZVP's
    diffuse virtuals project onto MINAO by varying amounts across the scan, so
    a fixed floor sometimes excluded the very orbital select_orbitals had
    already chosen to keep (B2 and CO near their compressed geometries), and
    independently-floored alpha/beta channels could disagree on whether the
    same antibonding orbital cleared the floor at all. Numbering only within
    `kept` makes label_orbitals agree with select_orbitals by construction --
    there is exactly one MINAO weight computation (inside select_orbitals),
    not two that can disagree."""
    irreps = symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, coeff)
    kept_set = set(kept)
    counts, last, labels = {}, {}, [None] * len(energy)
    for i in np.argsort(energy, kind='stable'):
        if i not in kept_set:
            continue
        key = irrep_to_lambda(mol.groupname, irreps[i])
        previous = last.get(key)
        if key[0] != 'σ' and previous is not None and abs(energy[i] - previous[1]) < 1e-4:
            number = previous[0]   # the degenerate partner of a π pair shares its number
        else:
            number = counts.get(key, 0) + 1
            counts[key] = number
        last[key] = (number, float(energy[i]))
        star = '*' if homonuclear and key in ANTIBONDING else ''
        labels[i] = f'{number}{key[0]}{key[1]}{star}'
    return labels


def select_orbitals(mol, coeff, occ):
    """Every occupied orbital, plus the virtuals most like minimal-basis valence
    orbitals (largest projection onto MINAO) up to the minimal-basis size: the
    textbook diagram's σ*/π*, not the triple-zeta basis's diffuse extras."""
    minao, projector = _minao_projector(mol)
    occupied = [i for i in range(len(occ)) if occ[i] > 0]
    virtual = [i for i in range(len(occ)) if occ[i] == 0]
    weight = {i: float(coeff[:, i] @ projector @ coeff[:, i]) for i in virtual}
    wanted = max(0, minao.nao - len(occupied))
    chosen = sorted(virtual, key=lambda i: -weight[i])[:wanted]
    return sorted(occupied + chosen)


def bond_order(labels, occupations, homonuclear):
    if not homonuclear:
        return None
    bonding = sum(o for label, o in zip(labels, occupations) if o > 0 and not label.endswith('*'))
    antibonding = sum(o for label, o in zip(labels, occupations) if o > 0 and label.endswith('*'))
    return (bonding - antibonding) / 2
