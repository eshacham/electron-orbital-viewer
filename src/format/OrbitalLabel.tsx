import React from 'react';
import { orbitalParts, orbitalPlainName } from './sci';
import { typesetLabel } from './subscripts';

/**
 * An orbital name with a real <sub> element instead of today's "_" separator, e.g. (3, 2, 0) renders "3d" with a "z²"
 * subscript. Read as the plain-text form screen readers announce correctly ("3dz²"), from a visually hidden copy beside
 * the visual (typesetLabel; final review: no aria-label on a role-less span). Past f there is no subscript, and the
 * plain text reads as it is.
 */
export function OrbitalLabel({ n, l, ml }: { n: number; l: number; ml: number }): React.JSX.Element {
    const { base, sub } = orbitalParts(n, l, ml);
    if (sub === null) return <span>{base}</span>;
    return typesetLabel([base, <sub key="sub">{sub}</sub>], orbitalPlainName(n, l, ml));
}
