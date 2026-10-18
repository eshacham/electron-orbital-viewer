/** @jest-environment node */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { MOLECULE_DATA_VERSION } from '../../src/molecules/data_version';
import { structureThumbUrl } from '../../src/molecules/thumb_paths';

const ROOT = join(__dirname, '../..');
// Vite's root is public/ and its publicDir is root-relative 'static' (ruling T11-pub),
// so public/static/<path> is served and shipped as /<path>.
const STATIC = join(ROOT, 'public/static');
const THUMBS = join(STATIC, `molecule-thumbs/${MOLECULE_DATA_VERSION}`);

// libraryEntries() of the published v3 index.json (35 entries, 25 in LIBRARY_CATEGORIES),
// fetched once when the thumbnails were rendered; there is no committed copy of index.json.
const LIBRARY_IDS = [
    'h2o', 'nh3', 'ch4', 'co2', 'c2h2', 'c2h4', 'c2h6', 'hcn', 'h2co', 'bf3', 'sih4', 'sf6', 'o3',
    'no2', 'so2', 'ph3', 'h2s', 'benzene', 'ch3oh', 'hcooh', 'ethanol', 'acetone', 'pyridine', 'formamide', 'glycine',
];

describe('the library thumbnails ship with the site (ruling P11, T11-pub)', () => {
    it('has one WebP of at most 20 KB per library molecule, and nothing else', () => {
        expect(readdirSync(THUMBS).sort()).toEqual(LIBRARY_IDS.map(id => `${id}.webp`).sort());
        const over = LIBRARY_IDS.filter(id => statSync(join(THUMBS, `${id}.webp`)).size > 20 * 1024);
        expect(over).toEqual([]);
        for (const id of LIBRARY_IDS) {
            const head = readFileSync(join(THUMBS, `${id}.webp`)).subarray(0, 12).toString('latin1');
            expect(head.slice(0, 4) + head.slice(8)).toBe('RIFFWEBP');
        }
    });

    it('serves each file at the URL the app asks for', () => {
        for (const id of LIBRARY_IDS) expect(join(STATIC, structureThumbUrl(id))).toBe(join(THUMBS, `${id}.webp`));
    });

    it('copies public/static into the build, and public/static holds only the thumbnails', () => {
        const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
        expect(config).toMatch(/^\s*publicDir: 'static',/m);
        expect(readdirSync(STATIC)).toEqual(['molecule-thumbs']);
    });

    it('never builds the dev-only render page', () => {
        const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
        expect(config).not.toMatch(/thumbs/);
        const page = readFileSync(join(ROOT, 'public/thumbs.html'), 'utf8');
        const scripts = [...page.matchAll(/<script\b[^>]*>/g)].map(match => match[0]);
        expect(scripts).toEqual(['<script type="module" src="../src/thumbs/thumbs_page.ts">']);
    });
});
