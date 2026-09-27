/**
 * RFC 4180 with one deliberate extension: leading `#` lines are comments (a
 * pandas/numpy convention, not part of the RFC), skipped by any reader that
 * knows to expect them and otherwise just header-like junk rows. Line
 * endings are LF, not CRLF -- also outside the RFC, but every consumer this
 * app targets (pandas, numpy, Excel) reads LF-only CSV without complaint,
 * and CRLF would need quoting to carry through `quote` below untouched.
 */

export interface CsvCurve {
    label: string;
    points: Array<{ r: number; value: number }>;
}

/**
 * Fix round 1 (M1): a NaN or Infinity used to write as '', leaving a
 * ragged, silently-empty cell -- exactly the partial file the spec's
 * "failures are shown, not hidden" rules out. Refusing outright, naming the
 * curve and the radius, turns that into an error the caller sees instead.
 */
function formatNumber(value: number, label: string, r: number): string {
    if (!Number.isFinite(value)) {
        throw new Error(`Cannot export "${label}" at r = ${r}: its value is ${value}, not a finite number.`);
    }
    return String(Number(value.toPrecision(8)));
}

// Fix round 1 (M2): a bare \r (no accompanying \n) would otherwise pass
// through unquoted and corrupt the row structure for a reader that splits
// on \r\n or \r alone.
const quote = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/**
 * One column per curve against a shared r column. Every curve the app plots
 * shares its radii (the atom's log grid, or one uniform sweep), so a
 * mismatch is a caller bug, not something to paper over by interpolating.
 */
export function radialCurvesToCsv(curves: CsvCurve[], commentLines: string[]): string {
    if (curves.length === 0) throw new Error('No curves to export.');
    const radii = curves[0].points.map(p => p.r);
    for (const curve of curves) {
        if (curve.points.length !== radii.length || curve.points.some((p, i) => p.r !== radii[i])) {
            throw new Error('Curves must be sampled at the same radii.');
        }
    }
    const lines = commentLines.map(line => `# ${line}`);
    lines.push(['r_bohr', ...curves.map(c => quote(c.label))].join(','));
    radii.forEach((r, i) => {
        const rCell = formatNumber(r, 'r_bohr', r);
        const cells = curves.map(c => formatNumber(c.points[i].value, c.label, r));
        lines.push([rCell, ...cells].join(','));
    });
    return `${lines.join('\n')}\n`;
}
