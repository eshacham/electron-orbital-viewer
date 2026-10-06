from jobs.errors import JobRefused

# H–Kr: heavier elements need effective core potentials, whose core the
# renderer's all-electron density cannot represent (spec §5.1).
SYMBOLS = ('H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
           'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr')
_BY_SYMBOL = {s.lower(): i + 1 for i, s in enumerate(SYMBOLS)}
# Rb onwards, so a real element beyond the range is named as such rather than "unknown".
_BEYOND = {'rb', 'sr', 'y', 'zr', 'nb', 'mo', 'tc', 'ru', 'rh', 'pd', 'ag', 'cd', 'in', 'sn', 'sb', 'te', 'i', 'xe',
           'cs', 'ba', 'la', 'ce', 'pr', 'nd', 'pm', 'sm', 'eu', 'gd', 'tb', 'dy', 'ho', 'er', 'tm', 'yb', 'lu',
           'hf', 'ta', 'w', 're', 'os', 'ir', 'pt', 'au', 'hg', 'tl', 'pb', 'bi', 'po', 'at', 'rn', 'fr', 'ra',
           'ac', 'th', 'pa', 'u', 'np', 'pu', 'am', 'cm', 'bk', 'cf', 'es', 'fm', 'md', 'no', 'lr', 'rf', 'db',
           'sg', 'bh', 'hs', 'mt', 'ds', 'rg', 'cn', 'nh', 'fl', 'mc', 'lv', 'ts', 'og'}


def _out_of_range(name):
    return JobRefused('element-out-of-range',
                      f'{name} is beyond krypton; this phase computes H–Kr only (heavier elements need effective '
                      'core potentials, which the renderer cannot show)')


def atomic_number(token: str) -> int:
    t = token.strip()
    if t.isdigit():
        z = int(t)
        if 1 <= z <= 36:
            return z
        if 37 <= z <= 118:
            raise _out_of_range(f'Element {z}')
        raise JobRefused('invalid-geometry', f'{t} is not an atomic number')
    if t.lower() in _BY_SYMBOL:
        return _BY_SYMBOL[t.lower()]
    if t.lower() in _BEYOND:
        raise _out_of_range(t.capitalize())
    raise JobRefused('invalid-geometry', f'"{t}" is not an element symbol')
