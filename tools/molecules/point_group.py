"""Orbital labels in the molecule's full point group (Phase 6D spec §3).

PySCF labels orbitals only in D2h and its subgroups, so the library showed
methane's HOMO as b1/b2/b3 (D2) rather than t2 (Td), ammonia's lone pair as
4a' (Cs) rather than 3a1 (C3v), and benzene in D2h rather than D6h.
label_orbitals works in one of three regimes:

- full group PySCF already labels (D2h and its subgroups, C∞v, D∞h, and SO3
  for atoms): PySCF's irreps, numbered per irrep in energy order; an atom's
  read 1s, 2s, 2p … by principal quantum number. The linear groups read σ/π/δ
  through Bonds mode's own mapping (labels.irrep_to_lambda), each component
  of a π (δ, φ) pair counted in turn, so the pair shares one number even when
  an open shell's ROKS splits it in energy (final review I1).
- projection (TABLES: C3v, D3h, D3d, D6h, Td, Oh): every MO, or set of MOs
  degenerate within SET_TOL, is labelled from its characters
  χ(R) = Σᵢ ⟨ψᵢ|R ψᵢ⟩ -- one operation R per class, integrated on the SCF's
  own DFT grid -- matched against the group's character table. A set that
  matches no irrep is cut at its internal energy gaps (SET_TOL chains core
  combinations 1e-6 Ha apart, as SF6's F 1s at def2-TZVPD) and each piece
  matched; a piece whose characters are still no single irrep's but are a
  sum of whole irreps (BF3's mixed F 1s a1' and e') reads as that sum,
  "1a1'+1e'", with a note, so every later number stays the textbook's
  (Ruling D1). Sets that still match nothing are joined when together they
  carry one irrep: an open shell's ROKS splits a partly filled e or t shell
  (CH4+'s 1t2) far beyond SET_TOL; joined, it is counted once, with a note.
  Anything else is left UNLABELLED, with a note: an accidental degeneracy, or
  numerical trouble, never a guess.
- subgroup: any other group (D2d, C3, Ih …), or a supported one whose
  operations cannot be built at this geometry, keeps PySCF's subgroup labels
  and says so (symmetry.labelNote) -- never silently.

An SCF run without symmetry (the job worker's final SCF falls back to it when
PySCF cannot build symmetry-adapted orbitals at the geometry) is labelled from
the geometry's own point group, found as PySCF finds it (detect_symm), by the
same projection: TABLES's groups, and D2h and its subgroups through PySCF's own
character tables. A linear molecule reads σ/π/δ/φ (g/u in D∞h) from each MO's
character under rotations about its axis and under inversion. Other groups
(atoms, D2d, Ih …) need PySCF's symmetry-adapted orbitals and are left
unlabelled, with a note (Task 8 controller ruling and its fix round).

Mulliken's notation, lower case for orbitals (a1, t2, e1g, a2"), with the core
counted, as textbooks number them. D6h follows Herzberg: C2' through atoms
(benzene's C and H), σv containing them; under it benzene's C 1s combination
that alternates round the ring is b1u.
"""
from __future__ import annotations

import numpy as np

SET_TOL = 1e-5            # Ha: MOs closer in energy than this form one degenerate set (spec §3)
CHI_TOL = 0.05            # a character further than this from the table's is no match (spec §3)
OP_TOL = 1e-3             # bohr: an operation must carry every nucleus onto one of the same element
BLOCK = 20000             # grid points per AO evaluation: bounds memory (SF6 at def2-TZVPD)
UNLABELLED = '?'
LINEAR = ('Dooh', 'Coov')


class SymmetryNotFound(RuntimeError):
    """A supported group's operations could not be built from this geometry."""


