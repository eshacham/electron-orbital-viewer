/**
 * Spectroscopic names for the real orbitals.
 *
 * The viewer otherwise shows only the three numbers you picked, which means you
 * have to already know what (3, 2, 0) looks like to notice when it looks wrong.
 *
 * The subscripts follow the real spherical harmonics this app draws, so they
 * depend on the sign convention in `realSphericalHarmonic`: positive ml takes
 * cos(ml*phi) and negative ml takes sin(|ml|*phi). That makes ml=+1 the one
 * along x and ml=-1 the one along y, and so on down the table.
 */

const SHELL_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h', 'i', 'k', 'l'];

/** Subscripts by l, indexed by ml + l. Only s through f are conventionally named. */
const SUBSCRIPTS: Record<number, string[]> = {
    0: [''],
    1: ['y', 'z', 'x'],
    2: ['xy', 'yz', 'z²', 'xz', 'x²−y²'],
    3: ['y(3x²−y²)', 'xyz', 'yz²', 'z³', 'xz²', 'z(x²−y²)', 'x(x²−3y²)'],
};

/** The letter for an angular momentum: s, p, d, f, g, h, i, k, l. */
export function shellLetter(l: number): string {
    return SHELL_LETTERS[l] ?? `l=${l}`;
}

/**
 * e.g. (3, 2, 0) -> "3d_z²", (2, 1, 1) -> "2p_x".
 *
 * Past f the subscript names are not in common use, so those get the magnetic
 * quantum number instead of an invented label: (7, 4, 2) -> "7g (mₗ = +2)".
 */
export function orbitalName(n: number, l: number, ml: number): string {
    const shell = `${n}${shellLetter(l)}`;

    const subscripts = SUBSCRIPTS[l];
    if (!subscripts) {
        const sign = ml > 0 ? '+' : '';
        return `${shell} (mₗ = ${sign}${ml})`;
    }

    const subscript = subscripts[ml + l];
    return subscript ? `${shell}_${subscript}` : shell;
}
