export interface CsvCurve {
    label: string;
    points: Array<{ r: number; value: number }>;
}

const formatNumber = (value: number) => (Number.isFinite(value) ? String(Number(value.toPrecision(8))) : '');
const quote = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

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
    radii.forEach((r, i) => lines.push([formatNumber(r), ...curves.map(c => formatNumber(c.points[i].value))].join(',')));
    return `${lines.join('\n')}\n`;
}
