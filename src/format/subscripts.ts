/**
 * Real subscripts in the names of what is drawn (Task 7a; Task 8 made it the one typeset-label helper): a molecular
 * orbital's symmetry label takes its g or u as a <sub> -- 3σg, 1πu, 1σu* read 3σ<sub>g</sub>, 1π<sub>u</sub>,
 * 1σ<sub>u</sub>* -- an irrep its number (1b1 or 1b₁ read 1b<sub>1</sub>, 1a1g 1a<sub>1g</sub>), and an orbital name
 * or a quantity written with an underscore takes what follows it: 3d_z², R_e, E_el read 3d<sub>z²</sub>,
 * R<sub>e</sub>, E<sub>el</sub>, so no "_" is ever shown. Unicode has no subscript g, so a <sub> it is, for all of
 * them. The words are left as they are. `flatSubscripts` (src/format/sci.ts) is the same parse, written flat.
 */
import React from 'react';
import { subscriptMatches } from './sci';

/**
 * A typeset label as a reader hears it (final review, unverified item, checked): the visual, with its <sub>, hidden from
 * assistive technology, and beside it a visually hidden plain copy -- "1b1", "3dz²", "C2v" -- that is read instead,
 * as a j-level's "6p j = 3/2" already is beside its "6p³⁄₂" (LevelNav). An aria-label on the role-less span did not do
 * it: ARIA 1.2 prohibits naming a generic element, so it is not reliably read, and a name computed from the content
 * can read a <sub> as a separate run ("C 2v"). The copy cannot be selected, so copied text reads once ("1b1").
 */
export function typesetLabel(visual: React.ReactNode[], spoken: string): React.ReactElement {
    return React.createElement('span', { className: 'typeset-label' },
        React.createElement('span', { 'aria-hidden': true }, ...visual),
        React.createElement('span', { className: 'visually-hidden' }, spoken));
}

/**
 * The text a reader hears in `node`: what is hidden from assistive technology (aria-hidden) left out, so a typeset
 * label reads once, as its plain copy (`typesetLabel`). InfoPanel reads its titles with it.
 */
export function spokenTextOf(node: Node | null | undefined): string {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
    if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return '';
    return Array.from(node.childNodes, spokenTextOf).join('');
}

/** `text` with its subscripts typeset; a string with none comes back as it is. */
export function withSubscripts(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const match of subscriptMatches(text)) {
        // Read as it reads, "1b1" or "3dz²" (typesetLabel). Plain digits, not the flat "1b₁" (ruling M6): screen readers
        // say Unicode subscript digits inconsistently ("subscript one"), so spoken names keep ASCII.
        const label = typesetLabel([match.base, React.createElement('sub', { key: 'sub' }, match.sub)], `${match.base}${match.sub}`);
        parts.push(text.slice(last, match.index), label);
        last = match.index + match.length;
    }
    if (parts.length === 0) return text;
    parts.push(text.slice(last));
    // Passed as arguments, not an array: a fixed list of children, so React asks for no keys.
    return React.createElement(React.Fragment, null, ...parts);
}

/** A formula's Unicode subscript digits (H₂O, C₆H₆, Ca(OH)₂): after an element symbol or a closing bracket. */
const FORMULA_DIGITS = /([A-Za-z)\]])([₀-₉]+)/g;
const asciiDigits = (digits: string) => digits.replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080));

/**
 * A serif title's formula digits as a <sub> of the face's own figures (finish ruling F4): the serif ships no Unicode
 * subscript digits (its fontsource subsets stop short of U+2080-2089), so a "₂" fell back to Georgia's, which sits on
 * the baseline at nearly x-height. Each one becomes a typeset label -- the visual H<sub>2</sub>, read "H2" (ASCII, as
 * withSubscripts' labels are; ruling M6). Strings are typeset wherever they sit in a fragment, so an Info title built
 * as `Water (H₂O) — ` + withSubscripts(label) works too; elements (a label already typeset, a button) are left alone.
 * Only the serif titles take it: the Inter text elsewhere draws its ₂ from a system face that has real inferiors.
 */
export function typesetFormulaDigits(node: React.ReactNode): React.ReactNode {
    if (typeof node === 'string') {
        const parts: React.ReactNode[] = [];
        let last = 0;
        for (const match of node.matchAll(FORMULA_DIGITS)) {
            const [whole, base, digits] = match;
            const sub = asciiDigits(digits);
            parts.push(node.slice(last, match.index), typesetLabel([base, React.createElement('sub', { key: 'sub' }, sub)], `${base}${sub}`));
            last = match.index + whole.length;
        }
        if (parts.length === 0) return node;
        parts.push(node.slice(last));
        return React.createElement(React.Fragment, null, ...parts);
    }
    if (Array.isArray(node)) return React.createElement(React.Fragment, null, ...node.map(typesetFormulaDigits));
    if (React.isValidElement<{ children?: React.ReactNode }>(node) && node.type === React.Fragment) {
        return React.createElement(React.Fragment, null, ...React.Children.toArray(node.props.children).map(typesetFormulaDigits));
    }
    return node;
}
