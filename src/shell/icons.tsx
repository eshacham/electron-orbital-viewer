import React from 'react';

/** The four custom 20 px mode icons (spec §4.8), drawn on the Material grid; decoration beside a text label. */
const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" aria-hidden="true" focusable="false">{children}</svg>
);

/** A nucleus with three orbits. */
export const AtomsIcon: React.FC = () => (
    <Svg>
        <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
        <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </Svg>
);

/** A p dumbbell. */
export const BasicOrbitalsIcon: React.FC = () => (
    <Svg>
        <path d="M12 12C9 8.5 8.6 3 12 3s3 5.5 0 9Z" />
        <path d="M12 12c-3 3.5-3.4 9 0 9s3-5.5 0-9Z" />
    </Svg>
);

/** Two spheres joined by a stick. */
export const BondsIcon: React.FC = () => (
    <Svg>
        <circle cx="6.5" cy="12" r="3.5" />
        <circle cx="17.5" cy="12" r="3.5" />
        <path d="M10 12h4" />
    </Svg>
);

/** Three spheres. */
export const MoleculesIcon: React.FC = () => (
    <Svg>
        <circle cx="12" cy="8" r="3.2" />
        <circle cx="6" cy="17" r="2.6" />
        <circle cx="18" cy="17" r="2.6" />
        <path d="M10.4 10.6 7.6 14.9M13.6 10.6l2.8 4.3" />
    </Svg>
);
