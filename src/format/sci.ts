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

/** Hyphen-minus becomes U+2212 only where it reads as a sign: at the start of the string, or
 * right after whitespace, "(" or "=", with a digit immediately after it. Never between two
 * digits, so a numeral range ("100-200 K") or a compact subtraction ("2-5") is left alone
 * rather than misread as a single negative number (Ruling T3-minus). For strings already built
 * with toFixed()/toString(), which only ever produce the ASCII hyphen. */
export function minus(s: string): string {
    return s.replace(/(^|[\s(=])-(?=\d)/g, (_match, before: string) => `${before}−`);
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
 *
 * Unicode has no subscript glyph for every letter either (no d, f, g, q, w, y, z) — Td and D3d,
 * both in the shipped molecule library, come back partly or fully untyped ("Td", "D₃d"). This is
 * fine for text-only contexts (aria-labels, CSV/caption exports, plain-text titles) that can't
 * hold a DOM element, but for visual rendering use `<PointGroupLabel>` instead, which puts every
 * character past the first letter in a real <sub> and so handles any suffix losslessly.
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

/**
 * An orbital's name as flat text, for places that cannot hold a <sub> -- an accessible name, a tab title: "3dz²",
 * never "3d_z²", whose underscore a screen reader reads aloud (Task 6 ruling). `<OrbitalLabel>` speaks this form.
 */
export function orbitalPlainName(n: number, l: number, ml: number): string {
    const { base, sub } = orbitalParts(n, l, ml);
    return sub === null ? base : `${base}${sub}`;
}

/** ₀–₉ as 0–9, and back: a subscript digit the flat form writes is typeset as a plain digit inside <sub>. */
const toAsciiDigits = (s: string) => s.replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080));
const toSubscriptDigits = (s: string) => s.replace(/[0-9]/g, c => SUBSCRIPT_DIGITS[c]);

/**
 * Every subscript in a name of what is drawn (Task 8): one parser behind the typeset helper (`withSubscripts`,
 * src/format/subscripts.ts) and its flat-string twin (`flatSubscripts`, below), so the two never disagree.
 *
 * - An MO label's g or u after σ, π, δ or φ: 1σg, 1πu, 1σu*.
 * - An irrep label's number and g or u after its a, b, e or t: 1b1, 3a1, 1a1g, 1e1g, 2eg, 1t2, 2a1', a1 -- and the
 *   flat form a plain-text surface wrote, 1b₁. Running text holds them too ("the 3a1 orbital"), so a label stands
 *   alone (no letter or digit either side); a label with no leading count needs an ASCII digit (a1), which keeps
 *   a₀, the bohr, and words like "eg" or "au" out of it.
 * - "_" before an orbital's subscript, as orbitalName writes it: 3d_z², 2p_x, 4f_z(x²−y²), and the quantities the
 *   data write the same way, R_e, E_el. Never shown: it only marks where the subscript starts. Not inside a word, so an
 *   identifier (build_library, valence_character) is left alone.
 *
 * For names and short prose only -- never paths, hashes, numbers or identifiers (fix round 1, M8): a file name or a
 * commit is set as <code> and kept away from this parser. Even so, what cannot be an irrep is left as it is: an
 * irrep's number is one digit (1–2 after e), so an exponent form (1e5, 2e10) or a hex run (89a9328) never matches,
 * and its count is 1–99 with no leading zero.
 */
const LABEL_SUBSCRIPT = new RegExp([
    '(\\d*[σπδφ])([gu])(?![A-Za-z])',
    '(?<![A-Za-z0-9_])(\\d+[abet])([0-9₀-₉]+[gu]?|[gu])(?![A-Za-z0-9₀-₉])',
    '(?<![A-Za-z0-9_])([abet])([0-9]+[gu]?)(?![A-Za-z0-9₀-₉])',
    // A parenthesis belongs to the subscript only when it holds a power (f's z(x²−y²)), so "2p_z)/√2" stops at z.
    '(?<![A-Za-z])(\\d*[A-Za-zε])_((?:[A-Za-z0-9²³−]|\\([^()]*²[^()]*\\))+)',
].join('|'), 'g');

export interface SubscriptMatch {
    /** Where the match starts in the text, and how long it is. */
    index: number;
    length: number;
    /** The label's text before its subscript -- its count too, "1σ", "1b", "3d" (the "_" dropped) -- the subscript as a
     * <sub> shows it, and as flat text writes it. */
    base: string;
    sub: string;
    flatSub: string;
}

/** An irrep the broad pattern found, checked: a count of 1–99 with no leading zero, and one digit (1 or 2 after e). */
function isIrrep(base: string, sub: string): boolean {
    const count = base.slice(0, -1);
    const letter = base.slice(-1);
    const digits = sub.replace(/[gu]$/, '');
    if (count !== '' && !/^[1-9]\d?$/.test(count)) return false;
    if (digits.length > 1) return false;
    return letter !== 'e' || digits === '' || digits === '1' || digits === '2';
}

/** Every subscript in `text`, in order. */
export function subscriptMatches(text: string): SubscriptMatch[] {
    return Array.from(text.matchAll(LABEL_SUBSCRIPT), (match): SubscriptMatch | null => {
        const [whole, greek, parity, count, irrep, bare, bareSub, letter, markup] = match;
        const at = { index: match.index, length: whole.length };
        if (greek) return { ...at, base: greek, sub: parity, flatSub: parity };
        const irrepBase = count ?? bare;
        if (irrepBase) {
            // The number takes a Unicode subscript in flat text; g and u have none, so they stay as they are.
            const sub = toAsciiDigits(irrep ?? bareSub);
            if (!isIrrep(irrepBase, sub)) return null;
            return { ...at, base: irrepBase, sub, flatSub: toSubscriptDigits(sub) };
        }
        return { ...at, base: letter, sub: markup, flatSub: markup };
    }).filter((match): match is SubscriptMatch => match !== null);
}

/**
 * The flat-string twin of `withSubscripts` (Task 8, addendum): `text` for a surface that cannot hold a <sub> --
 * document.title, an export caption, an accessible name built as a string. An orbital's subscript runs on ("3dz²",
 * as orbitalPlainName writes it), an irrep's number takes Unicode's subscript digit ("1b₁"), an MO's g or u stays
 * flat ("1σg"): never a "_".
 */
export function flatSubscripts(text: string): string {
    let flat = '';
    let last = 0;
    for (const match of subscriptMatches(text)) {
        flat += text.slice(last, match.index) + match.base + match.flatSub;
        last = match.index + match.length;
    }
    return flat + text.slice(last);
}
