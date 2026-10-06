import { LIBRARY_CATEGORIES } from './library_types';
import type { MoleculeIndexEntry } from './types';

const LIBRARY_KEYS = new Set(LIBRARY_CATEGORIES.map(c => c.key));
const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

/** The picker lists the library; Phase 5's bond-scan entries share index.json but belong to Bonds mode. */
export function libraryEntries(entries: MoleculeIndexEntry[]): MoleculeIndexEntry[] {
    return entries.filter(entry => LIBRARY_KEYS.has(entry.category));
}

function normalise(text: string): string {
    return text.trim().toLowerCase().replace(/[₀-₉]/g, c => String(SUBSCRIPTS.indexOf(c))).replace(/\s+/g, '');
}

export function filterMolecules(entries: MoleculeIndexEntry[], query: string, category: string | null): MoleculeIndexEntry[] {
    const q = normalise(query);
    return entries.filter(entry =>
        (!category || entry.category === category || entry.tags.includes(category))
        && (!q || entry.name.toLowerCase().includes(q) || normalise(entry.formula).startsWith(q) || entry.id === q || entry.tags.includes(q)));
}

export function formatFormula(formula: string): string {
    return formula.replace(/([A-Za-z)])(\d+)/g, (_, head: string, digits: string) => head + [...digits].map(d => SUBSCRIPTS[Number(d)]).join(''));
}