# Each group: its classes in table order -- (name, size, operation) -- and each irrep's characters in that
# order. An operation is ('E',), ('i',), ('C', n, k, axis) for C_n^k, ('S', n, k, axis) for S_n^k, or
# ('s', normal) for a mirror plane; the axes are named roles that _roles finds in the geometry.
TABLES = {
    'C3v': ([('E', 1, ('E',)), ('2C3', 2, ('C', 3, 1, 'z')), ('3σv', 3, ('s', 'v'))],
            {'A1': [1, 1, 1], 'A2': [1, 1, -1], 'E': [2, -1, 0]}),
    'D3h': ([('E', 1, ('E',)), ('2C3', 2, ('C', 3, 1, 'z')), ('3C2', 3, ('C', 2, 1, 'p')), ('σh', 1, ('s', 'z')),
             ('2S3', 2, ('S', 3, 1, 'z')), ('3σv', 3, ('s', 'v'))],
            {"A1'": [1, 1, 1, 1, 1, 1], "A2'": [1, 1, -1, 1, 1, -1], "E'": [2, -1, 0, 2, -1, 0],
             'A1"': [1, 1, 1, -1, -1, -1], 'A2"': [1, 1, -1, -1, -1, 1], 'E"': [2, -1, 0, -2, 1, 0]}),
    'D3d': ([('E', 1, ('E',)), ('2C3', 2, ('C', 3, 1, 'z')), ('3C2', 3, ('C', 2, 1, 'p')), ('i', 1, ('i',)),
             ('2S6', 2, ('S', 6, 1, 'z')), ('3σd', 3, ('s', 'v'))],
            {'A1g': [1, 1, 1, 1, 1, 1], 'A2g': [1, 1, -1, 1, 1, -1], 'Eg': [2, -1, 0, 2, -1, 0],
             'A1u': [1, 1, 1, -1, -1, -1], 'A2u': [1, 1, -1, -1, -1, 1], 'Eu': [2, -1, 0, -2, 1, 0]}),
    'D6h': ([('E', 1, ('E',)), ('2C6', 2, ('C', 6, 1, 'z')), ('2C3', 2, ('C', 3, 1, 'z')), ('C2', 1, ('C', 2, 1, 'z')),
             ("3C2'", 3, ('C', 2, 1, 'p')), ('3C2"', 3, ('C', 2, 1, 'q')), ('i', 1, ('i',)),
             ('2S3', 2, ('S', 3, 1, 'z')), ('2S6', 2, ('S', 6, 1, 'z')), ('σh', 1, ('s', 'z')),
             ('3σd', 3, ('s', 'dq')), ('3σv', 3, ('s', 'vp'))],
            {'A1g': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'A2g': [1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, -1],
             'B1g': [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1], 'B2g': [1, -1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1],
             'E1g': [2, 1, -1, -2, 0, 0, 2, 1, -1, -2, 0, 0], 'E2g': [2, -1, -1, 2, 0, 0, 2, -1, -1, 2, 0, 0],
             'A1u': [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1], 'A2u': [1, 1, 1, 1, -1, -1, -1, -1, -1, -1, 1, 1],
             'B1u': [1, -1, 1, -1, 1, -1, -1, 1, -1, 1, -1, 1], 'B2u': [1, -1, 1, -1, -1, 1, -1, 1, -1, 1, 1, -1],
             'E1u': [2, 1, -1, -2, 0, 0, -2, -1, 1, 2, 0, 0], 'E2u': [2, -1, -1, 2, 0, 0, -2, 1, 1, -2, 0, 0]}),
    'Td': ([('E', 1, ('E',)), ('8C3', 8, ('C', 3, 1, 'c3')), ('3C2', 3, ('C', 2, 1, 'a')),
            ('6S4', 6, ('S', 4, 1, 'a')), ('6σd', 6, ('s', 'd'))],
           {'A1': [1, 1, 1, 1, 1], 'A2': [1, 1, 1, -1, -1], 'E': [2, -1, 2, 0, 0],
            'T1': [3, 0, -1, 1, -1], 'T2': [3, 0, -1, -1, 1]}),
    'Oh': ([('E', 1, ('E',)), ('8C3', 8, ('C', 3, 1, 'c3')), ('6C2', 6, ('C', 2, 1, 'd')), ('6C4', 6, ('C', 4, 1, 'a')),
            ('3C2', 3, ('C', 2, 1, 'a')), ('i', 1, ('i',)), ('6S4', 6, ('S', 4, 1, 'a')), ('8S6', 8, ('S', 6, 1, 'c3')),
            ('3σh', 3, ('s', 'a')), ('6σd', 6, ('s', 'd'))],
           {'A1g': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'A2g': [1, 1, -1, -1, 1, 1, -1, 1, 1, -1],
            'Eg': [2, -1, 0, 0, 2, 2, 0, -1, 2, 0], 'T1g': [3, 0, -1, 1, -1, 3, 1, 0, -1, -1],
            'T2g': [3, 0, 1, -1, -1, 3, -1, 0, -1, 1], 'A1u': [1, 1, 1, 1, 1, -1, -1, -1, -1, -1],
            'A2u': [1, 1, -1, -1, 1, -1, 1, -1, -1, 1], 'Eu': [2, -1, 0, 0, 2, -2, 0, 1, -2, 0],
            'T1u': [3, 0, -1, 1, -1, -3, -1, 0, 1, 1], 'T2u': [3, 0, 1, -1, -1, -3, 1, 0, 1, -1]}),
}


