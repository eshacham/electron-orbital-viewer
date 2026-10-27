import React from 'react';
import { orbitalName } from '../orbital_names';
import { orbitalParts } from './sci';

/**
 * An orbital name with a real <sub> element instead of today's "_" separator, e.g. (3, 2, 0)
 * renders "3d" with a "z²" subscript. The aria-label stays the plain-text form screen readers
 * already announce correctly ("3dz²"), not the DOM's split base/sub.
 */
export function OrbitalLabel({ n, l, ml }: { n: number; l: number; ml: number }): React.JSX.Element {
    const { base, sub } = orbitalParts(n, l, ml);
    const ariaLabel = orbitalName(n, l, ml).replace('_', '');

    return (
        <span aria-label={ariaLabel}>
            {base}
            {sub !== null && <sub>{sub}</sub>}
        </span>
    );
}
