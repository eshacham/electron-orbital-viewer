/**
 * A drawn radius as text, in a₀ units left to the caller: three significant
 * figures, trailing zeros kept (19.96 reads "20.0", not "20"). One formatter
 * for the screen's compare line and the exports' caption, so the same ring
 * never prints as two different numbers (final review M9).
 */
export function formatDrawnRadius(radius: number): string {
    return radius.toPrecision(3);
}
