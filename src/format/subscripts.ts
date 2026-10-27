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

/** `text` with its subscripts typeset; a string with none comes back as it is. */
export function withSubscripts(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const match of subscriptMatches(text)) {
        // Named as it reads, "1b1" or "3dz²", as OrbitalLabel is: a <sub> is no inline run to every accessible-name
        // computation, which would read "1b 1".
        const label = React.createElement('span', { 'aria-label': `${match.base}${match.sub}` }, match.base, React.createElement('sub', null, match.sub));
        parts.push(text.slice(last, match.index), label);
        last = match.index + match.length;
    }
    if (parts.length === 0) return text;
    parts.push(text.slice(last));
    // Passed as arguments, not an array: a fixed list of children, so React asks for no keys.
    return React.createElement(React.Fragment, null, ...parts);
}
