// tests/bonds/scan_notes.test.ts -- Task 3 review (panel fixes): a scan's own note is filed under Info's Method or Limits
// by system (captions.ts NOTE_IS_METHOD). The notes are written in tools/molecules/molecules.py and shipped in each
// scan.json; this reads them there (as valence_threshold.test.ts reads orbitals.py), so a list that has gone stale --
// a caveat added to a note filed as Method, or a new ground-state note filed as a Limit -- fails here.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NOTE_IS_METHOD } from '../../src/bonds/captions';
import { DIATOMIC_IDS } from '../../src/bonds/systems';

const py = readFileSync(resolve(__dirname, '../../tools/molecules/molecules.py'), 'utf8');

/** A Python call's top-level arguments, split at commas outside quotes and brackets. */
function topLevelArguments(source: string): string[] {
    const args: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let current = '';
    for (const char of source) {
        if (quote) {
            if (char === quote) quote = null;
        } else if (char === '\'' || char === '"') quote = char;
        else if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (char === ',' && depth === 0) {
            args.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

/** Each diatomic's note (Diatomic's 10th argument, implicitly concatenated literals), or null. */
function shippedNotes(): Map<string, string | null> {
    const notes = new Map<string, string | null>();
    for (const match of py.matchAll(/^\s*Diatomic\(([\s\S]*?)\),\s*$/gm)) {
        const args = topLevelArguments(match[1]);
        const id = /^'([^']*)'$/.exec(args[0])![1];
        const note = args[9];
        notes.set(id, note === undefined || note === 'None' ? null
            : [...note.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]).join(''));
    }
    return notes;
}

describe('the scan notes Info files under Method (NOTE_IS_METHOD)', () => {
    const notes = shippedNotes();

    it('reads every diatomic of the app from molecules.py', () => {
        expect([...notes.keys()].sort()).toEqual([...DIATOMIC_IDS].sort());
        expect(notes.get('c2')).toBe('C₂ has strong multi-reference character; single-reference CCSD(T) and B3LYP are approximate here.');
    });

    it('files as Method only notes that state the ground state, and every such note', () => {
        for (const id of NOTE_IS_METHOD) {
            expect(notes.get(id)).toMatch(/^Ground state is /);
            // One sentence: a caveat appended to a ground-state note would be a limit filed as method.
            expect(notes.get(id)!.match(/[.;](\s|$)/g)).toHaveLength(1);
        }
        const groundStateNotes = [...notes].filter(([, note]) => note?.startsWith('Ground state is')).map(([id]) => id);
        expect(groundStateNotes.sort()).toEqual([...NOTE_IS_METHOD].sort());
    });
});
