import { readFileSync } from 'fs';
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

it('the committed manifest keeps every molecule within 3 MB', () => {
  const manifestPath = resolve(__dirname, `../../tools/molecules/manifest/${MOLECULE_DATA_VERSION}.json`);
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
