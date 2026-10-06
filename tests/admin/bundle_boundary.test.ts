import { existsSync, readFileSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../src');
const ADMIN = path.join(SRC, 'admin') + path.sep;
/** Relative specifiers in static imports and re-exports, dynamic import(), and worker `new URL('./x', import.meta.url)`. */
const SPECIFIER = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function resolveModule(from: string, specifier: string): string | null {
    const base = path.resolve(path.dirname(from), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
        if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
    }
    return null;          // CSS, JSON and other assets cannot carry the dashboard's code
}

/** Every source file reachable from an entry through relative imports of any kind. */
function reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
            const next = resolveModule(file, match[1] ?? match[2] ?? match[3]);
            if (next) queue.push(next);
        }
    }
    return seen;
}

describe('the dashboard stays out of the main bundle', () => {
    it('nothing reachable from src/main.tsx imports src/admin', () => {
        const files = [...reachable(path.join(SRC, 'main.tsx'))];
        expect(files.length).toBeGreaterThan(50);              // the walk really walked the app
        expect(files.filter(file => file.startsWith(ADMIN))).toEqual([]);
    });
    it('the dashboard entry reaches its own code, so the check above is not vacuous', () => {
        const files = reachable(path.join(SRC, 'admin', 'main.tsx'));
        for (const name of ['AdminApp.tsx', 'JobsTable.tsx', 'CostPanel.tsx']) expect(files.has(path.join(SRC, 'admin', name))).toBe(true);
    });
});
