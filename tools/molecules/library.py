"""
The molecule library of spec Phase 6: what ships, where each geometry comes
from, and what each is checked against (spec §3.1-3.2).

A molecule whose experimental structure symmetry pins down in a few
parameters is built here from CCCBDB's values, exactly. The seven that need
many parameters, or whose gas-phase conformer is the point, are optimised at
the density's own level of theory (optimise.py) and say so. Lengths Å, angles
degrees; Reference.atoms index the order written here, which PySCF keeps.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

CATEGORIES = ('first-examples', 'hybridisation', 'polarity', 'aromatic', 'biomolecule-fragments')
EXPERIMENT = 'experiment (CCCBDB)'
OPTIMISED = 'B3LYP/def2-TZVP optimised (PySCF + geomeTRIC)'
CRC = 'CRC Handbook, via CCCBDB'
PLAUSIBLE = 'experiment (CCCBDB); plausibility check of the optimised geometry'
# Ruling T7-O3: ozone ships as a documented known exception rather than a
# hidden failure (spec §3.5) -- its dipole misses tolerance at the owner's
# chosen property method (B3LYP/def2-TZVPD) for a real physical reason, not
# a bug.
OZONE_MULTIREFERENCE_CAVEAT = ('Ozone has strong multireference character: single-reference B3LYP '
                                'overestimates its dipole moment.')

Atom = tuple[str, tuple[float, float, float]]


@dataclass(frozen=True)
class Reference:
    quantity: str          # 'dipole' | 'bond' | 'angle' | 'dihedral'
    value: float
    unit: str              # 'D' | 'Å' | 'deg'
    source: str
    tolerance: float       # absolute, in `unit`
    atoms: tuple[int, ...] = ()
    label: str = ''
    # A documented, owner-accepted exception (ruling T7-O3): non-empty only
    # for a reference the method is known to miss. The validation row (and
    # the app's readout) show this instead of hiding the miss (spec §3.5).
    known_miss: str = ''


@dataclass(frozen=True)
class LibraryMolecule:
    id: str
    name: str
    formula: str
    category: str
    tags: tuple[str, ...]
    geometry_source: str
    atoms: tuple[Atom, ...] = ()
    zmatrix: str = ''
    spin: int = 0
    references: tuple[Reference, ...] = ()
    # Shown by the app's readout (Task 14) alongside a known-miss reference;
    # same text as that reference's known_miss, since the two are the same
    # documented exception (ruling T7-O3).
    caveat: str = ''

    @property
    def optimised(self) -> bool:
        return self.geometry_source == OPTIMISED


def dipole(value, source=CRC, known_miss=''):
    # Spec §3.2 says, verbatim, "dipoles within 10 % of experiment"; we floor
    # that tolerance at 0.05 D (D28 — a deliberate, documented deviation),
    # because below 0.5 D a strict 10 % band is tighter than B3LYP/def2-TZVPD
    # basis-set noise, which would fail small, correctly-computed dipoles.
    return Reference('dipole', value, 'D', source, max(0.1 * abs(value), 0.05), known_miss=known_miss)


def zero_dipole():
    return Reference('dipole', 0.0, 'D', 'zero by symmetry', 0.01)


def bond(a, b, value, label, source=EXPERIMENT, tolerance=0.01):
    return Reference('bond', value, 'Å', source, tolerance, (a, b), label)


def angle(a, v, b, value, label, source=EXPERIMENT, tolerance=1.0):
    return Reference('angle', value, 'deg', source, tolerance, (a, v, b), label)


def plausible(a, b, value, label):
    return bond(a, b, value, label, PLAUSIBLE, 0.03)


def conformer(a, b, c, d, value, label):
    return Reference('dihedral', value, 'deg', 'conformer check', 15.0, (a, b, c, d), label)


def _p(x, y, z):
    return (float(x), float(y), float(z))


def bent(x, y, r, apex):
    h = math.radians(apex) / 2
    return ((x, _p(0, 0, 0)), (y, _p(0, r * math.sin(h), r * math.cos(h))), (y, _p(0, -r * math.sin(h), r * math.cos(h))))


def pyramidal(x, y, r, apex):
    # Three ligands at polar angle t from -z: cos(apex) = (3 cos²t - 1) / 2.
    cos_t = math.sqrt((2 * math.cos(math.radians(apex)) + 1) / 3)
    sin_t = math.sqrt(1 - cos_t ** 2)
    ligands = tuple((y, _p(r * sin_t * math.cos(2 * math.pi * k / 3), r * sin_t * math.sin(2 * math.pi * k / 3), -r * cos_t))
                    for k in range(3))
    return ((x, _p(0, 0, 0)),) + ligands


def tetrahedral(x, y, r):
    s = r / math.sqrt(3.0)
    return ((x, _p(0, 0, 0)),) + tuple((y, _p(s * a, s * b, s * c)) for a, b, c in ((1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)))


def trigonal_planar(x, y, r):
    return ((x, _p(0, 0, 0)),) + tuple(
        (y, _p(r * math.cos(math.radians(120 * k)), r * math.sin(math.radians(120 * k)), 0)) for k in range(3))


def octahedral(x, y, r):
    return ((x, _p(0, 0, 0)),) + tuple((y, _p(*v)) for v in ((r, 0, 0), (-r, 0, 0), (0, r, 0), (0, -r, 0), (0, 0, r), (0, 0, -r)))


def linear(chain):
    return tuple((symbol, _p(0, 0, z)) for symbol, z in chain)


def ethylene(rcc, rch, hch):
    phi, z = math.radians(hch) / 2, rcc / 2
    atoms = [('C', _p(0, 0, z)), ('C', _p(0, 0, -z))]
    for sign in (1, -1):
        for side in (1, -1):
            atoms.append(('H', _p(0, side * rch * math.sin(phi), sign * (z + rch * math.cos(phi)))))
    return tuple(atoms)


def ethane(rcc, rch, hcc):
    t, z = math.radians(180.0 - hcc), rcc / 2
    atoms = [('C', _p(0, 0, z)), ('C', _p(0, 0, -z))]
    for sign, offset in ((1, 0.0), (-1, 60.0)):   # staggered
        for k in range(3):
            phi = math.radians(offset + 120.0 * k)
            atoms.append(('H', _p(rch * math.sin(t) * math.cos(phi), rch * math.sin(t) * math.sin(phi), sign * (z + rch * math.cos(t)))))
    return tuple(atoms)


def formaldehyde(rco, rch, hch):
    h = math.radians(hch) / 2
    return (('C', _p(0, 0, 0)), ('O', _p(0, 0, rco)),
            ('H', _p(0, rch * math.sin(h), -rch * math.cos(h))), ('H', _p(0, -rch * math.sin(h), -rch * math.cos(h))))


def aromatic_ring(ring, rcc, rch):
    """A regular hexagon in the xy plane (side = circumradius); a ring N carries no H."""
    atoms = [(s, _p(rcc * math.cos(math.radians(60 * k)), rcc * math.sin(math.radians(60 * k)), 0)) for k, s in enumerate(ring)]
    atoms += [('H', _p((rcc + rch) * math.cos(math.radians(60 * k)), (rcc + rch) * math.sin(math.radians(60 * k)), 0))
              for k, s in enumerate(ring) if s == 'C']
    return tuple(atoms)


METHANOL = """C
O 1 1.427
H 2 0.956 1 108.9
H 1 1.093 2 106.3 3 180.0
H 1 1.093 2 112.0 3 61.8
H 1 1.093 2 112.0 3 -61.8"""
FORMIC_ACID = """C
O 1 1.202
O 1 1.343 2 124.9
H 3 0.972 1 106.3 2 0.0
H 1 1.097 2 124.1 3 180.0"""
FORMAMIDE = """C
O 1 1.212
N 1 1.368 2 124.7
H 1 1.098 2 122.5 3 180.0
H 3 1.002 1 119.0 2 0.0
H 3 1.002 1 121.0 2 180.0"""
GLYCINE = """N
C 1 1.467
C 2 1.526 1 112.1
O 3 1.205 2 125.1 1 0.0
O 3 1.355 2 111.6 1 180.0
H 5 0.967 3 106.5 2 180.0
H 2 1.093 3 107.4 1 121.9
H 2 1.093 3 107.4 1 -121.9
H 1 1.013 2 110.2 3 57.9
H 1 1.013 2 110.2 3 -57.9"""
ETHANOL = """C
C 1 1.512
O 2 1.431 1 107.8
H 3 0.960 2 108.5 1 180.0
H 2 1.098 3 110.0 1 120.0
H 2 1.098 3 110.0 1 -120.0
H 1 1.093 2 110.5 3 180.0
H 1 1.093 2 110.5 3 60.0
H 1 1.093 2 110.5 3 -60.0"""
ACETONE = """C
O 1 1.213
C 1 1.520 2 121.7
C 1 1.520 2 121.7 3 180.0
H 3 1.090 1 110.0 2 0.0
H 3 1.090 1 110.0 2 120.0
H 3 1.090 1 110.0 2 -120.0
H 4 1.090 1 110.0 2 0.0
H 4 1.090 1 110.0 2 120.0
H 4 1.090 1 110.0 2 -120.0"""

M, E, O = LibraryMolecule, EXPERIMENT, OPTIMISED

LIBRARY: tuple[LibraryMolecule, ...] = (
    M('h2o', 'Water', 'H2O', 'first-examples', ('polarity', 'hybridisation'), E, bent('O', 'H', 0.958, 104.5),
      references=(bond(0, 1, 0.958, 'O–H'), angle(1, 0, 2, 104.5, 'H–O–H'), dipole(1.855))),
    M('nh3', 'Ammonia', 'NH3', 'first-examples', ('polarity', 'hybridisation'), E, pyramidal('N', 'H', 1.012, 106.7),
      references=(bond(0, 1, 1.012, 'N–H'), angle(1, 0, 2, 106.7, 'H–N–H'), dipole(1.471))),
    M('ch4', 'Methane', 'CH4', 'first-examples', ('hybridisation',), E, tetrahedral('C', 'H', 1.087),
      references=(bond(0, 1, 1.087, 'C–H'), angle(1, 0, 2, 109.47122, 'H–C–H'), zero_dipole())),
    M('co2', 'Carbon dioxide', 'CO2', 'first-examples', ('polarity',), E, linear((('C', 0.0), ('O', -1.160), ('O', 1.160))),
      references=(bond(0, 1, 1.160, 'C=O'), angle(1, 0, 2, 180.0, 'O=C=O'), zero_dipole())),
    M('c2h2', 'Acetylene', 'C2H2', 'hybridisation', ('sp',), E,
      linear((('C', -0.6015), ('C', 0.6015), ('H', -1.6645), ('H', 1.6645))),
      references=(bond(0, 1, 1.203, 'C≡C'), bond(0, 2, 1.063, 'C–H'), zero_dipole())),
    M('c2h4', 'Ethylene', 'C2H4', 'hybridisation', ('sp2',), E, ethylene(1.339, 1.087, 117.4),
      references=(bond(0, 1, 1.339, 'C=C'), bond(0, 2, 1.087, 'C–H'), angle(2, 0, 3, 117.4, 'H–C–H'), zero_dipole())),
    M('c2h6', 'Ethane', 'C2H6', 'hybridisation', ('sp3',), E, ethane(1.535, 1.094, 111.2),
      references=(bond(0, 1, 1.535, 'C–C'), bond(0, 2, 1.094, 'C–H'), angle(2, 0, 1, 111.2, 'H–C–C'), zero_dipole())),
    M('hcn', 'Hydrogen cyanide', 'HCN', 'hybridisation', ('polarity', 'sp'), E, linear((('H', -1.065), ('C', 0.0), ('N', 1.153))),
      references=(bond(0, 1, 1.065, 'H–C'), bond(1, 2, 1.153, 'C≡N'), dipole(2.985))),
    M('h2co', 'Formaldehyde', 'H2CO', 'hybridisation', ('polarity', 'sp2'), E, formaldehyde(1.205, 1.111, 116.1),
      references=(bond(0, 1, 1.205, 'C=O'), bond(0, 2, 1.111, 'C–H'), angle(2, 0, 3, 116.1, 'H–C–H'), dipole(2.332))),
    M('bf3', 'Boron trifluoride', 'BF3', 'hybridisation', ('polarity', 'sp2'), E, trigonal_planar('B', 'F', 1.307),
      references=(bond(0, 1, 1.307, 'B–F'), angle(1, 0, 2, 120.0, 'F–B–F'), zero_dipole())),
    M('sih4', 'Silane', 'SiH4', 'hybridisation', ('first-examples',), E, tetrahedral('Si', 'H', 1.480),
      references=(bond(0, 1, 1.480, 'Si–H'), zero_dipole())),
    M('sf6', 'Sulfur hexafluoride', 'SF6', 'polarity', ('hybridisation',), E, octahedral('S', 'F', 1.561),
      references=(bond(0, 1, 1.561, 'S–F'), angle(1, 0, 3, 90.0, 'F–S–F'), zero_dipole())),
    M('o3', 'Ozone', 'O3', 'polarity', ('first-examples',), E, bent('O', 'O', 1.278, 116.8),
      references=(bond(0, 1, 1.278, 'O–O'), angle(1, 0, 2, 116.8, 'O–O–O'),
                   dipole(0.53, known_miss=OZONE_MULTIREFERENCE_CAVEAT)),
      caveat=OZONE_MULTIREFERENCE_CAVEAT),
    M('no2', 'Nitrogen dioxide', 'NO2', 'polarity', ('radical',), E, bent('N', 'O', 1.194, 133.9), spin=1,
      references=(bond(0, 1, 1.194, 'N–O'), angle(1, 0, 2, 133.9, 'O–N–O'), dipole(0.316))),
    M('so2', 'Sulfur dioxide', 'SO2', 'polarity', (), E, bent('S', 'O', 1.431, 119.3),
      references=(bond(0, 1, 1.431, 'S–O'), angle(1, 0, 2, 119.3, 'O–S–O'), dipole(1.633))),
    M('ph3', 'Phosphine', 'PH3', 'polarity', ('hybridisation',), E, pyramidal('P', 'H', 1.420, 93.3),
      references=(bond(0, 1, 1.420, 'P–H'), angle(1, 0, 2, 93.3, 'H–P–H'), dipole(0.574))),
    M('h2s', 'Hydrogen sulfide', 'H2S', 'polarity', ('hybridisation',), E, bent('S', 'H', 1.336, 92.1),
      references=(bond(0, 1, 1.336, 'S–H'), angle(1, 0, 2, 92.1, 'H–S–H'), dipole(0.97))),
    M('benzene', 'Benzene', 'C6H6', 'aromatic', (), E, aromatic_ring(('C',) * 6, 1.397, 1.084),
      references=(bond(0, 1, 1.397, 'C–C'), bond(0, 6, 1.084, 'C–H'), zero_dipole())),
    M('ch3oh', 'Methanol', 'CH3OH', 'polarity', ('biomolecule-fragments', 'hybridisation'), O, zmatrix=METHANOL,
      references=(plausible(0, 1, 1.427, 'C–O'), plausible(1, 2, 0.956, 'O–H'), dipole(1.70))),
    M('hcooh', 'Formic acid', 'HCOOH', 'polarity', ('biomolecule-fragments',), O, zmatrix=FORMIC_ACID,
      references=(plausible(0, 1, 1.202, 'C=O'), plausible(0, 2, 1.343, 'C–O'),
                  conformer(3, 2, 0, 1, 0.0, 'H–O–C=O (Z)'), dipole(1.425))),
    M('ethanol', 'Ethanol', 'C2H5OH', 'polarity', ('biomolecule-fragments',), O, zmatrix=ETHANOL,
      references=(plausible(0, 1, 1.512, 'C–C'), plausible(1, 2, 1.431, 'C–O'),
                  conformer(3, 2, 1, 0, 180.0, 'H–O–C–C (anti)'), dipole(1.44, 'microwave, anti conformer'))),
    M('acetone', 'Acetone', '(CH3)2CO', 'polarity', ('biomolecule-fragments',), O, zmatrix=ACETONE,
      references=(plausible(0, 1, 1.213, 'C=O'), plausible(0, 2, 1.520, 'C–C'), dipole(2.88))),
    M('pyridine', 'Pyridine', 'C5H5N', 'aromatic', ('polarity',), O, aromatic_ring(('N', 'C', 'C', 'C', 'C', 'C'), 1.39, 1.08),
      references=(plausible(0, 1, 1.338, 'N–C2'), plausible(1, 2, 1.394, 'C2–C3'), dipole(2.215))),
    M('formamide', 'Formamide', 'HCONH2', 'biomolecule-fragments', ('polarity',), O, zmatrix=FORMAMIDE,
      references=(plausible(0, 1, 1.212, 'C=O'), plausible(0, 2, 1.368, 'C–N'), dipole(3.73))),
    M('glycine', 'Glycine', 'NH2CH2COOH', 'biomolecule-fragments', (), O, zmatrix=GLYCINE,
      references=(plausible(0, 1, 1.467, 'C–N'), plausible(1, 2, 1.526, 'C–C'), plausible(2, 3, 1.205, 'C=O'),
                  conformer(0, 1, 2, 3, 0.0, 'N–C–C=O (conformer I)'),
                  dipole(1.1, 'microwave, conformer I (Lovas et al. 1995)'))),
)


def by_id(molecule_id: str) -> LibraryMolecule:
    for molecule in LIBRARY:
        if molecule.id == molecule_id:
            return molecule
    raise KeyError(f'{molecule_id} is not in the molecule library')
