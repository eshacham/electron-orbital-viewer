import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CONSTRUCTED_NOTE, VALENCE_THRESHOLD } from '../../src/molecules/orbital_display';

const py = readFileSync(resolve(__dirname, '../../tools/molecules/orbitals.py'), 'utf8');

it('the list calls a virtual diffuse below the threshold the generator used', () => {
    expect(Number(/^VALENCE_THRESHOLD\s*=\s*([0-9.]+)/m.exec(py)?.[1])).toBe(VALENCE_THRESHOLD);
});

// Ruling D4-energy: meta.json's constructed rows carry orbitals.CONSTRUCTED_NOTE, and the list renders the same
// sentence from the row's flags -- the two must not drift apart.
it('captions a constructed LVMO with the sentence the generator writes into meta.json', () => {
    // Python's implicit concatenation of single- or double-quoted pieces inside one pair of parentheses.
    const literal = /^CONSTRUCTED_NOTE\s*=\s*\(((?:\s*(?:'[^']*'|"[^"]*"))+)\s*\)/m.exec(py)?.[1];
    expect(literal).toBeDefined();
    const joined = [...literal!.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]).join('');
    expect(joined).toBe(CONSTRUCTED_NOTE);
});
