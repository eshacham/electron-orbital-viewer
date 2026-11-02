import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TEMPER_LEVELS } from '../../src/design/tokens';

/** Spec §6.2: the same boot script in both entries, ahead of every stylesheet and module script. */
const html = (name: string) => readFileSync(resolve(__dirname, '../../public', name), 'utf8');
const scriptOf = (page: string) => {
    const match = /<script data-theme-boot>([\s\S]*?)<\/script>/.exec(page);
    if (!match) throw new Error('no data-theme-boot script');
    return match[1];
};
// Brass Instrument Task 1: the viewer's level temper, in its own script so the theme script stays identical in both pages.
const levelScriptOf = (page: string) => {
    const match = /<script data-level-boot>([\s\S]*?)<\/script>/.exec(page);
    return match ? match[1] : null;
};
const run = (script: string) => new Function(script)();

function mediaReporting(light: boolean) {
    window.matchMedia = ((query: string) => ({ matches: light && query.includes('light'), media: query,
        addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-level');
    jest.restoreAllMocks();
});

describe('the no-flash theme script', () => {
    const index = html('index.html');
    const admin = html('admin.html');

    it('is identical in index.html and admin.html, and runs before any stylesheet or module', () => {
        expect(scriptOf(index)).toBe(scriptOf(admin));
        for (const page of [index, admin]) {
            const at = page.indexOf('data-theme-boot');
            expect(at).toBeGreaterThan(0);
            expect(at).toBeLessThan(page.indexOf('type="module"'));
            const stylesheet = page.indexOf('rel="stylesheet"');
            if (stylesheet >= 0) expect(at).toBeLessThan(stylesheet);
        }
    });

    it('applies a stored choice', () => {
        mediaReporting(true);
        window.localStorage.setItem('eov.theme', 'dark');
        run(scriptOf(index));
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('follows the system when nothing is stored', () => {
        mediaReporting(true);
        run(scriptOf(index));
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('migrates a legacy key on first load', () => {
        mediaReporting(false);
        window.localStorage.setItem('eov.quantumlab.theme', 'light');
        run(scriptOf(index));
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(window.localStorage.getItem('eov.theme')).toBe('light');
        expect(window.localStorage.getItem('eov.quantumlab.theme')).toBeNull();
    });

    it('still themes the page when localStorage throws', () => {
        mediaReporting(false);
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        run(scriptOf(index));
        expect(document.documentElement.dataset.theme).toBe('dark');
    });
});

// Brass Instrument Task 1: the first paint is also tempered to the stored learning level.
describe('the no-flash level script (index.html only)', () => {
    const index = html('index.html');
    const admin = html('admin.html');

    it('runs before any stylesheet or module in index.html, and is absent from admin.html (no level: the Explore temper)', () => {
        expect(levelScriptOf(admin)).toBeNull();
        const at = index.indexOf('data-level-boot');
        expect(at).toBeGreaterThan(0);
        expect(at).toBeLessThan(index.indexOf('type="module"'));
        const stylesheet = index.indexOf('rel="stylesheet"');
        if (stylesheet >= 0) expect(at).toBeLessThan(stylesheet);
    });

    it.each(['basics', 'explore', 'advanced', 'research'])('sets data-level="%s" from a stored eov.level before paint', level => {
        window.localStorage.setItem('eov.level', level);
        run(levelScriptOf(index)!);
        expect(document.documentElement.dataset.level).toBe(level);
    });

    // Parked from Task 1: the script is inline (it runs before any module), so its level list is a copy of TEMPER_LEVELS --
    // tied here so a fifth level cannot be added to one and not the other.
    it('lists exactly the temper levels', () => {
        const listed = Array.from(levelScriptOf(index)!.matchAll(/v === '(\w+)'/g)).map(match => match[1]);
        expect(listed).toEqual([...TEMPER_LEVELS]);
    });

    it('sets nothing for a junk value or none stored', () => {
        run(levelScriptOf(index)!);
        expect(document.documentElement.hasAttribute('data-level')).toBe(false);
        window.localStorage.setItem('eov.level', 'wizard');
        run(levelScriptOf(index)!);
        expect(document.documentElement.hasAttribute('data-level')).toBe(false);
    });

    it('still runs when localStorage throws', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        expect(() => run(levelScriptOf(index)!)).not.toThrow();
        expect(document.documentElement.hasAttribute('data-level')).toBe(false);
    });
});

// Final review M5: the serif's latin face is fetched ahead of the stylesheet in both pages (Vite hashes the href), so the
// wordmark's first paint is not in the fallback face for long. It is the file fontsource's own stylesheet loads.
describe('the serif preload', () => {
    const FONT = 'node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2';
    it.each(['index.html', 'admin.html'])('%s preloads Source Serif 4\'s latin woff2', name => {
        const tag = /<link rel="preload"[^>]*>/.exec(html(name))?.[0] ?? '';
        expect(tag).toContain('as="font"');
        expect(tag).toContain('type="font/woff2"');
        expect(tag).toContain('crossorigin');
        expect(tag).toContain(FONT);
        expect(readFileSync(resolve(__dirname, '../..', FONT)).length).toBeGreaterThan(0);
    });
});