def number_labels(irreps):
    """'1a1', '2a1', '1b2' …: each irrep counted in the order given (energy order). A degenerate pair's
    components (E1ux, E1uy) share one label but are counted separately, so either may come first."""
    counts, labels = {}, []
    for irrep in irreps:
        name = irrep.lower()
        if name.startswith('e') and name[-1] in 'xy':
            key, component = name[:-1], name[-1]
        else:
            key, component = name, ''
        counts[(key, component)] = counts.get((key, component), 0) + 1
        labels.append(f'{counts[(key, component)]}{key}')
    return labels


def degenerate_sets(energies, indices, tol=SET_TOL):
    """`indices` (ascending, so in energy order for aufbau occupations) cut into runs whose neighbours lie
    within `tol` of each other."""
    sets = []
    for i in indices:
        if sets and abs(energies[i] - energies[sets[-1][-1]]) < tol:
            sets[-1].append(i)
        else:
            sets.append([i])
    return sets


def rotation(axis, angle):
    a = np.asarray(axis, dtype=float) / np.linalg.norm(axis)
    k = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(angle) * k + (1 - np.cos(angle)) * k @ k


def reflection(normal):
    n = np.asarray(normal, dtype=float) / np.linalg.norm(normal)
    return np.eye(3) - 2 * np.outer(n, n)


def improper(axis, angle):
    return reflection(axis) @ rotation(axis, angle)


def is_symmetry(op, x, z, tol=OP_TOL):
    """Whether `op` carries every nucleus (rows of x, about the charge centre) onto one of the same charge."""
    moved = x @ op.T
    distance = np.linalg.norm(moved[:, None, :] - x[None, :, :], axis=2)
    distance[z[:, None] != z[None, :]] = np.inf
    return bool((distance.min(axis=1) < tol).all())


def _unit(v):
    return np.asarray(v, dtype=float) / np.linalg.norm(v)


def _distinct(vectors):
    out = []
    for v in vectors:
        if np.linalg.norm(v) < 1e-3:
            continue
        u = _unit(v)
        if all(abs(abs(u @ w) - 1) > 1e-6 for w in out):
            out.append(u)
    return out


def _principal_axis(x, z, n, extra):
    """A C_n axis: one of the charge-weighted second moment's eigenvectors (a symmetric top's unique one is
    its Cn axis) or of PySCF's own symmetry axes."""
    _, vectors = np.linalg.eigh(np.einsum('i,ij,ik->jk', z, x, x))
    for axis in _distinct(list(vectors.T) + list(extra)):
        if is_symmetry(rotation(axis, 2 * np.pi / n), x, z):
            return axis
    raise SymmetryNotFound(f'no C{n} axis')


def _in_plane(x, axis):
    """Directions perpendicular to `axis`: through each nucleus's projection, and halfway between two. The
    projections are not merged with their opposites before halving: staggered ethane's C2 axes bisect a top
    hydrogen's projection and a bottom one's, which point 60° apart, not 120°."""
    p = [_unit(v) for v in x - np.outer(x @ axis, axis) if np.linalg.norm(v) > 1e-3]
    return _distinct(p + [a + b for i, a in enumerate(p) for b in p[i + 1:]])


def _cubic_roles(group, x, z):
    """Td: its three C2 (S4) axes; Oh: its three C4 axes. Then a C3 axis, and Td's σd normal or Oh's C2'."""
    vectors = [v for v in x if np.linalg.norm(v) > 1e-3]
    pairs = [a + b for i, a in enumerate(vectors) for b in vectors[i + 1:]]
    pairs += [a - b for i, a in enumerate(vectors) for b in vectors[i + 1:]]
    found = []
    for axis in _distinct(vectors + pairs):
        op = improper(axis, np.pi / 2) if group == 'Td' else rotation(axis, np.pi / 2)
        if is_symmetry(op, x, z) and all(abs(axis @ f) < 1e-6 for f in found):
            found.append(axis)
            if len(found) == 3:
                a1, a2, a3 = found
                return {'a': a1, 'c3': _unit(a1 + a2 + a3), 'd': _unit(a1 + a2) if group == 'Oh' else _unit(a1 - a2)}
    raise SymmetryNotFound('three perpendicular S4 axes' if group == 'Td' else 'three perpendicular C4 axes')


