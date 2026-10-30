// Final polish, Task 2 (F2): no text glyph stands in for a control's icon -- "▾ ▴ ‹ ›" are MUI icons now.
// A glyph in a comment or in prose-only text stays; this reads the shipped components' code, comments left out.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const SRC = resolve(__dirname, '../../src');
const GLYPH = /[‹›▾▴]/;

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
    });
}

/** The code of a file: block comments, line comments and JSX comments dropped, so a glyph named in a comment is fine. */
function codeOf(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
}

describe('glyph icons (final polish F2)', () => {
    it('leaves no "▾ ▴ ‹ ›" in any component\'s code: each is a real MUI icon', () => {
        const offenders = sourceFiles(SRC)
            .filter(path => GLYPH.test(codeOf(readFileSync(path, 'utf8'))))
            .map(path => relative(SRC, path));
        expect(offenders).toEqual([]);
    });
});
