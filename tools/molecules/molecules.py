"""The diatomics Bonds mode ships, the geometry each scan is centred on, and
the published value each is checked against."""
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BOHR_TO_ANGSTROM = 0.529177210903
ANGSTROM_TO_BOHR = 1 / BOHR_TO_ANGSTROM
HARTREE_TO_EV = 27.211386245988

# Dense near the minimum (R_e is fitted there), sparse out towards dissociation.
SCAN_FACTORS = (0.80, 0.85, 0.88, 0.91, 0.94, 0.96, 0.98, 1.00, 1.02, 1.04,
                1.06, 1.09, 1.12, 1.16, 1.22, 1.30, 1.45, 1.65, 1.95, 2.40)
EQUILIBRIUM_INDEX = SCAN_FACTORS.index(1.00)

HUBER_HERZBERG = 'Huber & Herzberg, Constants of Diatomic Molecules (1979), via NIST Chemistry WebBook'


@dataclass(frozen=True)
class Diatomic:
    id: str
    name: str
    formula: str
    elements: tuple[str, str]   # first at z = -R/2, second at +R/2
    spin: int                   # 2S, PySCF's convention
    r_ref_angstrom: float       # scan centre: experimental R_e where one exists
    energy_method: str          # 'fci' or 'ccsd(t)'
    reference_re_angstrom: float | None   # asserted within 1 %; None = not asserted
    reference_source: str | None          # None = no published value is asserted
    note: str | None = None


# Be₂ (ruling C4): the spec/plan read as "the period-2 series, Li₂ … F₂", which
# would include it, but it is omitted here. Be₂ is weakly bound (~4 mHa, bond
# order 0 in the simple MO picture -- its 2 extra valence electrons fill the
# antibonding 2σu* that cancels 2σg) and so would need its own caption and
# validation row rather than reusing the bond-order-N captions the rest of
# this table shares. Deferred to a future data version; see HANDOFF.
DIATOMICS = (
    Diatomic('h2', 'Hydrogen', 'H₂', ('H', 'H'), 0, 0.7414, 'fci', 0.7414, HUBER_HERZBERG),
    Diatomic('he2', 'Helium dimer', 'He₂', ('He', 'He'), 0, 1.5875, 'fci', None, None,
             'No chemical bond: bond order 0. The full-CI curve has only a van der Waals well of a few hundredths of a mHa, '
             'invisible at this scale; no counterpoise correction is applied, and basis-set superposition error is of '
             'the same order as that well.'),
    Diatomic('li2', 'Lithium', 'Li₂', ('Li', 'Li'), 0, 2.6729, 'ccsd(t)', None, HUBER_HERZBERG,
             'Both 1s shells are frozen, so CCSD(T) correlates only the two valence electrons, where it is exact '
             '(full CI): the whole curve is kept.'),
    Diatomic('b2', 'Boron', 'B₂', ('B', 'B'), 2, 1.5900, 'ccsd(t)', None, HUBER_HERZBERG,
             'Ground state is the triplet ³Σg⁻: two unpaired electrons in 1πu.'),
    Diatomic('c2', 'Carbon', 'C₂', ('C', 'C'), 0, 1.2425, 'ccsd(t)', None, HUBER_HERZBERG,
             'C₂ has strong multi-reference character; single-reference CCSD(T) and B3LYP are approximate here.'),
    Diatomic('n2', 'Nitrogen', 'N₂', ('N', 'N'), 0, 1.0977, 'ccsd(t)', 1.098, HUBER_HERZBERG),
    Diatomic('o2', 'Oxygen', 'O₂', ('O', 'O'), 2, 1.2075, 'ccsd(t)', 1.207, HUBER_HERZBERG,
             'Ground state is the triplet ³Σg⁻: two unpaired electrons in 1πg*.'),
    Diatomic('f2', 'Fluorine', 'F₂', ('F', 'F'), 0, 1.4119, 'ccsd(t)', 1.412, HUBER_HERZBERG),
    Diatomic('co', 'Carbon monoxide', 'CO', ('C', 'O'), 0, 1.1283, 'ccsd(t)', 1.128, HUBER_HERZBERG),
    Diatomic('hf', 'Hydrogen fluoride', 'HF', ('H', 'F'), 0, 0.9168, 'ccsd(t)', 0.917, HUBER_HERZBERG),
)

# Occupations pinned per D∞h irrep (alpha, beta), so SCF cannot settle into
# another state: B₂ 1πu², C₂ 1πu⁴ (not 3σg²), O₂ 1πg².
IRREP_NELEC_DOOH = {
    'b2': {'A1g': (2, 2), 'A1u': (2, 2), 'E1ux': (1, 0), 'E1uy': (1, 0)},
    'c2': {'A1g': (2, 2), 'A1u': (2, 2), 'E1ux': (1, 1), 'E1uy': (1, 1)},
    'o2': {'A1g': (3, 3), 'A1u': (2, 2), 'E1ux': (1, 1), 'E1uy': (1, 1), 'E1gx': (1, 0), 'E1gy': (1, 0)},
}
DOOH_TO_D2H = {'A1g': 'Ag', 'A1u': 'B1u', 'E1ux': 'B3u', 'E1uy': 'B2u', 'E1gx': 'B2g', 'E1gy': 'B3g'}

# Free-atom ground states (2S, term) for D_e = E(A) + E(B) - E(AB, R_e) at the
# molecule's own method and basis (ruling T4-a).
ATOM_GROUND_STATES = {'H': (1, '²S'), 'He': (0, '¹S'), 'Li': (1, '²S'), 'B': (1, '²P'),
                      'C': (2, '³P'), 'N': (3, '⁴S'), 'O': (2, '³P'), 'F': (1, '²P')}