def _roles(group, x, z, extra):
    if group in ('Td', 'Oh'):
        return _cubic_roles(group, x, z)
    axis = _principal_axis(x, z, 6 if group == 'D6h' else 3, extra)
    candidates = _in_plane(x, axis)
    plane = next((c for c in candidates if is_symmetry(reflection(np.cross(axis, c)), x, z)), None)
    if group == 'C3v':
        if plane is None:
            raise SymmetryNotFound('no vertical mirror plane')
        return {'z': axis, 'v': np.cross(axis, plane)}
    twofold = [c for c in candidates if is_symmetry(rotation(c, np.pi), x, z)]
    if not twofold:
        raise SymmetryNotFound('no C2 axis perpendicular to the principal axis')
    if group == 'D6h':
        def through(c):
            return sum(1 for v in x if np.linalg.norm(v) > 1e-3 and np.linalg.norm(np.cross(v, c)) < OP_TOL)
        p = max(twofold, key=through)                 # Herzberg: C2' passes through the most atoms
        q = rotation(axis, np.pi / 6) @ p
        return {'z': axis, 'p': p, 'q': q, 'vp': np.cross(axis, p), 'dq': np.cross(axis, q)}
    if plane is None:
        raise SymmetryNotFound('no vertical mirror plane')
    return {'z': axis, 'p': twofold[0], 'v': np.cross(axis, plane)}


def _operation(spec, roles):
    kind = spec[0]
    if kind == 'E':
        return np.eye(3)
    if kind == 'i':
        return -np.eye(3)
    if kind == 'C':
        return rotation(roles[spec[3]], 2 * np.pi * spec[2] / spec[1])
    if kind == 'S':
        return improper(roles[spec[3]], 2 * np.pi * spec[2] / spec[1])
    return reflection(roles[spec[1]])


def class_operations(group, x, z, extra_axes=()):
    """One operation per class of `group`, in TABLES order, each checked against the nuclei."""
    roles = _roles(group, x, z, list(extra_axes))
    ops = []
    for name, _, spec in TABLES[group][0]:
        op = _operation(spec, roles)
        if not is_symmetry(op, x, z):
            raise SymmetryNotFound(f'{name} is not a symmetry of this geometry')
        ops.append(op)
    return ops


def orbital_characters(mol, grids, mo, ops, centre):
    """⟨ψᵢ|R ψᵢ⟩ = ∫ ψᵢ(r) ψᵢ(R⁻¹r) dr for every column of `mo` and every operation, by the grid's
    quadrature: shape (operations, columns). A set's character is the sum over its members (a trace, so
    independent of how the set is rotated within itself); computing every kept MO's at once evaluates
    the AOs on each rotated grid once, not once per set -- most of the labelling cost (Ruling D7) -- and
    makes the characters of any split of a set free."""
    kind = 'GTOval_cart' if mol.cart else 'GTOval_sph'
    coords, weights = np.asarray(grids.coords), np.asarray(grids.weights)
    mo = np.asarray(mo)
    diagonal = np.zeros((len(ops), mo.shape[1]))
    for start in range(0, len(weights), BLOCK):
        r, w = coords[start:start + BLOCK], weights[start:start + BLOCK]
        weighted = (mol.eval_gto(kind, r) @ mo) * w[:, None]
        for k, op in enumerate(ops):
            moved = centre + (r - centre) @ op              # R⁻¹ r for an orthogonal R, as rows
            diagonal[k] += np.einsum('gi,gi->i', weighted, mol.eval_gto(kind, moved) @ mo)
    return diagonal


def characters(mol, grids, mo, ops, centre):
    """χ(R) = Σᵢ ∫ ψᵢ(r) ψᵢ(R⁻¹r) dr for the set's columns `mo`, by the grid's quadrature."""
    return orbital_characters(mol, grids, mo, ops, centre).sum(axis=1)


def _abelian(group):
    """PySCF's own character table for D2h or one of its subgroups (C1 included), in TABLES's shape: every
    class is one operation, named as PySCF names it ('C2z', 'sx': the mirror perpendicular to x …)."""
    from pyscf.symm import param
    return ([(name, 1, ('pyscf', name)) for name in param.OPERATOR_TABLE[group]],
            {row[0]: list(row[1:]) for row in param.CHARACTER_TABLE[group]})


def _table(group):
    return TABLES[group] if group in TABLES else _abelian(group)


def abelian_operations(group, axes, x, z):
    """One operation per class of D2h or a subgroup, about PySCF's axes for it (rows: x, y, z), each checked
    against the nuclei."""
    ops = []
    for name, _, (_, op) in _abelian(group)[0]:
        if op == 'E':
            matrix = np.eye(3)
        elif op == 'i':
            matrix = -np.eye(3)
        elif op.startswith('C2'):
            matrix = rotation(axes['xyz'.index(op[-1])], np.pi)
        else:
            matrix = reflection(axes['xyz'.index(op[-1])])
        if not is_symmetry(matrix, x, z):
            raise SymmetryNotFound(f'{op} is not a symmetry of this geometry')
        ops.append(matrix)
    return ops


