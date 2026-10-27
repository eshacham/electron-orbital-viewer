/**
 * Typography helpers: scientific notation, a true minus sign, typed point
 * groups and orbital name splitting for a <sub> element. Tasks 5-7 move text
 * that uses these into the Info section; this module only creates the
 * helpers themselves.
 */

import { orbitalName } from '../orbital_names';
import { formatPointGroup } from '../molecules/orbital_display';

const SUPERSCRIPT_CHARS: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** An integer exponent as superscript digits with a true minus, e.g. -2 -> "⁻²". The shared
 * logic behind formatSci's "× 10ⁿ" and stark.ts's formatVoltsPerMetre. */
export function toSuperscript(exponent: number): string {
    return String(exponent).split('').map(c => SUPERSCRIPT_CHARS[c] ?? c).join('');
}

/** Hyphen-minus immediately before a digit becomes U+2212, e.g. "-5" -> "−5". For strings
 * already built with toFixed()/toString(), which only ever produce the ASCII hyphen. */
export function minus(s: string): string {
    return s.replace(/-(?=\d)/g, '−');
}

/**
 * `x` to `digits` significant figures (3 by default): plain decimal notation while that stays
 * readable (0.1 <= |x| < 10**digits), "m × 10ⁿ" outside that range. Always a true minus, in the
 * mantissa and in the exponent.
 *
 * 0.0266 -> "2.66 × 10⁻²", 5.52 -> "5.52".
 */
export function formatSci(x: number, digits = 3): string {
    if (x === 0) return '0';
    const sign = x < 0 ? '−' : '';
    const ax = Math.abs(x);
    const [mantissaStr, expStr] = ax.toExponential(digits - 1).split('e');
    const exponent = Number(expStr);

    if (exponent >= -1 && exponent < digits) return `${sign}${ax.toPrecision(digits)}`;
    return `${sign}${mantissaStr} × 10${toSuperscript(exponent)}`;
}

const SUBSCRIPT_DIGITS: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};
/** Unicode's subscript Latin letters cover only a, e, h, i, j, k, l, m, n, o, p, r, s, t, u, v, x — enough
 * for the point-group suffixes actually in use (v, h, s, i). A suffix letter with no subscript glyph (e.g.
 * the "d" in D2d) passes through unchanged rather than being dropped. */
const SUBSCRIPT_LETTERS: Record<string, string> = { v: 'ᵥ', h: 'ₕ', s: 'ₛ', i: 'ᵢ' };

/**
 * A point group's order and suffix as subscript, e.g. C2v -> C₂ᵥ, D6h -> D₆ₕ, Cs -> Cₛ. Reuses
 * formatPointGroup for the Dooh/Coov -> D∞h/C∞v spelling first; ∞ has no subscript glyph, so the
 * infinite groups come back unchanged (D∞h, not D∞ₕ).
 */
export function typedPointGroup(pg: string): string {
    const normalized = formatPointGroup(pg);
    if (normalized.includes('∞')) return normalized;

    const main = normalized.slice(0, 1);
    const rest = normalized.slice(1);
    const typed = [...rest].map(c => SUBSCRIPT_DIGITS[c] ?? SUBSCRIPT_LETTERS[c] ?? c).join('');
    return `${main}${typed}`;
}

/**
 * Splits today's `orbitalName` at its "_" separator into a plain base and a subscript, for
 * `<OrbitalLabel>` to render as `{base}<sub>{sub}</sub>`. Past f, orbitalName has no separator
 * (e.g. "7g (mₗ = +2)") since those subscripts are not conventional; sub is null there, and for
 * s orbitals, which have no subscript at all.
 */
export function orbitalParts(n: number, l: number, ml: number): { base: string; sub: string | null } {
    const name = orbitalName(n, l, ml);
    const sep = name.indexOf('_');
    if (sep === -1) return { base: name, sub: null };
    return { base: name.slice(0, sep), sub: name.slice(sep + 1) };
}
