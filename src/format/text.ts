/**
 * Small text helpers every Info builder and panel shares (Task 6 fix round 1: one copy each, not one per file).
 */

/** `one` for exactly one, `many` otherwise: "1 electron", "2 electrons". */
export const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

/** "a", "a and b", "a, b and c". */
export function listOf(items: string[]): string {
    return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A formula kept on one line: its spaces become no-break spaces (U+00A0), so "n − l − 1" never wraps at an operator. */
export const nb = (formula: string): string => formula.replace(/ /g, '\u00A0');

/**
 * Final polish F3: where a held (no-break) fact value may wrap. A value such as "−2976.40 eV (−109.38074 Ha)" has every
 * space as U+00A0, so it cannot wrap at all and drops below its label as a whole; this cuts it at its two break
 * opportunities -- between a figure with its unit and the "(" that opens the other unit, and after a "·" -- into parts
 * that each stay whole. A value with neither comes back as one part. Joining the parts with a space gives the text back
 * with only those two no-break spaces made breakable.
 */
export function breakableParts(value: string): string[] {
    return value.split(/\u00A0(?=\()|(?<=\u00A0·)\u00A0/);
}
