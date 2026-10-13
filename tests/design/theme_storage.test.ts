import { decodeThemeChoice, encodeThemeChoice, migrateLegacyTheme, resolveMode, THEME_KEY } from '../../src/design/theme_storage';

afterEach(() => window.localStorage.clear());

describe('theme storage (spec §6.1)', () => {
    it('stores dark or light, and "follow the system" as no key at all', () => {
        expect(decodeThemeChoice('dark')).toBe('dark');
        expect(decodeThemeChoice('light')).toBe('light');
        expect(decodeThemeChoice(null)).toBe('system');
        expect(decodeThemeChoice('sepia')).toBe('system');
        expect(encodeThemeChoice('system')).toBeNull();
        expect(encodeThemeChoice('light')).toBe('light');
    });

    it('resolves "system" from prefers-color-scheme', () => {
        expect(resolveMode('system', true)).toBe('light');
        expect(resolveMode('system', false)).toBe('dark');
        expect(resolveMode('dark', true)).toBe('dark');
    });

    it('migrates the foundation\'s two keys into eov.theme and deletes them', () => {
        window.localStorage.setItem('eov.quantumlab.theme', 'light');
        window.localStorage.setItem('eov-color-theme', 'dark');
        migrateLegacyTheme(window.localStorage);
        expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
        expect(window.localStorage.getItem('eov.quantumlab.theme')).toBeNull();
        expect(window.localStorage.getItem('eov-color-theme')).toBeNull();
    });

    it('never overwrites an existing eov.theme, and drops a legacy value it cannot read', () => {
        window.localStorage.setItem(THEME_KEY, 'dark');
        window.localStorage.setItem('eov.quantumlab.theme', 'light');
        migrateLegacyTheme(window.localStorage);
        expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
        window.localStorage.clear();
        window.localStorage.setItem('eov-color-theme', 'auto');
        migrateLegacyTheme(window.localStorage);
        expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
        expect(window.localStorage.getItem('eov-color-theme')).toBeNull();
        expect(() => migrateLegacyTheme(null)).not.toThrow();
    });
});
