import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version';

// The loader (src/molecules/loader.ts) does not exist yet -- it is Task 6's
// (ruling C1). Task 6's loader.test.ts is the right home for the assertion
// that MOLECULES_BASE_URL === `/molecules/${MOLECULE_DATA_VERSION}`.

it('the app reads the data version the pipeline writes', () => {
  const py = readFileSync(resolve(__dirname, '../../tools/molecules/version.py'), 'utf8');
  const match = /^DATA_VERSION\s*=\s*"([^"]+)"/m.exec(py);
  expect(match?.[1]).toBe(MOLECULE_DATA_VERSION);
});

const manifestPath = resolve(__dirname, `../../tools/molecules/manifest/${MOLECULE_DATA_VERSION}.json`);

// `publish.py <version> --manifest-only` writes this file from
// tools/molecules/out/<version>/ with no AWS calls (ruling C2); it is then
// committed. Skipped, not failed, until that has happened: as of this task,
// `--manifest-only` correctly *refuses* to write one for v1, because
// tools/molecules/out/v1/{co,f2,hf,o2}/**/meta.json record a "...-dirty"
// generator.commit (uncommitted tools/molecules changes when those four were
// generated) while the rest record a clean commit -- see publish.py's
// resolve_generator and the task 5A report. Regenerate those molecules (or
// the whole tree) from a clean working tree, then rerun --manifest-only, and
// this test activates.
(existsSync(manifestPath) ? it : it.skip)('the committed manifest keeps every molecule within 3 MB', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    files: Array<{ path: string; bytes: number }>;
  };
  const perMolecule = new Map<string, number>();
  for (const file of manifest.files) {
    const id = file.path.includes('/') ? file.path.split('/')[0] : null;
    if (id) perMolecule.set(id, (perMolecule.get(id) ?? 0) + file.bytes);
  }
  const over = [...perMolecule].filter(([, bytes]) => bytes > 3_145_728).map(([id]) => id);
  expect(over).toEqual([]);
});
