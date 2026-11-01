import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

// Brass Instrument Task 4 (the sweep): the Deep Space and Light Clean blues, cyan and violet are gone from the source --
// every colour comes from tokens.ts. A scan of src (code and CSS, comments aside, since a comment may record the history
// of a retired value) so one cannot come back. The genuine science colours (phase pair, ESP, density, CPK, the curve
// palettes) hold none of these values; if one ever must, it gets a named exemption here, with its reason.
const RETIRED = [
    '#1FB6F5', '#2A85F8', '#4C9BFF', '#1662E0', '#1559D6', '#0E3A99', '#1E5BD8', 'rgba(31,182,245',
    '#A78BFA', '#5B3FD9', '#6D28D9', '#4F86FF', '#8090A8',
];
const EXEMPT: Record<string, string> = {};

const root = resolve(__dirname, '../../src');
function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return walk(path);
        return /\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
}
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const squeeze = (text: string) => text.toLowerCase().replace(/\s+/g, '');

describe('the colour sweep', () => {
    const files = walk(root);

    it('scans the source tree (a guard against the walk finding nothing)', () => {
        expect(files.length).toBeGreaterThan(100);
        expect(files.some(file => file.endsWith('style.css'))).toBe(true);
        expect(files.some(file => file.endsWith('science.ts'))).toBe(true);
    });

    it.each(RETIRED)('leaves no %s in src (code or CSS, outside comments)', literal => {
        const hits = files
            .filter(file => !(relative(root, file) in EXEMPT))
            .filter(file => squeeze(withoutComments(readFileSync(file, 'utf8'))).includes(squeeze(literal)))
            .map(file => relative(root, file));
        expect(hits).toEqual([]);
    });

    // Ruling T4-a: the favicon and the page shells are swept too -- the app icon was the last blue.
    it('leaves no retired literal in public/*.svg or public/*.html (the favicon is brass)', () => {
        const publicDir = resolve(__dirname, '../../public');
        const pages = readdirSync(publicDir).filter(name => /\.(svg|html)$/.test(name));
        expect(pages).toEqual(expect.arrayContaining(['electron-icon.svg', 'index.html', 'admin.html']));
        for (const name of pages) {
            const text = squeeze(readFileSync(join(publicDir, name), 'utf8').replace(/<!--[\s\S]*?-->/g, ''));
            for (const literal of RETIRED) expect([name, literal, text.includes(squeeze(literal))]).toEqual([name, literal, false]);
        }
        const icon = readFileSync(join(publicDir, 'electron-icon.svg'), 'utf8');
        for (const brass of ['#C4A15A', '#D7B46D', '#141513']) expect(icon).toContain(brass);
    });

    it('has no hex colour in a component stylesheet: every colour there comes from a token', () => {
        const sheets = files.filter(file => file.endsWith('.css') && !file.endsWith('tokens.css'));
        const hits = sheets.filter(file => /#[0-9a-f]{3,8}\b/i.test(withoutComments(readFileSync(file, 'utf8')))).map(file => relative(root, file));
        expect(hits).toEqual([]);
    });

    it('keeps the dead #update-orbital button rule and the learn-accent roles out', () => {
        const all = files.map(file => withoutComments(readFileSync(file, 'utf8'))).join('\n');
        expect(all).not.toContain('update-orbital');
        expect(all).not.toContain('learn-accent');
    });
});
