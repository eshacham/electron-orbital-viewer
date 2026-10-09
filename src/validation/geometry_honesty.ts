/**
 * Phase 6D spec §5: for a library molecule whose geometry is taken from experiment, its bond lengths and
 * angles compared with that same experiment are a transcription check, not a test of the method. Such rows
 * carry NOT_A_TEST (tools/molecules/build_library.py writes it) and no "agrees with experiment" summary may
 * count them; dipoles and other properties computed at those geometries still count. Light on purpose: the
 * provenance panel imports it, which references.ts (it computes rows at import) must not be.
 */
export const NOT_A_TEST = 'geometry from experiment (not a test of the method)';

export function countsAsValidation(row: { notATest?: string }): boolean {
    return !row.notATest;
}

/** build_library's sources for an experimental geometry all begin so: 'experiment (CCCBDB)', 'experimental R_e (…)'. */
export function isExperimentalGeometry(geometrySource: string): boolean {
    return geometrySource.startsWith('experiment');
}
