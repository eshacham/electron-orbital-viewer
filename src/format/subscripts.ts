/**
 * Real subscripts in running text (Task 7a): a molecular orbital's symmetry label takes its g or u as a <sub> -- 3σg,
 * 1πu, 1σu* read 3σ<sub>g</sub>, 1π<sub>u</sub>, 1σ<sub>u</sub>* -- and a quantity the data and captions write with an
 * underscore takes what follows it: R_e, D_e, E_el read R<sub>e</sub>, D<sub>e</sub>, E<sub>el</sub>, so no "_" is ever
 * shown. Unicode has no subscript g, so a <sub> it is, for both. The words are left as they are.
 */
import React from 'react';

/** σ, π or δ followed by g or u (and not by another letter); or a letter, "_", and its subscript letters. */
const SUBSCRIPTED = /([σπδ])([gu])(?![A-Za-z])|([A-Za-zε])_([A-Za-z]+)/g;

/** `text` with its subscripts typeset; a string with none comes back as it is. */
export function withSubscripts(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const match of text.matchAll(SUBSCRIPTED)) {
        const [whole, letter, parity, base, subscript] = match;
        parts.push(text.slice(last, match.index) + (letter ?? base), React.createElement('sub', null, parity ?? subscript));
        last = match.index + whole.length;
    }
    if (parts.length === 0) return text;
    parts.push(text.slice(last));
    // Passed as arguments, not an array: a fixed list of children, so React asks for no keys.
    return React.createElement(React.Fragment, null, ...parts);
}
