/**
 * Phase 6D spec §5: for a library molecule whose geometry is taken from experiment, its bond lengths and
 * angles compared with that same experiment are a transcription check, not a test of the method. Such rows
 * carry NOT_A_TEST (tools/molecules/build_library.py writes it) and no "agrees with experiment" summary may
 * count them; dipoles and other properties computed at those geometries still count. Light on purpose: the
 * provenance panel imports it, which references.ts (it computes rows at import) must not be.
 */
// format/text imports nothing, so this module stays light.
import { listOf } from '../format/text';

export const NOT_A_TEST = 'geometry from experiment (not a test of the method)';

export function countsAsValidation(row: { notATest?: string }): boolean {
    return !row.notATest;
}

/** build_library's sources for an experimental geometry all begin so: 'experiment (CCCBDB)', 'experimental R_e (…)'. */
export function isExperimentalGeometry(geometrySource: string): boolean {
    return geometrySource.startsWith('experiment');
}

/** What a reference row checks, as the tier badge names it; null when it checks nothing about the method. */
function checkedQuantity(quantity: string, source: string, experimental: boolean): string | null {
    if (quantity === 'dipole') return source === 'zero by symmetry' ? null : 'dipole';
    if (quantity === 'R_e') return 'equilibrium bond length (from its energy curve)';
    if (quantity === 'bond' || quantity === 'angle') return experimental ? null : quantity === 'bond' ? 'bond length' : 'bond angle';
    if (quantity === 'dihedral') return null;                     // a conformer check, not a published value
    return quantity.replace(/_/g, ' ');
}


/**
 * Final review I2: a library molecule's tier line, from its own references and geometry -- never a fixed
 * claim. Phase 6D left nine (methane, benzene, SF6 …) with an experimental geometry, whose bonds and angles
 * are no test (NOT_A_TEST), and no dipole but zero by symmetry: their line says nothing is checked yet.
 */
export function validatedLine(meta: {
    references: Array<{ quantity: string; source: string }>; geometrySource: string; geometryOptimisation?: unknown;
}): string {
    const experimental = isExperimentalGeometry(meta.geometrySource);
    const geometry = experimental ? 'geometry from experiment; ' : meta.geometryOptimisation ? 'optimised geometry; ' : '';
    const counts = new Map<string, number>();
    for (const { quantity, source } of meta.references) {
        const name = checkedQuantity(quantity, source, experimental);
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const checks = [...counts].map(([name, n]) => (n > 1 && name.startsWith('bond ') ? `${name}s` : name));
    return checks.length
        ? `Curated; ${geometry}${listOf(checks)} checked against published values.`
        : `Curated; ${geometry}no property checked against experiment yet.`;
}
