import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const SRC = resolve(__dirname, '../../src');
function cssFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith('.css') ? [path] : [];
    });
}
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Spec §4.3 "Nothing is smaller than 11 px", ruling T10-sub11: the periodic table's tile
// numbers (7 px), the molecule gap caveat (10 px) and the admin daily-spend label (10 px)
// were the last stylesheet sizes under the floor.
describe('nothing is smaller than 11 px (spec §4.3)', () => {
    it('sets no px font size under 11 in any stylesheet', () => {
        const under: string[] = [];
        for (const file of cssFiles(SRC)) {
            const css = strip(readFileSync(file, 'utf8'));
            for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
                for (const declaration of match[2].matchAll(/(?:^|;)\s*font(?:-size)?\s*:([^;]*)/g)) {
                    for (const size of declaration[1].matchAll(/(?:^|[\s/])(\d+(?:\.\d+)?)px\b/g)) {
                        // In the `font` shorthand the size is the px value before any `/ line-height`.
                        const before = declaration[1].slice(0, size.index! + size[0].length);
                        if (before.includes('/')) continue;
                        if (Number(size[1]) < 11) under.push(`${file.replace(SRC, 'src')} ${match[1].trim()} ${size[1]}px`);
                    }
                }
            }
        }
        expect(under).toEqual([]);
    });
});
