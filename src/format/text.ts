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
