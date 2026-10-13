import { ELEMENTS } from '../elements';
import { BONDS_SYSTEMS, type BondsSystemId } from '../bonds/systems';
import { filterMolecules, formatFormula } from '../molecules/catalogue';
import { LIBRARY_CATEGORIES } from '../molecules/library_types';
import { COMPUTED_CATEGORY } from '../jobs/computed';
import { orbitalName } from '../orbital_names';
import type { MoleculeIndexEntry } from '../molecules/types';

/**
 * The top bar's search (spec §8.3): one client-side index over data the app
 * already has -- all 118 elements, the library molecules (and, for the
 * owner, their computed ones: ruling R4), the Bonds systems and the Basic
 * orbitals. No server call. Opening a result does what the existing
 * pickers do; App owns that (Task 8's handleSearchPick).
 */
export type SearchAction =
    | { kind: 'element'; Z: number }
    | { kind: 'molecule'; id: string }
    | { kind: 'bonds'; system: BondsSystemId }
    | { kind: 'basic'; n: number; l: number; ml: number };

export type SearchGroup = 'Elements' | 'Molecules' | 'Bonds' | 'Basic orbitals';
export const SEARCH_GROUP_ORDER: readonly SearchGroup[] = ['Elements', 'Molecules', 'Bonds', 'Basic orbitals'];
export const SEARCH_GROUP_LIMIT = 6;

export interface SearchResult {
    key: string;
    group: SearchGroup;
    label: string;
    detail: string;
    action: SearchAction;
}

export interface SearchSources {
    /** The molecule picker's entries (withComputed for the owner), or null before the index loads. */
    molecules: MoleculeIndexEntry[] | null;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

/** Lower case; sub- and superscript digits as digits; ⁺ as '+'; ⁻ and minus signs as '-'; no spaces or underscores. */
export function normaliseQuery(text: string): string {
    return text.trim().toLowerCase()
        .replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080))
        .replace(/[⁰¹²³⁴-⁹]/g, c => SUPERSCRIPT_DIGITS[c] ?? c)
        .replace(/⁺/g, '+')
        .replace(/[⁻−–]/g, '-')
        .replace(/[\s_]+/g, '');
}

function elementResults(q: string): SearchResult[] {
    const scored: Array<{ Z: number; name: string; symbol: string; score: number }> = [];
    for (const element of ELEMENTS) {
        const name = element.name.toLowerCase();
        const symbol = element.symbol.toLowerCase();
        const score = symbol === q || name === q || String(element.atomicNumber) === q ? 0
            : name.startsWith(q) ? 1
            : q.length <= 2 && symbol.startsWith(q) ? 2
            : q.length >= 3 && name.includes(q) ? 3
            : null;
        if (score !== null) scored.push({ Z: element.atomicNumber, name: element.name, symbol: element.symbol, score });
    }
    scored.sort((a, b) => a.score - b.score || a.Z - b.Z);
    return scored.map(({ Z, name, symbol }) => ({
        key: `element-${Z}`, group: 'Elements', label: `${name} (${symbol})`, detail: `Z = ${Z} · Atoms`, action: { kind: 'element', Z },
    }));
}

const CATEGORY_LABEL = new Map<string, string>([
    ...LIBRARY_CATEGORIES.map(c => [c.key, c.label] as [string, string]),
    [COMPUTED_CATEGORY.key, COMPUTED_CATEGORY.label],
]);

function moleculeResults(query: string, entries: MoleculeIndexEntry[] | null): SearchResult[] {
    if (!entries) return [];
    return filterMolecules(entries, query, null).map(entry => ({
        key: `molecule-${entry.id}`, group: 'Molecules', label: `${entry.name} (${formatFormula(entry.formula)})`,
        detail: `${CATEGORY_LABEL.get(entry.category) ?? entry.category} · Molecules`, action: { kind: 'molecule', id: entry.id },
    }));
}

function bondsResults(q: string): SearchResult[] {
    return BONDS_SYSTEMS
        .filter(system => normaliseQuery(system.formula).startsWith(q) || (q.length >= 2 && system.name.toLowerCase().includes(q)))
        .map(system => ({
            key: `bonds-${system.id}`, group: 'Bonds', label: `${system.formula} — ${system.name}`, detail: 'Bonds',
            action: { kind: 'bonds', system: system.id },
        }));
}

/** Every Basic orbital, n = 1…9, as its name and that name normalised. */
const BASIC_ORBITALS = (() => {
    const list: Array<{ n: number; l: number; ml: number; name: string; key: string }> = [];
    for (let n = 1; n <= 9; n++) {
        for (let l = 0; l < n; l++) {
            for (let ml = -l; ml <= l; ml++) {
                const name = orbitalName(n, l, ml);
                list.push({ n, l, ml, name, key: normaliseQuery(name) });
            }
        }
    }
    return list;
})();

function basicResults(q: string): SearchResult[] {
    if (q.length < 2 || !/^[1-9]/.test(q)) return [];
    return BASIC_ORBITALS.filter(orbital => orbital.key.startsWith(q)).map(({ n, l, ml, name }) => ({
        key: `basic-${n}-${l}-${ml}`, group: 'Basic orbitals', label: name, detail: 'Hydrogen-like, Z = 1 · Basic Orbitals',
        action: { kind: 'basic', n, l, ml },
    }));
}

export function searchAll(query: string, sources: SearchSources): SearchResult[] {
    const q = normaliseQuery(query);
    if (!q) return [];
    const groups: Record<SearchGroup, SearchResult[]> = {
        Elements: elementResults(q),
        Molecules: moleculeResults(query, sources.molecules),
        Bonds: bondsResults(q),
        'Basic orbitals': basicResults(q),
    };
    return SEARCH_GROUP_ORDER.flatMap(group => groups[group].slice(0, SEARCH_GROUP_LIMIT));
}
