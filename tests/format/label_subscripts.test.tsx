import React from 'react';
import { render } from '@testing-library/react';
import { withSubscripts } from '../../src/format/subscripts';
import { flatSubscripts } from '../../src/format/sci';

/** The rendered markup of `text` through the one label helper, with each <sub> written out (each label's named
 * wrapper left out: the test below reads those names). */
function typeset(text: string): string {
    const { container } = render(<p>{withSubscripts(text)}</p>);
    return container.querySelector('p')!.innerHTML.replace(/<span aria-label="[^"]*">|<\/span>/g, '');
}

// Task 8 (addendum, "How to work"): one typeset-label helper for every name of what is drawn -- MO symmetry labels,
// irreps, orbital names written with "_" -- and its flat-string twin for plain-text surfaces. No "_" is ever shown.
describe('withSubscripts: the one typeset-label helper', () => {
    it.each([
        ['1σg', '1σ<sub>g</sub>'],
        ['1σu*', '1σ<sub>u</sub>*'],
        ['1πu', '1π<sub>u</sub>'],
        ['1b1', '1b<sub>1</sub>'],
        ['3a1', '3a<sub>1</sub>'],
        ['1a1g', '1a<sub>1g</sub>'],
        ['1e1g', '1e<sub>1g</sub>'],
        ['2eg', '2e<sub>g</sub>'],
        ['1t2', '1t<sub>2</sub>'],
        ["2a1'", "2a<sub>1</sub>'"],
        ['a1', 'a<sub>1</sub>'],
        // The flat form a plain-text surface writes comes back typeset too.
        ['1b₁', '1b<sub>1</sub>'],
    ])('typesets the MO or irrep label %s', (label, html) => {
        expect(typeset(label)).toBe(html);
    });

    it.each([
        ['3d_z²', '3d<sub>z²</sub>'],
        ['2p_z', '2p<sub>z</sub>'],
        ['3d_x²−y²', '3d<sub>x²−y²</sub>'],
        ['4f_z(x²−y²)', '4f<sub>z(x²−y²)</sub>'],
        ['Computing 2p_z…', 'Computing 2p<sub>z</sub>…'],
        ['(2s + 2p_z)/√2, −3F', '(2s + 2p<sub>z</sub>)/√2, −3F'],
        ['Hydrogen — 3d_z² orbital', 'Hydrogen — 3d<sub>z²</sub> orbital'],
    ])('typesets the orbital name in %s, with no "_"', (text, html) => {
        expect(typeset(text)).toBe(html);
        expect(typeset(text)).not.toContain('_');
    });

    // As OrbitalLabel is: the label is named as it reads, so an accessible name never gains a space before the <sub>.
    // Ruling M6: spoken names keep plain digits -- "1b1", even from the flat "1b₁".
    it('names each typeset label as it reads', () => {
        const { container } = render(<h1>{withSubscripts('Hydrogen — 3d_z² orbital, 1b₁ and 1σu*')}</h1>);
        expect(Array.from(container.querySelectorAll('[aria-label]'), el => el.getAttribute('aria-label'))).toEqual(['3dz²', '1b1', '1σu']);
    });

    it('typesets a label inside running text, and leaves words, units and point groups alone', () => {
        expect(typeset('Water (H₂O), orbital 1b₁ (HOMO), 90 % enclosed')).toBe('Water (H₂O), orbital 1b<sub>1</sub> (HOMO), 90 % enclosed');
        expect(typeset('N₂ 1πu, R = 2.07 a₀ (1.10 Å), 90% contour')).toBe('N₂ 1π<sub>u</sub>, R = 2.07 a₀ (1.10 Å), 90% contour');
        for (const plain of ['a bond at 2.07 a₀', 'e/a₀³', 'B3LYP/def2-TZVP', 'aug-cc-pVTZ', 'C2v', 'Ha/e', 'e.g. a ring', '1e-5']) {
            expect(typeset(plain)).toBe(plain.replace(/&/g, '&amp;'));
        }
    });
});

// Fix round 1 (M8): for names and short prose only -- what cannot be an irrep, or is an identifier, is left alone.
describe('withSubscripts leaves numbers, hashes and identifiers as they are', () => {
    it.each(['1e5', '2e10 Pa', '6.02e23', 'commit 89a9328', '3a12', '0b1', 'build_library.py', 'valence_character'])(
        '%s', text => {
            expect(typeset(text)).toBe(text);
            expect(flatSubscripts(text)).toBe(text);
        },
    );

    it('still typesets the irreps an e carries, and a two-digit count', () => {
        expect(typeset('1e1g and 2e2u')).toBe('1e<sub>1g</sub> and 2e<sub>2u</sub>');
        expect(typeset("10a1'")).toBe("10a<sub>1</sub>'");
    });
});

describe('flatSubscripts: the plain-text twin', () => {
    it.each([
        ['3d_z²', '3dz²'],
        ['Hydrogen — 2p_z orbital', 'Hydrogen — 2pz orbital'],
        ['n = 2 Stark state (2s + 2p_z)/√2', 'n = 2 Stark state (2s + 2pz)/√2'],
        ['1b1', '1b₁'],
        ['3a1', '3a₁'],
        ['1a1g', '1a₁g'],
        ['1σg', '1σg'],
        ['1σu*', '1σu*'],
        ['Water (H₂O), orbital 1b1 (HOMO)', 'Water (H₂O), orbital 1b₁ (HOMO)'],
    ])('writes %s as %s', (text, flat) => {
        expect(flatSubscripts(text)).toBe(flat);
    });

    it('leaves text with no label as it is', () => {
        expect(flatSubscripts('Carbon — whole atom · 90 % enclosed')).toBe('Carbon — whole atom · 90 % enclosed');
    });
});