def match_irrep(group, chi, size):
    """The irrep of `group` of dimension `size` whose every character is within CHI_TOL of `chi`, or None."""
    for name, row in _table(group)[1].items():
        if row[0] == size and np.all(np.abs(np.asarray(row, dtype=float) - chi) < CHI_TOL):
            return name
    return None


def reduce_characters(group, chi, size):
    """{irrep: multiplicity} when `chi` is the character of a sum of whole irreps of total dimension `size`
    -- every multiplicity from the reduction formula within CHI_TOL of a non-negative integer, and the
    rebuilt characters within CHI_TOL of `chi` -- else None. A set of near-degenerate orbitals that mixes
    two irreps (BF3's F 1s a1' and e') carries no single irrep, but as a whole still carries their sum."""
    classes, irreps = _table(group)
    sizes = np.array([s for _, s, _ in classes], dtype=float)
    rebuilt, counts = np.zeros(len(classes)), {}
    for name, row in irreps.items():
        row = np.asarray(row, dtype=float)
        n = float((sizes * row * chi).sum() / sizes.sum())
        m = round(n)
        if abs(n - m) >= CHI_TOL or m < 0:
            return None
        if m:
            counts[name] = m
            rebuilt += m * row
    if sum(m * irreps[name][0] for name, m in counts.items()) != size or np.any(np.abs(rebuilt - chi) >= CHI_TOL):
        return None
    return counts


def split_set(energies, members, cuts):
    """`members` (energy order) cut at their `cuts` largest internal energy gaps. Chained by SET_TOL, a set
    can hold several irreps whose orbitals lie only 1e-6 Ha apart (SF6's six F 1s combinations at
    def2-TZVPD: t1u, eg, a1g), while a true degeneracy's members agree far more closely, so the largest
    gaps fall between irreps first."""
    if cuts <= 0:
        return [list(members)]
    gaps = np.abs(np.diff([energies[i] for i in members]))
    at = sorted(np.argsort(-gaps, kind='stable')[:cuts] + 1)
    return [list(members[a:b]) for a, b in zip([0] + at, at + [len(members)])]


def _frame(mol):
    """Nuclear positions about the charge centre (bohr), the charges, and the centre."""
    coords, charges = mol.atom_coords(), mol.atom_charges().astype(float)
    centre = (charges[:, None] * coords).sum(axis=0) / charges.sum()
    return coords - centre, charges, centre


def _pyscf_axes(mol):
    axes = np.asarray(getattr(mol, '_symm_axes', np.eye(3)), dtype=float)
    return list(axes) + list(axes.T)


def _grids(mf):
    grids = getattr(mf, 'grids', None)
    if grids is None:
        from pyscf.dft import gen_grid
        grids = gen_grid.Grids(mf.mol)
        grids.level = 4
    if grids.coords is None:
        grids.build()
    return grids


def _linear_labels(group, irreps):
    """σ/π/δ/φ labels numbered per λ (and g/u) in energy order. PySCF names each component of a degenerate
    irrep (E1x/E1y, E1ux/E1uy …); each component is counted in turn, so a π (δ, φ) pair shares one number
    by its symmetry, however far apart its energies lie -- ROKS splits a partly filled shell (CH's 1π: one
    component singly occupied, one empty) by far more than SET_TOL (final review I1)."""
    from labels import irrep_to_lambda
    counts, out = {}, []
    for irrep in irreps:
        key = irrep_to_lambda(group, irrep)
        component = str(irrep)[-1] if key[0] != 'σ' and str(irrep)[-1] in 'xy' else ''
        counts[key, component] = counts.get((key, component), 0) + 1
        out.append(f'{counts[key, component]}{key[0]}{key[1]}')
    return out


ANGULAR = 'spdfghi'


def atom_labels(irreps):
    """An atom's orbitals (PySCF's SO3 irreps: s+0, p-1, p+0, p+1, d-2 …) as 1s, 2s, 2p …: each component m
    counted in turn per l, so a p (d, f) set shares one number, and the count offset by l, so it is the
    principal quantum number (the first p is 2p, the first d 3d) -- final review M1."""
    counts, out = {}, []
    for irrep in irreps:
        letter, m = str(irrep)[0], str(irrep)[1:]
        counts[letter, m] = counts.get((letter, m), 0) + 1
        out.append(f'{counts[letter, m] + ANGULAR.index(letter)}{letter}')
    return out


