import React from 'react';
import { formatPointGroup } from '../molecules/orbital_display';
import { typesetLabel } from './subscripts';

/**
 * A point group with everything past its first letter in a real <sub> element, e.g.
 * Td -> T<sub>d</sub>, D3d -> D<sub>3d</sub>, C2v -> C<sub>2v</sub>, Dooh -> D<sub>∞h</sub>.
 *
 * Unlike `typedPointGroup` (src/format/sci.ts), which can only subscript Unicode's handful of
 * subscript Latin letters, a DOM <sub> handles any character — needed because the shipped
 * molecule library already uses suffixes Unicode can't subscript (Td, D3d: Ruling T3-pg).
 *
 * Read as the plain written form (after Dooh/Coov -> D∞h/C∞v), "C2v", from a visually hidden copy beside the visual
 * (typesetLabel; final review: no aria-label on a role-less span) -- not the DOM's split main/rest halves.
 */
export function PointGroupLabel({ pg }: { pg: string }): React.JSX.Element {
    const normalized = formatPointGroup(pg);
    const main = normalized.slice(0, 1);
    const rest = normalized.slice(1);

    return typesetLabel([main, <sub key="sub">{rest}</sub>], normalized);
}
