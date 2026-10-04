/** The published molecule-data release the app reads (spec §4.5). Must equal
 * tools/molecules/version.py's DATA_VERSION (checked by tests/molecules/data_version.test.ts) --
 * bump both together whenever the generated data changes, since a published
 * version is immutable (ruling C2). */
export const MOLECULE_DATA_VERSION = 'v1';