def _pyscf_labels(mol, mf, indices, note):
    from pyscf import symm
    irreps = list(symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, mf.mo_coeff[:, indices]))
    if mol.groupname in LINEAR:
        names = _linear_labels(mol.groupname, irreps)
    elif mol.groupname == 'SO3':
        names = atom_labels(irreps)
    else:
        names = number_labels(irreps)
    symmetry = {'pointGroup': mol.topgroup, 'labelGroup': mol.groupname, 'labels': 'subgroup' if note else 'full-group'}
    if note:
        symmetry['labelNote'] = note
    return dict(zip(indices, names)), symmetry, {}


def _pieces(group, energies, members, chi_of):
    """The labelling of one degenerate set (Ruling D1): [(piece, {irrep: multiplicity}, exact)], or None.
    The whole set first; failing that, the set cut at its 1, 2 … largest internal gaps, taking the first
    cut whose every piece matches one irrep. Failing that, the cut that labels the most orbitals exactly
    while every other piece is still a sum of whole irreps (fewest cuts on a tie): BF3's three F 1s
    combinations at def2-TZVPD mix a1' and e', so no piece of them carries one irrep, but together they
    carry a1' + e'. None when no cut does either."""
    best, best_exact = None, -1
    for cuts in range(len(members)):
        pieces, valid = [], True
        for piece in split_set(energies, members, cuts):
            chi = chi_of(piece)
            irrep = match_irrep(group, chi, len(piece))
            parts = {irrep: 1} if irrep else reduce_characters(group, chi, len(piece))
            valid = valid and parts is not None
            pieces.append((piece, parts, irrep is not None))
        if all(exact for _, _, exact in pieces):
            return pieces
        exact = sum(len(piece) for piece, _, ok in pieces if ok)
        if valid and exact > best_exact:
            best, best_exact = pieces, exact
    return best


def _split_shells(group, sets, labelled, chi_of, most=3):
    """An open shell's ROKS splits a partly filled degenerate shell (CH4+'s 1t2: two components doubly
    occupied, one singly) by far more than SET_TOL, into sets that alone carry no irrep. Sets left unlabelled
    (`labelled[k]` None) are joined, each with the nearest later ones (up to `most` sets in all), when
    together they carry one irrep of the summed dimension: ({first set: (irrep, members)}, {joined sets})."""
    from itertools import combinations
    failed = [k for k, pieces in enumerate(labelled) if pieces is None]
    shells, absorbed = {}, set()
    for n, k in enumerate(failed):
        if k in absorbed:
            continue
        later = [j for j in failed[n + 1:] if j not in absorbed]
        for size in range(1, most):
            match = None
            for partners in combinations(later, size):
                members = sets[k] + [i for j in partners for i in sets[j]]
                irrep = match_irrep(group, chi_of(members), len(members))
                if irrep:
                    match = (irrep, members, partners)
                    break
            if match:
                shells[k] = match[:2]
                absorbed.update(match[2])
                break
    return shells, absorbed


def _and(names):
    return names[0] if len(names) == 1 else f'{", ".join(names[:-1])} and {names[-1]}'


def _projected_labels(mol, mf, indices, group, ops=None):
    x, z, centre = _frame(mol)
    if ops is None:
        ops = class_operations(group, x, z, _pyscf_axes(mol))
    energies = np.asarray(mf.mo_energy, dtype=float)
    diagonal = orbital_characters(mol, _grids(mf), mf.mo_coeff[:, indices], ops, centre)
    column = {i: k for k, i in enumerate(indices)}

    def chi_of(members):
        return diagonal[:, [column[i] for i in members]].sum(axis=1)

    order = list(_table(group)[1])
    sets = degenerate_sets(energies, indices)
    labelled = [_pieces(group, energies, members, chi_of) for members in sets]
    shells, absorbed = _split_shells(group, sets, labelled, chi_of)
    counts, labels, notes = {}, {}, {}
    for k, members in enumerate(sets):
        if k in absorbed:
            continue                                  # labelled with the first part of its shell
        if k in shells:
            irrep, parts = shells[k]
            name = irrep.lower()
            counts[name] = counts.get(name, 0) + 1
            note = (f'a degenerate {name} shell split in energy by its partial occupation (an open shell): '
                    f'together these orbitals carry {name}, so they share one label')
            for i in parts:
                labels[i], notes[i] = f'{counts[name]}{name}', note
            continue
        pieces = labelled[k]
        if pieces is None:
            chi = chi_of(members)
            note = (f'characters ({", ".join(f"{c:.2f}" for c in chi)}) match no single irrep of {group}, '
                    'nor do they split into pieces that do or sum to whole irreps: an accidental degeneracy '
                    'or numerical noise, so left unlabelled')
            for i in members:
                labels[i], notes[i] = UNLABELLED, note
            continue
        for piece, parts, exact in pieces:
            names = []
            for irrep in sorted(parts, key=order.index):             # character-table order: a1' before e'
                name = irrep.lower()
                for _ in range(parts[irrep]):
                    counts[name] = counts.get(name, 0) + 1
                    names.append(f'{counts[name]}{name}')
            for i in piece:
                labels[i] = '+'.join(names)
            if not exact:
                tol = f'{SET_TOL:.0e}'.replace('e-0', 'e-')
                note = (f'near-degenerate combinations of {_and([p.lower() for p in sorted(parts, key=order.index)])} '
                        f'(ΔE < {tol} Ha), mixed in these orbitals: the label names their sum and counts each')
                for i in piece:
                    notes[i] = note
    return labels, {'pointGroup': group, 'labelGroup': group, 'labels': 'full-group'}, notes


