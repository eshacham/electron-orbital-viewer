// DESIGN.md: "Spacing follows a 4 px step (4, 8, 12, 16, 20, 24, 32)". The hallmark audit (REFLEX 24b) found 132 gaps,
// paddings and margins that had drifted to 6 and 10 px; this scan keeps every stylesheet on the grid.
// Allowed lengths: 0, a hairline (1 to 3 px: borders' companions, focus-ring and optical offsets), a multiple of 4 px,
// and anything that is not an absolute px length (var(), %, em, ch, rem). Exceptions, with a reason, go in EXCEPTIONS.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const root = resolve(__dirname, '../..');

function cssFiles(dir: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...cssFiles(path));
        else if (name.endsWith('.css')) found.push(path);
    }
    return found;
}

/** "file:selector property" mapped to the reason it may stay off the grid. Empty: nothing needs one. */
const EXCEPTIONS: Record<string, string> = {};

const SPACING = /(?:^|[;{\s])(gap|row-gap|column-gap|padding(?:-[a-z]+)*|margin(?:-[a-z]+)*)\s*:\s*([^;}]+)/g;
const PX = /(-?\d*\.?\d+)px/g;

function offenders(): string[] {
    const found: string[] = [];
    for (const file of cssFiles(resolve(root, 'src'))) {
        const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
        for (let m = SPACING.exec(text); m; m = SPACING.exec(text)) {
            const line = text.slice(0, m.index).split('\n').length;
            for (let px = PX.exec(m[2]); px; px = PX.exec(m[2])) {
                const size = Math.abs(parseFloat(px[1]));
                if (size === 0 || size <= 3 || size % 4 === 0) continue;
                const key = `${relative(root, file)}:${line} ${m[1]}: ${m[2].trim()}`;
                if (!Object.keys(EXCEPTIONS).some(prefix => key.startsWith(prefix))) found.push(key);
            }
        }
    }
    return [...new Set(found)];
}

describe('the 4 px spacing grid (audit REFLEX 24b)', () => {
    it('finds the stylesheets it scans', () => {
        expect(cssFiles(resolve(root, 'src')).length).toBeGreaterThan(20);
    });
    it('every gap, padding and margin length is 0, a 1 to 3 px hairline, a multiple of 4 px, or relative', () => {
        expect(offenders()).toEqual([]);
    });
});
