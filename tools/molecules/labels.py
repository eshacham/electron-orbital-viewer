"""σ/π labels, the orbitals worth shipping, and bond order."""
import re

import numpy as np
from pyscf import gto, symm

_D2H = {'Ag': ('σ', 'g'), 'B1u': ('σ', 'u'), 'B2u': ('π', 'u'), 'B3u': ('π', 'u'),
        'B2g': ('π', 'g'), 'B3g': ('π', 'g'), 'B1g': ('δ', 'g'), 'Au': ('δ', 'u')}
_C2V = {'A1': ('σ', ''), 'B1': ('π', ''), 'B2': ('π', ''), 'A2': ('δ', '')}
_LAMBDA = {'A': 'σ', 'E1': 'π', 'E2': 'δ', 'E3': 'φ'}
ANTIBONDING = {('σ', 'u'), ('π', 'g')}

# def2-TZVP's diffuse and polarisation functions give every symmetry several
# low-lying virtuals with almost no minimal-basis character (observed for N2:
# the true 3*sigma_u* projects 0.66 onto MINAO; the basis-set artefacts below
# it in energy project <= 0.17). A real valence/antibonding orbital keeps more
# than half its norm in the minimal basis; this floor is generous on either
# side of that gap and keeps the artefacts out of the "nth sigma/pi" count.
MINAO_WEIGHT_FLOOR = 0.5


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


def label_orbitals(mol, coeff, energy, homonuclear):
    """nσg/nσu*/nπu/nπg*-style labels, numbered per irrep in energy order.
    Orbitals with little minimal-basis character (def2-TZVP's diffuse
    virtuals, never the ones select_orbitals keeps) are excluded from the
    count -- otherwise the textbook 3σu* would be numbered by its rank among
    basis-set artefacts instead of its rank among real valence orbitals."""
    irreps = symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, coeff)
    _, projector = _minao_projector(mol)
    weight = np.einsum('ik,kl,li->i', coeff.T, projector, coeff)
    counts, last, labels = {}, {}, [''] * len(energy)
    for i in np.argsort(energy, kind='stable'):
        key = irrep_to_lambda(mol.groupname, irreps[i])
        star = '*' if homonuclear and key in ANTIBONDING else ''
        if weight[i] < MINAO_WEIGHT_FLOOR:
            labels[i] = f'0{key[0]}{key[1]}{star}'   # never selected; number is unused
            continue
        previous = last.get(key)
        if key[0] != 'σ' and previous is not None and abs(energy[i] - previous[1]) < 1e-4:
            number = previous[0]   # the degenerate partner of a π pair shares its number
        else:
            number = counts.get(key, 0) + 1
            counts[key] = number
        last[key] = (number, float(energy[i]))
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