# Why it ran without symmetry -- PySCF could not build symmetry-adapted orbitals, or the symmetric SCF did not
# converge and was rerun without it (Ruling OH-retry) -- is the run's own record (input.py's finalGeometry or
# finalScf note); the label note names neither (deferred minor, Task 9).
NO_SYMMETRY = 'the SCF ran without point-group symmetry'
GEOMETRY_NOTE = f"{NO_SYMMETRY}: labelled from the geometry's own point group, by character projection"


def geometry_operations(mol):
    """(the geometry's own point group, one operation per class for the projection) for a molecule built
    without symmetry: the group and axes PySCF's Mole.build would have found (detect_symm, as_subgroup).
    Raises SymmetryNotFound for a group the projection cannot cover without symmetry-adapted orbitals."""
    from pyscf.symm import geom
    top, _, axes = geom.detect_symm(mol._atom, mol._basis)
    sub, axes = geom.as_subgroup(top, axes)
    x, z, _ = _frame(mol)
    axes = np.asarray(axes, dtype=float)
    from pyscf.symm import param
    if top in TABLES:
        return top, class_operations(top, x, z, list(axes) + list(axes.T))
    if top == sub and top in param.OPERATOR_TABLE:  # D2h or one of its subgroups: no degenerate irreps
        return top, abelian_operations(top, axes, x, z)
    # Coov, Dooh and SO3 come back from as_subgroup unchanged (fix round 1): linear molecules have their own
    # path (linear_components), atoms none.
    raise SymmetryNotFound(f'{top} orbitals cannot be labelled without it')


# A linear molecule's MOs, without PySCF's symmetry: a real orbital with angular momentum m about the axis has
# <psi|C(theta) psi> = cos(m theta) under a rotation by theta, whichever real combination of its pair it is.
# Two rotations, C5 and C7, tell sigma, pi, delta and phi apart (under C5 alone delta and phi coincide:
# cos 144° = cos 216°); inversion gives g/u in D∞h.
LINEAR_ROTATIONS = (5, 7)
LAMBDAS = ('σ', 'π', 'δ', 'φ')


def _linear_axis(mol):
    x, z, centre = _frame(mol)
    _, _, vectors = np.linalg.svd(x)
    return vectors[0], centre


def linear_components(mol, mf, coeff, group):
    """For each column of `coeff`, its (λ, 'g'/'u'/'') as a (σ, '')-style key, or None when its characters
    are no single component's (an accidental degeneracy mixing two, or numerical trouble)."""
    axis, centre = _linear_axis(mol)
    ops = [rotation(axis, 2 * np.pi / n) for n in LINEAR_ROTATIONS]
    if group == 'Dooh':
        ops.append(-np.eye(3))
    diagonal = orbital_characters(mol, _grids(mf), coeff, ops, centre)
    keys = []
    for chi in diagonal.T:
        rotations = chi[:len(LINEAR_ROTATIONS)]
        m = next((m for m in range(len(LAMBDAS))
                  if np.all(np.abs(rotations - [np.cos(2 * np.pi * m / n) for n in LINEAR_ROTATIONS]) < CHI_TOL)),
                 None)
        parity = ''
        if group == 'Dooh':
            parity = 'g' if abs(chi[-1] - 1) < CHI_TOL else 'u' if abs(chi[-1] + 1) < CHI_TOL else None
        keys.append(None if m is None or parity is None else (LAMBDAS[m], parity))
    return keys


