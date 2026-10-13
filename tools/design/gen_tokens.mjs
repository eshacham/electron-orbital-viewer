#!/usr/bin/env node
// Writes src/design/tokens.css from src/design/tokens.ts (spec §4: generated
// and checked in, so the first paint is already themed). Run after any token
// change; tests/design/tokens.test.ts fails while the two differ:
//   node tools/design/gen_tokens.mjs
// Node 24 strips the .ts file's types itself; tokens.ts has no imports.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensCss } from '../../src/design/tokens.ts';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/design/tokens.css');
writeFileSync(out, tokensCss());
console.log(`wrote ${out}`);
