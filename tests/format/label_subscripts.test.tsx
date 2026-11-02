import React from 'react';
import { render, screen } from '@testing-library/react';
import { typesetFormulaDigits, withSubscripts } from '../../src/format/subscripts';
import { seenText } from '../seen_text';
import { flatSubscripts } from '../../src/format/sci';

/** The rendered markup of `text` through the one label helper, with each <sub> written out (each label's wrapper,
 * aria-hidden visual and plain copy left out: the test below reads those -- final review, typesetLabel). */
function typeset(text: string): string {
    const { container } = render(<p>{withSubscripts(text)}</p>);
    return container.querySelector('p')!.innerHTML
        .replace(/<span class="visually-hidden">[^<]*<\/span>/g, '')
        .replace(/<span class="typeset-label">|<span aria-hidden="true">|<\/span>/g, '');
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

    // Final review (unverified item, checked): an aria-label on a role-less <span> is prohibited (ARIA 1.2) and not reliably
    // read, and a name computed from the content can split at the <sub> ("1b 1") -- so the visual is aria-hidden and a
    // visually hidden plain copy is read instead (typesetLabel), as OrbitalLabel's is. Ruling M6: spoken names keep plain
    // digits -- "1b1", even from the flat "1b₁".
    it('reads each typeset label as it reads, from a plain copy beside its hidden visual', () => {
        const { container } = render(<h1>{withSubscripts('Hydrogen — 3d_z² orbital, 1b₁ and 1σu*')}</h1>);
        expect(container.querySelectorAll('[aria-label]')).toHaveLength(0);
        expect(Array.from(container.querySelectorAll('.typeset-label > .visually-hidden'), el => el.textContent)).toEqual(['3dz²', '1b1', '1σu']);
        expect(Array.from(container.querySelectorAll('.typeset-label > [aria-hidden="true"]'), el => el.innerHTML))
            .toEqual(['3d<sub>z²</sub>', '1b<sub>1</sub>', '1σ<sub>u</sub>']);
        // Each label is read whole ("1b1", never "1b 1"); jsdom gives the copy no display, so it may set it off by a space.
        expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(/^Hydrogen — 3dz² orbital, 1b1 and 1σu ?\*$/);
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

// Finish ruling F4: the serif titles' formulas. The serif ships no Unicode subscript digits (its fontsource subsets
// stop short of U+2080-2089), so a "₂" fell back to Georgia's, which sits on the baseline at nearly x-height. In the
// serif titles the digits are typeset as a <sub> of the serif's own figures; the plain copy reads them as ASCII.
describe('typesetFormulaDigits: a formula\'s digits as <sub> in the serif titles', () => {
    const shown = (node: React.ReactNode) => {
        const { container } = render(<p>{node}</p>);
        return container.querySelector('p')!;
    };

    it.each([
        ['Water (H₂O)', 'Water (H<sub>2</sub>O)', 'Water (H2O)'],
        ['Benzene (C₆H₆)', 'Benzene (C<sub>6</sub>H<sub>6</sub>)', 'Benzene (C6H6)'],
        ['Preview — C₈H₁₀N₄O₂', 'Preview — C<sub>8</sub>H<sub>10</sub>N<sub>4</sub>O<sub>2</sub>', 'Preview — C8H10N4O2'],
        ['Ca(OH)₂', 'Ca(OH)<sub>2</sub>', 'Ca(OH)2'],
    ])('typesets %s', (text, html, spoken) => {
        const p = shown(typesetFormulaDigits(text));
        expect(p.innerHTML.replace(/<span class="visually-hidden">[^<]*<\/span>/g, '')
            .replace(/<span class="typeset-label">|<span aria-hidden="true">|<\/span>/g, '')).toBe(html);
        expect(p.querySelectorAll('.visually-hidden')).toHaveLength(p.querySelectorAll('sub').length);
        expect(seenText(p)).toBe(spoken);
        expect(p.querySelector('.typeset-label > .visually-hidden')?.textContent).toMatch(/^[A-Za-z)]+\d+$/);
    });

    it('reaches into a title built as a fragment, and leaves what withSubscripts already typeset alone', () => {
        const title = <>{'Water (H₂O) — '}{withSubscripts('1b1')}{' orbital'}</>;
        const p = shown(typesetFormulaDigits(title));
        expect(Array.from(p.querySelectorAll('sub'), sub => sub.textContent)).toEqual(['2', '1']);
        expect(seenText(p)).toBe('Water (H2O) — 1b1 orbital');
    });

    it('leaves text with no formula digits as it is', () => {
        expect(typesetFormulaDigits('Hydrogen — 2p_z orbital')).toBe('Hydrogen — 2p_z orbital');
        expect(typesetFormulaDigits('sp³ hybrid h₋₂')).toBe('sp³ hybrid h₋₂');
        expect(typesetFormulaDigits(null)).toBeNull();
    });
});