def _linear_geometry_labels(mol, mf, indices, group):
    """σ/π/δ labels numbered per irrep in energy order, as textbooks (and the symmetry path) number them. A π
    (δ, φ) shell has two components, counted in turn, so a pair shares its number even when an open shell's
    ROKS splits it (OH's 1π: one component doubly occupied, one singly)."""
    keys = linear_components(mol, mf, np.asarray(mf.mo_coeff)[:, indices], group)
    counts, labels, notes = {}, {}, {}
    for i, key in zip(indices, keys):
        if key is None:
            labels[i] = UNLABELLED
            notes[i] = (f'characters match no σ, π, δ or φ orbital of {group}: an accidental degeneracy mixing two, '
                        'or numerical noise, so left unlabelled')
            continue
        counts[key] = counts.get(key, 0) + 1
        number = counts[key] if key[0] == 'σ' else (counts[key] + 1) // 2
        labels[i] = f'{number}{key[0]}{key[1]}'
    return labels, {'pointGroup': group, 'labelGroup': group, 'labels': 'full-group', 'labelNote': GEOMETRY_NOTE}, notes


def _detected_group(mol):
    from pyscf.symm import geom
    return geom.detect_symm(mol._atom, mol._basis)[0]


def _geometry_labels(mol, mf, indices):
    top = _detected_group(mol)
    if top in LINEAR:
        return _linear_geometry_labels(mol, mf, indices, top)
    try:
        group, ops = geometry_operations(mol)
    except SymmetryNotFound as e:
        return ({i: f'ψ{i + 1}' for i in indices},
                {'pointGroup': top, 'labelGroup': None, 'labels': 'none', 'labelNote': f'{NO_SYMMETRY}, and {e}'}, {})
    labels, symmetry, notes = _projected_labels(mol, mf, indices, group, ops)
    return labels, {**symmetry, 'labelNote': GEOMETRY_NOTE}, notes


def label_orbitals(mol, mf, indices):
    """(labels by MO index, meta.json's `symmetry`, notes by MO index) for the MOs `indices` -- every
    occupied one and a run of virtuals from the LUMO, so numbering starts at the core."""
    indices = list(indices)
    if not mol.symmetry:
        return _geometry_labels(mol, mf, indices)
    top, sub = mol.topgroup, mol.groupname
    if top in TABLES:
        try:
            return _projected_labels(mol, mf, indices, top)
        except SymmetryNotFound as e:
            return _pyscf_labels(mol, mf, indices, f'irreducible representations of {sub}, a subgroup of {top}: '
                                                   f'the {top} symmetry operations were not found at this geometry ({e})')
    if top == sub:
        return _pyscf_labels(mol, mf, indices, None)
    return _pyscf_labels(mol, mf, indices, f'irreducible representations of {sub}, a subgroup of {top}: '
                                           f'full-group labels are not available for {top}')


def irrep_of(mol, mf, coeff):
    """The irrep, lower case and unnumbered, of one set of orthonormal orbitals (the columns of `coeff`) in
    the group label_orbitals would use; UNLABELLED if they do not carry a single one."""
    if not mol.symmetry:
        top = _detected_group(mol)
        if top in LINEAR:
            keys = set(linear_components(mol, mf, coeff, top))
            key = keys.pop() if len(keys) == 1 else None
            return f'{key[0]}{key[1]}' if key else UNLABELLED
        try:
            group, ops = geometry_operations(mol)
        except SymmetryNotFound:
            return UNLABELLED
        irrep = match_irrep(group, characters(mol, _grids(mf), coeff, ops, _frame(mol)[2]), coeff.shape[1])
        return irrep.lower() if irrep else UNLABELLED
    if mol.topgroup in TABLES:
        try:
            x, z, centre = _frame(mol)
            ops = class_operations(mol.topgroup, x, z, _pyscf_axes(mol))
            irrep = match_irrep(mol.topgroup, characters(mol, _grids(mf), coeff, ops, centre), coeff.shape[1])
            return irrep.lower() if irrep else UNLABELLED
        except SymmetryNotFound:
            pass
    from pyscf import symm
    try:
        names = set(symm.label_orb_symm(mol, mol.irrep_name, mol.symm_orb, coeff))
    except ValueError:                                # orbitals mixed across irreps
        return UNLABELLED
    if mol.groupname in LINEAR:
        from labels import irrep_to_lambda
        names = {''.join(irrep_to_lambda(mol.groupname, n)) for n in names}
    elif mol.groupname == 'SO3':
        names = {str(n)[0] for n in names}           # an atom's p set: p-1, p+0, p+1
    return names.pop().lower() if len(names) == 1 else UNLABELLED
