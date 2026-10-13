import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Spec §6.2: the same boot script in both entries, ahead of every stylesheet and module script. */
const html = (name: string) => readFileSync(resolve(__dirname, '../../public', name), 'utf8');
const scriptOf = (page: string) => {
    const match = /<script data-theme-boot>([\s\S]*?)<\/script>/.exec(page);
    if (!match) throw new Error('no data-theme-boot script');
    return match[1];
};
const run = (script: string) => new Function(script)();

function mediaReporting(light: boolean) {
    window.matchMedia = ((query: string) => ({ matches: light && query.includes('light'), media: query,
        addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
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
